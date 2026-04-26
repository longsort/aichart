
import 'package:flutter/material.dart';
import '../widgets/neon_theme.dart';

class TradeGuideScreen extends StatelessWidget {
  const TradeGuideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    Widget card(String title, List<String> lines) {
      return Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 15)),
            const SizedBox(height: 10),
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.only(top: 6),
                      decoration: BoxDecoration(color: theme.good.withOpacity(0.7), borderRadius: BorderRadius.circular(2)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(l, style: TextStyle(color: theme.fg, height: 1.25, fontSize: 13))),
                  ],
                ),
              ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: theme.bg,
      appBar: AppBar(
        backgroundColor: theme.bg,
        elevation: 0,
        title: Text('초보 매매법', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
          children: [
            card('0) 원칙 (무조건 지키기)', [
              '1회 손실은 “계좌의 5% 이내”로 고정. (감정 매매 방지)',
              '진입 전에 손절가(SL)가 먼저 결정돼야 함. SL 없는 진입 금지.',
              'RR(리스크:리워드) 최소 1:2 이상만 진입. (예: -1% 손절이면 +2% 이상 목표)',
              '한 번에 올인/물타기 금지. 분할 진입 + 분할 익절이 기본.',
            ]),
            card('1) 기본 용어', [
              '추세: 고점/저점이 높아지면 상승추세, 낮아지면 하락추세.',
              '지지/저항: 가격이 자주 멈추는 구간. 진입/손절/목표의 기준점.',
              '거래량: “움직임의 힘”. 돌파는 거래량이 동반될수록 신뢰↑.',
              '변동성(ATR): 흔들림 크기. 변동성 과도하면 NO-TRADE 고려.',
            ]),
            card('2) 초보 진입 규칙 (5 Evidence)', [
              '① 구조: 상위 TF(1D/4H) 방향과 같은 방향만 공략.',
              '② 지지/저항: 지지에서 반등 롱 / 저항에서 반락 숏이 기본.',
              '③ 거래량: 반등/돌파 구간에서 거래량이 늘어나면 신뢰↑.',
              '④ 유동성/스탑헌트: 직전 고점/저점 쓸고 되돌림이면 함정 가능성.',
              '⑤ 리스크: 손절폭이 너무 넓으면 패스. (손절폭 작고 RR 좋은 자리만)',
            ]),
            card('3) 손절(SL) 잡는 법', [
              '롱: “직전 스윙 저점 아래” 또는 “지지 아래”에 SL.',
              '숏: “직전 스윙 고점 위” 또는 “저항 위”에 SL.',
              'SL은 “예상”이 아니라 “무효화 지점”이다. (거기 깨지면 시나리오 폐기)',
            ]),
            card('4) 익절(TP) 잡는 법 (분할)', [
              '1차: 근처 저항/지지(반대편) — 포지션 40% 정리',
              '2차: 다음 저항/지지 — 35% 정리',
              '3차: 강한 추세면 나머지 25% 트레일링(추세선/이평/스윙)로 끌고 감',
            ]),
            card('5) 5% 리스크 고정 공식 (초보용)', [
              '리스크 금액 = 계좌 × 0.05',
              '손절폭(%) = |진입가 - 손절가| ÷ 진입가 × 100',
              '포지션 크기(현물) ≈ 리스크 금액 ÷ 손절폭(%)',
              '레버리지는 “손절폭이 좁을 때만” 사용. (넓으면 레버리지 금지)',
            ]),
            card('6) NO-TRADE 체크리스트', [
              '상위TF 방향과 반대 방향이면: 패스',
              '리스크가 너무 높고(흔들림 큼) 손절폭이 커지면: 패스',
              '증거(5 Evidence) 중 3개 미만이면: 패스',
              '연속 손실 상태면: 잠깐 쉬기 (쿨다운)',
            ]),
            const SizedBox(height: 6),
            Text('※ 이 화면은 “초보용 기본 매매법”입니다. 신호/브리핑 화면은 위 원칙을 자동 적용하는 방향으로 확장합니다.',
                style: TextStyle(color: theme.muted, height: 1.3)),
          ],
        ),
      ),
    );
  }
}
