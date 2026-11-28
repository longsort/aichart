'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_CRITICAL_BELOW,
  DEFAULT_WARN_BELOW,
  parseNonNegInt,
  parseOptionalNonNegInt,
} from '@/lib/wms/stock-alerts';

function revalidateAlertPaths() {
  revalidatePath('/dashboard');
  revalidatePath('/settings/alerts');
  revalidatePath('/settings');
  revalidatePath('/safety');
}

/**
 * 대시보드 긴급/주의 카드 옆 — 전역 SKU 기준만 빠르게 저장 (사이즈·압력 필드는 유지).
 */
export async function quickSaveDashboardGlobalThresholdsAction(formData: FormData) {
  const criticalBelowSku = parseNonNegInt(formData.get('criticalBelowSku'), DEFAULT_CRITICAL_BELOW);
  const warnBelowSku = parseNonNegInt(formData.get('warnBelowSku'), DEFAULT_WARN_BELOW);
  const pressure = String(formData.get('pressure') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const shortage = String(formData.get('shortage') || '').trim();
  const band = String(formData.get('band') || '').trim();

  const back = () => {
    const sp = new URLSearchParams();
    if (pressure) sp.set('pressure', pressure);
    if (size) sp.set('size', size);
    if (shortage === '1' || shortage === 'true') sp.set('shortage', '1');
    if (band === 'empty' || band === 'critical' || band === 'warn' || band === 'ok') {
      sp.set('band', band);
    }
    return sp;
  };

  if (warnBelowSku < criticalBelowSku) {
    const sp = back();
    sp.set('err', '주의 값은 긴급 이상이어야 합니다.');
    redirect(`/dashboard?${sp.toString()}`);
  }

  try {
    const existing = await prisma.inventoryThresholdSettings.findUnique({
      where: { id: 'default' },
    });
    await prisma.inventoryThresholdSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        criticalBelowSku,
        warnBelowSku,
        criticalBelowSize: existing?.criticalBelowSize ?? DEFAULT_CRITICAL_BELOW,
        warnBelowSize: existing?.warnBelowSize ?? DEFAULT_WARN_BELOW,
        criticalBelowPressure: existing?.criticalBelowPressure ?? DEFAULT_CRITICAL_BELOW,
        warnBelowPressure: existing?.warnBelowPressure ?? DEFAULT_WARN_BELOW,
      },
      update: {
        criticalBelowSku,
        warnBelowSku,
      },
    });
  } catch {
    const sp = back();
    sp.set('err', '전역 긴급/주의 저장 실패');
    redirect(`/dashboard?${sp.toString()}`);
  }

  revalidateAlertPaths();
  const sp = back();
  sp.set('ok', `전역 기준 긴급 <${criticalBelowSku} · 주의 <${warnBelowSku}`);
  redirect(`/dashboard?${sp.toString()}`);
}

/** 전역 긴급/주의 기준 저장 */
export async function saveGlobalThresholdAction(_prev: unknown, formData: FormData) {
  const criticalBelowSku = parseNonNegInt(formData.get('criticalBelowSku'), DEFAULT_CRITICAL_BELOW);
  const warnBelowSku = parseNonNegInt(formData.get('warnBelowSku'), DEFAULT_WARN_BELOW);
  const criticalBelowSize = parseNonNegInt(formData.get('criticalBelowSize'), DEFAULT_CRITICAL_BELOW);
  const warnBelowSize = parseNonNegInt(formData.get('warnBelowSize'), DEFAULT_WARN_BELOW);
  const criticalBelowPressure = parseNonNegInt(
    formData.get('criticalBelowPressure'),
    DEFAULT_CRITICAL_BELOW,
  );
  const warnBelowPressure = parseNonNegInt(formData.get('warnBelowPressure'), DEFAULT_WARN_BELOW);

  if (warnBelowSku < criticalBelowSku) {
    return { success: false as const, error: '주의(SKU) 값은 긴급(SKU) 이상이어야 합니다.' };
  }
  if (warnBelowSize < criticalBelowSize) {
    return { success: false as const, error: '주의(사이즈합) 값은 긴급(사이즈합) 이상이어야 합니다.' };
  }
  if (warnBelowPressure < criticalBelowPressure) {
    return { success: false as const, error: '주의(압력합) 값은 긴급(압력합) 이상이어야 합니다.' };
  }

  try {
    await prisma.inventoryThresholdSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        criticalBelowSku,
        warnBelowSku,
        criticalBelowSize,
        warnBelowSize,
        criticalBelowPressure,
        warnBelowPressure,
      },
      update: {
        criticalBelowSku,
        warnBelowSku,
        criticalBelowSize,
        warnBelowSize,
        criticalBelowPressure,
        warnBelowPressure,
      },
    });
    revalidateAlertPaths();
    return { success: true as const, error: '' };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: '전역 경보 기준 저장 중 오류가 발생했습니다.' };
  }
}

