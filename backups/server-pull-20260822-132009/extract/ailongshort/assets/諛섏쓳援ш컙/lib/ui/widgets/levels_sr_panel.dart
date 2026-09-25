
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/data/bitget/bitget_live_store.dart';
import 'package:fulink_pro_ultra/services/user_levels_store.dart';

class LevelsSrPanel extends StatefulWidget {
  const LevelsSrPanel({super.key});

  @override
  State<LevelsSrPanel> createState() => _LevelsSrPanelState();
}

class _LevelsSrPanelState extends State<LevelsSrPanel> {
  final _c = List<TextEditingController>.generate(5, (_) => TextEditingController());
  bool _loaded = false;

  @override
  void dispose() {
    for (final x in _c) { x.dispose(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = BitgetLiveStore.I;
    final lv = UserLevelsStore.I;

    if (!_loaded) {
      _loaded = true;
      lv.load().then((_) {
        final v = lv.levels.value;
        for (int i=0;i<5;i++) {
          _c[i].text = v[i]?.toStringAsFixed(0) ?? '';
        }
        if (mounted) setState((){});
      });
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('사용자 구간 5개 (지지/저항/뚫림 게이지)',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),

          // input row
          Wrap(
            spacing: 8, runSpacing: 8,
            children: List.generate(5, (i) {
              return SizedBox(
                width: 110,
                child: TextField(
                  controller: _c[i],
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  decoration: InputDecoration(
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                    hintText: 'P${i+1}',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.35)),
                    filled: true,
                    fillColor: Colors.black.withOpacity(0.25),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.10)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.10)),
                    ),
                  ),
                  onSubmitted: (_) => _save(),
                ),
              );
            }),
          ),
          const SizedBox(height: 8),

          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _save,
              child: const Text('저장', style: TextStyle(color: Colors.white)),
            ),
          ),

          const SizedBox(height: 8),

          // live gauges
          ValueListenableBuilder(
            valueListenable: store.ticker,
            builder: (_, __, ___) {
              final last = store.ticker.value?.last ?? 0.0;
              final online = store.online.value;
              return ValueListenableBuilder<List<double?>>(
                valueListenable: lv.levels,
                builder: (_, levels, __) {
                  return Column(
                    children: List.generate(5, (i) {
                      final p = levels[i];
                      if (p == null || p == 0) {
                        return _emptyCard(i);
                      }
                      final g = _calc(last: last, level: p, prices: store.prices);
                      return _card(i: i, level: p, last: last, online: online, s: g.support, r: g.resist, b: g.breakRisk);
                    }),
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }

  void _save() {
    final v = <double?>[];
    for (final c in _c) {
      final t = c.text.trim();
      v.add(t.isEmpty ? null : double.tryParse(t));
    }
    UserLevelsStore.I.save(v);
    setState((){});
  }

  Widget _emptyCard(int i) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('P${i+1}', style: TextStyle(color: Colors.white.withOpacity(0.7))),
          Text('미설정', style: TextStyle(color: Colors.white.withOpacity(0.35))),
        ],
      ),
    );
  }

  Widget _card({
    required int i,
    required double level,
    required double last,
    required bool online,
    required double s,
    required double r,
    required double b,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('P${i+1}  ', style: TextStyle(color: Colors.white.withOpacity(0.75))),
              Text(level.toStringAsFixed(0), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              const Spacer(),
              Icon(Icons.circle, size: 9, color: online?Colors.green:Colors.red),
              const SizedBox(width: 6),
              Text(last.toStringAsFixed(1), style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          _bar(label: '지지', v: s),
          const SizedBox(height: 6),
          _bar(label: '저항', v: r),
          const SizedBox(height: 6),
          _bar(label: '뚫림', v: b),
        ],
      ),
    );
  }

  Widget _bar({required String label, required double v}) {
    final val = (v/100.0).clamp(0.0, 1.0);
    return Row(
      children: [
        SizedBox(width: 34, child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: val,
              minHeight: 10,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation(_color(v)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 42, child: Text('${v.toStringAsFixed(0)}', textAlign: TextAlign.right,
          style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 11))),
      ],
    );
  }

  Color _color(double v) {
    if (v >= 75) return Colors.greenAccent;
    if (v <= 35) return Colors.redAccent;
    return Colors.orangeAccent;
  }

  _Gauge _calc({required double last, required double level, required List<double> prices}) {
    if (last <= 0) return const _Gauge(50,50,50);

    // proximity factor
    final dist = (last - level).abs() / last;
    final near = exp(-dist / 0.0022); // ~0.22% scale
    // momentum proxy from last 8 samples
    double mom = 0;
    if (prices.length >= 9) {
      final a = prices[prices.length-1];
      final b = prices[prices.length-9];
      mom = (a - b) / (b == 0 ? 1 : b);
    }
    final toward = ((level - last).sign == mom.sign) ? 1.0 : 0.0; // moving toward level?
    final speed = (mom.abs() * 800).clamp(0.0, 1.0); // normalize

    // heuristic:
    // If level below price => support. If above => resistance.
    final isSupport = level <= last;
    final base = (near * (0.55 + 0.35 * speed)).clamp(0.0, 1.0);

    double support = (isSupport ? base : base * 0.65);
    double resist  = (!isSupport ? base : base * 0.65);

    // break risk rises when near + moving toward + speed high
    double br = (near * (0.35 + 0.65 * toward) * (0.55 + 0.45 * speed)).clamp(0.0, 1.0);

    // convert to 1..100
    return _Gauge(
      (support*100).clamp(1.0, 100.0),
      (resist*100).clamp(1.0, 100.0),
      (br*100).clamp(1.0, 100.0),
    );
  }
}

class _Gauge {
  final double support;
  final double resist;
  final double breakRisk;
  const _Gauge(this.support, this.resist, this.breakRisk);
}
