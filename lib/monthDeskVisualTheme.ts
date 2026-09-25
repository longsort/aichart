/** 마감·안착 비주얼 — 다크/라이트 공통 토큰 */
export type MonthDeskVisualTheme = {
  id: 'dark' | 'light';
  bg: string;
  panel: string;
  panelBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  long: string;
  short: string;
  wait: string;
  track: string;
  gaugeText: string;
  heatEmpty: string;
};

export function getMonthDeskVisualTheme(theme: 'dark' | 'light'): MonthDeskVisualTheme {
  if (theme === 'light') {
    return {
      id: 'light',
      bg: 'rgba(248,250,252,0.96)',
      panel: 'linear-gradient(155deg, rgba(237,233,254,0.9) 0%, rgba(241,245,249,0.95) 48%, rgba(255,255,255,0.98) 100%)',
      panelBorder: 'rgba(124,58,237,0.22)',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#7c3aed',
      long: '#16a34a',
      short: '#dc2626',
      wait: '#ca8a04',
      track: 'rgba(148,163,184,0.45)',
      gaugeText: '#0f172a',
      heatEmpty: 'rgba(148,163,184,0.25)',
    };
  }
  return {
    id: 'dark',
    bg: 'rgba(8,12,28,0.92)',
    panel: 'linear-gradient(155deg, rgba(30,27,75,0.45) 0%, rgba(12,18,36,0.88) 42%, rgba(8,12,28,0.96) 100%)',
    panelBorder: 'rgba(167,139,250,0.28)',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    accent: '#a78bfa',
    long: '#4ade80',
    short: '#f87171',
    wait: '#fcd34d',
    track: 'rgba(51,65,85,0.85)',
    gaugeText: '#f8fafc',
    heatEmpty: 'rgba(51,65,85,0.55)',
  };
}
