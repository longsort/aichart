import 'dart:math';
import 'package:flutter/material.dart';

class PositionProgressCard extends StatelessWidget {
  final double price;
  final double entry;
  final double sl;
  final double tp;
  final String title;

  const PositionProgressCard({
    super.key,
    required this.price,
    required this.entry,
    required this.sl,
    required this.tp,
    this.title = '포지션 진행',
  });

  @override
  Widget build(BuildContext context) {
    final p = price;
    final e = entry;
    final s = sl;
    final t = tp;

    double progress01 = 0;
    if (e > 0 && t > e) {
      progress01 = ((p - e) / (t - e)).clamp(0.0, 1.0);
    }

    double slDistPct = 0;
    if (e > 0 && s > 0) slDistPct = ((e - s).abs() / e * 100).clamp(0.0, 999);

    String state = '대기';
    if (p > 0 && e > 0 && t > 0) {
      if (p >= t) state = '목표달성 ✅';
      else if (p <= s) state = '손절 🔴';
      else if (progress01 >= 0.85) state = '거의도달';
      else state = '진행중';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.speed, color: Colors.greenAccent, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
                ),
              ),
              Text(
                state,
                style: TextStyle(
                  color: state.contains('🔴') ? Colors.redAccent : Colors.greenAccent,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _rail(p, e, s, t, progress01),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _chip('현재', p),
              _chip('진입', e),
              _chip('손절', s),
              _chip('목표', t),
              _chipTxt('진행', '${(progress01 * 100).toStringAsFixed(0)}%'),
              _chipTxt('손절폭', '${slDistPct.toStringAsFixed(2)}%'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(String k, double v) {
    return _chipTxt(k, v <= 0 ? '-' : v.toStringAsFixed(2));
  }

  Widget _chipTxt(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.05),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Text(
        '$k: $v',
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  Widget _rail(double p, double e, double s, double t, double progress01) {
    // Normalize to [sl..tp] window
    final minV = min(s > 0 ? s : e, e);
    final maxV = max(t > 0 ? t : e, e);
    double pos01 = 0.5;
    if (maxV > minV) {
      pos01 = ((p - minV) / (maxV - minV)).clamp(0.0, 1.0);
    }

    return Column(
      children: [
        Row(
          children: const [
            Expanded(child: Text('SL', style: TextStyle(color: Colors.redAccent, fontSize: 11, fontWeight: FontWeight.w900))),
            Expanded(child: Text('IN', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900))),
            Expanded(child: Text('TP', textAlign: TextAlign.right, style: TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.w900))),
          ],
        ),
        const SizedBox(height: 6),
        Stack(
          children: [
            Container(
              height: 12,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: Colors.white.withOpacity(0.08),
              ),
            ),
            FractionallySizedBox(
              widthFactor: progress01,
              child: Container(
                height: 12,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  color: Colors.greenAccent.withOpacity(0.35),
                ),
              ),
            ),
            Positioned(
              left: pos01 * 260, // layout friendly enough for compact mode
              child: Container(
                width: 8,
                height: 12,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  color: (p >= e) ? Colors.greenAccent : Colors.redAccent,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
