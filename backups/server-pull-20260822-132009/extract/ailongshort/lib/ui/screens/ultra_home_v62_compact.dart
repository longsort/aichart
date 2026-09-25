import 'package:flutter/material.dart';
import 'package:ailongshort/ui/widgets/v62_visual_pack.dart';
import 'package:ailongshort/engine/core/core_engine.dart';
import 'package:ailongshort/engine/core/core_demo_feed.dart';

class UltraHomeV62Compact extends StatefulWidget {
  const UltraHomeV62Compact({super.key});

  @override
  State<UltraHomeV62Compact> createState() => _UltraHomeV62CompactState();
}

class _UltraHomeV62CompactState extends State<UltraHomeV62Compact> {
  bool compact = true;

  final _feed = CoreDemoFeed();
  final _core = CoreEngine();

  double price = 0.0;
  double chg24h = 0.0;

  int longP = 50, shortP = 30, noP = 20;
  String whale = 'LOW';
  int risk = 35;

  String tf = '15m';

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 250), _tick);
  }

  void _tick() {
    if (!mounted) return;

    _feed.step();

    final prices = _feed.prices;
    final vols = _feed.volumes;
    final snap = _core.analyze(tf, prices, vols);

    final int up = snap.breakoutUp.round().toInt().clamp(0, 100);
    final int down = snap.breakoutDown.round().toInt().clamp(0, 100);
    final int none = (100 - up - down).clamp(0, 40).toInt();

    setState(() {
      price = prices.isEmpty ? 0.0 : prices.last;
      chg24h = _feed.chg24h;

      longP = up;
      shortP = down;
      noP = none;

      whale = snap.whale;
      risk = (snap.risk * 100).round().toInt().clamp(0, 100);
    });

    Future.delayed(const Duration(seconds: 1), _tick);
  }

  void _openDiagnose() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UltraDiagnoseV62(
          whale: whale,
          risk: risk,
          longP: longP,
          shortP: shortP,
          noP: noP,
          tf: tf,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Fulink Pro ULTRA'),
        actions: [
          _tfButton('15m'),
          _tfButton('1h'),
          _tfButton('4h'),
          IconButton(
            tooltip: 'Diagnose',
            onPressed: _openDiagnose,
            icon: const Icon(Icons.monitor_heart),
          ),
          IconButton(
            tooltip: 'Compact',
            onPressed: () => setState(() => compact = !compact),
            icon: Icon(compact ? Icons.unfold_more : Icons.unfold_less),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                const Expanded(child: RealtimeSparkline()),
                const SizedBox(width: 8),
                _chip('CORE ON', Icons.memory, glow: true),
              ],
            ),
            const SizedBox(height: 10),
            _glassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('PRICE  ${price.toStringAsFixed(1)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  Text('24H  ${chg24h.toStringAsFixed(1)}%', style: const TextStyle(fontSize: 14)),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      ProbabilityPulse(label: 'LONG', value: longP),
                      ProbabilityPulse(label: 'SHORT', value: shortP),
                      ProbabilityPulse(label: 'NO', value: noP),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _whaleBadge(whale),
                      _chip('RISK $risk', Icons.shield),
                      _chip(tf.toUpperCase(), Icons.timer),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (!compact)
              Expanded(
                child: ListView(
                  children: [
                    _glassCard(child: _section('Key Levels', '?§Ïùå ?®Í≥Ñ: ÏßÄÏßÄ/?Ä???êÎèô ÏßëÍ≥Ñ ?∞Í≤∞')),
                    _glassCard(child: _section('Evidence', '?§Ïùå ?®Í≥Ñ: evidenceHit(10Ï¢? ?∞Í≤∞')),
                    _glassCard(child: _section('Scenarios', '?§Ïùå ?®Í≥Ñ: Entry/SL/TP ?êÎèô ?∞Ï∂ú')),
                  ],
                ),
              )
            else
              const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }

  Widget _tfButton(String v) {
    final on = tf == v;
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: TextButton(
        onPressed: () => setState(() => tf = v),
        child: Text(v, style: TextStyle(color: on ? Colors.white : Colors.white70)),
      ),
    );
  }

  Widget _section(String title, String body) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
        const SizedBox(height: 6),
        Text(body, style: const TextStyle(fontSize: 13, color: Colors.white70)),
      ],
    );
  }

  Widget _glassCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: child,
    );
  }

  Widget _chip(String text, IconData icon, {bool glow = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(glow ? 0.25 : 0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(fontSize: 12, color: Colors.white)),
        ],
      ),
    );
  }

  Widget _whaleBadge(String g) {
    final grade = g.toUpperCase();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Text('WHALE $grade', style: const TextStyle(fontSize: 12, color: Colors.white)),
    );
  }
}

class UltraDiagnoseV62 extends StatelessWidget {
  final String whale;
  final int risk;
  final int longP, shortP, noP;
  final String tf;

  const UltraDiagnoseV62({
    super.key,
    required this.whale,
    required this.risk,
    required this.longP,
    required this.shortP,
    required this.noP,
    required this.tf,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, title: const Text('Diagnose')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('TF: $tf', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            Text('WHALE: $whale', style: const TextStyle(fontSize: 14, color: Colors.white)),
            const SizedBox(height: 6),
            Text('RISK: $risk', style: const TextStyle(fontSize: 14, color: Colors.white)),
            const SizedBox(height: 12),
            Text('P: LONG $longP / SHORT $shortP / NO $noP', style: const TextStyle(fontSize: 14, color: Colors.white)),
            const SizedBox(height: 18),
            const Text('???ÑÏû¨??CORE ?∞Î™® ?ºÎìú Í∏∞Î∞ò.\n?§Ïùå ?®Í≥Ñ: ?§ÏãúÍ∞?Í±∞Îûò???∞Ïù¥???∞Í≤∞ + ?µÍ≥Ñ/?ôÏäµ ?Ä??', style: TextStyle(fontSize: 13, color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}