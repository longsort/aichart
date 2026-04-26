import 'package:flutter/material.dart';

import '../../core/briefing_engine/periodic_briefing_db.dart';
import '../../core/briefing_engine/periodic_briefing_engine.dart';
import '../../core/models/fu_state.dart';

/// 1W/1M/1Y(및 1D)용: “기간 당 1회” 저장된 브리핑을 보여주는 카드.
/// - StrongBriefingCard(실시간)과 함께 쓰되, 주/월/년은 고정 브리핑을 따로 보여준다.
class PeriodicBriefingMiniCard extends StatefulWidget {
  final String tf; // 1w/1m/1y/1d
  final FuState state;

  const PeriodicBriefingMiniCard({
    super.key,
    required this.tf,
    required this.state,
  });

  @override
  State<PeriodicBriefingMiniCard> createState() => _PeriodicBriefingMiniCardState();
}

class _PeriodicBriefingMiniCardState extends State<PeriodicBriefingMiniCard> {
  Future<PeriodicBriefingRow?>? _f;

  @override
  void didUpdateWidget(covariant PeriodicBriefingMiniCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tf != widget.tf || oldWidget.state.price != widget.state.price || oldWidget.state.dataLive != widget.state.dataLive) {
      _load();
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final tf = widget.tf.toLowerCase().trim();
    if (!PeriodicBriefingEngine.isPeriodicTf(tf)) {
      setState(() => _f = Future.value(null));
      return;
    }
    // 마감이 지나서 “기간 브리핑이 필요한 시점”이면 생성, 아니면 최신만
    setState(() {
      _f = () async {
        // ensure()는 “없으면 생성”
        final ensured = await PeriodicBriefingEngine.ensure(tf: tf, state: widget.state);
        return ensured ?? await PeriodicBriefingDB.latestForTf(tf);
      }();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FutureBuilder<PeriodicBriefingRow?>(
      future: _f,
      builder: (context, snap) {
        final row = snap.data;
        if (!widget.state.dataLive) {
          return _card(
            theme,
            title: '기간 브리핑',
            body: '데이터가 LIVE가 아니면 기간 브리핑을 생성/확정하지 않습니다.\n(가짜 데이터로 확정 금지)',
            badge: 'LOCK',
            badgeColor: Colors.blueGrey,
          );
        }
        if (row == null) {
          return _card(
            theme,
            title: '기간 브리핑',
            body: '마감 후 자동 생성됩니다.\n(현재는 준비 단계)',
            badge: '대기',
            badgeColor: Colors.orangeAccent,
          );
        }
        return _card(
          theme,
          title: row.title,
          body: row.body,
          badge: widget.tf.toUpperCase(),
          badgeColor: Colors.white,
        );
      },
    );
  }

  Widget _card(
    ThemeData theme, {
    required String title,
    required String body,
    required String badge,
    required Color badgeColor,
  }) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withOpacity(0.07),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.calendar_month, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900), overflow: TextOverflow.ellipsis),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: badgeColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: badgeColor.withOpacity(0.35)),
                ),
                child: Text(
                  badge,
                  style: TextStyle(color: badgeColor.withOpacity(0.95), fontSize: 11, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            body,
            style: TextStyle(color: Colors.white.withOpacity(0.82), fontSize: 11, fontWeight: FontWeight.w800, height: 1.2),
          ),
        ],
      ),
    );
  }
}
