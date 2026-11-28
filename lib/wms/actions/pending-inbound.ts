'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { InventoryLotStatus, StockMoveType, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  BULK_RECEIVE_DOC_PREFIX,
  bulkReceiveDocumentNo,
} from '@/lib/wms/pending-inbound';

const OPEN_LOT = 'OPEN';

type Tx = Prisma.TransactionClient;

type BulkLine = {
  itemId: string;
  qty: number;
  stockMoveId: string;
  lotId: string;
};

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
  revalidatePath('/mopi/pending');
  revalidatePath('/mopi/machining');
  revalidatePath('/mopi/hole');
}

function safeReturnPath(raw: string): string | null {
  const p = String(raw || '').trim();
  if (!p.startsWith('/') || p.startsWith('//')) return null;
  if (p.includes('://')) return null;
  return p.split('?')[0] || null;
}

function assertPendingInboundReady() {
  const d = (prisma as { pendingInbound?: { findMany?: unknown } }).pendingInbound;
  if (!d || typeof d.findMany !== 'function') {
    throw new Error(
      'PendingInbound Prisma 클라이언트가 없습니다. npx prisma generate && npx prisma db push 후 서버를 재시작하세요.',
    );
  }
}

async function resolveLocationId(
  db: Pick<Tx, 'location'>,
  itemLocationId: string | null | undefined,
) {
  if (itemLocationId) return itemLocationId;
  const first = await db.location.findFirst({ orderBy: { name: 'asc' } });
  return first?.id ?? null;
}

/**
 * 대기 → StockMove(IN)+OPEN LOT. qty 미지정 시 대기 전량.
 * documentNo / reason 옵션으로 배치 입고 태깅.
 */
async function receiveOnePendingInTx(
  tx: Tx,
  opts: {
    itemId: string;
    qtyWanted?: number | null;
    note?: string;
    documentNo?: string;
  },
): Promise<{ qty: number; stockMoveId: string; lotId: string }> {
  const item = await tx.item.findUnique({ where: { id: opts.itemId } });
  if (!item || !item.isActive) throw new Error('품목을 찾을 수 없습니다.');

  const pending = await tx.pendingInbound.findUnique({ where: { itemId: opts.itemId } });
  const pendingQty = pending?.quantity ?? 0;
  if (pendingQty <= 0) {
    throw new Error('저장된 대기 수량이 없습니다. 먼저 대기를 저장하세요.');
  }

  let qty =
    opts.qtyWanted == null || !Number.isFinite(opts.qtyWanted)
      ? pendingQty
      : Math.floor(opts.qtyWanted);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('입고 수량은 1 이상이어야 합니다.');
  }
  if (qty > pendingQty) {
    throw new Error(`대기 ${pendingQty}보다 많은 수량(${qty})은 입고할 수 없습니다.`);
  }

  const locationId = await resolveLocationId(tx, item.locationId);
  const existing = await tx.inventoryLot.findUnique({
    where: { itemId_lotNo_heatNo: { itemId: opts.itemId, lotNo: OPEN_LOT, heatNo: '' } },
  });
  const before = existing?.quantity ?? 0;
  const after = before + qty;
  const note = opts.note || '입고완료(대기→재고)';

  const lot = await tx.inventoryLot.upsert({
    where: { itemId_lotNo_heatNo: { itemId: opts.itemId, lotNo: OPEN_LOT, heatNo: '' } },
    create: {
      itemId: opts.itemId,
      lotNo: OPEN_LOT,
      heatNo: '',
      quantity: qty,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date(),
      locationId,
      memo: note,
    },
    update: {
      quantity: { increment: qty },
      locationId: locationId || undefined,
      status: InventoryLotStatus.NORMAL,
    },
  });

  const move = await tx.stockMove.create({
    data: {
      itemId: opts.itemId,
      lotId: lot.id,
      moveType: StockMoveType.IN,
      quantity: qty,
      beforeQty: before,
      afterQty: after,
      toLocationId: locationId,
      documentNo: opts.documentNo || '',
      reason: note,
    },
  });

  const remain = pendingQty - qty;
  if (remain <= 0) {
    await tx.pendingInbound.delete({ where: { itemId: opts.itemId } });
  } else {
    await tx.pendingInbound.update({
      where: { itemId: opts.itemId },
      data: { quantity: remain },
    });
  }

  return { qty, stockMoveId: move.id, lotId: lot.id };
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
    assertPendingInboundReady();
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
    assertPendingInboundReady();
    const qtyWanted =
      qtyRaw === '' ? null : Math.floor(Number(qtyRaw));
    const received = await prisma.$transaction(async (tx) =>
      receiveOnePendingInTx(tx, {
        itemId,
        qtyWanted,
        note: note || '입고완료(대기→재고)',
      }),
    );

    revalidatePendingPaths();
    redirect(dest(new URLSearchParams({ ok: `입고완료 +${received.qty}` })));
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '입고완료 실패' })),
    );
  }
}

/**
 * 전체입고완료 — 대기>0 SKU 전부 StockMove(IN) + BulkReceiveBatch (되돌리기용).
 */
