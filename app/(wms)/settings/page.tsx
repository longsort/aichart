import Link from 'next/link';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { LocationForm } from '@/components/wms/forms/location-form';
import { PRODUCT_TYPES, PRESSURE_CLASSES } from '@/lib/wms/codes';
import { deleteLocationForm } from '@/lib/wms/actions/locations';
import { updateLocationFormAction } from '@/lib/wms/actions/admin-records';
import { ConfirmSubmitButton } from '@/components/wms/confirm-submit-button';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';

type Search = { ok?: string; err?: string };

/** 기초코드·창고 설정 — 창고 수정/삭제 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: { zone: 'asc' } });

  return (
    <>
      <WmsPageHeader title="설정·기초코드" subtitle="창고 등록·수정·삭제 · 제품타입·압력등급 코드(참고)" />
      {sp.err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {sp.err}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {sp.ok}
        </p>
      ) : null}

      <WmsCard title="재고 경보" className="mb-4">
        <p className="mb-2 text-sm text-slate-300">
          긴급(빨강) / 주의(노랑) / 정상(초록) 기준은 별도 메뉴에서 바꿉니다.
        </p>
        <Link
          href="/settings/alerts"
          className="inline-flex min-h-9 items-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-600"
        >
          재고 경보 설정 열기
        </Link>
      </WmsCard>
      <WmsCard title="창고·구역 추가" className="mb-4">
        <LocationForm />
      </WmsCard>
      <WmsCard title="등록된 창고 (수정·삭제)" className="mb-4">
        {locations.length === 0 ? (
          <p className="text-xs text-slate-500">등록된 창고 없음</p>
        ) : (
          <ul className="space-y-3">
            {locations.map((l) => (
              <li
                key={l.id}
                className="rounded border border-slate-700 bg-slate-900/40 px-3 py-2"
              >
                <form action={updateLocationFormAction} className="grid gap-2 sm:grid-cols-4 sm:items-end">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="returnTo" value="/settings" />
                  <label className="flex flex-col gap-1">
                    <span className={wmsLabel}>창고명</span>
                    <input name="name" required defaultValue={l.name} className={wmsControlCompact} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={wmsLabel}>구역</span>
                    <input name="zone" defaultValue={l.zone || ''} className={wmsControlCompact} />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className={wmsLabel}>설명</span>
                    <input
                      name="description"
                      defaultValue={l.description || ''}
                      className={wmsControlCompact}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-4">
                    <button
                      type="submit"
                      className="inline-flex min-h-8 items-center rounded-md bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      수정
                    </button>
                  </div>
                </form>
                <form action={deleteLocationForm} className="mt-2">
                  <input type="hidden" name="id" value={l.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`창고「${l.name}」을 삭제할까요? (품목/LOT 사용 중이면 차단됩니다)`}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    삭제
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
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
