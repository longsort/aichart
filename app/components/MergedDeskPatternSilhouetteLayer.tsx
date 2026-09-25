'use client';

/**
 * 통합·분석 — 패턴 실루엣·스탬프 (정밀 SVG).
 * pointer-events: none — 차트 drag와 충돌 금지. 카드/HUD 없음.
 * 롱 스탬프=초록 · 숏 스탬프=빨강.
 */
import React from 'react';
import type {
  MergedDeskPatternSilhouettePack,
  MergedDeskSilhouetteKind,
  MergedDeskStampKind,
} from '@/lib/mergedDeskPatternSilhouette';

export type SilhouetteScreenGeom = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StampScreenPoint = {
  x: number;
  y: number;
  kind: MergedDeskStampKind;
};

type Props = {
  pack: MergedDeskPatternSilhouettePack;
  box: SilhouetteScreenGeom | null;
  stamps: StampScreenPoint[];
};

const FILL = 'rgba(148,163,184,0.12)';
const STROKE = 'rgba(241,245,249,0.22)';
const FILL_SOFT = 'rgba(100,116,139,0.08)';
const INK = 'rgba(15,23,42,0.35)';
const LONG = '#22c55e';
const LONG_SOFT = '#4ade80';
const LONG_EDGE = 'rgba(134,239,172,0.35)';
const SHORT = '#ef4444';
const SHORT_SOFT = '#f87171';
const SHORT_EDGE = 'rgba(252,165,165,0.35)';

function silhouetteOpacity(lifecycle: string, incomplete: boolean): number {
  if (lifecycle === 'CONFIRMED') return incomplete ? 0.11 : 0.14;
  if (lifecycle === 'CANDIDATE') return 0.1;
  return 0.08;
}

