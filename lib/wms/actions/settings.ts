'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

/**
 * 설정 화면 — 창고·구역 추가 (useFormState).
 */
export async function createLocationAction(_prev: unknown, formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const zone = String(formData.get('zone') || '').trim();
  const description = String(formData.get('description') || '').trim();

  if (!name) {
    return { success: false as const, error: '창고명은 필수입니다.' };
  }

  try {
    await prisma.location.create({
      data: { name, zone, description },
    });
    revalidatePath('/settings');
    revalidatePath('/stock/in');
    revalidatePath('/stock/out');
    return { success: true as const, error: '' };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: '창고 저장 중 오류가 발생했습니다.' };
  }
}
