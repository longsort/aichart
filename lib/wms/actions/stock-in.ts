'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { StockMoveType, InventoryLotStatus } from '@prisma/client';

/**
 * 입고 처리: 동일 품목+LOT+Heat이 있으면 수량 가산, 없으면 신규 LOT.
 * StockMove(IN) 자동 기록.
 */
export async function receiveStockAction(_prev: unknown, formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const lotNo = String(formData.get('lotNo') || '').trim();
  const heatNo = String(formData.get('heatNo') || '').trim();
  const qty = Number(formData.get('quantity'));
  const locationId = String(formData.get('locationId') || '').trim();
  const vendorName = String(formData.get('vendorName') || '').trim();
  const documentNo = String(formData.get('documentNo') || '').trim();
  const memo = String(formData.get('memo') || '').trim();

  if (!itemId || !lotNo || !locationId) {
    return { success: false as const, error: '품목·LOT번호·창고는 필수입니다.' };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false as const, error: '수량은 1 이상 숫자여야 합니다.' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryLot.findUnique({
        where: { itemId_lotNo_heatNo: { itemId, lotNo, heatNo } },
      });
      const before = existing?.quantity ?? 0;
      const after = before + qty;

      const lot = await tx.inventoryLot.upsert({
        where: { itemId_lotNo_heatNo: { itemId, lotNo, heatNo } },
        create: {
          itemId,
          lotNo,
          heatNo,
          quantity: qty,
          status: InventoryLotStatus.NORMAL,
          receivedDate: new Date(),
          locationId,
          memo,
        },
        update: {
          quantity: { increment: qty },
          locationId,
          memo: memo || undefined,
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
          vendorName,
          documentNo,
          reason: '입고',
        },
      });
    });

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    revalidatePath('/moves');
    revalidatePath('/items');
    return { success: true as const, error: '' };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: '입고 처리 중 오류가 발생했습니다.' };
  }
}
