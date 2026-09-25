/**
 * Mirage zone 면 라벨 — 짧은 표시(1~2토큰) + HUD/툴팁 전체 한글.
 * 영어 약어 모드·접근/선택 시 신호 확장 지원.
 */
import type { OverlayItem } from '@/types';
import {
  buildMirageZoneAiFaceLabel,
  type MirageZoneProactiveIntel,
  type ZoneRole,
} from '@/lib/mergedDeskMirageZoneExchangeIntel';

export type MirageZoneFaceLang = 'ko' | 'en';
export type MirageZoneFaceReveal = 'always' | 'progressive';

const ROLE_BASE_KO: Record<ZoneRole, string> = {
  support: '지지',
  resistance: '저항',
  ob_bull: '수요OB',
  ob_bear: '공급OB',
  neutral: '존',
};

const ROLE_BASE_EN: Record<ZoneRole, string> = {
  support: 'SUP',
  resistance: 'RES',
  ob_bull: 'OB+',
  ob_bear: 'OB-',
  neutral: 'ZN',
};

const KO_TO_EN: Record<string, string> = {
  받침가능: 'HOLD',
  받침관찰: 'HLD?',
  받침약: 'HLD-',
  받침유지: 'HLD+',
  받침흔들: 'HLD~',
  위막힘: 'REJ',
  위압력관찰: 'REJ?',
  막힘약: 'REJ-',
  위압력유지: 'REJ+',
  막힘흔들: 'REJ~',
  마감확인: 'SET',
  마감대기: 'SET?',
  마감깨짐: 'BRK',
  '구조전환↑': 'CH+',
  '구조전환↓': 'CH-',
  '구조바뀜↑': 'MS+',
  '구조바뀜↓': 'MS-',
  구조실패: 'MSX',
  '돌파시도↑': 'BO+',
  '돌파시도↓': 'BO-',
  '추세이어↑': 'BOS+',
  '추세이어↓': 'BOS-',
  매수블럭: 'OB+',
  매도블럭: 'OB-',
  오더블럭: 'OB',
  예전거래많음: 'WH',
  거래많았음: 'WH~',
  상승장맞음: 'UP',
  하락장맞음: 'DN',
  횡보장: 'RNG',
  장세안맞음: 'X',
  매수유입: 'BUY',
  매도유입: 'SEL',
  매수압력: 'BUY-',
  매도압력: 'SEL-',
  수급혼조: 'MIX',
  표본수집: '…',
  MTF강일치: 'MTF+',
  MTF일치: 'MTF',
  MTF역: 'MTF-',
  분석: 'AN',
  안착: 'SET',
  확정: 'OK',
  안착실패: 'FAIL',
  재시도: 'RT',
  재시도실패: 'RTX',
  BOS: 'BOS',
  CHOCH: 'CH',
  구조안착: 'ST+',
  구조무효: 'STX',
};

/** 영어 약어 → 한글 (HUD·툴팁) */
export const MIRAGE_ZONE_EN_TO_KO: Record<string, string> = Object.fromEntries(
  Object.entries(KO_TO_EN).map(([ko, en]) => [en, ko])
);
MIRAGE_ZONE_EN_TO_KO.SUP = '지지';
MIRAGE_ZONE_EN_TO_KO.RES = '저항';
MIRAGE_ZONE_EN_TO_KO['OB+'] = '수요OB';
MIRAGE_ZONE_EN_TO_KO['OB-'] = '공급OB';
MIRAGE_ZONE_EN_TO_KO.ZN = '존';
MIRAGE_ZONE_EN_TO_KO.HLD = '받침가능';
MIRAGE_ZONE_EN_TO_KO['HLD?'] = '받침관찰';
MIRAGE_ZONE_EN_TO_KO.REJ = '위막힘';
MIRAGE_ZONE_EN_TO_KO['REJ?'] = '위압력관찰';
MIRAGE_ZONE_EN_TO_KO.SET = '마감확인';
MIRAGE_ZONE_EN_TO_KO['SET?'] = '마감대기';
MIRAGE_ZONE_EN_TO_KO.BRK = '마감깨짐';
MIRAGE_ZONE_EN_TO_KO.WH = '예전거래많음';
MIRAGE_ZONE_EN_TO_KO['WH~'] = '거래많았음';

