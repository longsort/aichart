import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { getItem } from '@/lib/wms/actions/items';
import { prisma } from '@/lib/prisma';
import { ItemEditForm } from '@/components/wms/forms/item-edit-form';

/** 품목 상세·수정 */
export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const errMsg = err ? decodeURIComponent(err) : '';
  const [item, locations] = await Promise.all([getItem(id), prisma.location.findMany({ orderBy: { name: 'asc' } })]);
  if (!item) notFound();

  return (
    <>
      <WmsPageHeader title={`품목 수정 — ${item.itemCode}`} subtitle={item.itemName} />
      {errMsg ? <p className="mb-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">{errMsg}</p> : null}
      <Link href="/items" className="mb-3 inline-block text-xs text-teal-400 underline">
        ← 목록
      </Link>
      <WmsCard>
        <ItemEditForm item={item} locations={locations} />
      </WmsCard>
    </>
  );
}
