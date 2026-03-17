export type WhaleActivity = {
  inflow: number;
  outflow: number;
  net: number;
  label: string;
};

export function detectWhaleTransactions(_symbol: string): WhaleActivity {
  return { inflow: 0, outflow: 0, net: 0, label: '데이터 없음 (연동 대기)' };
}