export function mirageZoneEnTokenToKo(token: string): string {
  const t = String(token || '').trim();
  if (!t) return '';
  return MIRAGE_ZONE_EN_TO_KO[t] ?? t;
}

/** 차트 EN 면 라벨 → 짧은 한글 캡션 */
export function mirageZoneFaceKoFromEn(base: string, signal?: string | null): string {
  const parts = [mirageZoneEnTokenToKo(base)].filter(Boolean);
  if (signal) {
    const sig = signal.replace(/^[·\s]+/, '');
    const ko = mirageZoneEnTokenToKo(sig);
    if (ko) parts.push(ko);
  }
  return parts.join(' · ');
}

export function isMirageZoneFaceEnglish(
  overlay: Pick<import('@/types').OverlayItem, 'zoneFaceLang' | 'zoneFaceBase' | 'label'>
): boolean {
  if (overlay.zoneFaceLang === 'en') return true;
  if (overlay.zoneFaceLang === 'ko') return false;
  const base = String(overlay.zoneFaceBase || overlay.label || '').split('·')[0]?.trim() || '';
  return /^[A-Z0-9+?~.\-]{1,8}$/.test(base);
}

function toEnToken(ko: string): string {
  if (KO_TO_EN[ko]) return KO_TO_EN[ko]!;
  if (/^페\d+/.test(ko)) return ko.replace('페', 'PH');
  if (/^로그\d+/.test(ko)) return ko.replace('로그', 'L');
  if (/^반응\d+%/.test(ko)) return ko.replace('반응', 'R');
  if (/^유지\d+%/.test(ko)) return ko.replace('유지', 'K');
  return ko.length <= 5 ? ko.toUpperCase() : ko.slice(0, 4).toUpperCase();
}

function roleBiasToken(role: ZoneRole, lang: MirageZoneFaceLang): string {
  if (role === 'support' || role === 'ob_bull') return lang === 'en' ? 'LZN' : '롱존';
  if (role === 'resistance' || role === 'ob_bear') return lang === 'en' ? 'SZN' : '숏존';
  return lang === 'en' ? 'ZN' : '존';
}

/** 돌파·무효 신호가 있으면 숏존/롱존 베이스 대신 돌파 라벨 */
function preferBreakFaceBase(base: string, signal: string | null, lang: MirageZoneFaceLang): string {
  const sig = String(signal || '');
  if (/숏돌파|상향돌파|돌파무효|마감깨짐/.test(`${base}${sig}`)) {
    return lang === 'en' ? 'BRK↑' : '숏돌파';
  }
  if (/롱이탈|하향이탈/.test(`${base}${sig}`)) {
    return lang === 'en' ? 'BRK↓' : '롱이탈';
  }
  return base;
}

function roleBase(role: ZoneRole, baseCaption: string, lang: MirageZoneFaceLang): string {
  const raw = String(baseCaption || '').trim();
  const first = raw.split('·')[0]?.trim() || '';
  if (lang === 'en') {
    if (first === '지지' || first === '저항' || first === '횡보' || first === '존' || first === 'ZN') {
      return roleBiasToken(role, lang);
    }
    if (/^OB/i.test(first) || first.includes('OB')) return ROLE_BASE_EN[role];
    return ROLE_BASE_EN[role] === 'ZN' ? roleBiasToken(role, lang) : ROLE_BASE_EN[role];
  }
  if (!first || first === '존' || first === 'ZN') return roleBiasToken(role, lang);
  if (['지지', '저항', '횡보', '수요', '공급', '롱존', '숏존'].some((k) => first.includes(k))) {
    return first.length <= 6 ? first : ROLE_BASE_KO[role] === '존' ? roleBiasToken(role, lang) : ROLE_BASE_KO[role];
  }
  return ROLE_BASE_KO[role] === '존' ? roleBiasToken(role, lang) : ROLE_BASE_KO[role];
}

