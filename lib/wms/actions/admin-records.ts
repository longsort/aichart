'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  InventoryLotStatus,
  StockMoveType,
  type Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_CRITICAL_BELOW,
  DEFAULT_WARN_BELOW,
} from '@/lib/wms/stock-alerts';

function safeReturnPath(raw: string, fallback: string): string {
  const p = String(raw || '').trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('://')) return fallback;
  return p.split('?')[0] || fallback;
}

function dest(returnTo: string, sp: URLSearchParams) {
  const q = sp.toString();
  return q ? `${returnTo}?${q}` : returnTo;
}

function revalidateAdminPaths() {
  revalidatePath('/inventory');
  revalidatePath('/moves');
  revalidatePath('/stock/in');
  revalidatePath('/stock/out');
  revalidatePath('/dashboard');
  revalidatePath('/safety');
  revalidatePath('/settings');
  revalidatePath('/settings/alerts');
  revalidatePath('/items');
}

/** 원장 단건 기록삭제 (LOT 수량은 건드리지 않음) */
export async function deleteStockMoveAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/moves');
  if (!id) redirect(dest(returnTo, new URLSearchParams({ err: '기록 id 없음' })));
  try {
    await prisma.stockMove.delete({ where: { id } });
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '기록삭제 실패' }),
      ),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: '기록삭제' })));
}

/** 원장 전체(또는 유형별) 기록삭제 */
export async function clearStockMovesAction(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/moves');
  const moveType = String(formData.get('moveType') || '').trim();
  const where: Prisma.StockMoveWhereInput = {};
  if (moveType && moveType !== 'ALL') {
    where.moveType = moveType as StockMoveType;
  }
  try {
    const res = await prisma.stockMove.deleteMany({ where });
    revalidateAdminPaths();
    redirect(
      dest(
        returnTo,
        new URLSearchParams({
          ok: `기록 전체삭제 ${res.count}건${moveType && moveType !== 'ALL' ? ` (${moveType})` : ''}`,
        }),
      ),
    );
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '전체삭제 실패' }),
      ),
    );
  }
}

/** LOT 수정 — 수량 변경 시 ADJUST 원장 */
export async function updateLotAdminAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), `/inventory/${id}`);
  const lotNo = String(formData.get('lotNo') || '').trim();
  const heatNo = String(formData.get('heatNo') || '').trim();
  const memo = String(formData.get('memo') || '').trim();
  const locationId = String(formData.get('locationId') || '').trim() || null;
  const statusRaw = String(formData.get('status') || '').trim();
  const qty = Number(formData.get('quantity'));

  if (!id || !lotNo) {
    redirect(dest(returnTo, new URLSearchParams({ err: 'LOT 번호 필수' })));
  }
  if (!Number.isFinite(qty) || qty < 0) {
    redirect(dest(returnTo, new URLSearchParams({ err: '수량은 0 이상' })));
  }
  const status = (Object.values(InventoryLotStatus) as string[]).includes(statusRaw)
    ? (statusRaw as InventoryLotStatus)
    : InventoryLotStatus.NORMAL;

  try {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.findUnique({ where: { id } });
      if (!lot) throw new Error('LOT 없음');
      const before = lot.quantity;
      const after = Math.floor(qty);
      await tx.inventoryLot.update({
        where: { id },
        data: {
          lotNo,
          heatNo,
          memo,
          locationId,
          status,
          quantity: after,
        },
      });
      if (after !== before) {
        await tx.stockMove.create({
          data: {
            itemId: lot.itemId,
            lotId: id,
            moveType: StockMoveType.ADJUST,
            quantity: Math.abs(after - before),
            beforeQty: before,
            afterQty: after,
            fromLocationId: after < before ? lot.locationId : null,
            toLocationId: after > before ? locationId || lot.locationId : null,
            reason: 'LOT 관리자 수정',
          },
        });
      }
    });
  } catch (e) {
    redirect(
      dest(returnTo, new URLSearchParams({ err: e instanceof Error ? e.message : 'LOT 수정 실패' })),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: 'LOT 수정' })));
}

