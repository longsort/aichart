class IndicatorDef {
  final String id;
  final String title;
  final String oneLine;
  final String meaning;
  final List<String> howToRead;
  final List<String> notes;

  const IndicatorDef({
    required this.id,
    required this.title,
    required this.oneLine,
    required this.meaning,
    this.howToRead = const [],
    this.notes = const [],
  });
}

/// 지표 사전(Glossary)
/// - UI/설명용. 엔진과 분리.
const List<IndicatorDef> kIndicatorGlossary = [
  IndicatorDef(
    id: 'confirm',
    title: '확정',
    oneLine: '앱 결론(롱/숏/관망)을 “확정 라벨”로 띄울 수 있는 신뢰도 점수',
    meaning: '가격이 확정된다는 뜻이 아니라, “현재 결론을 확정으로 표기해도 되는가”에 대한 점수입니다.',
    howToRead: [
      '낮음: WATCH/관망/LOCK 유지',
      '높음: (근거≥5, 멀티TF 합의, 20% 게이트) 충족 시 LONG/SHORT 확정 표기',
    ],
  ),
  IndicatorDef(
    id: 'mtf',
    title: 'TF 합의',
    oneLine: '멀티 타임프레임(1m~1M) 방향/구조가 같은 쪽으로 얼마나 모였는지',
    meaning: '여러 TF가 같은 방향을 지지할수록 합의가 높아집니다. 합의가 낮으면 “관망/대기”가 우선입니다.',
    howToRead: [
      '낮음: TF마다 방향이 엇갈림 → 신호 확정 금지(WATCH)',
      '높음: 같은 방향 합의 → 다른 근거와 함께 확정 조건 충족 가능',
    ],
  ),
  IndicatorDef(
    id: 'reaction',
    title: '반응',
    oneLine: '반응구간(유동성/OB/FVG/BPR 등)에 닿았을 때 실제로 튕김/멈춤이 관측됐는지',
    meaning: '“그 구간이 먹혔는가(효력)”를 나타냅니다. 반응 자체는 현상이고, 세력/고래 흡수는 원인 추정입니다.',
    howToRead: [
      '100%라고 해서 세력 매집 확정은 아님(추가 근거 필요)',
      '반응↑ + 흡수/세력↑ 동반이면 “받는 구간” 가능성↑',
    ],
  ),
  IndicatorDef(
    id: 'po3',
    title: 'PO3 축적',
    oneLine: 'PO3(Power of 3)에서 “축적/레인지 쌓기” 단계로 보이는 정도',
    meaning: '대개 스탑헌트/확장 이전에 박스가 형성되며 유동성이 쌓이는 구간을 의미합니다.',
  ),
  IndicatorDef(
    id: 'bpr2_gold',
    title: 'BPR2 + 금딱',
    oneLine: '리밸런스/핵심 구간(골든 포켓 등)과 겹치는 확률 존 점수',
    meaning: '되돌림/재진입에서 “잘 먹히는 자리” 여부를 요약한 점수입니다.',
  ),
  IndicatorDef(
    id: 'ob_choch',
    title: 'OB / CHoCH',
    oneLine: '오더블록(OB) + 구조변화(CHoCH) 결합 점수',
    meaning: '구조 전환/추세 변화 조짐을 요약합니다. 높을수록 방향성 전환 신뢰가 올라갑니다.',
  ),
  IndicatorDef(
    id: 'fvg_bpr',
    title: 'FVG / BPR',
    oneLine: '불균형(FVG) 메움 + 리밸런스(BPR) 결합 점수',
    meaning: '갭/불균형 구간에서의 되돌림 확률과 리밸런스 가능성을 요약합니다.',
  ),
  IndicatorDef(
    id: 'tape_buy',
    title: '체결 매수',
    oneLine: '최근 체결에서 매수 우세 비중(0~100)',
    meaning: '시장가 체결 흐름이 매수 쪽인지(상승 에너지) 요약합니다.',
    notes: ['데이터 미연결이면 “--”로 표시됩니다.'],
  ),
  IndicatorDef(
    id: 'ob_buy',
    title: '오더북 매수',
    oneLine: '오더북 상 매수호가 우세 비중(0~100)',
    meaning: '호가(대기 물량) 기준으로 매수벽/매도벽 균형을 요약합니다.',
    notes: ['데이터 미연결이면 “--”로 표시됩니다.'],
  ),
  IndicatorDef(
    id: 'whale_buy',
    title: '고래 매수',
    oneLine: '대형 체결/대량 흐름에서 매수 우세 비중(0~100)',
    meaning: '고래로 추정되는 대형 거래의 방향성을 요약합니다.',
    notes: ['데이터 미연결이면 “--”로 표시됩니다.'],
  ),
  IndicatorDef(
    id: 'inst_bias',
    title: '기관 바이어스',
    oneLine: '기관/세력 방향성(매수 우세=높음) 요약값(0~100)',
    meaning: '여러 흐름 지표를 종합한 “바이어스(편향)” 요약치입니다.',
    notes: ['데이터 미연결이면 “--”로 표시됩니다.'],
  ),
  IndicatorDef(
    id: 'absorb',
    title: '흡수',
    oneLine: '큰 거래가 나와도 가격이 잘 안 밀릴 때(흡수) 점수',
    meaning: '매도(또는 매수) 물량이 나오는데도 가격이 버티면 흡수로 간주합니다.',
    notes: ['데이터/계산 미작동이면 0%에 고정될 수 있어 “--” 표기가 정상입니다.'],
  ),
  IndicatorDef(
    id: 'force',
    title: '세력',
    oneLine: '추세를 “밀고 가는 힘(Force)” 점수',
    meaning: '체결/호가/가격 진행이 한쪽으로 강하게 쏠릴 때 높아집니다.',
  ),
  IndicatorDef(
    id: 'decision_power',
    title: '결정력',
    oneLine: '결론 강도(엔진 confidenceScore) 요약',
    meaning: '근거/합의/ROI/리스크 등을 합쳐 “지금 결론이 얼마나 강한가”를 나타냅니다.',
  ),
  IndicatorDef(
    id: 'liquidity',
    title: '유동성',
    oneLine: '유동성/흡수(Absorption) 계열 점수',
    meaning: '반응구간에서 유동성 회수/흡수 징후가 강할수록 높습니다.',
  ),
  IndicatorDef(
    id: 'whale_score',
    title: '고래(점수)',
    oneLine: '고래 영향도(whaleScore) 점수',
    meaning: '대형 거래/급격한 흐름이 감지될수록 높아집니다.',
  ),
  IndicatorDef(
    id: 'sweep_risk',
    title: '스윕 위험',
    oneLine: '스탑헌트/털기 위험(높을수록 위험)',
    meaning: '변동성/꼬리/유동성 사냥 패턴이 강하면 위험도가 올라갑니다.',
  ),
];

const Map<String, String> kIndicatorAliases = {
  // chips
  '확정': 'confirm',
  '반응': 'reaction',
  'TF': 'mtf',
  'TF 합의': 'mtf',
  'PO3': 'po3',
  'BPR2+금딱': 'bpr2_gold',
  'OB/CHOCH': 'ob_choch',
  'FVG/BPR': 'fvg_bpr',
  // flow bars
  '체결 매수': 'tape_buy',
  '오더북 매수': 'ob_buy',
  '고래 매수': 'whale_buy',
  '기관 바이어스': 'inst_bias',
  '흡수': 'absorb',
  '세력': 'force',
  // meters
  '결정력': 'decision_power',
  '유동성': 'liquidity',
  '고래': 'whale_score',
  '스윕위험': 'sweep_risk',
};
