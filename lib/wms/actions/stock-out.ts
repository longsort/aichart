'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { InventoryLotStatus, StockMoveType } from '@prisma/client';

/**
 * 출고 처리: LOT 수량 차감 + StockMove(OUT).
 * 재고 부족 시 오류 반환.
 */
export async function shipStockAction(_prev: unknown, formData: FormData) {
  const lotId = String(formData.get('lotId') || '').trim();
  const qty = Number(formData.get('quantity'));
  const customerName = String(formData.get('customerName') || '').trim();
  const documentNo = String(formData.get('documentNo') || '').trim();

  if (!lotId || !customerName) {
    return { success: false as const, error: 'LOT와 거래처는 필수입니다.' };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false as const, error: '수량은 1 이상 숫자여야 합니다.' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
      if (!lot) throw new Error('LOT를 찾을 수 없습니다.');
      if (lot.quantity < qty) {
        throw new Error(`재고 부족: 현재 ${lot.quantity}, 요청 ${qty}`);
      }
      const before = lot.quantity;
      const after = before - qty;
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: {
          quantity: after,
          status: after === 0 ? InventoryLotStatus.SHIPPED : lot.status,
        },
      });
      await tx.stockMove.create({
        data: {
          itemId: lot.itemId,
          lotId: lot.id,
          moveType: StockMoveType.OUT,
          quantity: qty,
          beforeQty: before,
          afterQty: after,
          fromLocationId: lot.locationId,
          customerName,
          documentNo,
          reason: '출고',
        },
      });
    });

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    revalidatePath('/moves');
    revalidatePath('/stock/out');
    revalidatePath('/safety');
    return { success: true as const, error: '' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '출고 처리 중 오류가 발생했습니다.';
    return { success: false as const, error: msg };
  }
}
