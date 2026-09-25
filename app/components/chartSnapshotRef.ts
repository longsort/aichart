/** ChartView ref 타입만 — 홈 청크가 ChartView 본문을 끌어오지 않게 분리 */
export type ChartSnapshotRef = {
  getSnapshot: () => string | null;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  restoreDefaultChartView: () => void;
  saveChartView: () => boolean;
  sendTelegramTest: () => Promise<{ ok: boolean; error?: string }>;
};