/** AI 세그먼트 중 면에 1개만 노출할 최우선 신호 */
export function pickMirageZoneFaceSignal(
  role: ZoneRole,
  intel: MirageZoneProactiveIntel,
  opts?: {
    lifecycleKo?: string | null;
    learningKo?: string | null;
    deepParts?: string[];
    lang?: MirageZoneFaceLang;
  }
): string | null {
  const lang = opts?.lang ?? 'ko';
  const deep = opts?.deepParts ?? intel.deepFaceKo ?? [];
  const lifecycle = opts?.lifecycleKo?.trim();
  if (lifecycle) {
    return lang === 'en' ? toEnToken(lifecycle) : lifecycle;
  }

  const deepPriority = [
    '마감확인',
    '마감깨짐',
    '마감대기',
    '구조전환↑',
    '구조전환↓',
    '매수블럭',
    '매도블럭',
    '예전거래많음',
    '거래많았음',
    '상승장맞음',
    '하락장맞음',
    '장세안맞음',
    '횡보장',
  ];
  for (const key of deepPriority) {
    if (deep.includes(key)) return lang === 'en' ? toEnToken(key) : key;
  }
  for (const d of deep) {
    if (d) return lang === 'en' ? toEnToken(d) : d;
  }

  const full = buildMirageZoneAiFaceLabel(role, intel, {
    deepParts: deep,
    learningKo: opts?.learningKo,
  });
  const segments = full.split('·').map((s) => s.trim()).filter(Boolean);
  const skipBase = new Set(['지지', '저항', '횡보', '수요OB', '공급OB', '존', '롱존', '숏존']);
  for (const seg of segments) {
    if (!skipBase.has(seg)) {
      return lang === 'en' ? toEnToken(seg) : seg;
    }
  }

  if (opts?.learningKo) {
    return lang === 'en' ? toEnToken(opts.learningKo) : opts.learningKo;
  }
  return null;
}

export type MirageZoneFaceCompact = {
  base: string;
  signal: string | null;
  labelCompact: string;
  detailKo: string;
};

export function buildMirageZoneFaceCompact(
  role: ZoneRole,
  baseCaption: string,
  intel: MirageZoneProactiveIntel,
  opts?: {
    lifecycleKo?: string | null;
    learningKo?: string | null;
    deepParts?: string[];
    lang?: MirageZoneFaceLang;
  }
): MirageZoneFaceCompact {
  const lang = opts?.lang ?? 'ko';
  const base0 = roleBase(role, baseCaption, lang);
  const signal = pickMirageZoneFaceSignal(role, intel, { ...opts, lang });
  const base = preferBreakFaceBase(base0, signal ?? opts?.lifecycleKo ?? null, lang);
  const labelCompact = signal ? `${base}·${signal}` : base;
  const detailKo = intel.tagKo || buildMirageZoneAiFaceLabel(role, intel, opts);
  return { base, signal, labelCompact, detailKo };
}

export function applyMirageZoneFaceCompactFields(
  overlay: OverlayItem,
  role: ZoneRole,
  baseCaption: string,
  intel: MirageZoneProactiveIntel,
  opts?: {
    lifecycleKo?: string | null;
    learningKo?: string | null;
    deepParts?: string[];
    lang?: MirageZoneFaceLang;
    priorTooltip?: string;
  }
): OverlayItem {
  const lang = opts?.lang ?? 'ko';
  const face = buildMirageZoneFaceCompact(role, baseCaption, intel, opts);
  const prior = String(opts?.priorTooltip || overlay.labelTooltip || '').trim();
  const tooltipKo =
    lang === 'en'
      ? `${face.detailKo} · 영어 라벨 탭 → 한글 설명`
      : prior
        ? `${prior} · ${intel.detailKo}`
        : `${intel.detailKo} · 탭하여 상세`;

  return {
    ...overlay,
    label: face.labelCompact,
    zoneFaceBase: face.base,
    zoneFaceSignal: face.signal ?? undefined,
    zoneFaceDetailKo: face.detailKo,
    zoneFaceLang: lang,
    labelTooltip: tooltipKo,
  };
}

