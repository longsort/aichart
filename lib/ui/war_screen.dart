import 'dart:math';
import 'package:flutter/material.dart';

import '../core/engines/structure_ai.dart';
import '../core/engines/liquidity_ai.dart';
import '../core/engines/probability_ai.dart';
import '../core/engines/consensus_engine.dart';
import '../core/engines/risk_engine.dart';
import '../core/models/engine_models.dart';
import '../core/update/patch_manager.dart';

import 'full_screen.dart';
import 'widgets/glass_card.dart';
import 'widgets/sparkline.dart';
import 'widgets/prob_bar.dart';

class WarScreen extends StatefulWidget {
  const WarScreen({super.key});

  @override
  State<WarScreen> createState() => _WarScreenState();
}

class _WarScreenState extends State<WarScreen> {
  final _pm = PatchManager();

  final _structure = StructureAI();
  final _liq = LiquidityAI();
  final _prob = ProbabilityAI();
  final _cons = ConsensusEngine();
  final _risk = RiskEngine();

  late List<double> _closes;
  late List<double> _highs;
  late List<double> _lows;

  double _price = 62350.0;

  StructureOutput? _so;
  LiquidityOutput? _lo;
  ProbabilityOutput? _po;
  EngineConsensus? _co;
  RiskPlan? _rp;

  bool _busy = false;
  String _status = "READY";

  @override
  void initState() {
    super.initState();
    _seedData();
    _runEngines();
  }

  void _seedData() {
    final r = Random(7);
    _closes = List.generate(48, (i) => 62000 + r.nextDouble() * 600 + i * 2);
    _highs = _closes.map((e) => e + r.nextDouble() * 60).toList();
    _lows = _closes.map((e) => e - r.nextDouble() * 60).toList();
    _price = _closes.last;
  }

  void _runEngines() {
    final so = _structure.analyze(closes: _closes);
    final lo = _liq.analyze(highs: _highs, lows: _lows);
    final po = _prob.analyze(price: _price, biasHint: so.bias);
    final co = _cons.decide(structure: so, liquidity: lo, prob: po);

    final entry = _price;
    final stop = co.bias == MarketBias.long ? _price * 0.99 : _price * 1.01;
    final rp = _risk.buildPlan(entry: entry, stop: stop, price: _price);

    setState(() {
      _so = so; _lo = lo; _po = po; _co = co; _rp = rp;
    });
  }

  Future<void> _applyPatch() async {
    setState(() { _busy = true; _status = "PATCHING..."; });
    try {
      await _pm.applyBundledPatch();
      final v = await _pm.getCurrentVersion();
      setState(() { _status = "PATCH OK (v=$v)"; });
    } catch (e) {
      setState(() { _status = "PATCH FAIL (rolled back)"; });
    } finally {
      setState(() { _busy = false; });
    }
  }

  String _biasText(MarketBias b) => switch (b) {
    MarketBias.long => "LONG",
    MarketBias.short => "SHORT",
    MarketBias.neutral => "NEUTRAL",
  };

  String _gateText(TradeGate g) => switch (g) {
    TradeGate.enter => "ENTER",
    TradeGate.watch => "WATCH",
    TradeGate.noTrade => "NO-TRADE",
  };

  @override
  Widget build(BuildContext context) {
    final so = _so;
    final lo = _lo;
    final po = _po;
    final co = _co;
    final rp = _rp;

    final longScore = (co?.bias == MarketBias.long ? co!.confidence : 100 - (co?.confidence ?? 50)).clamp(0, 100);
    final shortScore = (co?.bias == MarketBias.short ? co!.confidence : 100 - (co?.confidence ?? 50)).clamp(0, 100);

    return Scaffold(
      appBar: AppBar(
        title: const Text("Fulink Pro"),
        actions: [
          IconButton(
            onPressed: _busy ? null : _applyPatch,
            icon: const Icon(Icons.system_update_alt),
            tooltip: "Apply patch (bundled)",
          ),
          IconButton(
            onPressed: () => setState(_seedData),
            icon: const Icon(Icons.refresh),
            tooltip: "Reseed sample data",
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            GlassCard(
              child: Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 78,
                      child: Sparkline(data: _closes),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text("PRICE", style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.7))),
                      Text(_price.toStringAsFixed(1), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(_status, style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.7))),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView(
                children: [
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Text("ONE-GLANCE WAR SCREEN", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                            const Spacer(),
                            TextButton.icon(
                              onPressed: () {
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => FullScreenView(
                                    price: _price,
                                    closes: _closes,
                                    consensus: co,
                                    prob: po,
                                    risk: rp,
                                    liquidity: lo,
                                    structure: so,
                                  ),
                                ));
                              },
                              icon: const Icon(Icons.open_in_full, size: 18),
                              label: const Text("FULL"),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          runSpacing: 8,
                          children: [
                            _pill("BIAS", co == null ? "-" : _biasText(co.bias)),
                            _pill("GATE", co == null ? "-" : _gateText(co.gate)),
                            _pill("CONF", co == null ? "-" : "${co.confidence}%"),
                            _pill("WAVE", so?.wave ?? "-"),
                            _pill("GRADE", so?.grade ?? "-"),
                            _pill("STOPHUNT", lo == null ? "-" : "${lo.stopHuntRisk}%"),
                            _pill("WHALES", lo == null ? "-" : (lo.whalesOn ? "ON" : "OFF")),
                          ],
                        ),
                        const SizedBox(height: 14),
                        ProbBar(label: "LONG", value: longScore),
                        const SizedBox(height: 10),
                        ProbBar(label: "SHORT", value: shortScore),
                        const SizedBox(height: 14),
                        if (co != null)
                          Text("REASON: ${co.reason}", style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.75))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("RISK PLAN (5%)", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        _kv("ENTRY", rp == null ? "-" : rp.entry.toStringAsFixed(1)),
                        _kv("STOP", rp == null ? "-" : rp.stop.toStringAsFixed(1)),
                        _kv("TP1/TP2/TP3", rp == null ? "-" : "${rp.tp1.toStringAsFixed(1)} / ${rp.tp2.toStringAsFixed(1)} / ${rp.tp3.toStringAsFixed(1)}"),
                        _kv("SPOT SIZE", rp == null ? "-" : "${rp.positionSizePctSpot}%"),
                        _kv("FUT LEV", rp == null ? "-" : "${rp.leverageFutures}x"),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("SCENARIOS (3)", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        if (po == null) const Text("-")
                        else ...po.scenarios.map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: _kv("${s.name}  ${_biasText(s.bias)}", "${s.probability}%  ??${s.target.toStringAsFixed(1)}"),
                        )),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pill(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
        color: Colors.white.withOpacity(0.05),
      ),
      child: Text("$k: $v", style: const TextStyle(fontSize: 11)),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(k, style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.7)))),
          Text(v, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
