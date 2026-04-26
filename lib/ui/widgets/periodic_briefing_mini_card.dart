import 'package:flutter/material.dart';

import '../../core/briefing_engine/periodic_briefing_db.dart';
import '../../core/briefing_engine/periodic_briefing_engine.dart';
import '../../core/models/fu_state.dart';

/// 1W/1M/1Y(ë°?1D)?? ?œê¸°ê°???1?Œâ€??€?¥ëœ ë¸Œë¦¬?‘ì„ ë³´ì—¬ì£¼ëŠ” ì¹´ë“œ.
/// - StrongBriefingCard(?¤ì‹œê°?ê³??¨ê»˜ ?°ë˜, ì£????„ì? ê³ ì • ë¸Œë¦¬?‘ì„ ?°ë¡œ ë³´ì—¬ì¤€??
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
    // ë§ˆê°??ì§€?˜ì„œ ?œê¸°ê°?ë¸Œë¦¬?‘ì´ ?„ìš”???œì ?ì´ë©??ì„±, ?„ë‹ˆë©?ìµœì‹ ë§?    setState(() {
      _f = () async {
        // ensure()???œì—†?¼ë©´ ?ì„±??        final ensured = await PeriodicBriefingEngine.ensure(tf: tf, state: widget.state);
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
            title: 'ê¸°ê°„ ë¸Œë¦¬??,
            body: '?°ì´?°ê? LIVEê°€ ?„ë‹ˆë©?ê¸°ê°„ ë¸Œë¦¬?‘ì„ ?ì„±/?•ì •?˜ì? ?ŠìŠµ?ˆë‹¤.\n(ê°€ì§??°ì´?°ë¡œ ?•ì • ê¸ˆì?)',
            badge: 'LOCK',
            badgeColor: Colors.blueGrey,
          );
        }
        if (row == null) {
          return _card(
            theme,
            title: 'ê¸°ê°„ ë¸Œë¦¬??,
            body: 'ë§ˆê° ???ë™ ?ì„±?©ë‹ˆ??\n(?„ì¬??ì¤€ë¹??¨ê³„)',
            badge: '?€ê¸?,
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
