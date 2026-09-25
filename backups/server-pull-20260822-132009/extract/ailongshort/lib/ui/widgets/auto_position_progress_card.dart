import 'dart:math';
import 'package:flutter/material.dart';

import '../../data/bitget/bitget_live_store.dart';
import '../../engine/trade/trade_plan_bus.dart';
import '../../engine/trade/trade_plan.dart';
import 'position_progress_card.dart';

/// ??1) Ï§ëÏïô ?µÍ≥Ñ/?†Ìò∏(TradePlanBus)?Ä ?∞Í≤∞
/// ??2) ?§ÏãúÍ∞?Í∞ÄÍ≤?BitgetLiveStore)Î°??êÎèô Í∞±Ïã†
/// ??3) ÏßÑÏûÖ/Ï≤?Ç∞ ??TradeJournal??Í∏∞Î°ù(TradePlanBus)
class AutoPositionProgressCard extends StatefulWidget {
  final String symbol;

  /// ?ÑÏãú Í≥ÑÏÇ∞???åÎûú??NONE???åÎßå ?¨Ïö©)
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
        // ?åÎûú???ÑÏßÅ ?ÜÏúºÎ©? ?ÑÏû¨Í∞Ä Í∏∞Ï? ?ÑÏãúÍ∞íÏúºÎ°?"?ÄÏßÅÏù¥?? Ïπ¥ÎìúÎß??†Ï?
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
                  ? '?¨Ï???ÏßÑÌñâ(?†Ìò∏ ?∞Í≤∞??'
                  : (_online ? '?¨Ï???ÏßÑÌñâ(?§ÏãúÍ∞?' : '?¨Ï???ÏßÑÌñâ(?∞Í≤∞Ï§?'),
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
                    ? 'Í∑ºÍ±∞ ${plan.evidenceHit}/${plan.evidenceTotal} ¬∑ TF ${plan.tfOk}/${plan.tfTotal}'
                    : '?†Ìò∏ ?ÜÏùå ¬∑ ?îÏßÑ ?∞Í≤∞ ?ÄÍ∏?,
                ok: plan.isValid,
              ),
            ),
            const SizedBox(width: 8),
            _btn(
              label: inPos ? 'ÏßÑÏûÖ?? : 'Í∞Ä?ÅÏßÑ??,
              onTap: canEnter ? () => TradePlanBus.I.enterFromPlan() : null,
              ok: canEnter,
            ),
            const SizedBox(width: 8),
            _btn(
              label: 'Í∞Ä?ÅÏ≤≠??,
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
