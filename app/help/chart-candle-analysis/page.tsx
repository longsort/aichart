import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '차트 캔들·신호 설명서',
  description: 'L/S, C↑, 로켓, A·B·C 설정 등 웹 차트 분석 표시 의미',
};

export default function ChartCandleAnalysisHelpPage() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 48px' }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: 'var(--muted)', fontSize: 13 }}>
          ← 메인으로
        </Link>
      </p>
      <article className="card" style={{ padding: '22px 24px' }}>
        <h1 className="title" style={{ fontSize: 'clamp(22px, 4vw, 28px)', marginBottom: 12 }}>
          차트 캔들·신호 기능 설명서
        </h1>
        <p className="subtle" style={{ marginBottom: 20, lineHeight: 1.55 }}>
          이 문서는 <strong>ailongshort 웹 차트</strong>에 표시되는 캔들 분석·마커·보조 신호가 코드상 어떤 의미인지 정리한 것입니다.
          <strong> 투자 권유가 아니며</strong>, 실제 매매는 본인 판단·책임 하에 하시고 손절·포지션 크기 등 리스크 관리를 병행하세요.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          1. 차트에 나오는 것 한눈에 보기
        </h2>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, lineHeight: 1.45 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px 8px 0' }}>표시</th>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>대략적인 의미</th>
                <th style={{ textAlign: 'left', padding: '8px 0 8px 10px' }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['L / S', '롱·숏 메인 신호 마커 (확정, RSI·상단 판정 등)', '최근 구간에서 상단 방향과 반대 마커 숨김'],
                ['L·숫자 / S·숫자', 'A 메타 ON: 신뢰도 또는 RSI totalScore', '수익 보장 아님'],
                ['🚀 / 📉', '구조 로켓 (BOS·존·CHOCH 등)', '같은 봉 L/S와 한 덩어리로 정리되는 경우 많음'],
                ['C↑ / C↓ / c+ / c-', '캔들 점수 보조', '캔들신호 ON일 때'],
                ['C↑78 형태', 'A 메타 ON 시 점수', '0~100 근처 캔들 점수'],
                ['T↑ / T↓', '타이롱 종가 힌트', '마지막 봉·보조'],
                ['존·라벨·피보', '공급/수요, FVG, OB 등', '설정·엔진에 따름'],
              ].map(([a, b, c]) => (
                <tr key={a} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px 10px 0', fontWeight: 700, whiteSpace: 'nowrap' }}>{a}</td>
                  <td style={{ padding: '10px' }}>{b}</td>
                  <td style={{ padding: '10px 0 10px 10px', color: 'var(--muted)' }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="subtle" style={{ fontSize: 13 }}>
          <strong>B(클릭)</strong> ON 상태에서 봉을 누르면 그 시각 마커를 한글 한 줄 요약으로 볼 수 있습니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          2. 캔들 분석 점수 (C↑ / C↓ / 숫자)
        </h2>
        <p className="subtle" style={{ marginBottom: 12, lineHeight: 1.55 }}>
          엔진 <code style={{ fontSize: 11 }}>engine/candles/candleEngine.ts</code>의 <strong>scoreCandles</strong>로 봉마다 점수를 냅니다.
        </p>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>2.1 상승 vs 하락</h3>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', marginBottom: 14, lineHeight: 1.55 }}>
          <li>
            <strong>상승(불)</strong>: 종가 ≥ 시가 → bullish. 마커는 보통 캔들 <strong>아래</strong>.
          </li>
          <li>
            <strong>하락(베어)</strong>: 종가 &lt; 시가 → bearish. 마커는 보통 캔들 <strong>위</strong>.
          </li>
        </ul>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>2.2 점수 (기준 50)</h3>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', marginBottom: 14, lineHeight: 1.55 }}>
          <li>긴 실체, 종가 위치(불↑/베어↓), 엔걸핑, 브레이크아웃 → 가점</li>
          <li>실패한 돌파 → 감점</li>
          <li>긴 꼬리(스윕 의심), 망치/역망치 → 소량 가점</li>
          <li>최종 0~100으로 클램프</li>
        </ul>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>2.3 강도</h3>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', marginBottom: 14, lineHeight: 1.55 }}>
          <li>strong: ≥ 75 · normal: ≥ 55 · weak: 그 미만</li>
        </ul>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>2.4 C 마커 조건 (lib/candleLsMarkers.ts)</h3>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', marginBottom: 14, lineHeight: 1.55 }}>
          <li>strong 이거나 점수 ≥ 62 또는 ≤ 38 인 봉만 후보</li>
          <li>C↑/c+: 불 + 조건 · C↓/c-: 베어 + 조건</li>
          <li>38~62 중간대는 안 나올 수 있음</li>
        </ul>
        <p className="subtle" style={{ lineHeight: 1.55 }}>
          C와 숫자는 그 순간 <strong>캔들 형태·모멘텀 점수</strong>이지, 단독 &quot;무조건 진입&quot;이 아닙니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          3. 지지·저항을 앱이 어떻게 쓰는지
        </h2>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', lineHeight: 1.55 }}>
          <li>수요·지지 / 공급·저항 근처와 판정 방향이 맞으면 RSI 다이버전스 점수에 존 가점 등으로 반영</li>
          <li>유동성 스윕도 체크리스트에 반영</li>
          <li>
            <strong>오버레이는 참고용</strong>이며 언제든 이탈 가능 — 확정 예측이 아닙니다.
          </li>
        </ul>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          4. 메인 L / S
        </h2>
        <ol className="subtle" style={{ paddingLeft: '1.2rem', lineHeight: 1.55 }}>
          <li>확정 신호 봉 시각 고정</li>
          <li>RSI 다이버전스·라인 끝점</li>
          <li>상단 verdict 롱/숏이면 마지막 봉 보강</li>
          <li>서버 확정 히스토리 백필</li>
          <li>로켓과 겹치면 우선순위 규칙으로 한 봉에 주로 하나</li>
        </ol>
        <p className="subtle" style={{ marginTop: 12, lineHeight: 1.55 }}>
          최근 약 <strong>22봉</strong>에서 상단 최종 방향과 <strong>반대</strong>인 L/S·로켓·선확은 숨깁니다. 진입·손절은 실행/브리핑·구조 라인과 함께 보는 것이 좋습니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          5. 타이롱 (T↑ / T↓)
        </h2>
        <p className="subtle" style={{ lineHeight: 1.55 }}>
          <code style={{ fontSize: 11 }}>tailongCloseSignals</code>가 마지막 봉에서만 힌트를 주면 표시. 캔들 점수(C)와는 <strong>별도 파이프라인</strong>입니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          6. 설정 A · B · C
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px 8px 0' }}>옵션</th>
                <th style={{ textAlign: 'left', padding: '8px 0' }}>역할</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['A 메타', 'L/S 접미사, C/T 숫자·텍스트'],
                ['B 클릭', '봉 클릭 시 마커 요약 패널'],
                ['C 밀도', 'L/S·로켓·보조·선확 개별 ON/OFF'],
              ].map(([a, b]) => (
                <tr key={a} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px 10px 0', fontWeight: 700 }}>{a}</td>
                  <td style={{ padding: '10px 0' }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="subtle" style={{ marginTop: 12, fontSize: 13 }}>
          보조 마커 최대 개수 슬라이더는 C/T 보조 마커 상한입니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          7. &quot;그래야만 안전한가?&quot;
        </h2>
        <p className="subtle" style={{ lineHeight: 1.55, marginBottom: 10 }}>
          <strong>아니요.</strong> 분석·시각화 도구이며 미래 수익을 보장하지 않습니다. 손절·상위 TF·여러 요소 겹침·본인 규칙을 권장합니다. 학습 필터·SL 실패 숨김은 보조일 뿐 무위험이 되지는 않습니다.
        </p>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          8. LuxAlgo 스타일 자동 추세선 (구조 ON)
        </h2>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', lineHeight: 1.55, marginBottom: 12 }}>
          <li>
            <strong>피벗 룩백</strong>은 헤더의 <strong>Trendline Lookback</strong>(2~15)과 동일합니다. 좌·우 같은 봉 수로 스윙 고/저를 찾습니다.
          </li>
          <li>
            <strong>작은구조:</strong> 시간상 가장 최근 두 고점을 잇는 <strong>저항(빨강 점선)</strong>, 최근 두 저점을 잇는 <strong>지지(초록 점선)</strong>. 종가로 돌파·이탈 시 <strong>실선(앰버)</strong>으로 바뀝니다.
          </li>
          <li>
            <strong>채널 점선:</strong> 저항선과 <strong>평행</strong>한 하단(연한 초록), 지지선과 평행한 상단(연한 빨강) — 두 앵커 사이의 극단 가격을 지나게 그립니다.
          </li>
          <li>
            <strong>큰구조:</strong> 화면 구간 최고 고가·최저 저가 축과 이후 2·2 피벗을 연결한 추가 점선(색·간격이 작은구조와 구분).
          </li>
          <li>
            선은 <strong>마지막 봉 쪽으로 짧게 우측 연장</strong>되어 현재가와의 관계를 보기 쉽게 합니다.
          </li>
          <li>
            <strong>★ 라벨:</strong> 조정 신뢰도 <strong>88% 이상</strong>이고, 자동 추세선 <strong>저항 돌파·지지 이탈·지지 반등·저항 거부</strong>가 상단 판정(또는 WATCH+RSI 다이버전스 방향)과 맞을 때 표시됩니다.
          </li>
        </ul>

        <h2 className="section-title" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          9. 코드 위치
        </h2>
        <ul className="subtle" style={{ paddingLeft: '1.2rem', lineHeight: 1.6, fontSize: 12 }}>
          <li>
            <code>engine/candles/candleEngine.ts</code> — scoreCandles
          </li>
          <li>
            <code>app/components/ChartView.tsx</code> — L/S·로켓·선확
          </li>
          <li>
            <code>lib/candleLsMarkers.ts</code> — C·T
          </li>
          <li>
            <code>lib/divergenceSignalEngine.ts</code> — RSI·체크리스트
          </li>
          <li>
            <code>lib/luxAlgoTrendlineEngine.ts</code> — Lux 자동 추세선·채널 점선
          </li>
          <li>
            <code>lib/analyze.ts</code> — ★ 라벨과 엔진 결합
          </li>
        </ul>
        <p className="subtle" style={{ marginTop: 20, fontSize: 12 }}>
          저장소 원문: <code>docs/chart-candle-analysis-guide.md</code>
        </p>
      </article>
    </main>
  );
}
