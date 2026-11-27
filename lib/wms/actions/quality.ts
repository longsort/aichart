'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { QualityCheckType, QualityResult, AttachmentFileType, InventoryLotStatus } from '@prisma/client';

/** LOT 검사 등록 + (선택) MTC 등 mock URL 첨부 */
export async function createQualityCheckAction(_prev: unknown, formData: FormData) {
  const lotId = String(formData.get('lotId') || '').trim();
  const checkType = String(formData.get('checkType') || 'VISUAL') as QualityCheckType;
  const result = String(formData.get('result') || 'PASS') as QualityResult;
  const inspector = String(formData.get('inspector') || '').trim();
  const memo = String(formData.get('memo') || '').trim();
  const mockUrl = String(formData.get('mockUrl') || '').trim();
  const fileName = String(formData.get('fileName') || '').trim();
  const fileType = String(formData.get('fileType') || 'MTC') as AttachmentFileType;

  if (!lotId) return { success: false as const, error: 'LOT 필수' };

  try {
    const qc = await prisma.qualityCheck.create({
      data: {
        lotId,
        checkType,
        result,
        inspector,
        memo,
      },
    });

    if (mockUrl && fileName) {
      await prisma.attachment.create({
        data: {
          lotId,
          qualityCheckId: qc.id,
          fileName,
          fileUrl: mockUrl,
          fileType,
        },
      });
    }

    if (result === QualityResult.PASS) {
      await prisma.inventoryLot.update({
        where: { id: lotId },
        data: { status: InventoryLotStatus.NORMAL },
      });
    } else if (result === QualityResult.FAIL) {
      await prisma.inventoryLot.update({
        where: { id: lotId },
        data: { status: InventoryLotStatus.DEFECT },
      });
    } else {
      await prisma.inventoryLot.update({
        where: { id: lotId },
        data: { status: InventoryLotStatus.HOLD },
      });
    }

    revalidatePath('/quality');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');
    return { success: true as const, error: '' };
  } catch {
    return { success: false as const, error: '검사 저장 실패' };
  }
}

/** LOT에만 MTC mock 첨부 */
export async function addAttachmentMockAction(formData: FormData) {
  const lotId = String(formData.get('lotId') ?? '').trim();
  const fileName = String(formData.get('fileName') ?? '').trim();
  const fileType = String(formData.get('fileType') ?? 'MTC') as AttachmentFileType;
  if (!lotId || !fileName) throw new Error('LOT·파일명 필수');
  const url = `https://mock-storage.local/mtc/${encodeURIComponent(fileName)}?t=${Date.now()}`;
  await prisma.attachment.create({
    data: { lotId, fileName, fileUrl: url, fileType },
  });
  revalidatePath('/quality');
  revalidatePath(`/inventory/${lotId}`);
}

/** 검사 폼 래퍼 */
export async function createQualityWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await createQualityCheckAction(null, formData);
  if (!r.success) redirect(`/quality?err=${encodeURIComponent(r.error)}`);
  redirect('/quality');
}

/** MTC mock 첨부 폼 */
export async function addAttachmentWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  try {
    await addAttachmentMockAction(formData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '첨부 실패';
    redirect(`/quality?err=${encodeURIComponent(msg)}`);
  }
  redirect('/quality');
}
