'use server';

import type { Prisma, StockMoveType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** 재고이동 이력 (필터·페이지) */
export async function listStockMoves(filters?: { moveType?: string; q?: string }, take = 200) {
  const where: Prisma.StockMoveWhereInput = {};
  if (filters?.moveType && filters.moveType !== 'ALL') {
    where.moveType = filters.moveType as StockMoveType;
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { documentNo: { contains: q } },
      { customerName: { contains: q } },
      { vendorName: { contains: q } },
      { item: { itemCode: { contains: q } } },
    ];
  }
  return prisma.stockMove.findMany({
    where,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      item: true,
      lot: true,
      fromLocation: true,
      toLocation: true,
    },
  });
}
