
import 'package:flutter/material.dart';
import '../../core/briefing/tf_briefing.dart';
import '../../core/models/fu_state.dart';
import 'neon_theme.dart';
import 'scenario_path_v1.dart';

class BriefingCardsV1 extends StatelessWidget {
  final FuState state;
  final List<String> tfs;
  final bool online;
  const BriefingCardsV1({super.key, required this.state, required this.tfs, required this.online});

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);

    return SizedBox(
      height: 120,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(left: 12, right: 12),
        itemCount: tfs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final tf = tfs[i];
          final b = TfBriefingEngine.build(s: state, tf: tf, online: online);
          return InkWell(
            onTap: () => _openSheet(context, b),
            borderRadius: BorderRadius.circular(16),
            child: Container(
              width: 230,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: t.card.withOpacity(0.92),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: t.border.withOpacity(0.28)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    _badge(t, b.badge, b.online),
                    const SizedBox(width: 8),
                    Text(tf, style: TextStyle(color: t.textStrong, fontWeight: FontWeight.w900, fontSize: 12)),
                    const Spacer(),
                    Text('마감 ${b.remainText}', style: TextStyle(color: t.text, fontSize: 11)),
                  ]),
                  const SizedBox(height: 6),
                  Expanded(
                    child: ScenarioPathV1(
                      badge: b.badge,
                      settle: b.settleLevel,
                      now: b.nowPrice,
                      target1: b.target1,
                      target2: b.target2,
                      invalid: b.invalidation,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    b.primaryScenario,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: t.text, fontSize: 11, height: 1.1),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _badge(NeonThemeData t, String badge, bool online){
    Color c = t.muted;
    if (badge == 'B') c = t.good;
    if (badge == 'S') c = t.bad;
    final label = online ? badge : 'OFF';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: c.withOpacity(0.14),
        border: Border.all(color: c.withOpacity(0.5)),
      ),
      child: Text(label, style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 11, height: 1.0)),
    );
  }

  void _openSheet(BuildContext context, TfBriefing b){
    final t = NeonTheme.of(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black.withOpacity(0.0),
      builder: (_) {
        return Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: t.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: t.border.withOpacity(0.25)),
          ),
          child: SafeArea(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    _badge(t, b.badge, b.online),
                    const SizedBox(width: 8),
                    Text(b.title, style: TextStyle(color: t.textStrong, fontWeight: FontWeight.w900)),
                    const Spacer(),
                    Text('다음 마감: ${b.nextClose.hour.toString().padLeft(2,'0')}:${b.nextClose.minute.toString().padLeft(2,'0')}', style: TextStyle(color: t.text, fontSize: 12)),
                  ]),
                  const SizedBox(height: 10),
                  ScenarioPathV1(
                    badge: b.badge,
                    settle: b.settleLevel,
                    now: b.nowPrice,
                    target1: b.target1,
                    target2: b.target2,
                    invalid: b.invalidation,
                    height: 120,
                  ),
                  const SizedBox(height: 10),
                  _kv(t, '현재가', b.nowPrice),
                  _kv(t, '마감 기준', b.settleLevel),
                  _kv(t, '눌림(예상)', b.pullback),
                  _kv(t, '목표1', b.target1),
                  _kv(t, '목표2', b.target2),
                  _kv(t, '무효', b.invalidation),
                  const SizedBox(height: 10),
                  Text('✅ 마감 성공 시나리오', style: TextStyle(color: t.good, fontWeight: FontWeight.w900, fontSize: 12)),
                  const SizedBox(height: 6),
                  Text(b.primaryScenario, style: TextStyle(color: t.text, height: 1.2)),
                  const SizedBox(height: 10),
                  Text('⚠️ 실패/무효', style: TextStyle(color: t.bad, fontWeight: FontWeight.w900, fontSize: 12)),
                  const SizedBox(height: 6),
                  Text(b.failScenario, style: TextStyle(color: t.text, height: 1.2)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _kv(NeonThemeData t, String k, double v){
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        SizedBox(width: 84, child: Text(k, style: TextStyle(color: t.text.withOpacity(0.7), fontSize: 12))),
        const Spacer(),
        Text(v.toStringAsFixed(0), style: TextStyle(color: t.textStrong, fontWeight: FontWeight.w900, fontSize: 12)),
      ]),
    );
  }
}
