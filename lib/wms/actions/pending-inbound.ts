'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { InventoryLotStatus, StockMoveType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const OPEN_LOT = 'OPEN';

function revalidatePendingPaths() {
  revalidatePath('/dashboard');
  revalidatePath('/inventory');
  revalidatePath('/items');
  revalidatePath('/moves');
  revalidatePath('/stock/in');
  revalidatePath('/stock/pending');
  revalidatePath('/stock/pending/stats');
  revalidatePath('/stock/out');
  revalidatePath('/safety');
}

function safeReturnPath(raw: string): string | null {
  const p = String(raw || '').trim();
  if (!p.startsWith('/') || p.startsWith('//')) return null;
  if (p.includes('://')) return null;
  return p.split('?')[0] || null;
}

async function resolveLocationId(
  db: Pick<typeof prisma, 'location'>,
  itemLocationId: string | null | undefined,
) {
  if (itemLocationId) return itemLocationId;
  const first = await db.location.findFirst({ orderBy: { name: 'asc' } });
  return first?.id ?? null;
}

/**
 * 입고대기 수량 저장 — LOT/보유에 넣지 않음. PendingInbound upsert.
 */
export async function savePendingInboundAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const qty = Math.floor(Number(formData.get('quantity') || 0));
  const note = String(formData.get('note') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/stock/pending';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  if (!itemId) {
    redirect(dest(new URLSearchParams({ err: '품목을 선택하세요.' })));
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    redirect(dest(new URLSearchParams({ err: '대기 수량은 1 이상이어야 합니다.' })));
  }

  try {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) throw new Error('품목을 찾을 수 없습니다.');

    await prisma.pendingInbound.upsert({
      where: { itemId },
      create: {
        itemId,
        quantity: qty,
        memo: note || '입고대기',
      },
      update: {
        quantity: qty,
        memo: note || undefined,
      },
    });
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '대기 저장 실패' })),
    );
  }

  revalidatePendingPaths();
  redirect(dest(new URLSearchParams({ ok: `대기 ${qty} 저장` })));
}

/**
 * 입고완료 — PendingInbound 수량을 StockMove(IN)+OPEN LOT으로 전환 후 대기 차감/삭제.
 * quantity 없으면 대기 전량. quantity가 대기보다 크면 거부.
 */
export async function receivePendingInboundAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const qtyRaw = String(formData.get('quantity') || '').trim();
  const note = String(formData.get('note') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/stock/pending';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  if (!itemId) {
    redirect(dest(new URLSearchParams({ err: '품목을 선택하세요.' })));
  }

  try {
    const received = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || !item.isActive) throw new Error('품목을 찾을 수 없습니다.');

      const pending = await tx.pendingInbound.findUnique({ where: { itemId } });
      const pendingQty = pending?.quantity ?? 0;
      if (pendingQty <= 0) {
        throw new Error('저장된 대기 수량이 없습니다. 먼저 대기를 저장하세요.');
      }

      let qty =
        qtyRaw === '' ? pendingQty : Math.floor(Number(qtyRaw));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('입고 수량은 1 이상이어야 합니다.');
      }
      if (qty > pendingQty) {
        throw new Error(`대기 ${pendingQty}보다 많은 수량(${qty})은 입고할 수 없습니다.`);
      }

      const locationId = await resolveLocationId(tx, item.locationId);
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
          memo: note || '입고완료(대기→재고)',
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
          reason: note || '입고완료(대기→재고)',
        },
      });

      const remain = pendingQty - qty;
      if (remain <= 0) {
        await tx.pendingInbound.delete({ where: { itemId } });
      } else {
        await tx.pendingInbound.update({
          where: { itemId },
          data: { quantity: remain },
        });
      }

      return qty;
    });

    revalidatePendingPaths();
    redirect(dest(new URLSearchParams({ ok: `입고완료 +${received}` })));
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '입고완료 실패' })),
    );
  }
}

/**
 * 대기 수량 취소(삭제) — 재고 변동 없음.
 */
export async function clearPendingInboundAction(formData: FormData) {
  const itemId = String(formData.get('itemId') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/stock/pending';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  if (!itemId) {
    redirect(dest(new URLSearchParams({ err: '품목을 선택하세요.' })));
  }

  try {
    await prisma.pendingInbound.deleteMany({ where: { itemId } });
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '대기 취소 실패' })),
    );
  }

  revalidatePendingPaths();
  redirect(dest(new URLSearchParams({ ok: '대기 취소' })));
}
