import 'package:flutter/material.dart';
import '../../logic/tyron_engine.dart';

class TyronCard extends StatelessWidget {
  final TyronStats s;
  const TyronCard({super.key, required this.s});

  @override
  Widget build(BuildContext context) {
    final direction = _directionText(s);
    final color = _directionColor(s);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.55)),
        boxShadow: [BoxShadow(color: color.withOpacity(0.18), blurRadius: 18)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('타이롱 분석', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: color.withOpacity(0.55)),
                ),
                child: Text(direction, style: TextStyle(color: color, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            _oneLineReason(s),
            style: const TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 12),
          _row('다음 1봉 상승 확률', (s.pUp1 * 100).toStringAsFixed(0) + '%'),
          _row('다음 3봉 상승 확률', (s.pUp3 * 100).toStringAsFixed(0) + '%'),
          _row('다음 5봉 상승 확률', (s.pUp5 * 100).toStringAsFixed(0) + '%'),
          const SizedBox(height: 8),
          Text(
            s.samples == 0 ? '샘플 부족: 과거 데이터가 더 필요해요.' : '과거 샘플 ${s.samples}건 기준',
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(k, style: const TextStyle(color: Colors.white60))),
          Text(v, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  static String _directionText(TyronStats s) {
    // 상승 확률이 높으면 오르는 쪽, 낮으면 내리는 쪽, 애매하면 쉬기
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    if (avgUp >= 0.62) return '오르는 쪽 진입';
    if (avgUp <= 0.38) return '내리는 쪽 진입';
    return '지금은 쉬기';
    }

  static Color _directionColor(TyronStats s) {
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    if (avgUp >= 0.62) return const Color(0xFF7CFFB2);
    if (avgUp <= 0.38) return const Color(0xFFFF5C7A);
    return const Color(0xFFFFC04D);
  }

  static String _oneLineReason(TyronStats s) {
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    final big = s.isBigBull ? '장대양봉' : (s.isBigBear ? '장대음봉' : '큰 캔들 아님');
    final r = s.bodyAtrRatio.toStringAsFixed(2);
    if (avgUp >= 0.62) return '최근 $big(강도 $r배) 이후 과거에 “오르는 경우”가 더 많았어요.';
    if (avgUp <= 0.38) return '최근 $big(강도 $r배) 이후 과거에 “내리는 경우”가 더 많았어요.';
    return '최근 흐름이 애매해요. 확률이 비슷하면 쉬는 게 이득이에요.';
  }
}
