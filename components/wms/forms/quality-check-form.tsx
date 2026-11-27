'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createQualityCheckAction } from '@/lib/wms/actions/quality';
import type { QualityCheckType, QualityResult, AttachmentFileType } from '@prisma/client';
import {
  wmsControl,
  wmsLabel,
  wmsFormCol,
  wmsRow2,
  wmsHelp,
} from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
    >
      {pending ? '저장 중…' : '검사 등록'}
    </button>
  );
}

/** LOT 검사 + mock MTC URL 첨부(선택) */
export function QualityCheckForm({
  lots,
}: {
  lots: { id: string; lotNo: string; heatNo: string; item: { itemCode: string; itemName: string } }[];
}) {
  const [state, action] = useFormState(createQualityCheckAction, initial);

  return (
    <form action={action} className={wmsFormCol}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>LOT</span>
        <select name="lotId" required className={wmsControl}>
          <option value="">선택</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.item.itemCode} / {l.lotNo} / H:{l.heatNo || '-'}
            </option>
          ))}
        </select>
      </label>

      <div className={wmsRow2}>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>검사 유형</span>
          <select name="checkType" className={wmsControl}>
            {(['DIMENSION', 'MATERIAL', 'PRESSURE', 'VISUAL', 'FINAL'] as QualityCheckType[]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>판정</span>
          <select name="result" className={wmsControl}>
            {(['PASS', 'FAIL', 'HOLD'] as QualityResult[]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>검사자</span>
        <input name="inspector" className={wmsControl} placeholder="이름 또는 사번" />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>비고</span>
        <input name="memo" className={wmsControl} placeholder="특이사항" />
      </label>

      <p className={wmsHelp}>
        첨부(mock): 파일명·URL을 함께 넣으면 MTC 등으로 저장됩니다. 실제 스토리지 연동 전 단계입니다.
      </p>

      <div className={wmsRow2}>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>파일명 (선택)</span>
          <input name="fileName" placeholder="MTC-xxx.pdf" className={wmsControl} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>mock URL (선택)</span>
          <input name="mockUrl" placeholder="https://…" className={wmsControl} />
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>첨부 유형</span>
        <select name="fileType" className={wmsControl}>
          {(['MTC', 'INSPECTION_REPORT', 'PHOTO', 'PDF', 'ETC'] as AttachmentFileType[]).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">등록되었습니다.</p> : null}
      <Submit />
    </form>
  );
}
