import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/ui/widgets/bitget_live_header.dart';
import 'package:fulink_pro_ultra/ui/widgets/multitf_consensus_bar.dart';
import 'package:fulink_pro_ultra/ui/widgets/ai_conclusion_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/entry_plan_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/position_sizing_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/account_profit_targets_card.dart';
import 'package:fulink_pro_ultra/ui/widgets/paper_trade_card.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_trade_engine.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_account.dart';
import 'package:fulink_pro_ultra/data/bitget/bitget_live_store.dart';
import 'package:fulink_pro_ultra/engine/evidence/evidence_engine.dart';
import 'package:fulink_pro_ultra/data/snapshot/snapshot_store.dart';
import 'package:fulink_pro_ultra/engine/ai/entry_plan.dart';
import 'package:fulink_pro_ultra/engine/guard/no_trade_guard_store.dart';
import 'package:fulink_pro_ultra/engine/regime/regime_lock.dart';
import 'package:fulink_pro_ultra/engine/auto/full_auto_engine.dart';
import 'package:fulink_pro_ultra/engine/consensus/consensus_bus.dart';

class SignalsScreenV82 extends StatefulWidget {
  const SignalsScreenV82({super.key});

  @override
  State<SignalsScreenV82> createState() => _SignalsScreenV82State();
}

class _SignalsScreenV82State extends State<SignalsScreenV82> {
  NoTradeState _nt = NoTradeState.empty;
  double _balance = PaperAccount.I.balance.value;

  @override
  void initState() {
    super.initState();
    _loadGuard();
    PaperAccount.I.balance.addListener(() {
      if (!mounted) return;
      setState(() => _balance = PaperAccount.I.balance.value);
    });
  }

  Future<void> _loadGuard() async {
    final s = await NoTradeGuardStore.I.load();
    if (!mounted) return;
    setState(() => _nt = s);
  }

  double _pctChange(List<double> ps, int back) {
    if (ps.length < back + 1) return 0.0;
    final a = ps[ps.length - back - 1];
    final b = ps.last;
    if (a == 0) return 0.0;
    return (b - a) / a;
  }

  double _stdPct(List<double> ps, int win) {
    if (ps.length < win + 1) return 0.0;
    final start = ps.length - win;
    final returns = <double>[];
    for (int i = start + 1; i < ps.length; i++) {
      final p0 = ps[i - 1];
      final p1 = ps[i];
      if (p0 == 0) continue;
      returns.add((p1 - p0) / p0);
    }
    if (returns.length < 5) return 0.0;
    final m = returns.reduce((a, b) => a + b) / returns.length;
    double v = 0;
    for (final r in returns) {
      final d = r - m;
      v += d * d;
    }
    v /= max(1, returns.length - 1);
    return sqrt(v).clamp(0.0, 0.10);
  }