/** 사이즈별 덮어쓰기 저장 (빈칸이면 해당 필드 초기화) */
export async function saveSizeOverrideAction(_prev: unknown, formData: FormData) {
  const nominalSize = String(formData.get('nominalSize') || '').trim();
  if (!nominalSize) {
    return { success: false as const, error: '사이즈를 선택하세요.' };
  }
  const criticalBelow = parseOptionalNonNegInt(formData.get('criticalBelow'));
  const warnBelow = parseOptionalNonNegInt(formData.get('warnBelow'));

  if (criticalBelow != null && warnBelow != null && warnBelow < criticalBelow) {
    return { success: false as const, error: '주의 값은 긴급 이상이어야 합니다.' };
  }

  try {
    if (criticalBelow == null && warnBelow == null) {
      await prisma.sizeThresholdOverride.deleteMany({ where: { nominalSize } });
    } else {
      await prisma.sizeThresholdOverride.upsert({
        where: { nominalSize },
        create: { nominalSize, criticalBelow, warnBelow },
        update: { criticalBelow, warnBelow },
      });
    }
    revalidateAlertPaths();
    return { success: true as const, error: '' };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: '사이즈 경보 덮어쓰기 저장 중 오류가 발생했습니다.' };
  }
}

/** 압력별 덮어쓰기 저장 */
export async function savePressureOverrideAction(_prev: unknown, formData: FormData) {
  const pressureClass = String(formData.get('pressureClass') || '').trim();
  if (!pressureClass) {
    return { success: false as const, error: '압력등급을 선택하세요.' };
  }
  const criticalBelow = parseOptionalNonNegInt(formData.get('criticalBelow'));
  const warnBelow = parseOptionalNonNegInt(formData.get('warnBelow'));

  if (criticalBelow != null && warnBelow != null && warnBelow < criticalBelow) {
    return { success: false as const, error: '주의 값은 긴급 이상이어야 합니다.' };
  }

  try {
    if (criticalBelow == null && warnBelow == null) {
      await prisma.pressureThresholdOverride.deleteMany({ where: { pressureClass } });
    } else {
      await prisma.pressureThresholdOverride.upsert({
        where: { pressureClass },
        create: { pressureClass, criticalBelow, warnBelow },
        update: { criticalBelow, warnBelow },
      });
    }
    revalidateAlertPaths();
    return { success: true as const, error: '' };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: '압력 경보 덮어쓰기 저장 중 오류가 발생했습니다.' };
  }
}

export async function deleteSizeOverrideAction(formData: FormData) {
  const nominalSize = String(formData.get('nominalSize') || '').trim();
  if (!nominalSize) return;
  await prisma.sizeThresholdOverride.deleteMany({ where: { nominalSize } });
  revalidateAlertPaths();
}

export async function deletePressureOverrideAction(formData: FormData) {
  const pressureClass = String(formData.get('pressureClass') || '').trim();
  if (!pressureClass) return;
  await prisma.pressureThresholdOverride.deleteMany({ where: { pressureClass } });
  revalidateAlertPaths();
}