export async function receiveAllPendingInboundAction(formData: FormData) {
  const note = String(formData.get('note') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/stock/pending/stats';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  try {
    assertPendingInboundReady();
    const result = await prisma.$transaction(async (tx) => {
      const pendings = await tx.pendingInbound.findMany({
        where: { quantity: { gt: 0 }, item: { isActive: true } },
        select: { itemId: true, quantity: true },
      });
      if (pendings.length === 0) {
        throw new Error('입고할 대기 수량이 없습니다.');
      }

      const batch = await tx.bulkReceiveBatch.create({
        data: { linesJson: '[]', itemCount: 0, qtyTotal: 0 },
      });
      const docNo = bulkReceiveDocumentNo(batch.id);
      const lines: BulkLine[] = [];
      let qtyTotal = 0;

      for (const p of pendings) {
        const r = await receiveOnePendingInTx(tx, {
          itemId: p.itemId,
          qtyWanted: p.quantity,
          note: note || '전체입고완료(대기→재고)',
          documentNo: docNo,
        });
        lines.push({
          itemId: p.itemId,
          qty: r.qty,
          stockMoveId: r.stockMoveId,
          lotId: r.lotId,
        });
        qtyTotal += r.qty;
      }

      await tx.bulkReceiveBatch.update({
        where: { id: batch.id },
        data: {
          linesJson: JSON.stringify(lines),
          itemCount: lines.length,
          qtyTotal,
        },
      });

      return { itemCount: lines.length, qtyTotal, batchId: batch.id };
    });

    revalidatePendingPaths();
    redirect(
      dest(
        new URLSearchParams({
          ok: `전체입고완료 ${result.itemCount}품번 +${result.qtyTotal}`,
        }),
      ),
    );
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '전체입고완료 실패' })),
    );
  }
}

/**
 * 한 단계 되돌리기 — 마지막 전체입고완료 BulkReceiveBatch의 StockMove 취소 + PendingInbound 복원.
 */
export async function undoLastBulkReceiveAction(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('returnTo') || '')) || '/stock/pending/stats';

  const dest = (sp: URLSearchParams) => {
    const q = sp.toString();
    return q ? `${returnTo}?${q}` : returnTo;
  };

  try {
    assertPendingInboundReady();
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.bulkReceiveBatch.findFirst({
        where: { undoneAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!batch) throw new Error('되돌릴 전체입고완료가 없습니다.');

      let lines: BulkLine[] = [];
      try {
        const parsed = JSON.parse(batch.linesJson || '[]') as BulkLine[];
        if (Array.isArray(parsed)) lines = parsed;
      } catch {
        lines = [];
      }
      if (lines.length === 0) {
        // linesJson 비어 있으면 documentNo로 StockMove 복구
        const moves = await tx.stockMove.findMany({
          where: {
            documentNo: bulkReceiveDocumentNo(batch.id),
            moveType: StockMoveType.IN,
          },
        });
        lines = moves.map((m) => ({
          itemId: m.itemId,
          qty: m.quantity,
          stockMoveId: m.id,
          lotId: m.lotId || '',
        }));
      }
      if (lines.length === 0) throw new Error('배치 입고 내역이 비어 있습니다.');

      for (const line of lines) {
        const move = await tx.stockMove.findUnique({ where: { id: line.stockMoveId } });
        if (move) {
          if (move.lotId) {
            const lot = await tx.inventoryLot.findUnique({ where: { id: move.lotId } });
            if (lot) {
              const nextQty = Math.max(0, lot.quantity - move.quantity);
              await tx.inventoryLot.update({
                where: { id: lot.id },
                data: { quantity: nextQty },
              });
            }
          }
          await tx.stockMove.delete({ where: { id: move.id } });
        } else if (line.lotId && line.qty > 0) {
          const lot = await tx.inventoryLot.findUnique({ where: { id: line.lotId } });
          if (lot) {
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { quantity: Math.max(0, lot.quantity - line.qty) },
            });
          }
        }

        const existing = await tx.pendingInbound.findUnique({
          where: { itemId: line.itemId },
        });
        if (existing) {
          await tx.pendingInbound.update({
            where: { itemId: line.itemId },
            data: { quantity: existing.quantity + line.qty },
          });
        } else {
          await tx.pendingInbound.create({
            data: {
              itemId: line.itemId,
              quantity: line.qty,
              memo: '되돌리기(전체입고완료)',
            },
          });
        }
      }

      // 혹시 documentNo로 남은 IN 이동 정리
      await tx.stockMove.deleteMany({
        where: {
          documentNo: `${BULK_RECEIVE_DOC_PREFIX}${batch.id}`,
          moveType: StockMoveType.IN,
        },
      });

      await tx.bulkReceiveBatch.update({
        where: { id: batch.id },
        data: { undoneAt: new Date() },
      });

      return { itemCount: lines.length, qtyTotal: batch.qtyTotal || lines.reduce((s, l) => s + l.qty, 0) };
    });

    revalidatePendingPaths();
    redirect(
      dest(
        new URLSearchParams({
          ok: `되돌리기 ${result.itemCount}품번 · 대기 +${result.qtyTotal}`,
        }),
      ),
    );
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '되돌리기 실패' })),
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
    assertPendingInboundReady();
    await prisma.pendingInbound.deleteMany({ where: { itemId } });
  } catch (e) {
    redirect(
      dest(new URLSearchParams({ err: e instanceof Error ? e.message : '대기 취소 실패' })),
    );
  }

  revalidatePendingPaths();
  redirect(dest(new URLSearchParams({ ok: '대기 취소' })));
}
