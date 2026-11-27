'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { InventoryLotStatus, Prisma, StockMoveType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** LOT 목록 (필터) */
export async function listLots(filters?: {
  material?: string;
  locationId?: string;
  status?: InventoryLotStatus | 'ALL';
  q?: string;
}) {
  const where: Prisma.InventoryLotWhereInput = {};
  if (filters?.locationId && filters.locationId !== 'ALL') {
    where.locationId = filters.locationId;
  }
  if (filters?.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }
  if (filters?.material && filters.material !== 'ALL') {
    where.item = { materialType: filters.material as 'SCS304' | 'SCS316' | 'SEMI_RAW' };
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [{ lotNo: { contains: q } }, { heatNo: { contains: q } }, { item: { itemCode: { contains: q } } }];
  }
  return prisma.inventoryLot.findMany({
    where,
    include: {
      item: true,
      location: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

/** LOT 상세 + 이력 */
export async function getLotDetail(id: string) {
  const lot = await prisma.inventoryLot.findUnique({
    where: { id },
    include: {
      item: { include: { location: true } },
      location: true,
      stockMoves: { orderBy: { createdAt: 'desc' }, take: 100 },
      qualityChecks: { orderBy: { checkedAt: 'desc' }, include: { attachments: true } },
    },
  });
  return lot;
}

/** 입고: 동일 품목+LOT+Heat 이면 수량 가산, 아니면 신규 LOT */
export async function stockIn(input: {
  itemId: string;
  lotNo: string;
  heatNo?: string;
  quantity: number;
  locationId?: string | null;
  memo?: string;
  vendorName?: string;
  documentNo?: string;
  createdBy?: string | null;
}) {
  if (input.quantity <= 0) throw new Error('수량은 1 이상이어야 합니다.');
  const heat = (input.heatNo ?? '').trim();
  const lotNo = input.lotNo.trim();
  const item = await prisma.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error('품목을 찾을 수 없습니다.');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryLot.findUnique({
      where: {
        itemId_lotNo_heatNo: { itemId: input.itemId, lotNo, heatNo: heat },
      },
    });
    let lotId: string;
    let before = 0;
    let after: number;
    if (existing) {
      before = existing.quantity;
      after = before + input.quantity;
      await tx.inventoryLot.update({
        where: { id: existing.id },
        data: {
          quantity: after,
          locationId: input.locationId || existing.locationId,
          memo: input.memo?.trim() || existing.memo,
          receivedDate: existing.receivedDate ?? new Date(),
          status: 'NORMAL' as InventoryLotStatus,
        },
      });
      lotId = existing.id;
    } else {
      const created = await tx.inventoryLot.create({
        data: {
          itemId: input.itemId,
          lotNo,
          heatNo: heat,
          quantity: input.quantity,
          status: 'NORMAL',
          receivedDate: new Date(),
          locationId: input.locationId || null,
          memo: input.memo?.trim() ?? '',
        },
      });
      lotId = created.id;
      before = 0;
      after = input.quantity;
    }
    await tx.stockMove.create({
      data: {
        itemId: input.itemId,
        lotId,
        moveType: 'IN' as StockMoveType,
        quantity: input.quantity,
        beforeQty: before,
        afterQty: after,
        toLocationId: input.locationId || null,
        vendorName: input.vendorName?.trim() ?? '',
        documentNo: input.documentNo?.trim() ?? '',
        reason: '입고',
        createdBy: input.createdBy ?? null,
      },
    });
  });

  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  revalidatePath('/moves');
}

/** 출고: LOT 수량 차감 */
export async function stockOut(input: {
  lotId: string;
  quantity: number;
  customerName?: string;
  documentNo?: string;
  reason?: string;
  createdBy?: string | null;
}) {
  if (input.quantity <= 0) throw new Error('수량은 1 이상이어야 합니다.');
  await prisma.$transaction(async (tx) => {
    const lot = await tx.inventoryLot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw new Error('LOT를 찾을 수 없습니다.');
    if (lot.quantity < input.quantity) {
      throw new Error(`재고 부족: 현재 ${lot.quantity}, 요청 ${input.quantity}`);
    }
    const before = lot.quantity;
    const after = before - input.quantity;
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        quantity: after,
        status: after === 0 ? ('SHIPPED' as InventoryLotStatus) : lot.status,
      },
    });
    await tx.stockMove.create({
      data: {
        itemId: lot.itemId,
        lotId: lot.id,
        moveType: 'OUT' as StockMoveType,
        quantity: input.quantity,
        beforeQty: before,
        afterQty: after,
        fromLocationId: lot.locationId,
        customerName: input.customerName?.trim() ?? '',
        documentNo: input.documentNo?.trim() ?? '',
        reason: input.reason?.trim() || '출고',
        createdBy: input.createdBy ?? null,
      },
    });
  });
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  revalidatePath('/moves');
}

/** 입고 폼 제출 */
export async function stockInFromForm(formData: FormData) {
  try {
    await stockIn({
      itemId: String(formData.get('itemId') ?? ''),
      lotNo: String(formData.get('lotNo') ?? ''),
      heatNo: String(formData.get('heatNo') ?? ''),
      quantity: Number(formData.get('quantity') ?? 0),
      locationId: String(formData.get('locationId') ?? '') || null,
      memo: String(formData.get('memo') ?? ''),
      vendorName: String(formData.get('vendorName') ?? ''),
      documentNo: String(formData.get('documentNo') ?? ''),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '입고 처리 오류';
    redirect(`/stock/in?err=${encodeURIComponent(msg)}`);
  }
  redirect('/inventory');
}

/** 출고 폼 제출 */
export async function stockOutFromForm(formData: FormData) {
  try {
    await stockOut({
      lotId: String(formData.get('lotId') ?? ''),
      quantity: Number(formData.get('quantity') ?? 0),
      customerName: String(formData.get('customerName') ?? ''),
      documentNo: String(formData.get('documentNo') ?? ''),
      reason: String(formData.get('reason') ?? ''),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '출고 처리 오류';
    redirect(`/stock/out?err=${encodeURIComponent(msg)}`);
  }
  redirect('/inventory');
}
