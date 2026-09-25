import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

/// 통합 브리핑 카드 (초보용)
class IntegratedBriefingCardV1 extends StatelessWidget {
  final FuState s;
  final Color card;
  final Color fg;
  final Color sub;
  final Color border;

  const IntegratedBriefingCardV1({
    super.key,
    required this.s,
    required this.card,
    required this.fg,
    required this.sub,
    required this.border,
  });

  @override
  Widget build(BuildContext context) {
    final dir = s.signalDir.toUpperCase();
    final bool locked = s.locked;

    String title;
    String emoji;
    if (locked) {
      title = '거래 금지';
      emoji = '🔒';
    } else if (dir == 'LONG') {
      title = '상승 우세';
      emoji = '📈';
    } else if (dir == 'SHORT') {
      title = '하락 우세';
      emoji = '📉';
    } else {
      title = '관망';
      emoji = '👀';
    }

    final reasons = <String>[];
    if (locked && s.lockedReason.trim().isNotEmpty) {
      reasons.add(s.lockedReason.trim());
    }
    // bullets에서 핵심 3개만 뽑기
    for (final b in s.signalBullets) {
      if (reasons.length >= 3) break;
      final t = b.trim();
      if (t.isEmpty) continue;
      reasons.add(t);
    }
    if (reasons.isEmpty) {
      reasons.add(s.signalWhy.isNotEmpty ? s.signalWhy : '데이터 수집 중');
    }

    final bool actionable = s.showSignal && !locked;
    final guide1 = locked
        ? '초보: 지금은 쉬어요'
        : (actionable ? '초보: 5% 리스크로 소액만' : '초보: 조건 충족 전까지 대기');
    final guide2 = locked
        ? '숙련: 과열/충돌 구간 회피'
        : (actionable ? '숙련: 계획(진입/손절/목표)대로' : '숙련: 지지/저항 반응 확인');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: TextStyle(color: fg, fontSize: 16)),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w900),
              ),
              const Spacer(),
              Text(
                '신뢰 ${s.confidence}% · 위험 ${s.risk}%',
                style: TextStyle(color: sub, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...reasons.take(3).map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('• $t', style: TextStyle(color: sub, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text(guide1, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800))),
              const SizedBox(width: 8),
              Expanded(child: Text(guide2, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800))),
            ],
          )
        ],
      ),
    );
  }
}
