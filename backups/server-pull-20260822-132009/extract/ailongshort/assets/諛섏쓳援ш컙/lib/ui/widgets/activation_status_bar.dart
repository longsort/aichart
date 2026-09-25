import 'package:flutter/material.dart';
import '../ai/feature_flags.dart';

/// Compact Activation Status Bar
/// - Shows which major modules are ON/OFF at a glance.
/// - Put it at the top of your main screen (ultra_home_layout_v1) or above charts.
class ActivationStatusBar extends StatelessWidget {
  final bool isFutureMode;
  final bool isLocked;

  /// decisionPct can be nullable depending on upstream calculations.
  /// null -> 0 (WATCH)
  final double? decisionPct; // 0~100 (nullable safe)

  const ActivationStatusBar({
    super.key,
    required this.isFutureMode,
    required this.isLocked,
    required this.decisionPct,
  });

    @override
  Widget build(BuildContext context) {
    final dp = (decisionPct ?? 0).clamp(0.0, 100.0).toDouble();
    final watch = dp < 20.0;
    final modeTxt = isFutureMode ? 'AI 예측' : '실전';

    final stateTxt = isLocked ? '잠금' : (watch ? '관망' : '활성');
    final stateTone = isLocked ? _Tone.danger : (watch ? _Tone.warn : _Tone.ok);
    final stateIcon = isLocked ? Icons.block : (watch ? Icons.visibility : Icons.check_circle);

    return Container(
      margin: const EdgeInsets.fromLTRB(10, 8, 10, 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.42),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _pill(
              text: modeTxt,
              tone: isFutureMode ? _Tone.primary : _Tone.neutral,
              icon: isFutureMode ? Icons.auto_awesome : Icons.candlestick_chart,
            ),
            const SizedBox(width: 6),
            _pill(text: stateTxt, tone: stateTone, icon: stateIcon),
            const SizedBox(width: 10),

            _dot(text: '표시', on: FeatureFlags.enableFutureProjectionOverlay || FeatureFlags.enableZoneProbLabels || FeatureFlags.enableEntryMarkers),
            const SizedBox(width: 6),
            _dot(text: 'DB', on: FeatureFlags.enableSqliteTradeLogs),
            const SizedBox(width: 6),
            _dot(text: '판정', on: FeatureFlags.enableAutoJudge),
            const SizedBox(width: 6),
            _dot(text: '적중', on: FeatureFlags.enableRollingHitRate),
            const SizedBox(width: 6),
            _dot(text: '락', on: FeatureFlags.enableNoTradeLock),
            const SizedBox(width: 6),
            _dot(text: '튜닝', on: FeatureFlags.enableAutoTune),
          ],
        ),
      ),
    );
  }

  Widget _dot({required String text, required bool on}) {
    final c = on ? const Color(0xFF2BFFB7) : Colors.white.withOpacity(0.20);
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: c.withOpacity(on ? 0.65 : 0.35), width: 1),
      ),
      child: Center(
        child: Text(
          text,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w900,
            color: c.withOpacity(on ? 0.95 : 0.55),
          ),
        ),
      ),
    );
  }

  Widget _pill({required String text, required _Tone tone, required IconData icon}) {
    Color border;
    Color fg;
    switch (tone) {
      case _Tone.primary:
        border = const Color(0xFF2CCBFF);
        fg = Colors.white.withOpacity(0.92);
        break;
      case _Tone.ok:
        border = const Color(0xFF2BFFB7);
        fg = Colors.white.withOpacity(0.92);
        break;
      case _Tone.warn:
        border = const Color(0xFFFFC857);
        fg = Colors.white.withOpacity(0.92);
        break;
      case _Tone.danger:
        border = const Color(0xFFFF4D6D);
        fg = Colors.white.withOpacity(0.92);
        break;
      case _Tone.neutral:
        border = Colors.white.withOpacity(0.30);
        fg = Colors.white.withOpacity(0.88);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: border.withOpacity(0.70), width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: border.withOpacity(0.95)),
          const SizedBox(width: 7),
          Text(
            text,
            style: TextStyle(
              color: fg,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.15,
            ),
          ),
        ],
      ),
    );
  }
}

enum _Tone { primary, ok, warn, danger, neutral }