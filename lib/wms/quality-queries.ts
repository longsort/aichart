import { prisma } from '@/lib/prisma';

/** 검사 이력 (UI용) */
export async function listQualityChecksForUi(take = 100) {
  return prisma.qualityCheck.findMany({
    take,
    orderBy: { checkedAt: 'desc' },
    include: {
      lot: { include: { item: true } },
      attachments: true,
    },
  });
}
