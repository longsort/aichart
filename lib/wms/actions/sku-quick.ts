'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { InventoryLotStatus, MaterialType, StockMoveType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const OPEN_LOT = 'OPEN';

function revalidateStockPaths() {
  revalidatePath('/dashboard');
  revalidatePath('/inventory');
  revalidatePath('/items');
  revalidatePath('/moves');
  revalidatePath('/stock/in');
  revalidatePath('/stock/out');
  revalidatePath('/safety');
}

async function resolveLocationId(itemLocationId: string | null | undefined) {
  if (itemLocationId) return itemLocationId;
  const first = await prisma.location.findFirst({ orderBy: { name: 'asc' } });
  return first?.id ?? null;
}

/**
 * SKU 간단 입고 — StockMove(IN) + OPEN LOT 수량 가산.
 * 수량만 직접 고치지 않음.
 */
export async function quickStockInAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const qty = Math.floor(Number(formData.get('quantity') || 0));
  const note = String(formData.get('note') || '').trim();
  const pressure = String(formData.get('pressure') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const shortage = String(formData.get('shortage') || '').trim();

  const back = () => {
    const sp = new URLSearchParams();
    if (pressure) sp.set('pressure', pressure);
    if (size) sp.set('size', size);
    if (shortage === '1' || shortage === 'true') sp.set('shortage', '1');
    return sp;
  };

  if (!itemId) {
    const sp = back();
    sp.set('err', '품목을 선택하세요.');
    redirect(`/dashboard?${sp.toString()}`);
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    const sp = back();
    sp.set('err', '입고 수량은 1 이상이어야 합니다.');
    redirect(`/dashboard?${sp.toString()}`);
  }

  try {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) throw new Error('품목을 찾을 수 없습니다.');
    const locationId = await resolveLocationId(item.locationId);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryLot.findUnique({
        where: { itemId_lotNo_heatNo: { itemId, lotNo: OPEN_LOT, heatNo: '' } },
      });
      const before = existing?.quantity ?? 0;
      const after = before + qty;
      const lot = await tx.inventoryLot.upsert({
        where: { itemId_lotNo_heatNo: { itemId, lotNo: OPEN_LOT, heatNo: '' } },
        create: {
          itemId,
          lotNo: OPEN_LOT,
          heatNo: '',
          quantity: qty,
          status: InventoryLotStatus.NORMAL,
          receivedDate: new Date(),
          locationId,
          memo: note || '간단입고',
        },
        update: {
          quantity: { increment: qty },
          locationId: locationId || undefined,
          status: InventoryLotStatus.NORMAL,
        },
      });
      await tx.stockMove.create({
        data: {
          itemId,
          lotId: lot.id,
          moveType: StockMoveType.IN,
          quantity: qty,
          beforeQty: before,
          afterQty: after,
          toLocationId: locationId,
          reason: note || '간단입고',
        },
      });
    });
  } catch (e) {
    const sp = back();
    sp.set('err', e instanceof Error ? e.message : '입고 실패');
    redirect(`/dashboard?${sp.toString()}`);
  }

  revalidateStockPaths();
  const sp = back();
  sp.set('ok', `입고 +${qty}`);
  redirect(`/dashboard?${sp.toString()}`);
}

/**
 * SKU 간단 출고 — 보유 LOT에서 FIFO 차감 + StockMove(OUT).
 */
