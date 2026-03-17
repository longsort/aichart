
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import 'briefing_sheet_v1.dart';

class TfBriefingCardsV2 extends StatelessWidget {
  final Map<String, FuState> tfSnap;
  final String selectedTf;
  final ValueChanged<String> onSelectTf;

  const TfBriefingCardsV2({
    super.key,
    required this.tfSnap,
    required this.selectedTf,
    required this.onSelectTf,
  });

  @override
  Widget build(BuildContext context) {
    final tfs = const ['1m','5m','15m','1h','4h','1D','1W','1M'];
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: tfs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final tf = tfs[i];
          final s = tfSnap[tf];
          final badge = _badgeFor(s);
          final isSel = tf == selectedTf;
          return GestureDetector(
            onTap: () {
              onSelectTf(tf);
              if (s != null) {
                showModalBottomSheet(
                  context: context,
                  backgroundColor: Colors.transparent,
                  isScrollControlled: true,
                  builder: (_) => BriefingSheetV1(tf: tf, s: s),
                );
              }
            },
            child: Container(
              width: 110,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(isSel ? 0.55 : 0.35),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSel ? Colors.white.withOpacity(0.18) : Colors.white.withOpacity(0.08),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(tf, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      const Spacer(),
                      _miniBadge(badge),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    s == null ? '대기중' : _titleFor(s),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12, height: 1.15),
                  ),
                  const Spacer(),
                  if (s != null)
                    Text(
                      '${s.price.toStringAsFixed(0)}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _titleFor(FuState s) {
    // decisionTitle already human-friendly in this project
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) return t;
    if (s.locked) return s.lockedReason.isEmpty ? 'NO-TRADE' : s.lockedReason;
    if (s.score >= 60) return '롱 우세';
    if (s.score <= 40) return '숏 우세';
    return '관망';
  }

  String _badgeFor(FuState? s) {
    if (s == null) return 'W';
    if (s.locked) return 'N';
    final t = (s.decisionTitle).toLowerCase();
    if (t.contains('롱') || t.contains('매수') || t.contains('상승')) return 'B';
    if (t.contains('숏') || t.contains('매도') || t.contains('하락')) return 'S';
    if (s.score >= 60 && s.confidence >= 55) return 'B';
    if (s.score <= 40 && s.confidence >= 55) return 'S';
    return 'W';
  }

  Widget _miniBadge(String b) {
    Color c;
    switch (b) {
      case 'B': c = Colors.greenAccent; break;
      case 'S': c = Colors.redAccent; break;
      case 'N': c = Colors.orangeAccent; break;
      default: c = Colors.white70;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.25)),
      ),
      child: Text(b, style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12)),
    );
  }
}
