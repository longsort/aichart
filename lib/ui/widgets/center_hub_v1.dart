
import 'package:flutter/material.dart';
import 'neon_theme.dart';
import 'fx_config.dart';

class CenterHubV1 extends StatelessWidget {
  final String symbol;
  final String tfLabel;
  final double price;
  final String decisionTitle;
  final bool locked;
  final String lockedReason;
  final int evidenceHit;
  final int evidenceTotal;
  final int score;
  final int confidence;
  final int risk;
  final VoidCallback? onTapSettings;

  const CenterHubV1({
    super.key,
    this.symbol = "BTCUSDT",
    this.tfLabel = "15m",
    required this.price,
    required this.decisionTitle,
    required this.locked,
    required this.lockedReason,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.score,
    required this.confidence,
    required this.risk,
    this.onTapSettings,
  });

  String _money(double v) {
    final s = v.toStringAsFixed(2);
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    String verdictText() {
      if (locked) return 'Í±∞ÎûòÍ∏àÏ?';
      // decisionTitle is from engine. Map common words to beginner Korean.
      final d = decisionTitle.toUpperCase();
      if (d.contains('LONG')) return 'Î°??∞ÏÑ∏';
      if (d.contains('SHORT')) return '???∞ÏÑ∏';
      if (d.contains('HOLD')) return 'Í¥ÄÎß?;
      return decisionTitle;
    }

    String verdictHint() {
      if (locked) return lockedReason.isEmpty ? 'Ï¥àÎ≥¥???¨Îäî Í≤??òÏùµ?ÖÎãà??' : lockedReason;
      return '?êÏàò/?†Î¢∞/?ÑÌóò??Î≥¥Í≥† ?úÍ∑úÏπ?Ï∂©Ï°±?ùÏù∏ÏßÄ ?êÎã®';
    }

    Widget pill(String a, String b) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: theme.bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: theme.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(a, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text(b, style: TextStyle(color: theme.fg, fontSize: 11, fontWeight: FontWeight.w900)),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: onTapSettings,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      pill('ÏΩîÏù∏', symbol),
                      const SizedBox(width: 8),
                      pill('Ï£ºÍ∏∞', tfLabel),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(_money(price), style: TextStyle(color: theme.fg, fontSize: 22, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text('?êÎã®: ', style: TextStyle(color: theme.muted, fontWeight: FontWeight.w800)),
                      Text(verdictText(),
                          style: TextStyle(
                            color: locked ? theme.warn : theme.good,
                            fontWeight: FontWeight.w900,
                          )),
                      const SizedBox(width: 10),
                      Text('Í∑ºÍ±∞ $evidenceHit/$evidenceTotal', style: TextStyle(color: theme.muted)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(verdictHint(), style: TextStyle(color: theme.muted, fontSize: 12, height: 1.2)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              children: [
                _meter(theme, '?êÏàò', score),
                const SizedBox(height: 8),
                _meter(theme, '?†Î¢∞', confidence),
                const SizedBox(height: 8),
                _meter(theme, '?ÑÌóò', risk),
                const SizedBox(height: 10),
                _setBtn(theme),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _meter(NeonTheme theme, String label, int v) {
    final vv = v.clamp(0, 100);
    final isRisk = label.contains('?ÑÌóò');
    final glow = isRisk ? theme.warn : theme.good;

    return Container(
      width: 44,
      padding: const EdgeInsets.fromLTRB(6, 8, 6, 8),
      decoration: BoxDecoration(
        color: theme.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        children: [
          Text(label, style: TextStyle(color: theme.muted, fontSize: 10, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          SizedBox(
            width: 24,
            height: 56,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: vv / 100.0),
              duration: const Duration(milliseconds: 550),
              curve: Curves.easeOutCubic,
              builder: (context, p, _) {
                return Stack(
                  alignment: Alignment.bottomCenter,
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: theme.card,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: theme.border),
                      ),
                    ),
                    FractionallySizedBox(
                      heightFactor: p,
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: glow.withOpacity(0.85),
                          boxShadow: FxConfig.showMode
                              ? [BoxShadow(color: glow.withOpacity(0.55), blurRadius: 14, spreadRadius: 1)]
                              : const [],
                        ),
                      ),
                    ),
                    if (FxConfig.showMode)
                      Positioned(
                        top: 6,
                        child: AnimatedOpacity(
                          duration: const Duration(milliseconds: 800),
                          opacity: 0.6,
                          child: Container(
                            width: 14,
                            height: 2,
                            decoration: BoxDecoration(color: theme.fg.withOpacity(0.45), borderRadius: BorderRadius.circular(999)),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 6),
          Text('$vv', style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _setBtn(NeonTheme theme) {
    return Container(
      width: 42,
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: theme.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.border),
      ),
      child: Center(
        child: Text('?§Ï†ï', style: TextStyle(color: theme.fg, fontSize: 11, fontWeight: FontWeight.w900)),
      ),
    );
  }
}
