/**
 * 차트 기능 클릭 설명 카드 — AVWAP 축 숫자·기관ST ↓/↑ 마커용.
 * 확정 수익·고정 승률 문구 금지. 참고·조건부만.
 */
import type { InstitutionalBandInteractionMarker } from '@/lib/institutionalSuperBand';
import {
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';

export type ChartFeatureExplainSection = {
  heading: string;
  bullets: string[];
};

export type ChartFeatureExplainCard = {
  kind: 'avwap' | 'st_short' | 'st_long' | 'bar_signals';
  titleKo: string;
  subtitleKo?: string;
  priceLabel?: string;
  accent: string;
  sections: ChartFeatureExplainSection[];
  disclaimerKo: string;
};

const DISCLAIMER =
  '참고용 분석 표시입니다. 확정 진입·수익 보장 아님. 손절·포지션은 본인 판단.';

/** 엔진 짧은 토큰 → 사용자용 한 줄 */
export function humanizeBandPartKo(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  const map: Record<string, string> = {
    근접: '밴드 가격에 매우 근접',
    '위크스윕·종가복귀': '고가(저가)로 훑은 뒤 밴드 안쪽으로 종가 복귀',
    저항거절: '상단 저항에서 거절(윗꼬리·종가 약세)',
    지지반등: '하단 지지에서 반등(아랫꼬리·종가 강세)',
    강한종가: '봉 종가가 강하게 마감',
    약한종가: '봉 종가가 약하게 마감(고가 대비 처짐)',
    양봉: '양봉(매수 우세 캔들)',
    음봉: '음봉(매도 우세 캔들)',
    거래량확대: '직전 대비 거래량 확대',
    스윙고점: '단기 스윙 고점 부근',
    스윙저점: '단기 스윙 저점 부근',
    OBV: 'OBV(누적거래량) 합류',
    거래량: '거래량 프로파일·급증 합류',
    구조: '구조(지지·저항·EQ) 합류',
    RSI: 'RSI 모멘텀 합류',
    HotZone: 'HotZone(핵심가) 합류',
    고래: '고래·세력 거래량 구간 합류',
    방어: '세력 방어(지지) 구간 근접',
    저항: '세력·공급 저항 구간 근접',
  };
  if (map[t]) return map[t];
  for (const [k, v] of Object.entries(map)) {
    if (t.includes(k)) return `${v} (${t})`;
  }
  return t;
}

function humanizeParts(parts: string[] | undefined, max = 8): string[] {
  if (!parts?.length) return [];
  const out: string[] = [];
  for (const p of parts.slice(0, max)) {
    const h = humanizeBandPartKo(p);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export type AvwapExplainSnap = {
  slot: 'highExt' | 'highOpen' | 'lowExt' | 'lowOpen' | string;
  price: number;
  color: string;
  /** 축·카드 제목용 짧은 한글 */
  axisTitleKo: string;
  /** 줄선 역할 설명 */
  roleKo: string;
  biasKo?: string;
  reasonsKo: string[];
  entryAllowed?: boolean;
};

/** AVWAP 축 라벨 — 숫자만 분홍 알약 대신 역할이 보이게 */
export function formatAvwapAxisTitleKo(params: {
  baseTagKo: string;
  liveTitleKo?: string;
}): string {
  const live = String(params.liveTitleKo || params.baseTagKo || '').trim();
  const base = String(params.baseTagKo || '').trim();
  let role = '앵커VWAP';
  if (/고·고가|고가앵커|highExt/i.test(live) || /고·고가/.test(base)) role = '고가앵커';
  else if (/고·시가|시가앵커|highOpen/i.test(live) || /고·시가/.test(base)) role = '시가앵커';
  else if (/저·고가|lowExt/i.test(live) || /저·고가/.test(base)) role = '저·고가앵커';
  else if (/저·시가|lowOpen/i.test(live) || /저·시가/.test(base)) role = '저·시가앵커';

  let bias = '';
  if (/숏후보/.test(live)) bias = '숏후보';
  else if (/롱후보/.test(live)) bias = '롱후보';
  else if (/숏관찰/.test(live)) bias = '숏관찰';
  else if (/롱관찰/.test(live)) bias = '롱관찰';
  else if (/대기/.test(live)) bias = '대기';

  return bias ? `${role}·${bias}` : role;
}

export function buildAvwapExplainCard(snap: AvwapExplainSnap): ChartFeatureExplainCard {
  const sections: ChartFeatureExplainSection[] = [
    {
      heading: '이 라벨이 뭔가요?',
      bullets: [
        'Anchored VWAP(고정 거래량가중평균가) 줄선의 **현재값**입니다.',
        snap.roleKo,
        '우측 축의 색 라벨 = 해당 줄선 가격(분홍·빨강은 보통 고점 앵커의 시가 VWAP).',
      ],
    },
    {
      heading: '어떻게 쓰나요?',
      bullets: [
        '가격이 줄선 위/아래에서 반응하면 지지·저항 후보로 봅니다.',
        '초록=고가 쪽 앵커, 빨강·분홍=시가 쪽 앵커(고점 기준)가 흔합니다.',
        snap.biasKo
          ? `지금 표시: ${snap.biasKo}${snap.entryAllowed ? ' (합류 후보·확정 아님)' : ' (관찰·대기)'}`
          : '합류가 약하면 대기(WAIT)로 둡니다.',
      ],
    },
  ];
  if (snap.reasonsKo.length) {
    sections.push({
      heading: '앱 엔진 합류 근거',
      bullets: snap.reasonsKo.slice(0, 10),
    });
  }
  sections.push({
    heading: '세력·고래·구간',
    bullets: [
      'VWAP만으로 세력 방어/저항을 단정하지 않습니다.',
      '기관밴드(ST)·HotZone·거래량 존과 겹칠 때만 “방어·저항 후보”로 같이 봅니다.',
      '겹침이 없으면 단순 평균가 참고선입니다.',
    ],
  });

  return {
    kind: 'avwap',
    titleKo: snap.axisTitleKo || '앵커 VWAP',
    subtitleKo: '고정 VWAP 줄선 · 클릭 설명',
    priceLabel: Number.isFinite(snap.price) ? snap.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : undefined,
    accent: snap.color || '#f87171',
    sections,
    disclaimerKo: DISCLAIMER,
  };
}

export function buildStBandExplainCard(
  ev: InstitutionalBandInteractionMarker
): ChartFeatureExplainCard {
  const isLong = ev.verdict === 'LONG';
  const gradeKo = ev.tier === 'A' ? '강' : ev.tier === 'B' ? '중' : '약';
  const titleKo = isLong
    ? `기관밴드 롱터치 · ${gradeKo}`
    : `기관밴드 숏터치 · ${gradeKo}`;
  const arrowKo = isLong
    ? '▲(또는 위쪽 화살) = 하단 지지밴드 터치·반등 후보'
    : '▼ 동그라미 화살 = 상단 저항밴드 터치·거절 후보';

  const touchBullets = humanizeParts(ev.summaryParts);
  const precisionBullets = humanizeParts(ev.precisionParts);
  const confluenceBullets = humanizeParts(ev.confluence?.parts);

  const sections: ChartFeatureExplainSection[] = [
    {
      heading: '이 화살표가 뭔가요?',
      bullets: [
        arrowKo,
        `기관 SuperTrend 밴드(기간 ${INSTITUTIONAL_BAND_DEFAULT_PERIOD} · 배수 ${INSTITUTIONAL_BAND_DEFAULT_MULT})와의 의미 있는 접촉입니다.`,
        isLong
          ? '하늘색·초록 밴드(지지) 쪽에서 롱 관점 참고.'
          : '빨강·분홍 밴드(저항) 쪽에서 숏 관점 참고.',
        '「숏확정/롱확정」이 아닙니다. 터치·반응 후보만 표시합니다.',
      ],
    },
    {
      heading: isLong ? '지지·방어 매수 구간 해석' : '저항·세력 매도 구간 해석',
      bullets: isLong
        ? [
            '하단 밴드 = 기관·세력이 받아주는 지지 후보로 해석합니다.',
            '위크 스윕 후 종가 복귀·거래량 확대가 있으면 “방어 매수” 시나리오 참고.',
            '밴드 아래로 종가가 깊게 이탈하면 지지 무효·하방 참고.',
          ]
        : [
            '상단 밴드 = 기관·세력 공급(저항) 후보로 해석합니다.',
            '고가 스윕 후 종가 복귀·음봉·거래량 확대가 있으면 “저항 거절·숏” 시나리오 참고.',
            '밴드 위로 종가가 강하게 돌파·안착하면 숏 관점 무효·상방 참고.',
          ],
    },
  ];

  if (touchBullets.length) {
    sections.push({ heading: '이 봉에서 잡힌 반응', bullets: touchBullets });
  }
  if (precisionBullets.length) {
    sections.push({ heading: '정밀 게이트(거래량·구조)', bullets: precisionBullets });
  }
  if (confluenceBullets.length || ev.confluence) {
    const head = ev.confluence
      ? `다축 합류 · 등급 ${ev.confluence.grade} · 점수 ${ev.confluence.total}`
      : '다축 합류';
    sections.push({
      heading: head,
      bullets:
        confluenceBullets.length > 0
          ? confluenceBullets
          : ['합류 점수는 있으나 세부 토큰이 비어 있습니다.'],
    });
  }

  sections.push({
    heading: '품질',
    bullets: [
      `등급 ${ev.tier}(${gradeKo}) · 품질점수 ${ev.score}`,
      `밴드까지 거리 ≈ ${ev.proximityAtr.toFixed(2)} ATR`,
      ev.unionSource === 'confluence'
        ? '파이프: 합류'
        : ev.unionSource === 'precision'
          ? '파이프: 정밀'
          : '기본 터치 파이프',
    ],
  });

  return {
    kind: isLong ? 'st_long' : 'st_short',
    titleKo,
    subtitleKo: isLong ? '기관밴드 지지 터치' : '기관밴드 저항 터치',
    accent: isLong ? '#2dd4bf' : '#f472b6',
    sections,
    disclaimerKo: DISCLAIMER,
  };
}

export function buildBarSignalsExplainCard(
  lines: string[],
  opts?: { titleKo?: string }
): ChartFeatureExplainCard {
  return {
    kind: 'bar_signals',
    titleKo: opts?.titleKo || '이 봉 신호 설명',
    subtitleKo: '마커·밴드 클릭 요약',
    accent: '#94a3b8',
    sections: [
      {
        heading: '표시된 신호',
        bullets: lines.filter(Boolean).slice(0, 14),
      },
      {
        heading: '읽는 법',
        bullets: [
          '구조 로켓 = 추세/구조 전환 후보',
          '기관밴드(ST) = 지지·저항 밴드 터치',
          '여러 줄이 같이 있으면 합류가 강한 봉입니다(그래도 확정 아님).',
        ],
      },
    ],
    disclaimerKo: DISCLAIMER,
  };
}

/** 클릭가에 가장 가까운 AVWAP 스냅 (허용 ATR/비율) */
export function pickNearestAvwapSnap(
  snaps: AvwapExplainSnap[],
  clickPrice: number,
  tolRatio = 0.004
): AvwapExplainSnap | null {
  if (!(clickPrice > 0) || !snaps.length) return null;
  let best: AvwapExplainSnap | null = null;
  let bestDist = Infinity;
  const tol = Math.max(clickPrice * tolRatio, 1);
  for (const s of snaps) {
    if (!(s.price > 0)) continue;
    const d = Math.abs(s.price - clickPrice);
    if (d <= tol && d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