/** 코끼리 — 몸·귀주름·엄니·코·눈·다리 */
function ElephantSvg({ w, h, incomplete }: { w: number; h: number; incomplete?: boolean }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="md-el-g2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(203,213,225,0.16)" />
          <stop offset="55%" stopColor="rgba(148,163,184,0.1)" />
          <stop offset="100%" stopColor="rgba(71,85,105,0.08)" />
        </linearGradient>
      </defs>
      <path
        d="M42 96 C48 54 78 30 118 28 C148 26 172 22 198 38 C218 50 228 66 224 82
           C248 86 268 104 262 126 C238 134 210 124 196 110
           C178 134 142 142 104 132 C72 122 50 110 42 96 Z"
        fill="url(#md-el-g2)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      <path
        d="M78 48 C58 42 44 58 48 78 C52 94 72 100 92 88 C98 72 96 56 78 48 Z"
        fill={FILL_SOFT}
        stroke={STROKE}
        strokeWidth="1"
      />
      <ellipse cx="168" cy="58" rx="36" ry="30" fill={FILL} stroke={STROKE} strokeWidth="1" />
      <circle cx="178" cy="52" r="3" fill={INK} />
      {/* 코 — 미완성이면 점선만 */}
      <path
        d="M208 72 C222 88 232 108 226 132 C220 146 208 150 200 142"
        fill="none"
        stroke={incomplete ? 'rgba(251,191,36,0.45)' : STROKE}
        strokeWidth={incomplete ? 3.5 : 6}
        strokeLinecap="round"
        strokeDasharray={incomplete ? '6 5' : undefined}
      />
      {!incomplete && (
        <path
          d="M208 72 C220 86 228 106 224 128 C220 140 212 144 206 138"
          fill="none"
          stroke="rgba(226,232,240,0.28)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
      <path d="M88 122 L82 150 M118 128 L114 152 M152 126 L154 150" stroke={STROKE} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

/** 사람·머리어깨 — 머리·양어깨·몸·다리 */
function PersonSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="md-ps-g" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="rgba(226,232,240,0.36)" />
          <stop offset="100%" stopColor="rgba(100,116,139,0.2)" />
        </linearGradient>
      </defs>
      {/* 머리(헤드) */}
      <ellipse cx="140" cy="34" rx="28" ry="26" fill="url(#md-ps-g)" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="130" cy="32" r="2.4" fill={INK} />
      <circle cx="150" cy="32" r="2.4" fill={INK} />
      <path d="M130 42 Q140 48 150 42" fill="none" stroke={INK} strokeWidth="1.3" />
      {/* 목 */}
      <path d="M132 56 L148 56 L146 68 L134 68 Z" fill={FILL} stroke={STROKE} strokeWidth="1" />
      {/* 양어깨 + 몸(어깨-헤드-어깨) */}
      <path
        d="M36 118 C48 70 78 58 112 62 C124 64 132 68 140 68 C148 68 156 64 168 62
           C202 58 232 70 244 118 L222 122 C214 86 186 78 140 78 C94 78 66 86 58 122 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth="1.5"
      />
      {/* 왼쪽·오른쪽 어깨 강조 */}
      <ellipse cx="72" cy="88" rx="22" ry="16" fill={FILL_SOFT} stroke="rgba(226,232,240,0.3)" strokeWidth="1" />
      <ellipse cx="208" cy="88" rx="22" ry="16" fill={FILL_SOFT} stroke="rgba(226,232,240,0.3)" strokeWidth="1" />
      {/* 팔 */}
      <path d="M58 100 L42 128 M222 100 L238 128" stroke={STROKE} strokeWidth="3.2" strokeLinecap="round" />
      {/* 다리 */}
      <path d="M118 118 L108 148 M162 118 L172 148" stroke={STROKE} strokeWidth="4" strokeLinecap="round" />
      {/* 구조 가이드선 (머리어깨) */}
      <path
        d="M56 92 L112 70 L140 42 L168 70 L224 92"
        fill="none"
        stroke="rgba(248,250,252,0.28)"
        strokeWidth="1.4"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

/** 나비·이중바닥(W) — 날개맥·더듬이·몸 */
function ButterflySvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="md-bf-l" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(134,239,172,0.28)" />
          <stop offset="100%" stopColor="rgba(74,222,128,0.12)" />
        </linearGradient>
        <linearGradient id="md-bf-r" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(134,239,172,0.28)" />
          <stop offset="100%" stopColor="rgba(74,222,128,0.12)" />
        </linearGradient>
      </defs>
      {/* 왼·오른 날개 */}
      <path
        d="M140 40 C108 18 52 36 40 78 C36 108 72 128 140 108 C140 108 140 70 140 40 Z"
        fill="url(#md-bf-l)"
        stroke={LONG_EDGE}
        strokeWidth="1.4"
      />
      <path
        d="M140 40 C172 18 228 36 240 78 C244 108 208 128 140 108 C140 108 140 70 140 40 Z"
        fill="url(#md-bf-r)"
        stroke={LONG_EDGE}
        strokeWidth="1.4"
      />
      {/* 날개맥 */}
      <path d="M140 48 C110 44 78 58 64 82 M140 70 C112 68 88 80 78 98 M140 90 C120 92 100 100 92 112" fill="none" stroke="rgba(187,247,208,0.45)" strokeWidth="1.1" />
      <path d="M140 48 C170 44 202 58 216 82 M140 70 C168 68 192 80 202 98 M140 90 C160 92 180 100 188 112" fill="none" stroke="rgba(187,247,208,0.45)" strokeWidth="1.1" />
      {/* 몸·더듬이 */}
      <ellipse cx="140" cy="78" rx="8" ry="36" fill="rgba(226,232,240,0.45)" stroke={STROKE} strokeWidth="1.2" />
      <circle cx="140" cy="48" r="6" fill="rgba(241,245,249,0.5)" stroke={STROKE} strokeWidth="1" />
      <path d="M136 40 L124 18 M144 40 L156 18" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="124" cy="16" r="2.2" fill={LONG_SOFT} />
      <circle cx="156" cy="16" r="2.2" fill={LONG_SOFT} />
      {/* W 구조선 */}
      <path d="M48 100 L100 130 L140 88 L180 130 L232 100" fill="none" stroke="rgba(74,222,128,0.4)" strokeWidth="1.6" strokeDasharray="5 3" />
    </svg>
  );
}

/** 하트·이중천장(M) — 로브·하이라이트·M선 */
function HeartSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="md-ht-g" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="rgba(252,165,165,0.34)" />
          <stop offset="55%" stopColor="rgba(248,113,113,0.22)" />
          <stop offset="100%" stopColor="rgba(185,28,28,0.18)" />
        </linearGradient>
        <radialGradient id="md-ht-shine" cx="38%" cy="32%" r="42%">
          <stop offset="0%" stopColor="rgba(254,226,226,0.45)" />
          <stop offset="100%" stopColor="rgba(254,226,226,0)" />
        </radialGradient>
      </defs>
      <path
        d="M140 138 C48 92 28 40 72 22 C102 10 124 28 140 52 C156 28 178 10 208 22 C252 40 232 92 140 138 Z"
        fill="url(#md-ht-g)"
        stroke={SHORT_EDGE}
        strokeWidth="1.7"
      />
      <path
        d="M140 138 C48 92 28 40 72 22 C102 10 124 28 140 52 C156 28 178 10 208 22 C252 40 232 92 140 138 Z"
        fill="url(#md-ht-shine)"
      />
      {/* 안쪽 하트 */}
      <path
        d="M140 118 C78 86 68 52 92 38 C108 28 124 40 140 58 C156 40 172 28 188 38 C212 52 202 86 140 118 Z"
        fill="rgba(254,202,202,0.16)"
        stroke="rgba(254,202,202,0.35)"
        strokeWidth="1"
      />
      {/* M 이중천장 구조 */}
      <path
        d="M56 70 L100 36 L140 78 L180 36 L224 70"
        fill="none"
        stroke="rgba(254,226,226,0.5)"
        strokeWidth="1.8"
        strokeDasharray="5 3"
      />
      <circle cx="100" cy="36" r="3.5" fill={SHORT_SOFT} opacity="0.85" />
      <circle cx="180" cy="36" r="3.5" fill={SHORT_SOFT} opacity="0.85" />
      <circle cx="140" cy="78" r="3" fill="rgba(248,250,252,0.55)" />
    </svg>
  );
}