  double _volSpike01(List<double> vs, int win) {
    if (vs.length < win + 1) return 0.0;
    final start = max(0, vs.length - win);
    double sum = 0;
    int n = 0;
    for (int i = start; i < vs.length - 1; i++) {
      sum += vs[i];
      n++;
    }
    final avg = n == 0 ? 0.0 : sum / n;
    final cur = vs.last;
    if (avg <= 0) return 0.0;
    final ratio = cur / avg;
    // 1.0 => 0, 2.0 => ~1
    return ((ratio - 1.0) / 1.0).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final store = BitgetLiveStore.I;
    final evEngine = EvidenceEngine();
    final regimeLock = RegimeLock();
    final auto = FullAutoEngine();

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: ListView(
            children: [
              const BitgetLiveHeader(symbol: 'BTCUSDT'),
              const SizedBox(height: 10),
              if (_nt.locked) _noTradeBanner(_nt),
              const MultiTfConsensusBar(),
              const SizedBox(height: 10),
              ValueListenableBuilder(
                valueListenable: store.ticker,
                builder: (_, t, __) {
                  final price = t?.last ?? 0.0;

                  // v96: use real TF UP% from ConsensusBus (fallback to safe defaults)
                  final tfUp = ConsensusBus.I.tfUp.value;
                  final up15 = (tfUp['15m'] ?? 55).toDouble();
                  final up1h = (tfUp['1h'] ?? 52).toDouble();
                  final up4h = (tfUp['4h'] ?? 50).toDouble();

                  // v96: compute risk/momentum/volSpike from ring buffers
                  final ps = store.prices;
                  final vs = store.vols;

                  final momentum = _pctChange(ps, 30); // ~ last 1min (if 2s tick)
                  final volStd = _stdPct(ps, 120);     // ~ last 4min
                  final risk01 = (volStd / 0.05).clamp(0.0, 1.0);
                  final volSpike01 = _volSpike01(vs, 120);

                  final consensusPct = (ConsensusBus.I.consensus01.value * 100).round();

                  final regime = regimeLock.detect(risk01: risk01, momentum: momentum, volSpike01: volSpike01);

                  final ev = evEngine.evaluate(
                    up15: up15,
                    up1h: up1h,
                    up4h: up4h,
                    whaleGrade: store.whaleGrade,
                    whaleStreak: store.whaleStreak,
                    risk01: risk01,
                    momentum: momentum,
                    volSpike01: volSpike01,
                    consensus01: ConsensusBus.I.consensus01.value,
                    tfUp: tfUp,
                  );

                  final decisionPack = evEngine.decide(
                    ev: ev,
                    up15: up15.round(),
                    risk: (risk01 * 100).round(),
                    consensusPct: consensusPct,
                  );

                  String decision0 = (decisionPack['decision'] ?? '관망').toString();
                  int confidence0 = (decisionPack['confidence'] ?? 0) as int;

                  if (_nt.locked) {
                    decision0 = '관망';
                    confidence0 = (confidence0 * 0.5).round();
                  }

                  if (!regimeLock.allowTrade(decision0, regime)) {
                    decision0 = '관망';
                    confidence0 = (confidence0 * 0.6).round();
                  }

                  final finalPack = auto.finalize(
                    decision: decision0,
                    confidence: confidence0,
                    regime: regime.regime,
                    noTradeLocked: _nt.locked,
                    evidenceHit: ev.hit,
                    evidenceTotal: ev.total,
                  );

                  final decision = finalPack.decision;
                  final confidence = finalPack.confidence;

                  final plan = buildPlan(
                    price: price == 0 ? 0.0 : price,
                    decision: decision,
                    evidenceHit: ev.hit,
                    atr: 1.2,
                  );

                  
                  // 가상매매(자동) 틱 업데이트
                  final safety01 = ((ev.hit / (ev.total == 0 ? 1 : ev.total)) * 0.6 + (consensusPct / 100.0) * 0.4).clamp(0.0, 1.0);
                  PaperTradeEngine.I.onTick(
                    price: price,
                    decision: decision,
                    entry: plan.entry,
                    sl: plan.sl,
                    tps: plan.tps,
                    evidenceHit: ev.hit,
                    evidenceTotal: ev.total,
                    flags: ev.flags,
                    safety01: safety01,
                  );
return Column(
                    children: [
                      _regimeBanner(regime, '${finalPack.reason} • 합의도 $consensusPct%'),
                      const SizedBox(height: 10),
                      AIConclusionCard(
                        decision: decision,
                        confidence: confidence,
                        evidenceHit: ev.hit,
                        evidenceTotal: ev.total,
                        up15: up15.round(),
                        risk: (risk01 * 100).round(),
                        whale: store.whaleGrade,
                        whaleStreak: store.whaleStreak,
                      ),
                      const SizedBox(height: 10),
                      EntryPlanCard(
                        decision: decision,
                        price: plan.entry,
                        evidenceHit: ev.hit,
                        atr: 1.2,
                      ),
                      const SizedBox(height: 10),
                      if (decision != '관망')
                        PositionSizingCard(
                          balance: _balance,
                          entry: plan.entry,
                          sl: plan.sl,
                        ),
                      const SizedBox(height: 10),
                      const PaperTradeCard(),
                      const SizedBox(height: 10),
                      _recordButton(
                        disabled: _nt.locked,
                        onTap: () async {
                          await saveSnapshot({
                            'ts': DateTime.now().toIso8601String(),
                            'symbol': 'BTCUSDT',
                            'price': price,
                            'decision': decision,
                            'confidence': confidence,
                            'reason': finalPack.reason,
                            'evidenceHit': ev.hit,
                            'evidenceTotal': ev.total,
                            'whale': store.whaleGrade,
                            'whaleStreak': store.whaleStreak,
                            'up15': up15,
                            'up1h': up1h,
                            'up4h': up4h,
                            'consensusPct': consensusPct,
                            'tfUp': tfUp,
                            'risk': (risk01 * 100),
                            'momentum': momentum,
                            'volSpike01': volSpike01,
                            'entry': plan.entry,
                            'sl': plan.sl,
                            'tp1': plan.tps.isNotEmpty ? plan.tps[0] : null,
                            'tp2': plan.tps.length > 1 ? plan.tps[1] : null,
                            'tp3': plan.tps.length > 2 ? plan.tps[2] : null,
                            'rr': plan.rr,
                            'regime': regime.regime,
                            'regimeScore': regime.score01,
                            'evidenceFlags': ev.flags,
                            'balance': _balance,
                          });

                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('저장 완료')),
                          );
                        },
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _regimeBanner(RegimeResult r, String reason) {
    final txt = '${r.regime} ${(r.score01 * 100).toStringAsFixed(0)}%';
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        children: [
          const Icon(Icons.waves, color: Colors.cyanAccent, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text('레짐  $txt   •   $reason',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _noTradeBanner(NoTradeState s) {
    final until = s.until;
    final txt = until == null ? '잠금' : '잠금 해제 ${until.toLocal().toString().substring(0, 16)}';
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
            child: Text('노트레이드 $txt  (연속손실 ${s.lossStreak})',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _recordButton({required bool disabled, required VoidCallback onTap}) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: disabled ? null : onTap,
        icon: const Icon(Icons.save),
        label: Text(disabled ? '잠금 상태' : '스냅샷 저장'),
      ),
    );
  }
}