'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  InventoryLotStatus,
  MaterialType,
  ProcessOrderStatus,
  ProcessStep,
  StockMoveType,
  type Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mopiItemCodeToFinished } from '@/lib/wms/yuil-catalog-size-grid';

const OPEN_LOT = 'OPEN';

type Tx = Prisma.TransactionClient;

function revalidateMopiPaths() {
  revalidatePath('/mopi/pending');
  revalidatePath('/mopi/machining');
  revalidatePath('/mopi/hole');
  revalidatePath('/dashboard');
  revalidatePath('/inventory');
  revalidatePath('/moves');
  revalidatePath('/stock/pending');
  revalidatePath('/process');
}

function safeReturnPath(raw: string): string | null {
  const p = String(raw || '').trim();
  if (!p.startsWith('/') || p.startsWith('//')) return null;
  if (p.includes('://')) return null;
  return p.split('?')[0] || null;
}

async function resolveLocationId(db: Pick<Tx, 'location'>, itemLocationId: string | null | undefined) {
  if (itemLocationId) return itemLocationId;
  const first = await db.location.findFirst({ orderBy: { name: 'asc' } });
  return first?.id ?? null;
}

/**
 * 가공완료 — 모피 재고 차감 → 홀가공대기(ProcessOrder DRILLING) 등록.
 * 대응 완성품은 홀가공완료 때 합류.
 */
export async function completeMopiMachiningAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const qty = Math.floor(Number(formData.get('quantity') || 0));
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/mopi/machining';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  if (!itemId) redirect(dest(new URLSearchParams({ err: '품목을 선택하세요.' })));
  if (!Number.isFinite(qty) || qty <= 0) {
    redirect(dest(new URLSearchParams({ err: '가공 수량은 1 이상이어야 합니다.' })));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || !item.isActive) throw new Error('품목을 찾을 수 없습니다.');
      if (item.materialType !== MaterialType.SEMI_RAW || !item.itemCode.startsWith('M-')) {
        throw new Error('모피(M-*) SKU만 가공할 수 있습니다.');
      }

      const finishedCode = mopiItemCodeToFinished(item.itemCode);
      const finished = await tx.item.findUnique({ where: { itemCode: finishedCode } });
      if (!finished || !finished.isActive) {
        throw new Error(`대응 완성품 ${finishedCode} 없음`);
      }

      const lot = await tx.inventoryLot.findUnique({
        where: { itemId_lotNo_heatNo: { itemId, lotNo: OPEN_LOT, heatNo: '' } },
      });
      const available = lot?.quantity ?? 0;
      if (!lot || available < qty) {
        throw new Error(`모피 재고 부족 (보유 ${available})`);
      }

      const before = available;
      const after = before - qty;
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: {
          quantity: after,
          status: after <= 0 ? InventoryLotStatus.SHIPPED : InventoryLotStatus.NORMAL,
        },
      });

      await tx.stockMove.create({
        data: {
          itemId,
          lotId: lot.id,
          moveType: StockMoveType.PROCESS_OUT,
          quantity: qty,
          beforeQty: before,
          afterQty: after,
          fromLocationId: lot.locationId ?? item.locationId ?? null,
          reason: '모피 가공완료 → 홀가공대기',
        },
      });

      const orderNo = `MOPI-${Date.now().toString(36).toUpperCase()}`;
      await tx.processOrder.create({
        data: {
          orderNo,
          sourceLotId: lot.id,
          targetItemId: finished.id,
          inputQty: qty,
          outputQty: 0,
          status: ProcessOrderStatus.PROCESSING,
          processStep: ProcessStep.DRILLING,
          startDate: new Date(),
          memo: `모피 가공완료 · ${item.itemCode} → ${finished.itemCode}`,
        },
      });
    });
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '가공완료 실패' })),
    );
  }

  revalidateMopiPaths();
  redirect(dest(new URLSearchParams({ ok: `가공완료 ${qty} → 홀가공대기` })));
}

/**
 * 홀가공완료 — 홀가공대기 지시 종료 + 대응 완성품 OPEN LOT 합류(PROCESS_IN).
 * 모피 차감은 가공완료 시점에 이미 처리됨.
 */
export async function completeMopiHoleAction(formData: FormData) {
  const orderId = String(formData.get('orderId') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/mopi/hole';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  if (!orderId) redirect(dest(new URLSearchParams({ err: '지시가 없습니다.' })));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.processOrder.findUnique({
        where: { id: orderId },
        include: {
          sourceLot: { include: { item: true } },
          targetItem: true,
        },
      });
      if (!order) throw new Error('홀가공 지시 없음');
      if (order.status !== ProcessOrderStatus.PROCESSING || order.processStep !== ProcessStep.DRILLING) {
        throw new Error('홀가공대기 상태만 완료할 수 있습니다.');
      }
      const mopi = order.sourceLot.item;
      if (mopi.materialType !== MaterialType.SEMI_RAW || !mopi.itemCode.startsWith('M-')) {
        throw new Error('모피 지시가 아닙니다.');
      }

      const qty = order.inputQty;
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('수량 오류');

      const locationId = await resolveLocationId(tx, order.targetItem.locationId);
      if (!locationId) throw new Error('완성품 창고가 없습니다.');

      const existing = await tx.inventoryLot.findUnique({
        where: {
          itemId_lotNo_heatNo: {
            itemId: order.targetItemId,
            lotNo: OPEN_LOT,
            heatNo: '',
          },
        },
      });
      const before = existing?.quantity ?? 0;
      const after = before + qty;

      const outLot = await tx.inventoryLot.upsert({
        where: {
          itemId_lotNo_heatNo: {
            itemId: order.targetItemId,
            lotNo: OPEN_LOT,
            heatNo: '',
          },
        },
        create: {
          itemId: order.targetItemId,
          lotNo: OPEN_LOT,
          heatNo: '',
          quantity: qty,
          status: InventoryLotStatus.NORMAL,
          receivedDate: new Date(),
          locationId,
          memo: '홀가공완료(모피→완성품)',
        },
        update: {
          quantity: { increment: qty },
          locationId,
          status: InventoryLotStatus.NORMAL,
          memo: '홀가공완료(모피→완성품)',
        },
      });

      await tx.stockMove.create({
        data: {
          itemId: order.targetItemId,
          lotId: outLot.id,
          moveType: StockMoveType.PROCESS_IN,
          quantity: qty,
          beforeQty: before,
          afterQty: after,
          toLocationId: locationId,
          reason: `홀가공완료 (${order.orderNo}) · ${mopi.itemCode} → ${order.targetItem.itemCode}`,
          documentNo: order.orderNo,
        },
      });

      await tx.processOrder.update({
        where: { id: orderId },
        data: {
          status: ProcessOrderStatus.DONE,
          processStep: ProcessStep.FINISHED,
          outputQty: qty,
          endDate: new Date(),
        },
      });

      return { qty, finishedCode: order.targetItem.itemCode };
    });

    revalidateMopiPaths();
    redirect(
      dest(
        new URLSearchParams({
          ok: `홀가공완료 +${result.qty} → ${result.finishedCode}`,
        }),
      ),
    );
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '홀가공완료 실패' })),
    );
  }
}