export async function quickStockOutAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const qty = Math.floor(Number(formData.get('quantity') || 0));
  const note = String(formData.get('note') || '').trim();
  const pressure = String(formData.get('pressure') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const shortage = String(formData.get('shortage') || '').trim();

  const back = () => {
    const sp = new URLSearchParams();
    if (pressure) sp.set('pressure', pressure);
    if (size) sp.set('size', size);
    if (shortage === '1' || shortage === 'true') sp.set('shortage', '1');
    return sp;
  };

  if (!itemId) {
    const sp = back();
    sp.set('err', '품목을 선택하세요.');
    redirect(`/dashboard?${sp.toString()}`);
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    const sp = back();
    sp.set('err', '출고 수량은 1 이상이어야 합니다.');
    redirect(`/dashboard?${sp.toString()}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const lots = await tx.inventoryLot.findMany({
        where: {
          itemId,
          quantity: { gt: 0 },
          status: { notIn: [InventoryLotStatus.SHIPPED, InventoryLotStatus.DEFECT] },
        },
        orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
      });
      const onHand = lots.reduce((s, l) => s + l.quantity, 0);
      if (onHand < qty) throw new Error(`재고 부족: 보유 ${onHand}, 요청 ${qty}`);

      let remain = qty;
      for (const lot of lots) {
        if (remain <= 0) break;
        const take = Math.min(lot.quantity, remain);
        const before = lot.quantity;
        const after = before - take;
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            quantity: after,
            status: after === 0 ? InventoryLotStatus.SHIPPED : lot.status,
          },
        });
        await tx.stockMove.create({
          data: {
            itemId,
            lotId: lot.id,
            moveType: StockMoveType.OUT,
            quantity: take,
            beforeQty: before,
            afterQty: after,
            fromLocationId: lot.locationId,
            reason: note || '간단출고',
          },
        });
        remain -= take;
      }
    });
  } catch (e) {
    const sp = back();
    sp.set('err', e instanceof Error ? e.message : '출고 실패');
    redirect(`/dashboard?${sp.toString()}`);
  }

  revalidateStockPaths();
  const sp = back();
  sp.set('ok', `출고 −${qty}`);
  redirect(`/dashboard?${sp.toString()}`);
}

/**
 * 신규 SKU 등록 (+선택 초기입고는 StockMove IN).
 */
export async function quickCreateSkuAction(formData: FormData) {
  const itemCode = String(formData.get('itemCode') || '').trim().toUpperCase();
  const itemName = String(formData.get('itemName') || '').trim();
  const pressureClass = String(formData.get('pressureClass') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const materialType = String(formData.get('materialType') || 'SCS304') as MaterialType;
  const productType = String(formData.get('productType') || 'KS Flange').trim() || 'KS Flange';
  const initialQty = Math.floor(Number(formData.get('initialQty') || 0));
  const pressureFilter = String(formData.get('pressure') || '').trim();
  const sizeFilter = String(formData.get('sizeFilter') || '').trim();

  const back = () => {
    const sp = new URLSearchParams();
    if (pressureFilter) sp.set('pressure', pressureFilter);
    if (sizeFilter) sp.set('size', sizeFilter);
    return sp;
  };

  if (!itemCode || !itemName) {
    const sp = back();
    sp.set('err', '품목코드·품목명은 필수입니다.');
    redirect(`/dashboard?${sp.toString()}`);
  }
  if (!pressureClass || !size) {
    const sp = back();
    sp.set('err', '압력등급·사이즈를 선택하세요.');
    redirect(`/dashboard?${sp.toString()}`);
  }
  if (!['SCS304', 'SCS316', 'SEMI_RAW'].includes(materialType)) {
    const sp = back();
    sp.set('err', '재질을 선택하세요.');
    redirect(`/dashboard?${sp.toString()}`);
  }

  try {
    const locationId = await resolveLocationId(null);
    const item = await prisma.item.create({
      data: {
        itemCode,
        itemName,
        materialType,
        productType,
        standard: '',
        size,
        pressureClass,
        unit: 'EA',
        safetyStock: 20,
        locationId,
        memo: '간단등록',
      },
    });

    if (initialQty > 0) {
      await prisma.$transaction(async (tx) => {
        const lot = await tx.inventoryLot.create({
          data: {
            itemId: item.id,
            lotNo: OPEN_LOT,
            heatNo: '',
            quantity: initialQty,
            status: InventoryLotStatus.NORMAL,
            receivedDate: new Date(),
            locationId,
            memo: '신규 초기입고',
          },
        });
        await tx.stockMove.create({
          data: {
            itemId: item.id,
            lotId: lot.id,
            moveType: StockMoveType.IN,
            quantity: initialQty,
            beforeQty: 0,
            afterQty: initialQty,
            toLocationId: locationId,
            reason: '신규 초기입고',
          },
        });
      });
    }
  } catch {
    const sp = back();
    sp.set('err', '동일 품목코드가 있거나 등록에 실패했습니다.');
    redirect(`/dashboard?${sp.toString()}`);
  }

  revalidateStockPaths();
  const sp = back();
  sp.set('ok', `신규 등록 ${itemCode}`);
  // 등록한 압력·사이즈로 바로 보이게
  if (pressureClass) sp.set('pressure', pressureClass);
  if (size) sp.set('size', size);
  redirect(`/dashboard?${sp.toString()}`);
}
