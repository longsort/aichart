/**
 * 벤치마크·레퍼런스 데스크 — 공개 OSS·차트 라이브러리·ailongshort 기능 대조.
 * 순위/1위 주장 없음 — 커뮤니티에서 자주 쓰이는 레퍼런스 정리용.
 */

export type ReferenceDeskOssProject = {
  id: string;
  name: string;
  repo: string;
  url: string;
  starsHint: string;
  stack: string[];
  assetFocus: 'crypto' | 'stock' | 'both';
  category: 'chart' | 'analysis' | 'backtest' | 'data' | 'platform';
  summaryKo: string;
  strengths: string[];
  limits: string[];
};

export type ReferenceDeskChartLibrary = {
  id: string;
  name: string;
  vendor: string;
  license: string;
  footprint: string;
  perfHint: string;
  bestFor: string;
  cryptoStock: 'crypto' | 'stock' | 'both';
  url: string;
  notesKo: string;
};

export type ReferenceDeskFeatureCompareRow = {
  id: string;
  area: string;
  industryCommon: string;
  ailongshort: 'yes' | 'partial' | 'unique' | 'no';
  ailongshortNote: string;
  gapOrNext?: string;
};

export const REFERENCE_DESK_DISCLAIMER =
  '공개 GitHub·문서 기준 참고용입니다. “세계 1위 개발자” 같은 순위는 없으며, Stars·기능은 시점에 따라 변합니다.';

