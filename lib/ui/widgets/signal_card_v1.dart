
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
    if (d.contains('LONG')) return 'ë¡??ìŠ¹)';
    if (d.contains('SHORT')) return '???˜ë½)';
    return 'ì¤‘ë¦½(ê´€ë§?';
  }

  String _probHint() {
    if (probability >= 75) return '?’ìŒ(ê·¸ë˜??100%???†ìŒ)';
    if (probability >= 55) return 'ë³´í†µ(ê·¼ê±° ???•ì¸)';
    return '??Œ(ì´ˆë³´???€ê¸?ì¶”ì²œ)';
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
              Text('ê·¼ê±° $evidenceHit/$evidenceTotal', style: TextStyle(color: theme.muted)),
              const Spacer(),
              Text('?±ê¸‰ $grade', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          // NOTE: ?¨ìˆ˜ ?ì²´ë¥?ë¬¸ì?´ë¡œ ì¶œë ¥?˜ì? ?Šë„ë¡?ë°˜ë“œ???¸ì¶œ ê²°ê³¼ë¥??£ëŠ”??
          Text('?•ë¥  ?´ì„: ${_probHint()}', style: TextStyle(color: theme.muted, fontSize: 12)),
          const SizedBox(height: 10),
          // CHOCH/BOS/ê°€ê²©ì¡°ê±?ê°™ì? ?µì‹¬???¤ìª½??ë¶™ì–´??ì´ˆë³´ê°€ ?“ì¹˜ì§€ ?Šê²Œ
          // ê¸°ë³¸ ?œì‹œ ê°œìˆ˜ë¥??˜ë¦°???¤í¬ë¡??†ì´??ë³´ì´?„ë¡ 10ê°œê¹Œì§€).
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
    s = s.replaceAll('FVG', 'ë¹ˆêµ¬ê°?ê¸‰ë“±/ê¸‰ë½ ?”ì )');
    s = s.replaceAll('BPR', '?˜ëŒë¦??µì‹¬êµ¬ê°„');
    s = s.replaceAll('liquidity', '? ë™??ë¬¼ëŸ‰??ëª°ë¦° ?ë¦¬)');
    s = s.replaceAll('stop-hunt', '?ì ˆ?¸ê¸°(?¨ì •)');
    s = s.replaceAll('OB', 'ì£¼ë¬¸/ë¬¼ëŸ‰ êµ¬ê°„');
    s = s.replaceAll('CVD', 'ë§¤ìˆ˜/ë§¤ë„ ?°ìœ„');
    s = s.replaceAll('VWAP', '?‰ê· ??VWAP)');
    s = s.replaceAll('funding', '?€???˜ìˆ˜ë£?ë°©í–¥)');
    s = s.replaceAll('OI', 'ë¯¸ê²°?œì•½???“ì¸ ?¬ì???');
    s = s.replaceAll('ATR', 'ë³€?™ì„±(?”ë“¤ë¦?');

    // êµ¬ì¡°/SMC ?©ì–´
    s = s.replaceAll('CHOCH_UP', 'ì¶”ì„¸?„í™˜(?ìŠ¹)');
    s = s.replaceAll('CHOCH_DN', 'ì¶”ì„¸?„í™˜(?˜ë½)');
    s = s.replaceAll('CHOCH', 'ì¶”ì„¸?„í™˜ ? í˜¸');
    s = s.replaceAll('BOS_UP', '?ìŠ¹ ?ŒíŒŒ');
    s = s.replaceAll('BOS_DN', '?˜ë½ ?ŒíŒŒ');
    s = s.replaceAll('BOS', 'êµ¬ì¡° ?ŒíŒŒ');
    s = s.replaceAll('RANGE', 'ë°•ìŠ¤ê¶??¡ë³´)');
    s = s.replaceAll('TREND_UP', '?ìŠ¹ ì¶”ì„¸');
    s = s.replaceAll('TREND_DN', '?˜ë½ ì¶”ì„¸');

    return s;
  }
}