/** LOT 삭제 (검사·첨부 cascade, 원장 lotId null) */
export async function deleteLotAdminAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/inventory');
  if (!id) redirect(dest(returnTo, new URLSearchParams({ err: 'LOT id 없음' })));
  try {
    await prisma.inventoryLot.delete({ where: { id } });
  } catch (e) {
    redirect(
      dest(returnTo, new URLSearchParams({ err: e instanceof Error ? e.message : 'LOT 삭제 실패' })),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: 'LOT 삭제' })));
}

/** 수량 0 LOT 전체삭제 */
export async function deleteEmptyLotsAction(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/inventory');
  try {
    const res = await prisma.inventoryLot.deleteMany({ where: { quantity: 0 } });
    revalidateAdminPaths();
    redirect(dest(returnTo, new URLSearchParams({ ok: `수량0 LOT ${res.count}건 삭제` })));
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '빈 LOT 삭제 실패' }),
      ),
    );
  }
}

/** 검사 기록 삭제 */
export async function deleteQualityCheckAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const lotId = String(formData.get('lotId') || '').trim();
  const returnTo = safeReturnPath(
    String(formData.get('returnTo') || ''),
    lotId ? `/inventory/${lotId}` : '/inventory',
  );
  if (!id) redirect(dest(returnTo, new URLSearchParams({ err: '검사 id 없음' })));
  try {
    await prisma.qualityCheck.delete({ where: { id } });
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '검사 삭제 실패' }),
      ),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: '검사 기록삭제' })));
}

/** 안전재고 수치 수정 */
export async function updateSafetyStockAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/safety');
  const safetyStock = Math.max(0, Math.floor(Number(formData.get('safetyStock') || 0)));
  if (!id) redirect(dest(returnTo, new URLSearchParams({ err: '품목 id 없음' })));
  try {
    await prisma.item.update({ where: { id }, data: { safetyStock } });
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '안전재고 수정 실패' }),
      ),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: '안전재고 수정' })));
}

/** 압력·사이즈 경보 덮어쓰기 전체삭제 */
export async function clearAllThresholdOverridesAction(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/settings/alerts');
  try {
    const [s, p] = await Promise.all([
      prisma.sizeThresholdOverride.deleteMany({}),
      prisma.pressureThresholdOverride.deleteMany({}),
    ]);
    revalidateAdminPaths();
    redirect(
      dest(
        returnTo,
        new URLSearchParams({
          ok: `덮어쓰기 전체삭제 · 사이즈 ${s.count} · 압력 ${p.count}`,
        }),
      ),
    );
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '덮어쓰기 삭제 실패' }),
      ),
    );
  }
}

/** 전역 경보 기본값(긴급20/주의500) 복원 */
export async function resetGlobalThresholdDefaultsAction(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/settings/alerts');
  try {
    await prisma.inventoryThresholdSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        criticalBelowSku: DEFAULT_CRITICAL_BELOW,
        warnBelowSku: DEFAULT_WARN_BELOW,
        criticalBelowSize: DEFAULT_CRITICAL_BELOW,
        warnBelowSize: DEFAULT_WARN_BELOW,
        criticalBelowPressure: DEFAULT_CRITICAL_BELOW,
        warnBelowPressure: DEFAULT_WARN_BELOW,
      },
      update: {
        criticalBelowSku: DEFAULT_CRITICAL_BELOW,
        warnBelowSku: DEFAULT_WARN_BELOW,
        criticalBelowSize: DEFAULT_CRITICAL_BELOW,
        warnBelowSize: DEFAULT_WARN_BELOW,
        criticalBelowPressure: DEFAULT_CRITICAL_BELOW,
        warnBelowPressure: DEFAULT_WARN_BELOW,
      },
    });
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '기본값 복원 실패' }),
      ),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: '전역 경보 기본값 복원' })));
}

/** 창고 수정 폼 */
export async function updateLocationFormAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const zone = String(formData.get('zone') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const returnTo = safeReturnPath(String(formData.get('returnTo') || ''), '/settings');
  if (!id || !name) {
    redirect(dest(returnTo, new URLSearchParams({ err: '창고명 필수' })));
  }
  try {
    await prisma.location.update({
      where: { id },
      data: { name, zone, description },
    });
  } catch (e) {
    redirect(
      dest(
        returnTo,
        new URLSearchParams({ err: e instanceof Error ? e.message : '창고 수정 실패' }),
      ),
    );
  }
  revalidateAdminPaths();
  redirect(dest(returnTo, new URLSearchParams({ ok: '창고 수정' })));
}