export const REFERENCE_DESK_OSS_PROJECTS: ReferenceDeskOssProject[] = [
  {
    id: 'lwc',
    name: 'Lightweight Charts',
    repo: 'tradingview/lightweight-charts',
    url: 'https://github.com/tradingview/lightweight-charts',
    starsHint: '14k+',
    stack: ['TypeScript', 'Canvas'],
    assetFocus: 'both',
    category: 'chart',
    summaryKo: '금융 시계열 전용 경량 차트. 캔들·라인·히스토그램, 플러그인 확장.',
    strengths: ['대용량 캔들 부드러운 렌더', '번들 작음(~45KB gzip)', 'React/Vue 래퍼 생태계'],
    limits: ['지표·드로잉은 직접 구현', 'TradingView 위젯만큼 기능 풍부하지 않음'],
  },
  {
    id: 'openbb',
    name: 'OpenBB Terminal / Platform',
    repo: 'OpenBB-finance/OpenBB',
    url: 'https://github.com/OpenBB-finance/OpenBB',
    starsHint: '30k+',
    stack: ['Python', 'API'],
    assetFocus: 'both',
    category: 'platform',
    summaryKo: '오픈소스 투자 리서치·데이터 허브. 주식·매크로·크립토 데이터 통합.',
    strengths: ['다양한 데이터 소스', '리서치 워크플로', '커뮤니티 확장'],
    limits: ['실시간 트레이딩 UI는 별도', 'SMC·존 작도급 커스텀은 약함'],
  },
  {
    id: 'freqtrade',
    name: 'Freqtrade',
    repo: 'freqtrade/freqtrade',
    url: 'https://github.com/freqtrade/freqtrade',
    starsHint: '28k+',
    stack: ['Python'],
    assetFocus: 'crypto',
    category: 'backtest',
    summaryKo: '크립토 봇 + 백테스트 + 하이퍼옵트. 전략 코드 중심.',
    strengths: ['실거래·페이퍼·백테스트 일체', '거래소 연동 풍부', '전략 커뮤니티'],
    limits: ['차트 작도·MTF 시각화는 부차적', '주식 현물은 범위 밖'],
  },
  {
    id: 'jesse',
    name: 'Jesse',
    repo: 'jesse-ai/jesse',
    url: 'https://github.com/jesse-ai/jesse',
    starsHint: '5k+',
    stack: ['Python'],
    assetFocus: 'crypto',
    category: 'backtest',
    summaryKo: '크립토 알고 전략·백테스트 프레임워크.',
    strengths: ['전략 DSL', '백테스트 리포트', '멀티 타임프레임 전략'],
    limits: ['프론트 차트 커스텀은 제한', '엔진형 UI와는 목적 다름'],
  },
  {
    id: 'ccxt',
    name: 'CCXT',
    repo: 'ccxt/ccxt',
    url: 'https://github.com/ccxt/ccxt',
    starsHint: '32k+',
    stack: ['JavaScript', 'Python'],
    assetFocus: 'crypto',
    category: 'data',
    summaryKo: '거래소 REST/WebSocket 통합 라이브러리.',
    strengths: ['거래소 API 표준화', '실시간·OHLCV 수집'],
    limits: ['분석·차트 없음 — 데이터 레이어만'],
  },
  {
    id: 'backtrader',
    name: 'Backtrader',
    repo: 'mementum/backtrader',
    url: 'https://github.com/mementum/backtrader',
    starsHint: '13k+',
    stack: ['Python'],
    assetFocus: 'both',
    category: 'backtest',
    summaryKo: '클래식 Python 백테스트·지표·브로커 시뮬.',
    strengths: ['지표·전략 풍부', '주식·선물 예제 많음'],
    limits: ['웹 대시보드 없음', '실시간 SMC 작도와는 별개'],
  },
  {
    id: 'zipline',
    name: 'Zipline / Zipline-reloaded',
    repo: 'stefan-jansen/zipline-reloaded',
    url: 'https://github.com/stefan-jansen/zipline-reloaded',
    starsHint: '2k+',
    stack: ['Python'],
    assetFocus: 'stock',
    category: 'backtest',
    summaryKo: 'Quantopian 계열 주식 백테스트 엔진 포크.',
    strengths: ['주식 파이프라인', '팩터·포트폴리오'],
    limits: ['크립토·실시간 차트 UI는 약함'],
  },
  {
    id: 'stocksharp',
    name: 'StockSharp',
    repo: 'StockSharp/StockSharp',
    url: 'https://github.com/StockSharp/StockSharp',
    starsHint: '6k+',
    stack: ['C#'],
    assetFocus: 'both',
    category: 'platform',
    summaryKo: '주식·선물·크립토 알고·차트·커넥터 통합 플랫폼.',
    strengths: ['브로커 연동', '차트·전략·실행'],
    limits: ['.NET 중심', '웹 SMC 커스텀과 스택 상이'],
  },
  {
    id: 'finplot',
    name: 'finplot',
    repo: 'highfestiva/finplot',
    url: 'https://github.com/highfestiva/finplot',
    starsHint: '3k+',
    stack: ['Python', 'PyQt'],
    assetFocus: 'both',
    category: 'chart',
    summaryKo: 'PyQt 기반 고속 금융 플롯(데스크톱).',
    strengths: ['로컬 고속 플롯', '캔들·볼륨'],
    limits: ['웹 배포 아님', '협업 UI 없음'],
  },
  {
    id: 'tulipindicators',
    name: 'Tulip Indicators',
    repo: 'TulipCharts/tulipindicators',
    url: 'https://github.com/TulipCharts/tulipindicators',
    starsHint: '1k+',
    stack: ['C'],
    assetFocus: 'both',
    category: 'analysis',
    summaryKo: '100+ 기술 지표 C 라이브러리.',
    strengths: ['지표 계산 성능', '다언어 바인딩'],
    limits: ['차트·시나리오·존 작도 없음'],
  },
  {
    id: 'cryptofeed',
    name: 'Cryptofeed',
    repo: 'bmoscon/cryptofeed',
    url: 'https://github.com/bmoscon/cryptofeed',
    starsHint: '2k+',
    stack: ['Python'],
    assetFocus: 'crypto',
    category: 'data',
    summaryKo: '크립토 거래소 실시간 피드·콜백.',
    strengths: ['L2·트레이드 스트림', '연구·봇용'],
    limits: ['UI·분석 엔진 없음'],
  },
  {
    id: 'lwc-indicators',
    name: 'lightweight-charts-indicators',
    repo: 'deepquarry/lightweight-charts-indicators',
    url: 'https://github.com/deepquarry/lightweight-charts-indicators',
    starsHint: 'community',
    stack: ['TypeScript'],
    assetFocus: 'both',
    category: 'analysis',
    summaryKo: 'LWC 위 RSI·MACD 등 지표 계산 보조.',
    strengths: ['LWC와 궁합', '클라이언트 지표'],
    limits: ['공식 TradingView 지표 세트 아님', 'SMC·존은 별도'],
  },
];

