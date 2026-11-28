'use server';

import { revalidatePath } from 'next/cache';
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
