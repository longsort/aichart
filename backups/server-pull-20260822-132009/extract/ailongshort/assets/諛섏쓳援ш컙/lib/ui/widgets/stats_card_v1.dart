
import 'package:flutter/material.dart';

import '../../core/learning/trade_store.dart';
import '../../core/learning/trade_stats_engine.dart';

class StatsCardV1 extends StatefulWidget {
  const StatsCardV1({super.key});

  @override
  State<StatsCardV1> createState() => _StatsCardV1State();
}

class _StatsCardV1State extends State<StatsCardV1> {
  final _store = TradeStore();
  final _engine = TradeStatsEngine();

  bool _open = false;
  bool _loading = false;
  Map<String, TradeStats>? _buckets;
  TradeStats? _overall;

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final logs = await _store.readAll(limit: 400);
      _overall = _engine.overall(logs);
      _buckets = _engine.quickBuckets(logs);
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () async {
              setState(() => _open = !_open);
              if (_open && _buckets == null && !_loading) await _load();
            },
            child: Row(
              children: [
                const Icon(Icons.bar_chart, size: 16, color: Colors.white70),
                const SizedBox(width: 8),
                const Text('통계', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                const Spacer(),
                Text(_open ? '닫기' : '보기', style: const TextStyle(color: Colors.white70)),
              ],
            ),
          ),
          if (_open) ...[
            const SizedBox(height: 10),
            if (_loading) const Text('불러오는 중...', style: TextStyle(color: Colors.white70)),
            if (!_loading && _overall != null) ...[
              _row('전체', _overall!.winRate, _overall!.wins, _overall!.total),
              const SizedBox(height: 8),
              if (_buckets != null)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _buckets!.entries.map((e) {
                    final s = e.value;
                    return _pill('${e.key} ${s.winRate.toStringAsFixed(0)}%', s.total);
                  }).toList(),
                ),
              const SizedBox(height: 6),
              const Text('※ v13에서 자동 복기/가중치 보정까지 연결됨', style: TextStyle(color: Colors.white38, fontSize: 11)),
            ],
          ],
        ],
      ),
    );
  }

  Widget _row(String label, double wr, int wins, int total) {
    return Row(
      children: [
        Text(label, style: const TextStyle(color: Colors.white70)),
        const Spacer(),
        Text('${wr.toStringAsFixed(0)}%', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
        const SizedBox(width: 10),
        Text('$wins/$total', style: const TextStyle(color: Colors.white70)),
      ],
    );
  }

  Widget _pill(String text, int n) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(text, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        const SizedBox(width: 6),
        Text('($n)', style: const TextStyle(color: Colors.white38, fontSize: 11)),
      ]),
    );
  }
}
