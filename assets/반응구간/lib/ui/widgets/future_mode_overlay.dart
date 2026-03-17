import 'dart:ui';
import 'package:flutter/material.dart';

/// FUTURE MODE UI: "AI PROJECTION" overlay + probability chips + subtle background glow.
///
/// Put this ABOVE the future chart inside a Stack.
///
/// Stack(
///   children: [
///     FutureChart(...),
///     Positioned.fill(
///       child: FutureModeOverlay(
///         enabled: isFutureMode,
///         confidencePct: aiConfidencePct, // 0~100
///         reactionPct: reactionPct,       // 0~100 (지지/저항 반응 확률)
///         invalidPct: invalidPct,         // 0~100 (무효/실패 확률)
///         labelLeft: 'AI PROJECTION',
///       ),
///     ),
///   ],
/// )
class FutureModeOverlay extends StatelessWidget {
  final bool enabled;

  /// AI confidence (0~100)
  final double confidencePct;

  /// Reaction probability (0~100) - e.g., "지지 반응 확률"
  final double reactionPct;

  /// Invalidation probability (0~100) - e.g., "무효 확률"
  final double invalidPct;

  /// Top-left label
  final String labelLeft;

  /// Optional subtitle (e.g., "3 시나리오 / 무효 라인 적용")
  final String? subtitle;

  const FutureModeOverlay({
    super.key,
    required this.enabled,
    required this.confidencePct,
    required this.reactionPct,
    required this.invalidPct,
    this.labelLeft = 'AI PROJECTION',
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    if (!enabled) return const SizedBox.shrink();

    final c = confidencePct.clamp(0, 100).toDouble();
    final r = reactionPct.clamp(0, 100).toDouble();
    final inv = invalidPct.clamp(0, 100).toDouble();

    return IgnorePointer(
      child: Stack(
        children: [
          // background tint/glow
          Positioned.fill(
            child: Opacity(
              opacity: 0.55,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      const Color(0xFF2CCBFF).withOpacity(0.12),
                      const Color(0xFF2CCBFF).withOpacity(0.00),
                      const Color(0xFF8B5CFF).withOpacity(0.06),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // subtle blur band on top for "mode change" feedback
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  height: 44,
                  color: Colors.black.withOpacity(0.18),
                ),
              ),
            ),
          ),
          Positioned(
            left: 14,
            top: 10,
            child: _Chip(
              icon: Icons.auto_awesome,
              text: labelLeft,
              tone: _Tone.primary,
            ),
          ),
          Positioned(
            right: 14,
            top: 10,
            child: _Chip(
              icon: Icons.speed,
              text: 'AI ${c.toStringAsFixed(0)}%',
              tone: _Tone.primary,
            ),
          ),
          if (subtitle != null && subtitle!.trim().isNotEmpty)
            Positioned(
              left: 14,
              top: 52,
              child: Text(
                subtitle!,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.70),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          // bottom probability overlay
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: _BottomBar(
              reactionPct: r,
              invalidPct: inv,
            ),
          ),
        ],
      ),
    );
  }
}

enum _Tone { primary, warn, danger }

class _Chip extends StatelessWidget {
  final IconData icon;
  final String text;
  final _Tone tone;

  const _Chip({required this.icon, required this.text, required this.tone});

  @override
  Widget build(BuildContext context) {
    Color border;
    Color glow;
    switch (tone) {
      case _Tone.primary:
        border = const Color(0xFF2CCBFF);
        glow = const Color(0xFF2CCBFF);
        break;
      case _Tone.warn:
        border = const Color(0xFFFFC857);
        glow = const Color(0xFFFFC857);
        break;
      case _Tone.danger:
        border = const Color(0xFFFF4D6D);
        glow = const Color(0xFFFF4D6D);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: border.withOpacity(0.70), width: 1.2),
        boxShadow: [
          BoxShadow(
            blurRadius: 12,
            spreadRadius: 0,
            offset: const Offset(0, 6),
            color: glow.withOpacity(0.10),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: border.withOpacity(0.95)),
          const SizedBox(width: 7),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withOpacity(0.92),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final double reactionPct;
  final double invalidPct;

  const _BottomBar({required this.reactionPct, required this.invalidPct});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.38),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
      ),
      child: Row(
        children: [
          Expanded(
            child: _metric(
              icon: Icons.bolt,
              title: '반응 확률',
              pct: reactionPct,
              color: const Color(0xFF2CCBFF),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _metric(
              icon: Icons.close,
              title: '무효 확률',
              pct: invalidPct,
              color: const Color(0xFFFF4D6D),
            ),
          ),
        ],
      ),
    );
  }

  Widget _metric({
    required IconData icon,
    required String title,
    required double pct,
    required Color color,
  }) {
    final p = pct.clamp(0, 100).toDouble();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.20), width: 1),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            color.withOpacity(0.12),
            Colors.white.withOpacity(0.02),
          ],
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color.withOpacity(0.95)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Colors.white.withOpacity(0.70),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${p.toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Colors.white.withOpacity(0.92),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}