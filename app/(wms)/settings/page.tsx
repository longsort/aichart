import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { LocationForm } from '@/components/wms/forms/location-form';
import { PRODUCT_TYPES, PRESSURE_CLASSES } from '@/lib/wms/codes';

/** 기초코드·창고 설정 */
export default async function SettingsPage() {
  const locations = await prisma.location.findMany({ orderBy: { zone: 'asc' } });

  return (
    <>
      <WmsPageHeader title="설정·기초코드" subtitle="창고 등록 · 제품타입·압력등급 코드(참고)" />
      <WmsCard title="창고·구역 추가" className="mb-4">
        <LocationForm />
      </WmsCard>
      <WmsCard title="등록된 창고" className="mb-4">
        <ul className="space-y-1 text-xs text-slate-300">
          {locations.map((l) => (
            <li key={l.id}>
              <span className="font-mono text-teal-400">{l.zone || '—'}</span> {l.name}
              {l.description ? <span className="text-slate-500"> — {l.description}</span> : null}
            </li>
          ))}
        </ul>
      </WmsCard>
      <WmsCard title="제품 타입 (품목 등록 시 사용)">
        <p className="mb-2 text-[10px] text-slate-500">코드는 lib/wms/codes.ts 에 정의되어 있습니다.</p>
        <div className="flex flex-wrap gap-1">
          {PRODUCT_TYPES.map((p) => (
            <span key={p} className="rounded border border-slate-700 px-2 py-0.5 text-[10px]">
              {p}
            </span>
          ))}
        </div>
      </WmsCard>
      <WmsCard title="압력 등급" className="mt-3">
        <div className="flex flex-wrap gap-1">
          {PRESSURE_CLASSES.map((p) => (
            <span key={p} className="rounded border border-slate-700 px-2 py-0.5 text-[10px]">
              {p}
            </span>
          ))}
        </div>
      </WmsCard>
    </>
  );
}
