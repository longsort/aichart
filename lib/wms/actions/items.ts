'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { MaterialType } from '@prisma/client';

/** 품목 등록 */
export async function createItemAction(_prev: unknown, formData: FormData) {
  const itemCode = String(formData.get('itemCode') || '').trim();
  const itemName = String(formData.get('itemName') || '').trim();
  const materialType = String(formData.get('materialType') || '') as MaterialType;
  const productType = String(formData.get('productType') || '').trim();
  const standard = String(formData.get('standard') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const pressureClass = String(formData.get('pressureClass') || '').trim();
  const unit = String(formData.get('unit') || 'EA').trim();
  const safetyStock = Number(formData.get('safetyStock') || 0);
  const locationId = String(formData.get('locationId') || '').trim();
  const memo = String(formData.get('memo') || '').trim();

  if (!itemCode || !itemName) return { success: false as const, error: '품목코드·품목명은 필수입니다.' };
  if (!['SCS304', 'SCS316', 'SEMI_RAW'].includes(materialType)) {
    return { success: false as const, error: '재질을 선택하세요.' };
  }

  try {
    await prisma.item.create({
      data: {
        itemCode,
        itemName,
        materialType,
        productType: productType || '기타',
        standard,
        size,
        pressureClass,
        unit: unit || 'EA',
        safetyStock: Number.isFinite(safetyStock) ? Math.max(0, Math.floor(safetyStock)) : 0,
        locationId: locationId || null,
        memo,
      },
    });
    revalidatePath('/items');
    revalidatePath('/dashboard');
    return { success: true as const, error: '' };
  } catch {
    return { success: false as const, error: '동일 품목코드가 있거나 저장에 실패했습니다.' };
  }
}

/** 품목 수정 */
export async function updateItemAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) return { success: false as const, error: 'id 없음' };

  const itemName = String(formData.get('itemName') || '').trim();
  const materialType = String(formData.get('materialType') || '') as MaterialType;
  const productType = String(formData.get('productType') || '').trim();
  const standard = String(formData.get('standard') || '').trim();
  const size = String(formData.get('size') || '').trim();
  const pressureClass = String(formData.get('pressureClass') || '').trim();
  const unit = String(formData.get('unit') || 'EA').trim();
  const safetyStock = Number(formData.get('safetyStock') || 0);
  const locationId = String(formData.get('locationId') || '').trim();
  const memo = String(formData.get('memo') || '').trim();
  /** 체크박스: 체크 시 `on`, 미체크 시 필드 없음 */
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';

  try {
    await prisma.item.update({
      where: { id },
      data: {
        itemName,
        materialType,
        productType: productType || '기타',
        standard,
        size,
        pressureClass,
        unit: unit || 'EA',
        safetyStock: Number.isFinite(safetyStock) ? Math.max(0, Math.floor(safetyStock)) : 0,
        locationId: locationId || null,
        memo,
        isActive,
      },
    });
    revalidatePath('/items');
    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    return { success: true as const, error: '' };
  } catch {
    return { success: false as const, error: '수정 실패' };
  }
}

/** 품목 삭제(비활성) */
export async function deactivateItemAction(id: string) {
  await prisma.item.update({ where: { id }, data: { isActive: false } });
  revalidatePath('/items');
  revalidatePath('/dashboard');
}

/** 폼에서 비활성 */
export async function deactivateItemFormAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) return { success: false as const, error: 'id 없음' };
  await deactivateItemAction(id);
  return { success: true as const, error: '' };
}

/** 품목 목록 (필터) */
export async function listItems(filters?: { material?: string; productType?: string; q?: string }) {
  const where: import('@prisma/client').Prisma.ItemWhereInput = {};
  if (filters?.material && filters.material !== 'ALL') {
    where.materialType = filters.material as MaterialType;
  }
  if (filters?.productType && filters.productType !== 'ALL') {
    where.productType = filters.productType;
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { itemCode: { contains: q } },
      { itemName: { contains: q } },
      { standard: { contains: q } },
      { size: { contains: q } },
    ];
  }
  const items = await prisma.item.findMany({
    where,
    include: { location: true, lots: { select: { quantity: true } } },
    orderBy: { itemCode: 'asc' },
  });
  return items.map((it) => ({
    ...it,
    totalQty: it.lots.reduce((s, l) => s + l.quantity, 0),
    belowSafety: it.isActive && it.lots.reduce((s, l) => s + l.quantity, 0) < it.safetyStock,
  }));
}

/** 품목 단건 */
export async function getItem(id: string) {
  return prisma.item.findUnique({ where: { id }, include: { location: true } });
}

/** 품목 물리 삭제 (LOT 없을 때만) */
export async function deleteItemHardAction(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const id = String(formData.get('id') ?? '').trim();
  const n = await prisma.inventoryLot.count({ where: { itemId: id } });
  if (n > 0) {
    redirect(`/items?err=${encodeURIComponent('LOT가 남아 있어 삭제할 수 없습니다.')}`);
  }
  await prisma.item.delete({ where: { id } });
  revalidatePath('/items');
  revalidatePath('/dashboard');
  redirect('/items');
}

/** 등록 폼 → 리다이렉트 */
export async function createItemWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await createItemAction(null, formData);
  if (!r.success) redirect(`/items?err=${encodeURIComponent(r.error)}`);
  redirect('/items');
}

/** 수정 폼 → 리다이렉트 */
export async function updateItemWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const id = String(formData.get('id') ?? '').trim();
  const r = await updateItemAction(null, formData);
  if (!r.success) redirect(`/items/${id}?err=${encodeURIComponent(r.error)}`);
  redirect('/items');
}