/** 채널·근육 */
function MuscleSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="md-ms-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(186,230,253,0.28)" />
          <stop offset="100%" stopColor="rgba(100,116,139,0.2)" />
        </linearGradient>
      </defs>
      <path
        d="M88 40 C102 18 126 12 140 14 C154 12 178 18 192 40
           C222 44 250 66 252 96 C250 124 222 140 192 134
           C178 148 154 154 140 152 C126 154 102 148 88 134
           C58 140 30 124 28 96 C30 66 58 44 88 40 Z"
        fill="url(#md-ms-g)"
        stroke={STROKE}
        strokeWidth="1.5"
      />
      <ellipse cx="88" cy="90" rx="26" ry="34" fill={FILL_SOFT} stroke="rgba(186,230,253,0.35)" strokeWidth="1" />
      <ellipse cx="192" cy="90" rx="26" ry="34" fill={FILL_SOFT} stroke="rgba(186,230,253,0.35)" strokeWidth="1" />
      {/* 복근 라인 */}
      <path d="M128 70 V120 M152 70 V120" stroke="rgba(226,232,240,0.35)" strokeWidth="1.4" />
      <path d="M118 86 H162 M118 102 H162" stroke="rgba(226,232,240,0.28)" strokeWidth="1.1" />
      <path d="M110 78 Q140 98 170 78" fill="none" stroke="rgba(186,230,253,0.4)" strokeWidth="2" />
      {/* 채널 평행선 */}
      <path d="M48 52 L232 40" stroke="rgba(125,211,252,0.45)" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M48 120 L232 108" stroke="rgba(125,211,252,0.45)" strokeWidth="1.5" strokeDasharray="6 4" />
    </svg>
  );
}

function ObBlockSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="32" y="30" width="216" height="100" rx="8" fill="rgba(248,113,113,0.16)" stroke={SHORT_EDGE} strokeWidth="1.8" />
      <rect x="48" y="48" width="184" height="32" rx="4" fill="rgba(45,212,191,0.14)" stroke="rgba(45,212,191,0.45)" strokeWidth="1.3" />
      <text x="140" y="70" textAnchor="middle" fill="rgba(226,232,240,0.65)" fontSize="16" fontWeight="800">
        OB
      </text>
      <path
        d="M56 118 L84 100 L112 112 L140 86 L168 104 L196 72 L224 96"
        fill="none"
        stroke="rgba(226,232,240,0.4)"
        strokeWidth="1.6"
      />
      <circle cx="196" cy="72" r="4" fill={LONG_SOFT} />
    </svg>
  );
}

function SupplyDemandSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="40" y="22" width="200" height="44" rx="5" fill="rgba(248,113,113,0.18)" stroke={SHORT_EDGE} strokeWidth="1.5" />
      <text x="140" y="50" textAnchor="middle" fill={SHORT_EDGE} fontSize="12" fontWeight="800">
        공급
      </text>
      <rect x="40" y="94" width="200" height="44" rx="5" fill="rgba(34,197,94,0.16)" stroke={LONG_EDGE} strokeWidth="1.5" />
      <text x="140" y="122" textAnchor="middle" fill={LONG_EDGE} fontSize="12" fontWeight="800">
        수요
      </text>
      <path d="M70 44 L140 116 L210 44" fill="none" stroke="rgba(226,232,240,0.45)" strokeWidth="2.2" strokeDasharray="6 4" />
      <circle cx="140" cy="116" r="8" fill="none" stroke={LONG} strokeWidth="2.2" />
      <path d="M140 110 L140 122 M134 116 H146" stroke={LONG} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 독수리 — 좌하락·바닥·우회복 날개 */
function EagleSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="md-eg-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(148,163,184,0.14)" />
          <stop offset="100%" stopColor="rgba(74,222,128,0.1)" />
        </linearGradient>
      </defs>
      <path
        d="M40 50 C70 30 100 70 140 90 C180 70 210 30 240 50 C220 90 180 120 140 130 C100 120 60 90 40 50 Z"
        fill="url(#md-eg-g)"
        stroke={LONG_EDGE}
        strokeWidth="1.2"
      />
      <ellipse cx="140" cy="100" rx="18" ry="22" fill={FILL_SOFT} stroke={STROKE} strokeWidth="1" />
      <path d="M48 58 L100 110 L140 88 L180 110 L232 58" fill="none" stroke="rgba(74,222,128,0.28)" strokeWidth="1.2" strokeDasharray="4 3" />
    </svg>
  );
}

function SilhouetteBody({
  kind,
  w,
  h,
  incomplete,
}: {
  kind: MergedDeskSilhouetteKind;
  w: number;
  h: number;
  incomplete?: boolean;
}) {
  if (kind === 'elephant') return <ElephantSvg w={w} h={h} incomplete={incomplete} />;
  if (kind === 'person') return <PersonSvg w={w} h={h} />;
  if (kind === 'butterfly') return <ButterflySvg w={w} h={h} />;
  if (kind === 'heart') return <HeartSvg w={w} h={h} />;
  if (kind === 'eagle') return <EagleSvg w={w} h={h} />;
  if (kind === 'muscle') return <MuscleSvg w={w} h={h} />;
  if (kind === 'ob_block') return <ObBlockSvg w={w} h={h} />;
  if (kind === 'supply_demand') return <SupplyDemandSvg w={w} h={h} />;
  return null;
}

