import 'dart:async';
import 'package:flutter/material.dart';

import '../../data/bitget/bitget_live_store.dart';
import '../../engine/consensus/consensus_bus.dart';

import '../../pipe/evidence.dart';
import '../../pipe/snapshot.dart';
import '../../pipe/snapshot_hub.dart';

import '../widgets/half_compass_gauge.dart';

class PracticalDashboardScreen extends StatefulWidget {
  const PracticalDashboardScreen({super.key});

  @override
  State<PracticalDashboardScreen> createState() => _PracticalDashboardScreenState();
}

class _PracticalDashboardScreenState extends State<PracticalDashboardScreen> {
  final hub = SnapshotHub(tick: const Duration(seconds: 1));
  final live = BitgetLiveStore.I;

  Timer? _pump;
  double? _prevPrice;

  @override
  void initState() {
    super.initState();
    live.start(symbol: 'BTCUSDT', interval: const Duration(seconds: 2));
    hub.start();

    // Ï§ëÏïô ?åÏù¥?ÑÏóê Ï¶ùÍ±∞ Í≥ÑÏÜç Í≥µÍ∏â(Í∏∞Ï°¥ ?îÏßÑ ??†ú ?ÜÏù¥ "Ï∂îÍ?")
    _pump = Timer.periodic(const Duration(milliseconds: 450), (_) => _pushEvidence());
  }

  void _pushEvidence() {
    // 1) Ï§ëÏïô ?©Ïùò(?¥Î? Í∏∞Ï°¥ ?±Ïù¥ Í∞±Ïã† Ï§?
    final c01 = ConsensusBus.I.consensus01.value.clamp(0.0, 1.0);
    final hit = ConsensusBus.I.evidenceHit.value;
    final tot = ConsensusBus.I.evidenceTotal.value <= 0 ? 10 : ConsensusBus.I.evidenceTotal.value;
    final conf = (hit / tot).clamp(0.0, 1.0);

    hub.push(Evidence(
      id: 'CONSENSUS',
      kind: EvidenceKind.trend,
      tf: 'mtf',
      score: ((c01 - 0.5) * 2).clamp(-1.0, 1.0),
      weight: 0.95,
      confidence: conf,
      meta: {'consensus01': c01, 'hit': hit, 'tot': tot},
    ));

    // 2) Í∞ÄÍ≤?Î™®Î©ò?Ä(?ÑÏ£º Í∞ÄÎ≤ºÏö¥ Î≥¥Ï°∞ Ï¶ùÍ±∞)
    final t = live.ticker.value;
    final last = t?.last;
    if (last != null) {
      final prev = _prevPrice;
      _prevPrice = last;
      if (prev != null) {
        final d = last - prev;
        final s = d == 0 ? 0.0 : (d > 0 ? 0.18 : -0.18);
        hub.push(Evidence(
          id: 'PRICE_MOM',
          kind: EvidenceKind.momentum,
          tf: 'rt',
          score: s,
          weight: 0.35,
          confidence: 0.55,
          meta: {'d': d},
        ));
      }
    }

    // 3) ?ÑÌóò(?∞Îèô ?äÍ?) ?àÏ†Ñ?•Ïπò
    final lastUp = ConsensusBus.I.lastUpdateMs.value;
    final now = DateTime.now().millisecondsSinceEpoch;
    final stale = (now - lastUp) > 8000;
    if (stale) {
      hub.push(const Evidence(
        id: 'STALE_LINK',
        kind: EvidenceKind.risk,
        tf: 'rt',
        score: -0.55,
        weight: 0.9,
        confidence: 0.8,
        meta: {'reason': 'consensus stale'},
      ));
    }
  }

  @override
  void dispose() {
    _pump?.cancel();
    hub.dispose();
    super.dispose();
  }

  Color _bg(EngineSnapshot s) {
    if (s.bias >= 0.10) return const Color(0xFF00FF7A).withOpacity(0.10); // ?∞Ìïú Ï¥àÎ°ù
    if (s.bias <= -0.10) return const Color(0xFFFF2D55).withOpacity(0.10); // ?∞Ìïú Îπ®Í∞ï
    return Colors.black;
  }

  String _title(EngineSnapshot s) {
    switch (s.state) {
      case TradeState.allow:
        return s.bias >= 0 ? 'Î°??†Ìò∏ (BUY)' : '???†Ìò∏ (SELL)';
      case TradeState.caution:
        return s.bias >= 0 ? 'Î°?Ï£ºÏùò (WAIT)' : '??Ï£ºÏùò (WAIT)';
      case TradeState.block:
        return 'Í¥ÄÎß?/ Í∏àÏ?';
    }
  }

