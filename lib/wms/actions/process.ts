'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  MaterialType,
  ProcessOrderStatus,
  ProcessStep,
  StockMoveType,
  InventoryLotStatus,
} from '@prisma/client';

/** 가공지시 등록 (READY) */
export async function createProcessOrderAction(_prev: unknown, formData: FormData) {
  const sourceLotId = String(formData.get('sourceLotId') || '').trim();
  const targetItemId = String(formData.get('targetItemId') || '').trim();
  const inputQty = Number(formData.get('inputQty'));
  const orderNo = String(formData.get('orderNo') || '').trim() || `PO-${Date.now()}`;
  const memo = String(formData.get('memo') || '').trim();

  if (!sourceLotId || !targetItemId) return { success: false as const, error: '원천 LOT·완제품 품목을 선택하세요.' };
  if (!Number.isFinite(inputQty) || inputQty <= 0) return { success: false as const, error: '투입수량 오류' };

  const lot = await prisma.inventoryLot.findUnique({
    where: { id: sourceLotId },
    include: { item: true },
  });
  if (!lot || lot.item.materialType !== MaterialType.SEMI_RAW) {
    return { success: false as const, error: '毛皮 반제품(SEMI_RAW) LOT만 투입 가능합니다.' };
  }
  if (lot.quantity < inputQty) return { success: false as const, error: `투입 가능 수량 초과 (현재 ${lot.quantity})` };

  try {
    await prisma.processOrder.create({
      data: {
        orderNo,
        sourceLotId,
        targetItemId,
        inputQty,
        status: ProcessOrderStatus.READY,
        processStep: ProcessStep.RAW,
        memo,
      },
    });
    revalidatePath('/process');
    revalidatePath('/inventory');
    return { success: true as const, error: '' };
  } catch {
    return { success: false as const, error: '지시번호 중복 또는 저장 실패' };
  }
}

/** 가공 단계 변경 + LOT 상태 PROCESSING */
export async function updateProcessStepAction(orderId: string, step: ProcessStep) {
  const order = await prisma.processOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  await prisma.processOrder.update({
    where: { id: orderId },
    data: {
      processStep: step,
      status: ProcessOrderStatus.PROCESSING,
      startDate: order.startDate ?? new Date(),
    },
  });
  await prisma.inventoryLot.update({
    where: { id: order.sourceLotId },
    data: { status: InventoryLotStatus.PROCESSING },
  });
  revalidatePath('/process');
  revalidatePath('/dashboard');
}

/** 네이티브 form action (useFormState 없이) */
export async function submitProcessStepForm(formData: FormData) {
  await updateProcessStepFormAction(null, formData);
}

/** 폼: hidden orderId + step */
export async function updateProcessStepFormAction(_prev: unknown, formData: FormData) {
  const orderId = String(formData.get('orderId') || formData.get('id') || '').trim();
  const step = String(formData.get('step') || '') as ProcessStep;
  if (!orderId || !step) return { success: false as const, error: '잘못된 요청' };
  await updateProcessStepAction(orderId, step);
  return { success: true as const, error: '' };
}

/** READY → PROCESSING (가공 시작) */
export async function startProcessOrderAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) return { success: false as const, error: '지시 ID 없음' };
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.processOrder.findUnique({ where: { id }, include: { sourceLot: true } });
      if (!order) throw new Error('지시 없음');
      if (order.status !== ProcessOrderStatus.READY) throw new Error('대기(READY)만 시작 가능');
      if (order.sourceLot.quantity < order.inputQty) throw new Error('원천 LOT 재고 부족');
      await tx.processOrder.update({
        where: { id },
        data: { status: ProcessOrderStatus.PROCESSING, startDate: new Date(), processStep: ProcessStep.CUTTING },
      });
      await tx.inventoryLot.update({
        where: { id: order.sourceLotId },
        data: { status: InventoryLotStatus.PROCESSING },
      });
    });
    revalidatePath('/process');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');
    return { success: true as const, error: '' };
  } catch (e: unknown) {
    return { success: false as const, error: e instanceof Error ? e.message : '시작 실패' };
  }
}

/** 가공 취소 */
export async function cancelProcessOrderAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) return { success: false as const, error: '지시 ID 없음' };
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.processOrder.findUnique({ where: { id } });
      if (!order) throw new Error('지시 없음');
      if (order.status === ProcessOrderStatus.DONE) throw new Error('완료된 지시는 취소 불가');
      if (order.status === ProcessOrderStatus.PROCESSING) {
        await tx.inventoryLot.updateMany({
          where: { id: order.sourceLotId, status: InventoryLotStatus.PROCESSING },
          data: { status: InventoryLotStatus.NORMAL },
        });
      }
      await tx.processOrder.update({
        where: { id },
        data: { status: ProcessOrderStatus.CANCELLED },
      });
    });
    revalidatePath('/process');
    revalidatePath('/inventory');
    return { success: true as const, error: '' };
  } catch (e: unknown) {
    return { success: false as const, error: e instanceof Error ? e.message : '취소 실패' };
  }
}

/**
 * 가공 완료: 반제품 차감 + 완제품 LOT 증가 + PROCESS_IN/OUT 이력
 * — PROCESSING 상태에서만 완료 가능
 */
