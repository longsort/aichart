'use client';

import { useState } from 'react';

const DISCLAIMER = '아래 설명은 지표·패널 읽는 법을 돕는 교육용 요약입니다. 매매 권유·수익 보장이 아닙니다.';

type Props = { compact?: boolean; /** 모달 등에서 처음부터 펼침 */ startOpen?: boolean };

export default function UnifiedDeskDashboardGuide({ compact = false, startOpen }: Props) {
  const [open, setOpen] = useState(startOpen !== undefined ? startOpen : !compact);

  return (
    <div
      className="unified-desk-dashboard-guide"
      style={{
        marginBottom: compact ? 0 : 12,
        borderRadius: 10,
        border: '1px solid rgba(59,130,246,0.35)',
        background: 'linear-gradient(165deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.92) 100%)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          border: 'none',
          background: 'rgba(59,130,246,0.12)',
          color: '#bfdbfe',
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>AI 트레이딩 대시보드 · 퀵 가이드</span>
        <span style={{ opacity: 0.85 }}>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px 14px', fontSize: 11, lineHeight: 1.55, color: '#cbd5e1' }}>
          <p style={{ margin: '0 0 10px', fontSize: 10, color: '#94a3b8' }}>{DISCLAIMER}</p>

          <div style={{ fontWeight: 800, color: '#93c5fd', marginBottom: 6 }}>1. 오른쪽 패널 · 시장 탭 &amp; 통합그래프</div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: '#e2e8f0' }}>MA / 이평</strong>: 통합그래프·보조지표에서 다중 시간대 이평을 봅니다.{' '}
              <span style={{ background: 'rgba(234,179,8,0.2)', padding: '0 4px', borderRadius: 4 }}>노란 톤</span>은 골든크로스 계열 감지,
              밝은/중립 배경은 데드크로스 계열로 읽는 UI가 많습니다. 교차만으로 진입을 확정하지 말고 상위 TF와 함께 확인하세요.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: '#e2e8f0' }}>MACD · 괴리(Div)</strong>: 차트 하단 MACD 패널을 켠 상태에서, 다이버전스(가격 vs 모멘텀 불일치)를 봅니다.{' '}
              <span style={{ color: '#4ade80' }}>녹색 배경</span>은 강세 다이버(하락 가격 + 모멘텀 회복 등) <strong>후보</strong>,{' '}
              <span style={{ color: '#f87171' }}>적색 배경</span>은 약세 다이버·익절 참고 <strong>후보</strong>로 쓰는 경우가 많습니다.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: '#e2e8f0' }}>점수</strong>: 통합그래프의 채널·점수는 여러 근거를 압축한 값입니다. 숫자만 보지 말고 반대 근거·게이트(잠금)를 함께 보세요.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: '#e2e8f0' }}>OBV·거래량</strong>: 자금·체결 흐름 보조입니다. 상승/하락 라벨은 방향 <strong>참고</strong>이며 단독 진입 신호가 아닙니다.
            </li>
          </ul>

          <div style={{ fontWeight: 800, color: '#93c5fd', marginBottom: 6 }}>2. AI 분석 한 줄(요약 블록)</div>
          <p style={{ margin: '0 0 8px' }}>
            브리핑/요약에 이모지나 키워드가 붙으면 대략 다음처럼 읽을 수 있습니다(문구는 버전마다 다를 수 있음).
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            <li>🚀·강한 매수 톤: 추세 강조 <strong>서술</strong> — 포지션 유지·추종은 본인 리스크 규칙에 따름.</li>
            <li>📉·조정: 상승 추세 속 단기 하락일 수 있음 — &quot;묻지 마 추격&quot;은 피하고 구간·손절을 먼저 잡습니다.</li>
            <li>🌤·기술적 반등: 하락 중 단기 반등일 수 있음 — 추격 매수보다 청산·관망 우선을 고려합니다.</li>
            <li>🌊·급락·붕괴 톤: 다 TF 약화 서술일 수 있음 — 관망·포지션 축소를 검토합니다.</li>
            <li>💤·횡보·혼조: 방향성 낮음 — 스프레드·노이즈에 유의합니다.</li>
          </ul>

          <div style={{ fontWeight: 800, color: '#93c5fd', marginBottom: 6 }}>3. 차트 작도(통합작도)</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>이평선 굵기</strong>: 굵을수록(또는 강조 스타일) 해당 구간에서 거래·관심이 실린 정도를 시각적으로 키운 경우가 많습니다. 지지·저항으로 함께 읽습니다.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>점선 목표(TP)</strong>: 하모닉·패턴 엔진이 넣는 자동 목표가 <strong>참고선</strong>입니다. 도달 시 분할·이동 손절 등은 본인 규칙에 따릅니다.
            </li>
            <li>
              <strong>캔들 위·아래 아이콘</strong>: RSI 과매수/과매도 등 보조 신호입니다. 단일 아이콘만으로 진입하지 않습니다.
            </li>
          </ul>
          <p style={{ margin: '12px 0 0', fontSize: 10, color: '#64748b' }}>
            차트 상단 도구에서 <strong>RSI · MACD · BB</strong> 패널을 켜면 위 설명과 화면 요소가 대응하기 쉽습니다.
          </p>
        </div>
      )}
    </div>
  );
}