export const REFERENCE_DESK_CHART_LIBRARIES: ReferenceDeskChartLibrary[] = [
  {
    id: 'lwc',
    name: 'Lightweight Charts',
    vendor: 'TradingView (OSS)',
    license: 'Apache 2.0 + Attribution',
    footprint: '~45KB gzip',
    perfHint: '5만+ 캔들 부드러운 렌더 (벤치마크 글 다수)',
    bestFor: '웹 트레이딩 UI · 실시간 캔들 · 커스텀 오버레이',
    cryptoStock: 'both',
    url: 'https://tradingview.github.io/lightweight-charts/',
    notesKo: 'ailongshort 차트 코어도 이 계열. 존·선·라벨은 앱이 직접 오버레이.',
  },
  {
    id: 'tv-widget',
    name: 'TradingView Widget / Charting Library',
    vendor: 'TradingView (상용/제휴)',
    license: 'Proprietary',
    footprint: '무거움',
    perfHint: '기능 풍부, 커스텀 데이터 연동 지연 가능',
    bestFor: '화이트라벨·지표·드로잉 즉시 필요',
    cryptoStock: 'both',
    url: 'https://www.tradingview.com/widget/',
    notesKo: '지표·드로잉 내장. 데이터·브랜딩·비용 trade-off.',
  },
  {
    id: 'chartjs',
    name: 'Chart.js',
    vendor: 'Open source',
    license: 'MIT',
    footprint: '~180KB gzip',
    perfHint: '~1만 포인트까지 무난, 금융 대량 캔들엔 부담',
    bestFor: '대시보드·혼합 차트·비금융 UI',
    cryptoStock: 'both',
    url: 'https://www.chartjs.org/',
    notesKo: '캔들·MTF 트레이딩 전용보다 범용 BI에 가깝다.',
  },
  {
    id: 'echarts',
    name: 'Apache ECharts',
    vendor: 'Apache',
    license: 'Apache 2.0',
    footprint: '중~대',
    perfHint: '대량 시계열 가능, 금융 특화는 직접 구현',
    bestFor: '대시보드·중국/아시아 SaaS·복합 차트',
    cryptoStock: 'both',
    url: 'https://echarts.apache.org/',
    notesKo: 'K线·볼륨 커스텀 가능하나 SMC 존 엔진은 별도.',
  },
  {
    id: 'plotly',
    name: 'Plotly / plotly.js',
    vendor: 'Plotly',
    license: 'MIT',
    footprint: '중~대',
    perfHint: '인터랙션 좋음, HFT급 실시간은 튜닝 필요',
    bestFor: '리서치·노트북·프로토타입',
    cryptoStock: 'both',
    url: 'https://plotly.com/javascript/',
    notesKo: '퀀트 리포트·교육용 많음. 프로덕션 트레이딩 UI는 LWC 선호 사례 많음.',
  },
  {
    id: 'highcharts',
    name: 'Highcharts Stock',
    vendor: 'Highsoft (상용)',
    license: 'Commercial',
    footprint: '중',
    perfHint: '금융 Stock 모듈 성숙',
    bestFor: '엔터프라이즈 리포트·증권사 내부',
    cryptoStock: 'both',
    url: 'https://www.highcharts.com/products/stock/',
    notesKo: '라이선스 비용. 커스텀 SMC·AI 융합은 자체 개발 필요.',
  },
];