export async function completeProcessOrderAction(_prev: unknown, formData: FormData) {
  const orderId = String(formData.get('orderId') || '').trim();
  const outputLotNo = String(formData.get('outputLotNo') || '').trim();
  const outputHeatNo = String(formData.get('outputHeatNo') || '').trim();
  const outputQty = Number(formData.get('outputQty'));
  const defectQty = Number(formData.get('defectQty') || 0);
  const locationId = String(formData.get('locationId') || '').trim();

  if (!orderId || !outputLotNo || !locationId) return { success: false as const, error: '지시·산출 LOT·창고는 필수입니다.' };
  if (!Number.isFinite(outputQty) || outputQty <= 0) return { success: false as const, error: '산출 수량 오류' };

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.processOrder.findUnique({
        where: { id: orderId },
        include: { sourceLot: { include: { item: true } }, targetItem: true },
      });
      if (!order) throw new Error('지시 없음');
      if (order.status !== ProcessOrderStatus.PROCESSING) throw new Error('가공중(PROCESSING)에서만 완료 가능합니다. 먼저 「가공시작」을 누르세요.');
      if (order.sourceLot.item.materialType !== MaterialType.SEMI_RAW) throw new Error('반제품 LOT 아님');

      const srcLot = order.sourceLot;
      if (srcLot.quantity < order.inputQty) throw new Error('투입 수량 부족');

      const beforeSrc = srcLot.quantity;
      const afterSrc = beforeSrc - order.inputQty;
      await tx.inventoryLot.update({
        where: { id: srcLot.id },
        data: { quantity: afterSrc, status: afterSrc <= 0 ? InventoryLotStatus.SHIPPED : srcLot.status },
      });

      await tx.stockMove.create({
        data: {
          itemId: srcLot.itemId,
          lotId: srcLot.id,
          moveType: StockMoveType.PROCESS_OUT,
          quantity: order.inputQty,
          beforeQty: beforeSrc,
          afterQty: afterSrc,
          fromLocationId: srcLot.locationId ?? null,
          reason: `가공투입 완료 (${order.orderNo})`,
        },
      });

      const heat = outputHeatNo || '-';
      const existingOut = await tx.inventoryLot.findUnique({
        where: {
          itemId_lotNo_heatNo: { itemId: order.targetItemId, lotNo: outputLotNo, heatNo: heat },
        },
      });
      const beforeOut = existingOut?.quantity ?? 0;
      const afterOut = beforeOut + outputQty;

      const outLot = await tx.inventoryLot.upsert({
        where: {
          itemId_lotNo_heatNo: { itemId: order.targetItemId, lotNo: outputLotNo, heatNo: heat },
        },
        create: {
          itemId: order.targetItemId,
          lotNo: outputLotNo,
          heatNo: heat,
          quantity: outputQty,
          status: InventoryLotStatus.WAIT_INSPECTION,
          receivedDate: new Date(),
          locationId,
        },
        update: {
          quantity: { increment: outputQty },
          locationId,
          status: InventoryLotStatus.WAIT_INSPECTION,
        },
      });

      await tx.stockMove.create({
        data: {
          itemId: order.targetItemId,
          lotId: outLot.id,
          moveType: StockMoveType.PROCESS_IN,
          quantity: outputQty,
          beforeQty: beforeOut,
          afterQty: afterOut,
          toLocationId: locationId,
          reason: `가공산출 (${order.orderNo})`,
        },
      });

      await tx.processOrder.update({
        where: { id: orderId },
        data: {
          status: ProcessOrderStatus.DONE,
          processStep: ProcessStep.FINISHED,
          outputQty,
          defectQty: Number.isFinite(defectQty) ? Math.max(0, defectQty) : 0,
          endDate: new Date(),
        },
      });
    });

    revalidatePath('/process');
    revalidatePath('/inventory');
    revalidatePath('/moves');
    revalidatePath('/dashboard');
    return { success: true as const, error: '' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '가공 완료 처리 오류';
    return { success: false as const, error: msg };
  }
}

/** HTML form용 래퍼 (리다이렉트 + 오류 쿼리) */
export async function createProcessWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await createProcessOrderAction(null, formData);
  if (!r.success) redirect(`/process?err=${encodeURIComponent(r.error)}`);
  redirect('/process');
}

export async function completeProcessWrapper(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await completeProcessOrderAction(null, formData);
  if (!r.success) redirect(`/process?err=${encodeURIComponent(r.error)}`);
  redirect('/process');
}

export async function startProcessForm(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await startProcessOrderAction(null, formData);
  if (!r.success) redirect(`/process?err=${encodeURIComponent(r.error)}`);
  redirect('/process');
}

export async function cancelProcessForm(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await cancelProcessOrderAction(null, formData);
  if (!r.success) redirect(`/process?err=${encodeURIComponent(r.error)}`);
  redirect('/process');
}

export async function updateProcessStepForm(formData: FormData) {
  const { redirect } = await import('next/navigation');
  const r = await updateProcessStepFormAction(null, formData);
  if (!r.success) redirect(`/process?err=${encodeURIComponent(r.error)}`);
  redirect('/process');
}
