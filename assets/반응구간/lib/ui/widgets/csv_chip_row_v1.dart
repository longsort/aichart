import 'package:flutter/material.dart';

import '../../core/analysis/candle_prob_engine.dart';
import '../../core/models/fu_state.dart';
import 'neon_theme.dart';

class CsvChipRowV1 extends StatelessWidget {
  final NeonTheme t;
  final List<FuCandle> candles;
  final String dir;
  final int prob;
  final int sweepRisk;

  const CsvChipRowV1({
    super.key,
    required this.t,
    required this.candles,
    required this.dir,
    required this.prob,
    required this.sweepRisk,
  });

  @override
  Widget build(BuildContext context) {
    final chips = CandleProbEngine().buildChips(
      candles,
      currentDir: dir,
      currentProb: prob,
      sweepRisk: sweepRisk,
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: t.border.withOpacity(0.55), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ✅ 작은 화면에서 텍스트 오버플로우 방지
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('CSV/캔들 칩', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w700)),
              Text('현재 + 과거 비교', style: TextStyle(color: t.muted, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: chips.map((c) => _chip(t, c)).toList(growable: false),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(NeonTheme t, ChipItem c) {
    final bg = switch (c.tone) {
      ChipTone.good => t.good.withOpacity(0.16),
      ChipTone.bad => t.bad.withOpacity(0.16),
      ChipTone.warn => t.warn.withOpacity(0.14),
      // NeonTheme에는 panel이 없어서 card로 대체
      ChipTone.neutral => t.card.withOpacity(0.65),
    };

    final br = switch (c.tone) {
      ChipTone.good => t.good.withOpacity(0.45),
      ChipTone.bad => t.bad.withOpacity(0.45),
      ChipTone.warn => t.warn.withOpacity(0.45),
      ChipTone.neutral => t.border.withOpacity(0.45),
    };

    final fg = switch (c.tone) {
      ChipTone.good => t.good,
      ChipTone.bad => t.bad,
      ChipTone.warn => t.warn,
      ChipTone.neutral => t.fg,
    };

    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: br, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.title, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(c.value, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
