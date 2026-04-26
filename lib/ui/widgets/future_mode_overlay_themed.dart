import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/tf_theme.dart';

class FutureModeOverlayThemed extends StatelessWidget {
  final bool enabled;
  final String tf;
  final double confidencePct;
  final double reactionPct;
  final double invalidPct;
  final String? subtitle;

  const FutureModeOverlayThemed({
    super.key,
    required this.enabled,
    required this.tf,
    required this.confidencePct,
    required this.reactionPct,
    required this.invalidPct,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    if (!enabled) return const SizedBox.shrink();

    final th = TfTheme.of(tf);
    final tone = th.tone;
    final glow = th.glowOpacity;

    return IgnorePointer(
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [tone.withOpacity(glow), tone.withOpacity(0.0)],
                ),
              ),
            ),
          ),
          Positioned(
            left: 14,
            top: 10,
            child: _chip(icon: Icons.auto_awesome, text: 'AI PROJECTION', border: tone),
          ),
          Positioned(
            right: 14,
            top: 10,
            child: _chip(icon: Icons.speed, text: 'AI ${confidencePct.clamp(0,100).toStringAsFixed(0)}%', border: tone),
          ),
          if (subtitle != null)
            Positioned(
              left: 14,
              top: 52,
              child: Text(
                subtitle!,
                style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w600),
              ),
            ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: _bottomBar(tone: tone, reactionPct: reactionPct, invalidPct: invalidPct),
          ),
        ],
      ),
    );
  }

  Widget _chip({required IconData icon, required String text, required Color border}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: border.withOpacity(0.75), width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: border.withOpacity(0.95)),
          const SizedBox(width: 7),
          Text(text, style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _bottomBar({required Color tone, required double reactionPct, required double invalidPct}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.38),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
      ),
      child: Row(
        children: [
          Expanded(child: _metric(icon: Icons.bolt, title: '반응', pct: reactionPct, color: tone)),
          const SizedBox(width: 10),
          Expanded(child: _metric(icon: Icons.close, title: '무효', pct: invalidPct, color: const Color(0xFFFF4D6D))),
        ],
      ),
    );
  }

  Widget _metric({required IconData icon, required String title, required double pct, required Color color}) {
    final p = pct.clamp(0, 100).toDouble();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.22), width: 1),
        color: color.withOpacity(0.10),
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color.withOpacity(0.95)),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white.withOpacity(0.70))),
              const SizedBox(height: 2),
              Text('${p.toStringAsFixed(0)}%', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white.withOpacity(0.92))),
            ],
          ),
        ],
      ),
    );
  }
}