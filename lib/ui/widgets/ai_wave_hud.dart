
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'neon_card.dart';

/// AI ?Œë™ HUD (ì´ˆë³´??ì§ê??ìœ¼ë¡?'ì§€ê¸??Œë™??ê°•í•œì§€/?½í•œì§€' ë³´ì´ê²?
/// - energy(0~100): ?Œë™ ?ë„ˆì§€
/// - bias(-1~+1): ???„ë˜ ê¸°ìš¸ê¸?/// - confidence(0~100): ? ë¢°??/// - pulse: 0~1 ê°’ë“¤??ë¦¬ìŠ¤??ìµœê·¼ Nê°?. ?†ìœ¼ë©??´ë??ì„œ ê°„ë‹¨ ?ì„±.
class AiWaveHud extends StatelessWidget {
  final int energy;
  final double bias;
  final int confidence;
  final List<double> pulse;

  const AiWaveHud({
    super.key,
    required this.energy,
    required this.bias,
    required this.confidence,
    required this.pulse,
  });

  String get _biasText {
    if (bias >= 0.25) return '?ë°©';
    if (bias <= -0.25) return '?˜ë°©';
    return 'ì¤‘ë¦½';
  }

  @override
  Widget build(BuildContext context) {
    final safePulse = pulse.isNotEmpty ? pulse : _fallbackPulse();
    final e = energy.clamp(0, 100);
    final c = confidence.clamp(0, 100);

    return NeonCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('AI ?Œë™ HUD',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Row(
            children: [
              _Ring(
                value: e / 100.0,
                labelTop: '?ë„ˆì§€',
                valueText: '$e',
              ),
              const SizedBox(width: 10),
              _Ring(
                value: c / 100.0,
                labelTop: '? ë¢°',
                valueText: '$c%',
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _kv('ë°©í–¥', _biasText),
                    const SizedBox(height: 6),
                    _kv('ê¸°ìš¸ê¸?, bias.toStringAsFixed(2)),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 54,
                      child: CustomPaint(
                        painter: _WavePainter(safePulse),
                        child: const SizedBox.expand(),
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text('???Œí˜•??ë¾°ì¡±/?êº¼?¸ìˆ˜ë¡?ë³€?™â†‘',
                        style: TextStyle(fontSize: 11, color: Colors.white70)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) => Row(
        children: [
          Text('$k: ',
              style: const TextStyle(fontSize: 12, color: Colors.white70)),
          Text(v,
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      );

  List<double> _fallbackPulse() {
    // ê°„ë‹¨???Œí˜•(0~1) 24ê°?    final out = <double>[];
    for (int i = 0; i < 24; i++) {
      final x = i / 24.0 * math.pi * 2;
      out.add((math.sin(x) * 0.5 + 0.5).clamp(0.0, 1.0));
    }
    return out;
  }
}

class _Ring extends StatelessWidget {
  final double value; // 0..1
  final String labelTop;
  final String valueText;

  const _Ring({
    required this.value,
    required this.labelTop,
    required this.valueText,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 86,
      height: 86,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 86,
            height: 86,
            child: CircularProgressIndicator(
              value: value.clamp(0.0, 1.0),
              strokeWidth: 8,
              backgroundColor: Colors.white.withOpacity(0.08),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(labelTop,
                  style: const TextStyle(fontSize: 11, color: Colors.white70)),
              const SizedBox(height: 2),
              Text(valueText,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  final List<double> pulse;

  _WavePainter(this.pulse);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.cyanAccent.withOpacity(0.95)
      ..strokeWidth = 2.2
      ..style = PaintingStyle.stroke;

    final bg = Paint()
      ..color = Colors.white.withOpacity(0.06)
      ..style = PaintingStyle.fill;

    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, size.width, size.height), const Radius.circular(12)),
      bg,
    );

    if (pulse.isEmpty) return;

    final path = Path();
    for (int i = 0; i < pulse.length; i++) {
      final x = (i / (pulse.length - 1)) * size.width;
      final v = pulse[i].clamp(0.0, 1.0);
      final y = (1 - v) * (size.height - 8) + 4;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant _WavePainter oldDelegate) =>
      oldDelegate.pulse != pulse;
}
