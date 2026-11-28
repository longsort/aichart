import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { listQualityChecksForUi } from '@/lib/wms/quality-queries';
import { QualityCheckForm } from '@/components/wms/forms/quality-check-form';

/** 검사·MTC — LOT별 검사 등록·이력 */
export default async function QualityPage() {
  const [lots, checks] = await Promise.all([
    prisma.inventoryLot.findMany({
      include: { item: { select: { itemCode: true, itemName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 150,
    }),
    listQualityChecksForUi(80),
  ]);

  return (
    <>
      <WmsPageHeader title="검사·MTC" subtitle="PASS/FAIL/HOLD · mock URL 첨부" />
      <WmsCard title="검사 등록" className="mb-4">
        <QualityCheckForm
          lots={lots.map((l) => ({
            id: l.id,
            lotNo: l.lotNo,
            heatNo: l.heatNo,
            item: { itemCode: l.item.itemCode, itemName: l.item.itemName },
          }))}
        />
      </WmsCard>

      <WmsCard title="검사 이력">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="p-2">LOT</th>
                <th className="p-2">유형</th>
                <th className="p-2">결과</th>
                <th className="p-2">검사자</th>
                <th className="p-2">첨부</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/80">
                  <td className="p-2 font-mono text-slate-200">
                    {c.lot.item.itemCode} / {c.lot.lotNo}
                  </td>
                  <td className="p-2 text-slate-300">{c.checkType}</td>
                  <td className="p-2">
                    <span
                      className={
                        c.result === 'PASS' ? 'text-emerald-400' : c.result === 'FAIL' ? 'text-red-400' : 'text-amber-400'
                      }
                    >
                      {c.result}
                    </span>
                  </td>
                  <td className="p-2 text-slate-300">{c.inspector || '—'}</td>
                  <td className="p-2 text-slate-400">
                    {c.attachments.length
                      ? c.attachments.map((a) => (
                          <span key={a.id} className="mr-2 block truncate" title={a.fileUrl}>
                            {a.fileName} ({a.fileType})
                          </span>
                        ))
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WmsCard>
    </>
  );
}
