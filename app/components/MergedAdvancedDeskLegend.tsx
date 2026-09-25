'use client';

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: '롱/숏 확정',
    lines: [
      '▲ 녹색: 롱 확정·재안착 (구조·종가 조건, 참고)',
      '▼ 적색: 숏 확정·재안착',
      '⭕ 화살표 둘러싼 원: 동일 방향 재진입 신호(참고)',
    ],
  },
  {
    title: '안착/실패',
    lines: [
      '녹·적 계단선: 롱/숏 안착 추적(실선=유지, 점선=실패·재시도 구간)',
      'EQ50: 흰 점선 — 안착선 사이 중앙 균형',
      'TP1~3: 상방 녹·하방 적 점선 — 참고 목표(비보장)',
    ],
  },
  {
    title: '핫존',
    lines: [
      '보라 ★ 실선 원: 생성 단계',
      '★ 점선 원: 유지 단계',
      '★ 점·점선: 소멸·약화 단계',
      '가격·볼륨 동일 아이콘 = 동일 시점',
    ],
  },
  {
    title: '번개 × 흡수',
    lines: [
      '번개: 단기 유동성 유입(볼륨 급증)',
      '물방울: 매수·매도 흡수(체결 흡수)',
      '겹침: 유동성 + 흡수 동시(세력 개입 참고)',
    ],
  },
  {
    title: '매집핵심',
    lines: ['금색 ★: 매집 코어 후보 구간(bu-ob 등, 참고)'],
  },
  {
    title: '존 (수급 구간)',
    lines: [
      '붉은 반투명 띠: 공급(Supply)',
      '푸른 반투명 띠: 수요(Demand)',
    ],
  },
  {
    title: '합성 롱/숏 압력 (완전판 전용)',
    lines: [
      '차트 내 옅은 녹/적 대역: 다채널 합성 롱·숏 압력(참고)',
      '회색 점선: 현재가 기준 합성 요약 라벨 — 툴팁에 격차·요약',
      '캔들 【합】 마커: 통합 고급 강화 프로필 합성 방향(확정 아님)',
    ],
  },
  {
    title: '스윙 타점 병합 (존+밴드+선)',
    lines: [
      '붉은 옅은 띠: 리스크 구간(SL~진입), 녹 띠: 1차 수익권(진입~TP1), 더 옅은 녹: TP1~TP3 확장(있을 때)',
      '노란 띠·금색 선: 진입 포켓·진입가, 적색 점선: 손절, 녹색 선: TP1~3(참고·비보장)',
      '데이터: lsSignalPlan 우선, 없으면 verdict+computeTradePlan — 툴팁에 출처·RR 요약',
    ],
  },
  {
    title: '밴드·스윙 ✕ (차트 ST 동일 코어)',
    lines: [
      '캔들 뒤 옅은 녹/적 면: SuperTrend 상·하한 사이 리본(융합 구간색, TV식 채움)',
      '캔들 ✕·L(주황·아래): 롱 스윙, ✕·S(파랑·위): 숏 — 밴드 상·하 터치·추세 전환 근처 스윙',
      '점선: 각 ✕마다 진입·밴드 SL·반대 밴드 TP1 수평선(최근 구간만, 참고)',
      '차트 계단 밴드(녹/적)와 같은 SuperTrend 코어 — 플랜 병합 레이어와 병행',
    ],
  },
  {
    title: '집중 덱 (크롬 칩)',
    lines: [
      '기본 ON: 수급 면·고래자동·핫존·비전·스마트존 등 과밀 레이어를 끄고 밴드·합성·스윙이 보이게 함',
      '끄면(집중덱 OFF) 이전처럼 최강분석급 풀 병합 — ⚙ chartMergedAdvancedFocusDeck 과 동일',
    ],
  },
];

export default function MergedAdvancedDeskLegend() {
  return (
    <div className="merged-advanced-desk-legend merged-advanced-desk-legend--deck">
      <div className="merged-advanced-desk-legend__title">범례 · 통합 고급 완전판 덱</div>
      <div
        style={{
          display: 'grid',
          gap: '12px 10px',
          fontSize: 9,
          color: '#94a3b8',
          lineHeight: 1.45,
        }}
        className="merged-advanced-desk-legend__grid"
      >
        {SECTIONS.map((s) => (
          <div
            key={s.title}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(51,65,85,0.5)',
              minWidth: 0,
            }}
          >
            <div style={{ fontWeight: 800, color: '#e2e8f0', marginBottom: 6, fontSize: 10 }}>{s.title}</div>
            <ul style={{ margin: 0, paddingLeft: 12 }}>
              {s.lines.map((ln) => (
                <li key={ln} style={{ marginBottom: 3 }}>
                  {ln}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
