import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_trade_engine.dart';
import 'package:fulink_pro_ultra/data/snapshot/snapshot_reader.dart';
import 'package:fulink_pro_ultra/engine/stats/stats_calc.dart';
import 'package:fulink_pro_ultra/data/bitget/bitget_live_store.dart';
import 'package:fulink_pro_ultra/engine/guard/no_trade_guard_store.dart';
import 'package:fulink_pro_ultra/engine/learning/evidence_weight_store.dart';
import 'package:fulink_pro_ultra/engine/learning/evidence_learner.dart';
import 'package:fulink_pro_ultra/ui/widgets/evidence_heatmap_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/heatmap_delta_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/learning_intensity_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/performance_last20_card.dart';

enum Outcome { open, win, loss, timeout }

Outcome evalOutcomeAdvanced(Map<String, dynamic> s, double now, double minP, double maxP) {
  final d = (s['decision'] ?? '').toString();
  if (d != '상승(LONG)' && d != '하락(SHORT)') return Outcome.open;

  final sl = (s['sl'] ?? 0).toDouble();
  final tp1 = (s['tp1'] ?? 0).toDouble();
  if (sl == 0 || tp1 == 0) return Outcome.open;

  final tsStr = (s['ts'] ?? '').toString();
  final ts = DateTime.tryParse(tsStr);

  bool hitLoss = false;
  bool hitWin = false;

  if (d == '상승(LONG)') {
    hitLoss = (minP != 0 && minP <= sl) || (now != 0 && now <= sl);
    hitWin = (maxP != 0 && maxP >= tp1) || (now != 0 && now >= tp1);
  } else {
    hitLoss = (maxP != 0 && maxP >= sl) || (now != 0 && now >= sl);
    hitWin = (minP != 0 && minP <= tp1) || (now != 0 && now <= tp1);
  }

  if (hitLoss) return Outcome.loss;
  if (hitWin) return Outcome.win;

  if (ts != null) {
    final age = DateTime.now().difference(ts);
    if (age.inMinutes >= 60) return Outcome.timeout;
  }

  return Outcome.open;
}

class StatsScreenV82 extends StatefulWidget {
  const StatsScreenV82({super.key});

  @override
  State<StatsScreenV82> createState() => _StatsScreenV82State();
}

