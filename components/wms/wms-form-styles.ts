/**
 * WMS 폼 — 실제 스타일은 `app/(wms)/wms-tailwind.css` 의 @layer components
 * (`.wms-control`, `.wms-field-label`). 여기서는 클래스명만 export.
 */
export const wmsControl = 'wms-control';
export const wmsControlCompact = 'wms-control-compact';
export const wmsLabel = 'wms-field-label';

export const wmsFormCol = 'flex w-full max-w-2xl flex-col gap-4';
export const wmsFormGrid = 'grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-4 md:gap-y-3';
export const wmsFieldCol = 'flex min-w-0 flex-col gap-1.5';
export const wmsFieldSpan2 = 'flex min-w-0 flex-col gap-1.5 md:col-span-2';
export const wmsRow2 = 'grid grid-cols-1 gap-4 sm:grid-cols-2';
export const wmsHelp = 'rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-xs leading-relaxed text-slate-300';
