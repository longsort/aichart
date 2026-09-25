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
              Text('?€?´ë¡± ë¶„ì„', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
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
          _row('?¤ìŒ 1ë´??ìŠ¹ ?•ë¥ ', (s.pUp1 * 100).toStringAsFixed(0) + '%'),
          _row('?¤ìŒ 3ë´??ìŠ¹ ?•ë¥ ', (s.pUp3 * 100).toStringAsFixed(0) + '%'),
          _row('?¤ìŒ 5ë´??ìŠ¹ ?•ë¥ ', (s.pUp5 * 100).toStringAsFixed(0) + '%'),
          const SizedBox(height: 8),
          Text(
            s.samples == 0 ? '?˜í”Œ ë¶€ì¡? ê³¼ê±° ?°ì´?°ê? ???„ìš”?´ìš”.' : 'ê³¼ê±° ?˜í”Œ ${s.samples}ê±?ê¸°ì?',
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
    // ?ìŠ¹ ?•ë¥ ???’ìœ¼ë©??¤ë¥´??ìª? ??œ¼ë©??´ë¦¬??ìª? ? ë§¤?˜ë©´ ?¬ê¸°
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    if (avgUp >= 0.62) return '?¤ë¥´??ìª?ì§„ì…';
    if (avgUp <= 0.38) return '?´ë¦¬??ìª?ì§„ì…';
    return 'ì§€ê¸ˆì? ?¬ê¸°';
    }

  static Color _directionColor(TyronStats s) {
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    if (avgUp >= 0.62) return const Color(0xFF7CFFB2);
    if (avgUp <= 0.38) return const Color(0xFFFF5C7A);
    return const Color(0xFFFFC04D);
  }

  static String _oneLineReason(TyronStats s) {
    final avgUp = (s.pUp1 + s.pUp3 + s.pUp5) / 3.0;
    final big = s.isBigBull ? '?¥ë??‘ë´‰' : (s.isBigBear ? '?¥ë??Œë´‰' : '??ìº”ë“¤ ?„ë‹˜');
    final r = s.bodyAtrRatio.toStringAsFixed(2);
    if (avgUp >= 0.62) return 'ìµœê·¼ $big(ê°•ë„ $rë°? ?´í›„ ê³¼ê±°???œì˜¤ë¥´ëŠ” ê²½ìš°?ê? ??ë§ì•˜?´ìš”.';
    if (avgUp <= 0.38) return 'ìµœê·¼ $big(ê°•ë„ $rë°? ?´í›„ ê³¼ê±°???œë‚´ë¦¬ëŠ” ê²½ìš°?ê? ??ë§ì•˜?´ìš”.';
    return 'ìµœê·¼ ?ë¦„??? ë§¤?´ìš”. ?•ë¥ ??ë¹„ìŠ·?˜ë©´ ?¬ëŠ” ê²??´ë“?´ì—??';
  }
}
