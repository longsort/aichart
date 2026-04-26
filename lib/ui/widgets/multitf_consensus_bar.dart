import 'dart:math';
import 'package:flutter/material.dart';
import 'package:ailongshort/data/bitget/bitget_live_store.dart';
import 'package:ailongshort/engine/consensus/consensus_bus.dart';

class MultiTfConsensusBar extends StatefulWidget {
  const MultiTfConsensusBar({super.key});

  @override
  State<MultiTfConsensusBar> createState() => _MultiTfConsensusBarState();
}

class _MultiTfConsensusBarState extends State<MultiTfConsensusBar> {
  int consPct = 0;
  Map<String, int> ups = const {};

  @override
  void initState() {
    super.initState();
    _tick();
    BitgetLiveStore.I.ticker.addListener(_tick);
  }

  @override
  void dispose() {
    BitgetLiveStore.I.ticker.removeListener(_tick);
    super.dispose();
  }

  void _tick() {
    final r = calc();
    setState(() {
      consPct = (r['consPct'] as int?) ?? 0;
      ups = (r['ups'] as Map<String, int>?) ?? const {};
    });

    // publish
    ConsensusBus.I.consensus01.value = consPct / 100.0;
    ConsensusBus.I.tfUp.value = Map<String, int>.from(ups);
  }

  // returns ints only (safe)
  Map<String, dynamic> calc() {
    final store = BitgetLiveStore.I;
    final ps = store.prices;
    if (ps.length < 20) {
      return {'consPct': 0, 'ups': <String, int>{}};
    }

    // simple multi-window momentum proxies from ring buffer
    int up15 = _upPct(ps, win: 15);
    int up1h = _upPct(ps, win: 60);
    int up4h = _upPct(ps, win: 240);
    int up1d = _upPct(ps, win: 1440);
    int up1w = _upPct(ps, win: 10080);
    int up1m = _upPct(ps, win: 43200);

    final weights = <String, int>{
      '15m': 1,
      '1h': 2,
      '4h': 3,
      '1D': 4,
      '1W': 5,
      '1M': 6,
    };

    final ups = <String, int>{
      '15m': up15,
      '1h': up1h,
      '4h': up4h,
      '1D': up1d,
      '1W': up1w,
      '1M': up1m,
    };

    int num = 0;
    int den = 0;
    for (final e in ups.entries) {
      final w = weights[e.key] ?? 1;
      num += e.value * w;
      den += 100 * w;
    }
    final consPct = den == 0 ? 0 : (num / den * 100).round().clamp(0, 100);
    return {'consPct': consPct, 'ups': ups};
  }

  int _upPct(List<double> ps, {required int win}) {
    if (ps.isEmpty) return 0;
    final n = ps.length;
    final step = max(1, win ~/ 12); // sample points
    final start = max(0, n - win);
    final base = ps[start];
    if (base == 0) return 0;
    int up = 0;
    int tot = 0;
    for (int i = start; i < n; i += step) {
      tot++;
      if (ps[i] >= base) up++;
    }
    if (tot == 0) return 0;
    return (up / tot * 100).round().clamp(0, 100);
  }

  @override
  Widget build(BuildContext context) {
    final v = (consPct / 100.0).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('?©Ïùò???§Ï§ë?úÍ∞ÑÎ¥?', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
              const Spacer(),
              Text('$consPct%', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: v,
              backgroundColor: Colors.white.withOpacity(0.08),
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.cyanAccent),
              minHeight: 10,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: ups.entries.map((e) => _pill('${e.key} ${e.value}%')).toList(),
          ),
        ],
      ),
    );
  }

  Widget _pill(String t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}