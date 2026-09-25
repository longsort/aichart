import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/analysis/candle_prob_engine.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';

/// ?®ÌÑ¥(Ïπ?Í∏Ä?? ?¥Î¶≠ ???®Îäî "AI ?®ÌÑ¥ ?®ÎÑê" (?àÏ†Ñ/?§Îç∞?¥ÌÑ∞ Í∏∞Î∞ò)
/// - FuState + candles Í∏∞Î∞ò
/// - MiniChartV4 ?¨ÏÇ¨??+ overlayLines/overlayLabel ?úÏãú
/// - ?∞Ï∏° ?ÅÎã®: ÎØ∏ÎûòÍ≤ΩÎ°ú(?????? + ?åÎèô(1~5) ?îÏïΩ
class PatternAiPanel extends StatelessWidget {
  final NeonTheme t;
  final String symbol;
  final String tfLabel;
  final FuState state;
  final List<FuCandle> candles;
  final PatternInfo pattern;
  final List<MiniChartLine> overlayLines;
  final String overlayLabel;

  const PatternAiPanel({
    super.key,
    required this.t,
    required this.symbol,
    required this.tfLabel,
    required this.state,
    required this.candles,
    required this.pattern,
    this.overlayLines = const [],
    this.overlayLabel = '',
  });