/** 긴 TV 면 라벨 → 1~2토큰 (예: ▲롱 $78) */
export function compressMirageTvFaceParts(
  baseIn: string,
  signalIn?: string | null,
  lang: MirageZoneFaceLang = 'ko'
): { base: string; signal: string | null } {
  const joined = [String(baseIn || '').trim(), String(signalIn || '').trim()]
    .filter(Boolean)
    .join(' · ');
  let text = joined.replace(/\s+/g, ' ').trim();
  if (!text) return { base: lang === 'en' ? 'ZN' : '존', signal: null };

  // 이미 짧은 한글 신형 라벨은 그대로 정리만
  text = text
    .replace(/▲\s*LONG/gi, '▲롱')
    .replace(/▼\s*SHORT/gi, '▼숏')
    .replace(/◆\s*WAIT/gi, '◆대기')
    .replace(/\bLONG\b/gi, '롱')
    .replace(/\bSHORT\b/gi, '숏')
    .replace(/\bWAIT\b/gi, '대기')
    .replace(/\bNEUTRAL\b/gi, '대기')
    .replace(/\$\$\$\s*(\d+)\s*%?/g, '$$$1')
    .replace(/Resistance\s*(\d+)\s*%?/gi, '저항$1')
    .replace(/Support\s*(\d+)\s*%?/gi, '지지$1')
    .replace(/OB\s*BUY\s*(\d+)\s*%?(?:\s*CONF)?/gi, 'OB$1')
    .replace(/OB\s*SELL\s*(\d+)\s*%?(?:\s*CONF)?/gi, 'OB$1')
    .replace(/OB\s*(\d+)\s*%(?:\s*CONF)?/gi, 'OB$1')
    .replace(/\bCONF\b/gi, '확')
    .replace(/\bVERDICT\b/gi, '확')
    .replace(/\bSCAN\b/gi, '')
    .replace(/\bLIQ\b/gi, '')
    .replace(/\bGAP\b/gi, '')
    .replace(/\bBUY\b/gi, '')
    .replace(/\bSELL\b/gi, '')
    .replace(/\bBATTLE\b/gi, '혼전')
    .replace(/L(\d+)%\s*[·･]\s*S(\d+)%/gi, 'L$1/S$2')
    .replace(/L(\d+)\s*[·･]\s*S(\d+)/gi, 'L$1/S$2')
    .replace(/\s*[·･]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 전투 접두가 본문과 중복되면 접두만 신호로
  const battlePref = text.match(/^(⚔\s*)?L(\d+)\/S(\d+)\s+(.*)$/);
  if (battlePref && battlePref[4]) {
    const body = battlePref[4].trim();
    const sig = `L${battlePref[2]}/S${battlePref[3]}`;
    if (lang === 'en') {
      return {
        base: body
          .replace(/▲롱/g, '▲L')
          .replace(/▼숏/g, '▼S')
          .replace(/◆대기/g, '◆W')
          .replace(/저항/g, 'R')
          .replace(/지지/g, 'S'),
        signal: sig,
      };
    }
    return { base: body, signal: sig };
  }

  // 신호 후보: 확/혼전/Lxx/Syy / 매수·매도(중복 시 제거)
  let signal: string | null = null;
  const sigMatch = text.match(/\b(확|혼전|L\d+\/S\d+)\b/);
  if (sigMatch) {
    signal = sigMatch[1]!;
    text = text.replace(sigMatch[0], '').replace(/\s{2,}/g, ' ').trim();
  }

  // 중복 방향어 제거: ▲롱 롱 72 → ▲롱 72
  text = text
    .replace(/▲롱\s*롱\b/g, '▲롱')
    .replace(/▼숏\s*숏\b/g, '▼숏')
    .replace(/◆대기\s*대기\b/g, '◆대기')
    .replace(/\b매수\b/g, '')
    .replace(/\b매도\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (lang === 'en') {
    text = text
      .replace(/▲롱/g, '▲L')
      .replace(/▼숏/g, '▼S')
      .replace(/◆대기/g, '◆W')
      .replace(/저항(\d+)/g, 'R$1')
      .replace(/지지(\d+)/g, 'S$1')
      .replace(/확/g, 'OK')
      .replace(/혼전/g, 'MIX');
    if (signal === '확') signal = 'OK';
    if (signal === '혼전') signal = 'MIX';
  }

  // 너무 길면 앞 14자
  if (text.length > 14) text = `${text.slice(0, 13)}…`;
  return { base: text || (lang === 'en' ? 'ZN' : '존'), signal };
}

/** intel 없는 zone도 면 라벨 1~2토큰으로 압축 — face-minimal(중복 숨김)은 건드리지 않음 */
export function ensureMirageZoneCompactFaceOnOverlays(
  overlays: OverlayItem[],
  opts?: { faceLang?: MirageZoneFaceLang }
): OverlayItem[] {
  const lang = opts?.faceLang ?? 'ko';
  return overlays.map((raw) => {
    const extraEarly = String(raw.overlayZoneExtraClass || '');
    if (
      extraEarly.includes('merged-desk-zone-face-hidden') ||
      extraEarly.includes('merged-desk-money-zone-keep')
    ) {
      return raw;
    }
    if (
      extraEarly.includes('merged-desk-zone-face-minimal') ||
      extraEarly.includes('merged-desk-zone-pro-soft')
    ) {
      return {
        ...raw,
        label: '',
        zoneFaceBase: undefined,
        zoneFaceSignal: undefined,
      };
    }
    const kind = String(raw.kind || '');
    if (
      kind !== 'zone' &&
      kind !== 'demandZone' &&
      kind !== 'supplyZone' &&
      kind !== 'ob' &&
      kind !== 'fvg' &&
      kind !== 'reactionZone' &&
      kind !== 'box'
    ) {
      return raw;
    }
    const id = String(raw.id || '');
    if (!id.startsWith('merged-ares-mlsp-tv-') && !id.startsWith('merged-desk-')) return raw;
    /** 폭락구간 — 기능 상태(감시/나락확정/반등/저항) 잘림 금지 */
    if (id.includes('mtf-dump') || extraEarly.includes('merged-desk-mtf-dump-zone')) {
      return raw;
    }
    if (raw.zoneFaceBase) {
      const roleGuess: ZoneRole =
        extraEarly.includes('resist') || extraEarly.includes('ob-bear') || raw.structureBias === 'bearish'
          ? 'resistance'
          : extraEarly.includes('support') || extraEarly.includes('ob-bull') || raw.structureBias === 'bullish'
            ? 'support'
            : 'neutral';
      const compressed = compressMirageTvFaceParts(raw.zoneFaceBase, raw.zoneFaceSignal, lang);
      const base =
        compressed.base === '존' || compressed.base === 'ZN'
          ? roleBiasToken(roleGuess, lang)
          : compressed.base;
      return {
        ...raw,
        zoneFaceBase: base,
        zoneFaceSignal: compressed.signal ?? undefined,
        zoneFaceLang: lang,
        label: compressed.signal ? `${base}·${compressed.signal}` : base,
      };
    }
    const role: ZoneRole =
      id.includes('resist') || String(raw.overlayZoneExtraClass || '').includes('resist')
        ? 'resistance'
        : id.includes('support') || String(raw.overlayZoneExtraClass || '').includes('support')
          ? 'support'
          : id.includes('ob-bear')
            ? 'ob_bear'
            : id.includes('ob-bull')
              ? 'ob_bull'
              : raw.structureBias === 'bearish'
                ? 'resistance'
                : raw.structureBias === 'bullish'
                  ? 'support'
                  : 'neutral';
    const baseCaption = String(raw.label || '').split('·')[0]?.trim() || roleBiasToken(role, lang);
    const base = roleBase(role, baseCaption, lang);
    const segments = String(raw.label || '')
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    let signal: string | null = null;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!;
      if (seg === base || seg === baseCaption || seg.length <= 2) continue;
      const short = seg.length > 5 ? `${seg.slice(0, 4)}…` : seg;
      signal = lang === 'en' ? toEnToken(short.replace('…', '')) : short.replace('…', '');
      break;
    }
    const compressed = compressMirageTvFaceParts(base, signal, lang);
    return {
      ...raw,
      zoneFaceBase: compressed.base,
      zoneFaceSignal: compressed.signal ?? undefined,
      zoneFaceLang: lang,
      label: compressed.signal ? `${compressed.base}·${compressed.signal}` : compressed.base,
    };
  });
}
