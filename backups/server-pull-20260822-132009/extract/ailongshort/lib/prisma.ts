import { PrismaClient } from '@prisma/client';

/**
 * `.env.local` 에 `DATABASE_URL` 이 없을 때 사용하는 개발용 SQLite.
 * Prisma는 `file:./...` 를 **prisma/schema.prisma 가 있는 폴더(`prisma/`)** 기준으로 해석하므로
 * `./dev.db` → `prisma/dev.db` 입니다. (`file:./prisma/dev.db` 는 `prisma/prisma/dev.db` 로 잘못 잡힘)
 */
const DEFAULT_DEV_DATABASE_URL = 'file:./dev.db';

let resolvedDbUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : '';
/** 예전 안내로 잘못 넣은 `file:./prisma/dev.db` → prisma/prisma 로 해석되어 오류 14 */
if (/^file:\.\/prisma\/dev\.db$/i.test(resolvedDbUrl)) {
  resolvedDbUrl = DEFAULT_DEV_DATABASE_URL;
}
if (!resolvedDbUrl) {
  resolvedDbUrl = DEFAULT_DEV_DATABASE_URL;
}
process.env.DATABASE_URL = resolvedDbUrl;

/**
 * 개발 환경에서 Prisma 클라이언트 단일 인스턴스 유지 (핫 리로드 연결 폭주 방지)
 * PostgreSQL 전환 시 `DATABASE_URL`만 교체하면 됨 (schema datasource 동일 키)
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