  @override
  Widget build(BuildContext context) {
    final lastPrice = candles.isNotEmpty ? candles.last.close : state.price;

    final future = _calcFuture3(state);
    final wave = _calcWaveStage(candles);

    return SafeArea(
      child: Container(
        margin: const EdgeInsets.fromLTRB(10, 10, 10, 10),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        decoration: BoxDecoration(
          color: const Color(0xFF0B1020),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
          boxShadow: [
            BoxShadow(
              blurRadius: 18,
              color: Colors.black.withOpacity(0.35),
              offset: const Offset(0, 10),
            )
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$symbol ¬∑ $tfLabel',
                    style: TextStyle(
                      color: t.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                _pill(
                  title: '?®ÌÑ¥',
                  value: pattern.name,
                  tone: pattern.tone,
                ),
              ],
            ),
            const SizedBox(height: 10),

            // ?ÅÎã® ?îÏïΩ(?ÑÏû¨Í∞Ä/ÏßÄÏßÄ/?Ä??VWAP)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _pillText('?ÑÏû¨Í∞Ä', lastPrice > 0 ? lastPrice.toStringAsFixed(0) : '-'),
                _pillText('ÏßÄÏßÄ', state.s1 > 0 ? state.s1.toStringAsFixed(0) : '-'),
                _pillText('?Ä??, state.r1 > 0 ? state.r1.toStringAsFixed(0) : '-'),
                _pillText('VWAP', state.vwap > 0 ? state.vwap.toStringAsFixed(0) : '-'),
                _pillText('Íµ¨Ï°∞', state.structureTag),
              ],
            ),
            const SizedBox(height: 10),

            // ?∞Ï∏° ?ÅÎã®: ÎØ∏ÎûòÍ≤ΩÎ°ú + ?åÎèô
            Row(
              children: [
                Expanded(
                  child: Text(
                    'ÎØ∏Îûò Í≤ΩÎ°ú(?????? + ?åÎèô',
                    style: TextStyle(color: t.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
                _FuturePath3Mini(t: t, f: future),
                const SizedBox(width: 10),
                _WaveBadge(t: t, wave: wave),
              ],
            ),
            const SizedBox(height: 10),

            // Ï∞®Ìä∏(?§Îç∞?¥ÌÑ∞) + Í∏∞Ï°¥ ?§Î≤Ñ?àÏù¥
            SizedBox(
              height: 220,
              child: MiniChartV4(
                candles: candles,
                fvgZones: state.fvgZones,
                title: 'AI ?®ÌÑ¥',
                price: state.price,
                s1: state.s1,
                r1: state.r1,
                bias: state.signalDir,
                prob: state.signalProb,
                showPlan: state.showSignal,
                entry: state.entry,
                stop: state.stop,
                target: state.target,
                overlayLines: overlayLines,
                overlayLabel: overlayLabel,
                structureTag: state.structureTag,
                reactLevel: state.reactLevel,
                reactLow: state.reactLow,
                reactHigh: state.reactHigh,
              ),
            ),
            const SizedBox(height: 10),

            // ?úÎÇòÎ¶¨Ïò§ Ïπ¥Îìú(Ï°∞Í±¥ + ?ïÎ•†)
            Row(
              children: [
                Expanded(child: _scenarioCard('?ÅÎ∞©', future.up, 'Ï°∞Í±¥: ${state.breakLevel > 0 ? state.breakLevel.toStringAsFixed(0) : '?åÌåå ?ïÏù∏'} ?¥ÏÉÅ', good: true)),
                const SizedBox(width: 8),
                Expanded(child: _scenarioCard('?òÎ∞©', future.down, 'Ï°∞Í±¥: ${state.breakLevel > 0 ? state.breakLevel.toStringAsFixed(0) : '?¥ÌÉà ?ïÏù∏'} ?¥Ìïò', good: false)),
                const SizedBox(width: 8),
                Expanded(child: _scenarioCard('?°Î≥¥', future.flat, 'Ï°∞Í±¥: Î∞ïÏä§/Î∞òÏùë ?†Ï?', good: null)),
              ],
            ),
            const SizedBox(height: 10),

            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text('?´Í∏∞', style: TextStyle(color: t.textPrimary, fontWeight: FontWeight.w800)),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _pillText(String title, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Text(
        '$title $value',
        style: TextStyle(color: t.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _pill({required String title, required String value, required ChipTone tone}) {
    final Color c;
    switch (tone) {
      case ChipTone.good:
        c = const Color(0xFF3AF2A7);
        break;
      case ChipTone.bad:
        c = const Color(0xFFFF5C7A);
        break;
      case ChipTone.warn:
        c = const Color(0xFFFFC857);
        break;
      case ChipTone.neutral:
        c = Colors.white.withOpacity(0.70);
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.35)),
      ),
      child: Text(
        '$title $value',
        style: TextStyle(color: c.withOpacity(0.95), fontSize: 12, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _scenarioCard(String title, int pct, String cond, {required bool? good}) {
    Color c;
    if (good == true) {
      c = const Color(0xFF3AF2A7);
    } else if (good == false) {
      c = const Color(0xFFFF5C7A);
    } else {
      c = const Color(0xFFFFC857);
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(color: t.textPrimary, fontSize: 12, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('$pct%', style: TextStyle(color: c, fontSize: 16, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(cond, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Future3 {
  final int up;
  final int down;
  final int flat;
  const _Future3({required this.up, required this.down, required this.flat});
}

_Future3 _calcFuture3(FuState s) {
  final dir = s.signalDir.toUpperCase();
  final p = s.signalProb.clamp(0, 100);
  int up = 0, down = 0, flat = 0;
  if (dir == 'LONG') {
    up = p;
    down = ((100 - p) * 0.60).round();
    flat = 100 - up - down;
  } else if (dir == 'SHORT') {
    down = p;
    up = ((100 - p) * 0.60).round();
    flat = 100 - up - down;
  } else {
    // Í¥ÄÎß?Ï§ëÎ¶Ω?Ä ?°Î≥¥ ÎπÑÏ§ë???¨Í≤å
    flat = math.max(45, 100 - (p ~/ 2));
    final rest = 100 - flat;
    up = rest ~/ 2;
    down = 100 - flat - up;
  }
  // Î≥¥Ï†ï
  up = up.clamp(0, 100);
  down = down.clamp(0, 100);
  flat = (100 - up - down).clamp(0, 100);
  return _Future3(up: up, down: down, flat: flat);
}

class _WaveStage {
  final int step; // 1..5
  const _WaveStage(this.step);
}

_WaveStage _calcWaveStage(List<FuCandle> candles) {
  if (candles.length < 20) return const _WaveStage(0);
  // Îß§Ïö∞ ?®Ïàú/?àÏ†Ñ: ÏµúÍ∑º Î≥ÄÍ≥??ºÎ≤ó) Í∞úÏàòÎ°?1~5 Í∑ºÏÇ¨
  final data = candles.length > 120 ? candles.sublist(candles.length - 120) : candles;
  final pivots = <int>[];
  for (int i = 2; i < data.length - 2; i++) {
    final h = data[i].high;
    final l = data[i].low;
    final isHigh = h > data[i - 1].high && h > data[i - 2].high && h > data[i + 1].high && h > data[i + 2].high;
    final isLow = l < data[i - 1].low && l < data[i - 2].low && l < data[i + 1].low && l < data[i + 2].low;
    if (isHigh || isLow) pivots.add(i);
  }
  if (pivots.length < 5) return const _WaveStage(0);
  final recent = pivots.sublist(math.max(0, pivots.length - 5));
  final step = (recent.length).clamp(1, 5);
  return _WaveStage(step);
}

class _FuturePath3Mini extends StatelessWidget {
  final NeonTheme t;
  final _Future3 f;
  const _FuturePath3Mini({required this.t, required this.f});

  @override
  Widget build(BuildContext context) {
    Widget chip(String title, int pct, Color c) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: c.withOpacity(0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.withOpacity(0.30)),
        ),
        child: Text('$title $pct%', style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900)),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        chip('??, f.up, const Color(0xFF3AF2A7)),
        const SizedBox(width: 6),
        chip('??, f.down, const Color(0xFFFF5C7A)),
        const SizedBox(width: 6),
        chip('??, f.flat, const Color(0xFFFFC857)),
      ],
    );
  }
}

class _WaveBadge extends StatelessWidget {
  final NeonTheme t;
  final _WaveStage wave;
  const _WaveBadge({required this.t, required this.wave});

  @override
  Widget build(BuildContext context) {
    final txt = wave.step <= 0 ? '?åÎèô --' : '?åÎèô ${wave.step}/5';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Text(txt, style: TextStyle(color: t.textPrimary, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}
