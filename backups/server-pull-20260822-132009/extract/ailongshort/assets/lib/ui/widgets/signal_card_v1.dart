
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class SignalCardV1 extends StatelessWidget {
  final String direction; // LONG/SHORT/NEUTRAL
  final int probability;  // 0-100
  final String grade;
  final int evidenceHit;
  final int evidenceTotal;
  final List<String> bullets;

  const SignalCardV1({
    super.key,
    required this.direction,
    required this.probability,
    required this.grade,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.bullets,
  });

  String _dirKo() {
    final d = direction.toUpperCase();
    if (d.contains('LONG')) return '롱(상승)';
    if (d.contains('SHORT')) return '숏(하락)';
    return '중립(관망)';
  }

  String _probHint() {
    if (probability >= 75) return '높음(그래도 100%는 없음)';
    if (probability >= 55) return '보통(근거 더 확인)';
    return '낮음(초보는 대기 추천)';
  }

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('${_dirKo()}  $probability%',
                  style: TextStyle(color: theme.good, fontWeight: FontWeight.w900, fontSize: 14)),
              const SizedBox(width: 10),
              Text('근거 $evidenceHit/$evidenceTotal', style: TextStyle(color: theme.muted)),
              const Spacer(),
              Text('등급 $grade', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          // NOTE: 함수 자체를 문자열로 출력하지 않도록 반드시 호출 결과를 넣는다.
          Text('확률 해석: ${_probHint()}', style: TextStyle(color: theme.muted, fontSize: 12)),
          const SizedBox(height: 10),
          // CHOCH/BOS/가격조건 같은 핵심이 뒤쪽에 붙어도 초보가 놓치지 않게
          // 기본 표시 개수를 늘린다(스크롤 없이도 보이도록 10개까지).
          for (final b in bullets.take(10))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle_outline, size: 16, color: theme.muted),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_humanize(b), style: TextStyle(color: theme.fg, height: 1.2))),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _humanize(String raw) {
    var s = raw;
    // Replace jargon with beginner terms
    s = s.replaceAll('FVG', '빈구간(급등/급락 흔적)');
    s = s.replaceAll('BPR', '되돌림 핵심구간');
    s = s.replaceAll('liquidity', '유동성(물량이 몰린 자리)');
    s = s.replaceAll('stop-hunt', '손절쓸기(함정)');
    s = s.replaceAll('OB', '주문/물량 구간');
    s = s.replaceAll('CVD', '매수/매도 우위');
    s = s.replaceAll('VWAP', '평균선(VWAP)');
    s = s.replaceAll('funding', '펀딩(수수료 방향)');
    s = s.replaceAll('OI', '미결제약정(쌓인 포지션)');
    s = s.replaceAll('ATR', '변동성(흔들림)');

    // 구조/SMC 용어
    s = s.replaceAll('CHOCH_UP', '추세전환(상승)');
    s = s.replaceAll('CHOCH_DN', '추세전환(하락)');
    s = s.replaceAll('CHOCH', '추세전환 신호');
    s = s.replaceAll('BOS_UP', '상승 돌파');
    s = s.replaceAll('BOS_DN', '하락 돌파');
    s = s.replaceAll('BOS', '구조 돌파');
    s = s.replaceAll('RANGE', '박스권(횡보)');
    s = s.replaceAll('TREND_UP', '상승 추세');
    s = s.replaceAll('TREND_DN', '하락 추세');

    return s;
  }
}
