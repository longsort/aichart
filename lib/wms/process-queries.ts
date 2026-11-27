import { prisma } from '@/lib/prisma';

/** 가공 지시 목록 (서버 컴포넌트용 — actions 파일과 분리) */
export async function listProcessOrdersForUi() {
  return prisma.processOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      sourceLot: { include: { item: true } },
      targetItem: true,
    },
  });
}