class _StatsScreenV82State extends State<StatsScreenV82> {
  List<Map<String, dynamic>> snaps = const [];
  NoTradeState _nt = NoTradeState.empty;
  Map<String, double> _weights = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await loadSnapshots(limit: 900);
    final nt = await NoTradeGuardStore.I.load();
    final w = await EvidenceWeightStore.I.load();
    if (!mounted) return;
    setState(() {
      snaps = s;
      _nt = nt;
      _weights = w;
    });
  }

  @override
  Widget build(BuildContext context) {
    final sum = computeStats(snaps);
    final store = BitgetLiveStore.I;
    final nowPrice = store.ticker.value?.last ?? 0.0;

    final prices = store.prices;
    final minP = prices.isEmpty ? 0.0 : prices.reduce((a, b) => a < b ? a : b);
    final maxP = prices.isEmpty ? 0.0 : prices.reduce((a, b) => a > b ? a : b);

    int win = 0, loss = 0, open = 0, timeout = 0;

    int lossStreak = 0;
    bool streakAlive = true;

    // v85-86 learning: update weights from outcomes (newest first)
    final learner = EvidenceLearner();
    Map<String, double> weights = Map<String, double>.from(_weights);

    for (final s in snaps) {
      final o = (nowPrice == 0 && prices.isEmpty) ? Outcome.open : evalOutcomeAdvanced(s, nowPrice, minP, maxP);
      if (o == Outcome.win) win++;
      if (o == Outcome.loss) loss++;
      if (o == Outcome.open) open++;
      if (o == Outcome.timeout) timeout++;

      if (streakAlive) {
        if (o == Outcome.loss) {
          lossStreak += 1;
        } else if (o == Outcome.win) {
          streakAlive = false;
        }
      }

      // learning only on WIN/LOSS and only if flags exist
      final flags = s['evidenceFlags'];
      if (o == Outcome.win) {
        weights = (weights == _weights)
            ? weights
            : weights;
        // update (async) — keep UI responsive; fire-and-forget
        learner.update(current: weights, flags: flags is Map ? Map<String, dynamic>.from(flags as Map) : null, outcome: 'WIN');
      } else if (o == Outcome.loss) {
        learner.update(current: weights, flags: flags is Map ? Map<String, dynamic>.from(flags as Map) : null, outcome: 'LOSS');
      }
    }

    // update guard (lock if lossStreak>=3)
    NoTradeGuardStore.I.updateFromLossStreak(lossStreak: lossStreak);

    final double winRate = (win + loss) == 0 ? 0 : (win / (win + loss)) * 100;
    final grade = _grade(sum.avgEvidence, winRate);
    // v97: 최근 20개 성과(초보용)
    final last20 = snaps.take(20).toList(growable: false);
    int win20 = 0, loss20 = 0, timeout20 = 0, open20 = 0;
    double rrSum20 = 0.0; int rrN20 = 0;
    double evSum20 = 0.0; int evN20 = 0;

    for (final s in last20) {
      final o = evalOutcomeAdvanced(s, nowPrice, minP, maxP);
      if (o == Outcome.win) win20++;
      else if (o == Outcome.loss) loss20++;
      else if (o == Outcome.timeout) timeout20++;
      else open20++;

      final rr = s['rr'];
      if (rr is num) { rrSum20 += rr.toDouble(); rrN20++; }

      final eh = s['evidenceHit'];
      if (eh is num) { evSum20 += eh.toDouble(); evN20++; }
    }

    final double winRate20 = (win20 + loss20) == 0 ? 0.0 : (win20 / (win20 + loss20)) * 100.0;
    final double avgRR20 = rrN20 == 0 ? 0.0 : rrSum20 / rrN20;
    final double avgEv20 = evN20 == 0 ? 0.0 : evSum20 / evN20;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (_nt.locked) _guardBanner(_nt),
              _card(
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('STATS', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                        const Spacer(),
                        Text('GRADE $grade', style: const TextStyle(color: Colors.cyanAccent, fontSize: 13, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _row('Total', '${sum.total}'),
                    _row('Avg Evidence', sum.avgEvidence.toStringAsFixed(2)),
                    _row('Avg Conf', sum.avgConfidence.toStringAsFixed(1)),
                    _row('상승(LONG) rate', '${(sum.longRate * 100).toStringAsFixed(1)}%'),
                    _row('하락(SHORT) rate', '${(sum.shortRate * 100).toStringAsFixed(1)}%'),
                    const Divider(height: 18),
                    _row('Now Price', nowPrice == 0 ? '--' : nowPrice.toStringAsFixed(1)),
                    _row('WIN', '$win'),
                    _row('LOSS', '$loss'),
                    _row('TIMEOUT', '$timeout'),
                    _row('OPEN', '$open'),
                    _row('WinRate', '${winRate.toStringAsFixed(1)}%'),
                    _row('LossStreak', '$lossStreak'),
                    const SizedBox(height: 8),
                    const Text('※ v85-86: 증거별 가중치 학습 + 히트맵 + 신뢰등급.',
                        style: TextStyle(color: Colors.white54, fontSize: 11)),
                    const Text('Pull to refresh', style: TextStyle(color: Colors.white54, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              PerformanceLast20Card(
                win: win20,
                loss: loss20,
                timeout: timeout20,
                open: open20,
                winRate: winRate20,
                avgRR: avgRR20,
                avgEvidence: avgEv20,
              ),
              const SizedBox(height: 10),
              const LearningIntensityCard(),
              const SizedBox(height: 10),
              EvidenceHeatmapCard(weights: weights),
              const SizedBox(height: 10),
              HeatmapDeltaCard(weights: weights, baseline: EvidenceWeightStore.I.baseline),
              const SizedBox(height: 10),
              ...snaps.take(30).map((s) {
                final o = (nowPrice == 0 && prices.isEmpty) ? Outcome.open : evalOutcomeAdvanced(s, nowPrice, minP, maxP);
                final tag = o == Outcome.win ? 'WIN' : (o == Outcome.loss ? 'LOSS' : (o == Outcome.timeout ? 'TIMEOUT' : 'OPEN'));
                return _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${s['ts'] ?? ''}  ${s['symbol'] ?? ''}',
                          style: const TextStyle(color: Colors.white70, fontSize: 11)),
                      const SizedBox(height: 6),
                      Text(
                        'P ${(s['price'] ?? 0).toString()}  ${s['decision'] ?? ''}  conf ${s['confidence'] ?? 0}  ev ${(s['evidenceHit'] ?? 0)}/${(s['evidenceTotal'] ?? 10)}  [$tag]',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  String _grade(double avgEvidence, double winRate) {
    // simple grade: evidence + winrate
    if (avgEvidence >= 7.2 && winRate >= 55) return 'A';
    if (avgEvidence >= 6.2 && winRate >= 50) return 'B';
    if (avgEvidence >= 5.2 && winRate >= 45) return 'C';
    return 'D';
  }

  Widget _guardBanner(NoTradeState s) {
    final until = s.until;
    final txt = until == null ? 'LOCKED' : 'LOCKED until ${until.toLocal().toString().substring(0, 16)}';
    return Container(
      padding: const EdgeInsets.all(10),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.redAccent.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.redAccent.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock, color: Colors.redAccent, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text('관망 $txt  (lossStreak ${s.lossStreak})',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 110, child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _card(Widget child) {
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
}


// --- FIX: _paperBox가 없을 때를 대비한 확장 메서드(삭제 없이 추가) ---
extension PaperBoxExt on _StatsScreenV82State {
  Widget _paperBox() {
    return ValueListenableBuilder(
      valueListenable: PaperTradeEngine.I.state,
      builder: (_, s, __) {
        final last = s.last;
        final win = last.where((e) => e.outcome == '성공').length;
        final loss = last.where((e) => e.outcome == '실패').length;
        final tout = last.where((e) => e.outcome == '시간초과').length;

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('가상 매매 결과(앱 자동)',
                  style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text('성공 $win / 실패 $loss / 시간초과 $tout',
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Text('시간초과 종료', style: TextStyle(color: Colors.white70, fontSize: 11)),
                  const SizedBox(width: 8),
                  ValueListenableBuilder<int>(
                    valueListenable: PaperTradeEngine.I.timeoutMinutes,
                    builder: (_, v, __) => Text('$v분',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              ValueListenableBuilder<int>(
                valueListenable: PaperTradeEngine.I.timeoutMinutes,
                builder: (_, v, __) {
                  return Slider(
                    value: v.toDouble(),
                    min: 15,
                    max: 240,
                    divisions: 15,
                    onChanged: (x) => PaperTradeEngine.I.timeoutMinutes.value = x.round(),
                  );
                },
              ),
              const SizedBox(height: 8),
              if (last.isNotEmpty) ...[
                const Text('최근 5개', style: TextStyle(color: Colors.white54, fontSize: 11)),
                const SizedBox(height: 6),
                ...last.take(5).map((e) => Text(
                      '${e.outcome} • 손익 ${e.pnlUsd.toStringAsFixed(2)} USDT',
                      style: const TextStyle(color: Colors.white54, fontSize: 11),
                    )),
              ],
            ],
          ),
        );
      },
    );
  }
}