  String _sub(EngineSnapshot s) {
    if (s.state == TradeState.block) return 'Í∑ºÍ±∞Í∞Ä ?ΩÌïòÍ±∞ÎÇò Ï∂©Îèå???àÏñ¥??;
    if (s.bias.abs() < 0.12) return 'Ï§ëÎ¶Ω Íµ¨Í∞Ñ / ?ïÏù∏ ?ÑÏöî';
    return s.bias >= 0 ? 'BULL Ï°?/ Îß§Ïàò ?∞ÏÑ∏' : 'BEAR Ï°?/ Îß§ÎèÑ ?∞ÏÑ∏';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: StreamBuilder<EngineSnapshot>(
        stream: hub.stream,
        initialData: hub.last,
        builder: (context, snap) {
          final s = snap.data ?? EngineSnapshot.empty();
          final last = live.ticker.value?.last;
          final up = (_prevPrice != null && last != null) ? last >= _prevPrice! : true;

          return Container(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.0, -0.35),
                radius: 1.3,
                colors: [_bg(s), Colors.black],
              ),
            ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        ValueListenableBuilder(
                          valueListenable: live.online,
                          builder: (_, ok, __) {
                            return Row(
                              children: [
                                Text('BTCUSDT',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.92),
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.3,
                                    )),
                                const SizedBox(width: 10),
                                Text(ok ? '???∞Í≤∞Ï§? : '???ÄÍ∏?,
                                    style: TextStyle(
                                      color: ok ? Colors.greenAccent : Colors.white38,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    )),
                              ],
                            );
                          },
                        ),
                        Text(
                          last == null ? '--' : last.toStringAsFixed(1),
                          style: TextStyle(
                            color: up ? Colors.greenAccent : Colors.redAccent,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Half gauge
                    SizedBox(height: 180, child: HalfCompassGauge(snap: s)),
                    const SizedBox(height: 8),

                    // chips
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _chip('SHORT', '${(s.shortPct * 100).round()}%'),
                        _chip('LONG', '${(s.longPct * 100).round()}%'),
                        _chip('?©Ïùò', '${(s.consensus * 100).round()}%'),
                        _chip('?†Î¢∞', '${(s.confidence * 100).round()}%'),
                        _stateChip(s.state),
                      ],
                    ),

                    const SizedBox(height: 12),

                    // Signal card
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.04),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: Colors.white.withOpacity(0.08)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_title(s),
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.92),
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              )),
                          const SizedBox(height: 6),
                          Text(_sub(s),
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.62),
                                fontSize: 13,
                              )),
                          const SizedBox(height: 10),
                          Text('Í∑ºÍ±∞ Top',
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.78),
                                fontWeight: FontWeight.w800,
                              )),
                          const SizedBox(height: 6),
                          SizedBox(
                            height: 82,
                            child: ListView.builder(
                              scrollDirection: Axis.horizontal,
                              itemCount: s.top.length,
                              itemBuilder: (_, i) {
                                final e = s.top[i];
                                final dir = e.score >= 0 ? 'Î°? : '??;
                                final pct = (e.score.abs() * 100).round();
                                return Container(
                                  width: 170,
                                  margin: const EdgeInsets.only(right: 10),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.25),
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(e.id,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: Colors.white.withOpacity(0.86),
                                            fontWeight: FontWeight.w800,
                                            fontSize: 13,
                                          )),
                                      const SizedBox(height: 6),
                                      Text('$dir $pct%  tf:${e.tf}',
                                          style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 12)),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Mini metrics (placeholder bars derived from snapshot)
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.03),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('?ïÎ•† / ?ïÎ†• (?åÏù¥???∞Îèô)',
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.80),
                                  fontWeight: FontWeight.w800,
                                )),
                            const SizedBox(height: 10),
                            _barRow('?ÅÏäπ ?ïÎ•†', (0.50 + 0.35 * s.bias).clamp(0.0, 1.0)),
                            _barRow('?òÎùΩ ?ïÎ•†', (0.50 - 0.35 * s.bias).clamp(0.0, 1.0)),
                            _barRow('Îß§Ïàò ?ïÎ†•', (0.52 + 0.30 * s.bias).clamp(0.0, 1.0)),
                            _barRow('Îß§ÎèÑ ?ïÎ†•', (0.52 - 0.30 * s.bias).clamp(0.0, 1.0)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _chip(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Text('$k $v', style: TextStyle(color: Colors.white.withOpacity(0.74), fontSize: 12)),
    );
  }

  Widget _stateChip(TradeState state) {
    String t;
    Color c;
    switch (state) {
      case TradeState.allow:
        t = 'Í∞Ä??;
        c = Colors.greenAccent;
        break;
      case TradeState.caution:
        t = 'Ï£ºÏùò';
        c = Colors.amberAccent;
        break;
      case TradeState.block:
        t = 'Í∏àÏ?';
        c = Colors.redAccent;
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.withOpacity(0.35)),
      ),
      child: Text(t, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w900)),
    );
  }

  Widget _barRow(String label, double v01) {
    final pct = (v01 * 100).round();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(width: 78, child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 12))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: v01.clamp(0.0, 1.0),
                minHeight: 10,
                backgroundColor: Colors.white.withOpacity(0.06),
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withOpacity(0.55)),
              ),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(width: 44, child: Text('$pct%', style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 12))),
        ],
      ),
    );
  }
}