/** 롱=초록 · 숏=빨강 이모티콘 */
function StampGlyph({ kind }: { kind: MergedDeskStampKind }) {
  if (kind === 'elephant_tail') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="rgba(15,23,42,0.45)" stroke={SHORT_EDGE} strokeWidth="1.2" />
        <path
          d="M5 5 C11 3 16 7 17 12 C16 16 10 17 7 13"
          fill="none"
          stroke={SHORT_SOFT}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'person_peak') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="rgba(127,29,29,0.55)" stroke={SHORT} strokeWidth="1.4" />
        <circle cx="10" cy="8" r="3.6" fill={SHORT_SOFT} />
        <circle cx="8.6" cy="7.5" r="0.7" fill="#0f172a" />
        <circle cx="11.4" cy="7.5" r="0.7" fill="#0f172a" />
        <path d="M8.2 9.4 Q10 10.6 11.8 9.4" fill="none" stroke="#0f172a" strokeWidth="0.8" />
        <path d="M6 14 C7.5 11.8 12.5 11.8 14 14" fill={SHORT_SOFT} />
      </svg>
    );
  }
  if (kind === 'person_trough') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="rgba(20,83,45,0.55)" stroke={LONG} strokeWidth="1.4" />
        <circle cx="10" cy="8" r="3.4" fill={LONG_SOFT} />
        <path d="M5.5 15 C6.5 11.5 13.5 11.5 14.5 15" fill={LONG_SOFT} />
      </svg>
    );
  }
  if (kind === 'bear' || kind === 'bear_crown') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="10" fill="rgba(127,29,29,0.55)" stroke={SHORT} strokeWidth="1.6" />
        {kind === 'bear_crown' && (
          <path d="M6 4 L8 6.5 L11 3.2 L14 6.5 L16 4 L15.4 8 L6.6 8 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.6" />
        )}
        <ellipse cx="11" cy={kind === 'bear_crown' ? 12.2 : 11.5} rx="5.4" ry="4.5" fill={SHORT_SOFT} stroke={SHORT_EDGE} strokeWidth="0.8" />
        <circle cx="7.2" cy={kind === 'bear_crown' ? 9.2 : 8.6} r="1.7" fill={SHORT_SOFT} />
        <circle cx="14.8" cy={kind === 'bear_crown' ? 9.2 : 8.6} r="1.7" fill={SHORT_SOFT} />
        <circle cx="9.2" cy={kind === 'bear_crown' ? 11.6 : 11} r="0.75" fill="#0f172a" />
        <circle cx="12.8" cy={kind === 'bear_crown' ? 11.6 : 11} r="0.75" fill="#0f172a" />
        <ellipse cx="11" cy={kind === 'bear_crown' ? 13.2 : 12.6} rx="1.5" ry="1" fill={SHORT_EDGE} />
        {/* 숏 ▼ */}
        <path d="M11 16.2 L8.6 18.4 H13.4 Z" fill="#fecaca" />
      </svg>
    );
  }
  if (kind === 'bull') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="10" fill="rgba(20,83,45,0.55)" stroke={LONG} strokeWidth="1.6" />
        <ellipse cx="11" cy="11.2" rx="5.2" ry="4.2" fill={LONG_SOFT} stroke={LONG_EDGE} strokeWidth="0.8" />
        <path d="M5.5 7 L3.8 4.2 M16.5 7 L18.2 4.2" stroke={LONG_EDGE} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="10.6" r="0.75" fill="#0f172a" />
        <circle cx="13" cy="10.6" r="0.75" fill="#0f172a" />
        <ellipse cx="11" cy="12.8" rx="1.6" ry="0.95" fill="#bbf7d0" />
        <path d="M11 15.4 L8.8 18 H13.2 Z" fill="#dcfce7" />
      </svg>
    );
  }
  if (kind === 'entry_xhair') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9.5" fill="rgba(15,23,42,0.4)" stroke="#2dd4bf" strokeWidth="2" />
        <circle cx="11" cy="11" r="3.4" fill="none" stroke="rgba(248,250,252,0.95)" strokeWidth="1.5" />
        <path
          d="M11 3.2 V6.2 M11 15.8 V18.8 M3.2 11 H6.2 M15.8 11 H18.8"
          stroke="rgba(248,250,252,0.9)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'arrow_up') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="rgba(20,83,45,0.75)" stroke={LONG} strokeWidth="1.6" />
        <path d="M10 4.5 L15 11.2 H12.2 V15.5 H7.8 V11.2 H5 Z" fill={LONG_SOFT} />
      </svg>
    );
  }
  if (kind === 'arrow_down') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="rgba(127,29,29,0.75)" stroke={SHORT} strokeWidth="1.6" />
        <path d="M10 15.5 L5 8.8 H7.8 V5.5 H12.2 V8.8 H15 Z" fill={SHORT_SOFT} />
      </svg>
    );
  }
  if (kind === 'hammer') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="8" fill="rgba(15,23,42,0.4)" stroke={LONG_EDGE} strokeWidth="1.2" />
        <rect x="7.5" y="6" width="3" height="9" rx="1" fill="#94a3b8" />
        <rect x="3.5" y="3" width="11" height="4" rx="1" fill={LONG_SOFT} />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5" fill="rgba(148,163,184,0.7)" />
    </svg>
  );
}

export default function MergedDeskPatternSilhouetteLayer({ pack, box, stamps }: Props) {
  if (pack.kind === 'none') return null;
  const op = silhouetteOpacity(pack.lifecycle, pack.incomplete);
  const term = (pack.structureTerms ?? []).slice(0, 4).join(' · ');

  return (
    <div
      className="merged-desk-pattern-silhouette-layer"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {box && box.width > 8 && box.height > 8 && (
        <div
          title={`${pack.labelKo} · ${pack.confirmedSide} · ${pack.lifecycle} · score ${pack.patternScore}`}
          style={{
            position: 'absolute',
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            opacity: op,
          }}
        >
          <SilhouetteBody kind={pack.kind} w={box.width} h={box.height} incomplete={pack.incomplete} />
          {term ? (
            <div
              style={{
                position: 'absolute',
                left: 4,
                top: 2,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.04em',
                color:
                  pack.confirmedSide === 'LONG'
                    ? 'rgba(74,222,128,0.75)'
                    : 'rgba(248,113,113,0.75)',
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {pack.labelKo} · {pack.confirmedSide} · {pack.patternScore}
            </div>
          ) : null}
        </div>
      )}
      {stamps.map((s, i) => {
        const big =
          s.kind === 'entry_xhair' ||
          s.kind === 'bear_crown' ||
          s.kind === 'bull' ||
          s.kind === 'bear' ||
          s.kind === 'arrow_up' ||
          s.kind === 'arrow_down';
        const size = big ? 20 : 16;
        return (
          <div
            key={`ps-${i}-${s.kind}`}
            style={{
              position: 'absolute',
              left: s.x - size / 2,
              top: s.y - size / 2,
              width: size,
              height: size,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
            }}
          >
            <StampGlyph kind={s.kind} />
          </div>
        );
      })}
    </div>
  );
}
