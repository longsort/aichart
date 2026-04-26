import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/consensus/consensus_bus.dart';
import 'package:fulink_pro_ultra/logic/no_trade_lock.dart';

/// Top LONG/SHORT gauge driven by ConsensusBus.
///
/// Score mapping:
/// - consensus01 (0..1) -> score (-100..+100)
/// - score > +12 => LONG, score < -12 => SHORT, else NEUTRAL
///
/// NO-TRADE lock:
/// - derived from a lightweight risk proxy + TF agreement count
/// - (full engine wiring comes later; this is UI-skeleton safe)
class TopLongShortGauge extends StatefulWidget {
  const TopLongShortGauge({super.key});

  @override
  State<TopLongShortGauge> createState() => _TopLongShortGaugeState();
}

class _TopLongShortGaugeState extends State<TopLongShortGauge> {
  double _c01 = 0.5;
  Map<String, int> _tfUp = const {};
  int _hit = 0;
  int _total = 10;
  int _ageSec = 0;

  @override
  void initState() {
    super.initState();
    _sync();
    ConsensusBus.I.consensus01.addListener(_sync);
    ConsensusBus.I.tfUp.addListener(_sync);
    ConsensusBus.I.evidenceHit.addListener(_sync);
    ConsensusBus.I.evidenceTotal.addListener(_sync);
    ConsensusBus.I.lastUpdateMs.addListener(_sync);
  }

  @override
  void dispose() {
    ConsensusBus.I.consensus01.removeListener(_sync);
    ConsensusBus.I.tfUp.removeListener(_sync);
    ConsensusBus.I.evidenceHit.removeListener(_sync);
    ConsensusBus.I.evidenceTotal.removeListener(_sync);
    ConsensusBus.I.lastUpdateMs.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    if (!mounted) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = ConsensusBus.I.lastUpdateMs.value;
    setState(() {
      _c01 = ConsensusBus.I.consensus01.value;
      _tfUp = Map<String, int>.from(ConsensusBus.I.tfUp.value);
      _hit = ConsensusBus.I.evidenceHit.value;
      _total = ConsensusBus.I.evidenceTotal.value;
      _ageSec = last <= 0 ? 999 : ((now - last) / 1000).round();
    });
  }

  int _agreeCountFor(String dir) {
    // dir: 'LONG' or 'SHORT'
    int c = 0;
    for (final v in _tfUp.values) {
      if (dir == 'LONG') {
        if (v >= 60) c++;
      } else {
        if (v <= 40) c++;
      }
    }
    return c;
  }

  @override
  Widget build(BuildContext context) {
    final c01 = _c01.clamp(0.0, 1.0);
    final score = ((c01 - 0.5) * 200).clamp(-100.0, 100.0);

    final dir = score > 12
        ? 'LONG'
        : (score < -12 ? 'SHORT' : 'NEUTRAL');

    final agreeLong = _agreeCountFor('LONG');
    final agreeShort = _agreeCountFor('SHORT');
    final agree = (dir == 'SHORT' ? agreeShort : agreeLong);

    // v1: risk proxy (UI skeleton)
    // - evidence low => 위험 증가
    // - direction neutral => 위험 증가
    int risk = 40;
    if (_hit <= 3) risk = 85;
    else if (_hit <= 5) risk = 70;
    else if (_hit <= 7) risk = 55;
    if (dir == 'NEUTRAL') risk = (risk + 15).clamp(0, 100);

    final lock = NoTradeLockEngine.evaluate(
      riskScore: risk,
      agreeCount: agree,
      totalTf: (_tfUp.isEmpty ? 5 : _tfUp.length),
    );

    final conf = _total <= 0 ? 0.0 : (_hit / _total).clamp(0.0, 1.0);

    // indicator position: 0..1
    final pos01 = ((score + 100) / 200).clamp(0.0, 1.0);
    final longPct = (pos01 * 100).round().clamp(0, 100);
    final shortPct = (100 - longPct).clamp(0, 100);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                lock.locked ? 'NO-TRADE 🔒' : dir,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  color: lock.locked
                      ? Colors.white70
                      : (dir == 'LONG'
                          ? Colors.greenAccent
                          : (dir == 'SHORT'
                              ? Colors.redAccent
                              : Colors.white70)),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '점수 ${score.toStringAsFixed(0)}',
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.white60,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'c01 ${(c01 as double).toStringAsFixed(2)} · ${_ageSec}s',
                style: const TextStyle(
                  fontSize: 11,
                  color: Colors.white54,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              const Text(
                'GAUGE v2',
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.white38,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '증거 $_hit/$_total',
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.white70,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '합의 $agree',
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.white60,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _GaugeBar(pos01: pos01, locked: lock.locked),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                'SHORT $shortPct%',
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.white60,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              Text(
                lock.locked ? 'LOCK' : 'LONG $longPct%',
                style: TextStyle(
                  fontSize: 10,
                  color: lock.locked ? Colors.white54 : Colors.white70,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Text('SHORT',
                  style: TextStyle(
                      fontSize: 10,
                      color: Colors.white54,
                      fontWeight: FontWeight.w800)),
              const Spacer(),
              Text(
                lock.locked ? (lock.reason) : _regimeHint(score, conf),
                style: const TextStyle(
                  fontSize: 11,
                  color: Colors.white60,
                  fontWeight: FontWeight.w800,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              const Spacer(),
              const Text('LONG',
                  style: TextStyle(
                      fontSize: 10,
                      color: Colors.white54,
                      fontWeight: FontWeight.w800)),
            ],
          ),
        ],
      ),
    );
  }

  static String _regimeHint(double score, double conf) {
    final a = score.abs();
    if (a < 15) return 'RANGE · 관망권';
    if (a < 45) return conf >= 0.7 ? 'TREND · 준비' : '혼조 · 신중';
    return conf >= 0.75 ? 'TREND · 강' : 'TREND · 주의';
  }
}

class _GaugeBar extends StatelessWidget {
  final double pos01;
  final bool locked;

  const _GaugeBar({required this.pos01, required this.locked});

  @override
  Widget build(BuildContext context) {
    // v2: AnimatedAlign 기반으로 게이지 인디케이터가 부드럽게 이동
    final a = ((pos01.clamp(0.0, 1.0) * 2) - 1).clamp(-1.0, 1.0);
    return SizedBox(
      height: 14,
      child: Stack(
        children: [
          // base bar
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    color: locked
                        ? Colors.white.withOpacity(0.10)
                        : Colors.redAccent.withOpacity(0.22),
                  ),
                ),
                Expanded(
                  child: Container(
                    color: locked
                        ? Colors.white.withOpacity(0.10)
                        : Colors.greenAccent.withOpacity(0.22),
                  ),
                ),
              ],
            ),
          ),
          // center line
          Align(
            alignment: Alignment.center,
            child: Container(
              width: 2,
              color: Colors.white.withOpacity(0.22),
            ),
          ),
          // indicator (animated)
          Positioned.fill(
            child: AnimatedAlign(
              alignment: Alignment(a, 0),
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutCubic,
              child: Transform.translate(
                offset: const Offset(0, -2),
                child: Container(
                  width: 12,
                  height: 18,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    color: locked
                        ? Colors.white.withOpacity(0.55)
                        : Colors.white.withOpacity(0.88),
                    border: Border.all(color: Colors.black.withOpacity(0.25)),
                    boxShadow: locked
                        ? const []
                        : [
                            BoxShadow(
                              blurRadius: 10,
                              spreadRadius: 0.2,
                              color: Colors.white.withOpacity(0.12),
                            ),
                          ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
