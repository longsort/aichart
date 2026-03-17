import 'dart:math';
import 'package:flutter/material.dart';

import '../../data/bitget/bitget_live_store.dart';
import '../../engine/trade/trade_plan_bus.dart';
import '../../engine/trade/trade_plan.dart';
import 'position_progress_card.dart';

/// ✅ 1) 중앙 통계/신호(TradePlanBus)와 연결
/// ✅ 2) 실시간 가격(BitgetLiveStore)로 자동 갱신
/// ✅ 3) 진입/청산 시 TradeJournal에 기록(TradePlanBus)
class AutoPositionProgressCard extends StatefulWidget {
  final String symbol;

  /// 임시 계산용(플랜이 NONE일 때만 사용)
  final double slPct;
  final double tpPct;

  const AutoPositionProgressCard({
    super.key,
    this.symbol = 'BTCUSDT',
    this.slPct = 0.01,
    this.tpPct = 0.02,
  });

  @override
  State<AutoPositionProgressCard> createState() =>
      _AutoPositionProgressCardState();
}

class _AutoPositionProgressCardState extends State<AutoPositionProgressCard> {
  dynamic _t;
  bool _online = false;

  @override
  void initState() {
    super.initState();
    _sync();
    BitgetLiveStore.I.ticker.addListener(_sync);
    BitgetLiveStore.I.online.addListener(_sync);
  }

  @override
  void dispose() {
    BitgetLiveStore.I.ticker.removeListener(_sync);
    BitgetLiveStore.I.online.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    if (!mounted) return;
    setState(() {
      _t = BitgetLiveStore.I.ticker.value;
      _online = BitgetLiveStore.I.online.value;
    });
  }

  double _readNum(dynamic obj, String field, {double fallback = 0}) {
    try {
      final v = (obj as dynamic)[field];
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? fallback;
    } catch (_) {}
    try {
      if (field == 'last') {
        final v = (obj as dynamic).last;
        if (v is num) return v.toDouble();
        if (v is String) return double.tryParse(v) ?? fallback;
      }
    } catch (_) {}
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final last = _readNum(_t, 'last', fallback: 0.0);

    return ValueListenableBuilder<TradePlan>(
      valueListenable: TradePlanBus.I.plan,
      builder: (context, plan, _) {
        // 플랜이 아직 없으면: 현재가 기준 임시값으로 "움직이는" 카드만 유지
        final bool has = plan.isValid;
        final side = has ? plan.side : 'NONE';

        final entry = has ? plan.entry : last;
        final sl = has
            ? plan.sl
            : (entry > 0 ? max(0.0, entry * (1.0 - widget.slPct)) : 0.0);
        final tp = has
            ? plan.tp
            : (entry > 0 ? entry * (1.0 + widget.tpPct) : 0.0);

        return Column(
          children: [
            PositionProgressCard(
              price: last,
              entry: entry,
              sl: sl,
              tp: tp,
              title: has
                  ? '포지션 진행(신호 연결됨)'
                  : (_online ? '포지션 진행(실시간)' : '포지션 진행(연결중)'),
            ),
            const SizedBox(height: 10),
            _row(plan, last, side),
          ],
        );
      },
    );
  }

  Widget _row(TradePlan plan, double last, String side) {
    return ValueListenableBuilder<bool>(
      valueListenable: TradePlanBus.I.inPosition,
      builder: (context, inPos, _) {
        final canEnter = plan.isValid && !inPos;
        final canExit = inPos && last > 0;

        return Row(
          children: [
            Expanded(
              child: _pill(
                plan.isValid
                    ? '근거 ${plan.evidenceHit}/${plan.evidenceTotal} · TF ${plan.tfOk}/${plan.tfTotal}'
                    : '신호 없음 · 엔진 연결 대기',
                ok: plan.isValid,
              ),
            ),
            const SizedBox(width: 8),
            _btn(
              label: inPos ? '진입됨' : '가상진입',
              onTap: canEnter ? () => TradePlanBus.I.enterFromPlan() : null,
              ok: canEnter,
            ),
            const SizedBox(width: 8),
            _btn(
              label: '가상청산',
              onTap: canExit
                  ? () async {
                      await TradePlanBus.I.exit(exitPrice: last, reason: 'MANUAL');
                    }
                  : null,
              ok: canExit,
            ),
          ],
        );
      },
    );
  }

  Widget _pill(String t, {bool ok = false}) {
    final c = ok ? Colors.greenAccent : Colors.white54;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.05),
        border: Border.all(color: c.withOpacity(0.25)),
      ),
      child: Text(
        t,
        style: TextStyle(
          fontSize: 12,
          color: c,
          fontWeight: FontWeight.w800,
        ),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _btn({required String label, required VoidCallback? onTap, bool ok = false}) {
    final c = ok ? Colors.greenAccent : Colors.white38;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: c.withOpacity(ok ? 0.12 : 0.06),
          border: Border.all(color: c.withOpacity(0.35)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: c,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}
