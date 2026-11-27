'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

/** 위치 목록 */
export async function listLocations() {
  return prisma.location.findMany({ orderBy: { zone: 'asc', name: 'asc' } });
}

/** 위치 등록 */
export async function createLocation(data: { name: string; zone?: string; description?: string }) {
  await prisma.location.create({
    data: {
      name: data.name.trim(),
      zone: data.zone?.trim() ?? '',
      description: data.description?.trim() ?? '',
    },
  });
  revalidatePath('/settings');
  revalidatePath('/stock/in');
  revalidatePath('/stock/out');
}

/** 위치 수정 */
export async function updateLocation(id: string, data: { name: string; zone?: string; description?: string }) {
  await prisma.location.update({
    where: { id },
    data: {
      name: data.name.trim(),
      zone: data.zone?.trim() ?? '',
      description: data.description?.trim() ?? '',
    },
  });
  revalidatePath('/settings');
}

/** 위치 삭제 (참조 있으면 차단) */
export async function deleteLocation(id: string) {
  const [i, l] = await Promise.all([
    prisma.item.count({ where: { locationId: id } }),
    prisma.inventoryLot.count({ where: { locationId: id } }),
  ]);
  if (i + l > 0) {
    throw new Error('품목 또는 LOT에서 사용 중인 위치는 삭제할 수 없습니다.');
  }
  await prisma.location.delete({ where: { id } });
  revalidatePath('/settings');
}

/** 설정 화면: 위치 등록 폼 */
export async function createLocationFromForm(formData: FormData) {
  const { redirect } = await import('next/navigation');
  try {
    await createLocation({
      name: String(formData.get('name') ?? ''),
      zone: String(formData.get('zone') ?? ''),
      description: String(formData.get('description') ?? ''),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    redirect(`/settings?err=${encodeURIComponent(msg)}`);
  }
  redirect('/settings');
}

/** 위치 삭제 폼 */
export async function deleteLocationForm(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const id = String(formData.get('id') ?? '').trim();
  try {
    await deleteLocation(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '삭제 실패';
    redirect(`/settings?err=${encodeURIComponent(msg)}`);
  }
  redirect('/settings');
}