export const REFERENCE_DESK_AILONGSHORT_COMPARE: ReferenceDeskFeatureCompareRow[] = [
  {
    id: 'mtf',
    area: '다중 타임프레임 (상위→하위)',
    industryCommon: 'OpenBB·TV·퀀트 리포트에서 흔함',
    ailongshort: 'yes',
    ailongshortNote: 'MTF 스트립·분석·마감·안착 보드에 반영',
  },
  {
    id: 'structure',
    area: '구조·추세·BOS/CHoCH',
    industryCommon: 'TradingView·SMC 커뮤니티·일부 OSS',
    ailongshort: 'yes',
    ailongshortNote: 'structure·SMC 데스크·스마트머니 MVP',
  },
  {
    id: 'zones',
    area: '존·유동성·반응구간 작도',
    industryCommon: 'TV 드로잉·일부 Pine',
    ailongshort: 'unique',
    ailongshortNote: 'PHZ·고래·마감·안착·Trade Atlas 등 다층 존',
    gapOrNext: '존 과밀 시 간결 모드 UX 지속 개선',
  },
  {
    id: 'scenario',
    area: '시나리오·무효화·조건부 서술',
    industryCommon: '리서치 노트·AI 브리핑 도구',
    ailongshort: 'yes',
    ailongshortNote: 'AI 통합·브리핑·마감 시나리오',
  },
  {
    id: 'backtest',
    area: '백테스트·승률 검증',
    industryCommon: 'Freqtrade·Backtrader·Zipline 핵심',
    ailongshort: 'partial',
    ailongshortNote: '패턴 통계·가상매매·로그 기반 학습',
    gapOrNext: '전략 단위 장기 백테스트 리포트 확장 여지',
  },
  {
    id: 'realtime',
    area: '실시간 거래소 데이터',
    industryCommon: 'CCXT·Cryptofeed·브로커 API',
    ailongshort: 'yes',
    ailongshortNote: '마켓 API·캔들 갱신',
  },
  {
    id: 'modes',
    area: '모드별 UI·레이어 프리셋',
    industryCommon: '상용 터미널·OpenBB 메뉴',
    ailongshort: 'unique',
    ailongshortNote: '고래·합성·AI·마감·안착·벤치마크 등 레일',
  },
  {
    id: 'harmonic',
    area: '하모닉·피보·RSI·비전 패턴',
    industryCommon: 'TV 지표·Pine 스크립트',
    ailongshort: 'yes',
    ailongshortNote: 'analyze·indicators·patternVision',
  },
  {
    id: 'telegram',
    area: '텔레그램 시그널·확인',
    industryCommon: '봇 프레임워크는 많음, 차트 연동은 드묾',
    ailongshort: 'unique',
    ailongshortNote: 'signal-capture·trade-confirm API',
  },
  {
    id: 'learning',
    area: '로그·피드백 가중 조정',
    industryCommon: 'ML 파이프라인 OSS',
    ailongshort: 'partial',
    ailongshortNote: 'trade-learning·whale-memory — 고정 승률 아님',
    gapOrNext: '검증 지표 대시보드 강화',
  },
  {
    id: 'stock',
    area: '주식 + 코인 동시',
    industryCommon: 'OpenBB·StockSharp는 주식 강함',
    ailongshort: 'partial',
    ailongshortNote: '심볼·엔진 설계는 both, 데이터 소스는 코인 중심',
    gapOrNext: '주식 데이터 소스 확장 시 벤치마크 재정렬',
  },
  {
    id: 'oss-chart',
    area: '차트 엔진',
    industryCommon: 'LWC·TV Widget·Highcharts',
    ailongshort: 'yes',
    ailongshortNote: 'Lightweight Charts + 커스텀 HTML 오버레이',
  },
];

export function ailongshortCompareLabel(
  v: ReferenceDeskFeatureCompareRow['ailongshort']
): string {
  switch (v) {
    case 'yes':
      return '있음';
    case 'partial':
      return '부분';
    case 'unique':
      return '강점';
    case 'no':
      return '없음';
    default:
      return '–';
  }
}

export function assetFocusLabel(f: ReferenceDeskOssProject['assetFocus']): string {
  if (f === 'crypto') return '코인';
  if (f === 'stock') return '주식';
  return '코인·주식';
}

export function categoryLabel(c: ReferenceDeskOssProject['category']): string {
  const map: Record<ReferenceDeskOssProject['category'], string> = {
    chart: '차트',
    analysis: '분석·지표',
    backtest: '백테스트·봇',
    data: '데이터',
    platform: '플랫폼',
  };
  return map[c] ?? c;
}
