import 'dart:async';
import 'package:flutter/material.dart';
import 'package:ailongshort/data/market/market_store.dart';
import 'package:ailongshort/data/market/market_ticker.dart';
import 'package:ailongshort/data/logging/log_service.dart';
import 'package:ailongshort/data/bitget/bitget_live_store.dart';

class ZoneInputScreen extends StatefulWidget {
  const ZoneInputScreen({super.key});

  @override
  State<ZoneInputScreen> createState() => _ZoneInputScreenState();
}

class _ZoneInputScreenState extends State<ZoneInputScreen> {
  final ctrls = List.generate(5, (_) => TextEditingController());
  final zones = List<double?>.filled(5, null);

  DateTime _lastLog = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _logMaybe());
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in ctrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _logMaybe() {
    final t = MarketStore.I.ticker.value;
    if (t.last <= 0) return;

    final res = _calcAll(t.last);
    final now = DateTime.now();
    if (now.difference(_lastLog).inMilliseconds < 2000) return;
    _lastLog = now;

    LogService.I.logZones(
      p: zones,
      price: t.last,
      support: res.support,
      resistance: res.resistance,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('ZONE', style: TextStyle(color: Colors.white)),
      ),
      body: ValueListenableBuilder<MarketTicker>(
        valueListenable: MarketStore.I.ticker,
        builder: (_, t, __) {
          final price = t.last;
          final res = _calcAll(price);
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              _topInfo(t),
              const SizedBox(height: 10),
              _inputs(),
              const SizedBox(height: 10),
              ...List.generate(5, (i) => _zoneCard(i, price, res)),
            ],
          );
        },
      ),
    );
  }

  _ZoneRes _calcAll(double price) {
    final support = List<double>.filled(5, 0);
    final resistance = List<double>.filled(5, 0);
    final tape = List<double>.filled(5, 0);
    final wall = List<double>.filled(5, 0);

    // volatility proxy from Bitget ring buffer (works even if exchange=BINANCE, still safe)
    final p = BitgetLiveStore.I.prices;
    double v = 0;
    if (p.length >= 12) {
      double s = 0;
      for (int i = p.length - 12; i < p.length - 1; i++) {
        s += (p[i + 1] - p[i]).abs();
      }
      v = (s / 11.0).clamp(0, 1500);
    }

    for (int i = 0; i < 5; i++) {
      final z = zones[i];
      if (z == null || price <= 0) continue;

      final dist = (z - price).abs();
      final near = (100 - (dist / price) * 4500).clamp(0, 100).toDouble();
      final volBoost = (v / 1500 * 20).clamp(0, 20).toDouble();

      final isBelow = z < price;
      support[i] = (isBelow ? (near + volBoost) : (near * 0.35)).clamp(0, 100);
      resistance[i] = (!isBelow ? (near + volBoost) : (near * 0.35)).clamp(0, 100);

      // simulated tape/wall strength based on proximity + volatility
      tape[i] = (near * 0.75 + volBoost * 1.25).clamp(0, 100);
      wall[i] = (near * 0.6 + (100 - volBoost) * 0.2).clamp(0, 100);
    }
    return _ZoneRes(support, resistance, tape, wall);
  }

  Widget _topInfo(MarketTicker t) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(t.symbol, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          Text(t.last <= 0 ? '--' : t.last.toStringAsFixed(1),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _inputs() {
    return Column(
      children: List.generate(5, (i) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: TextField(
            controller: ctrls[i],
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'P${i + 1}',
              labelStyle: const TextStyle(color: Colors.white70),
              filled: true,
              fillColor: Colors.white.withOpacity(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
            onChanged: (v) {
              final x = double.tryParse(v.trim());
              setState(() => zones[i] = x);
            },
          ),
        );
      }),
    );
  }

  Widget _zoneCard(int i, double price, _ZoneRes r) {
    final z = zones[i];
    final label = 'P${i + 1}';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              const SizedBox(width: 10),
              Text(z == null ? '--' : z.toStringAsFixed(1), style: const TextStyle(color: Colors.white70)),
            ],
          ),
          const SizedBox(height: 10),
          _g('지지', r.support[i]),
          const SizedBox(height: 6),
          _g('?�??, r.resistance[i]),
          const SizedBox(height: 10),
          _g('체결', r.tape[i]),
          const SizedBox(height: 6),
          _g('�?, r.wall[i]),
        ],
      ),
    );
  }

  Widget _g(String name, double v) {
    return Row(
      children: [
        SizedBox(width: 42, child: Text(name, style: const TextStyle(color: Colors.white70, fontSize: 12))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (v / 100).clamp(0, 1),
              minHeight: 10,
              backgroundColor: Colors.white10,
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 40,
          child: Text(v.toStringAsFixed(0), textAlign: TextAlign.right,
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ),
      ],
    );
  }
}

class _ZoneRes {
  final List<double> support;
  final List<double> resistance;
  final List<double> tape;
  final List<double> wall;
  _ZoneRes(this.support, this.resistance, this.tape, this.wall);
}
