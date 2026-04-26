import 'package:flutter/material.dart';

import '../../core/diagnostics/engine_signal_hub.dart';
import 'neon_theme.dart';

/// ?îÏßÑ/Í∏∞Îä•Î≥?"?ëÎèô ?†Ìò∏"Î•??úÎàà??Î≥¥Í∏∞ ?ÑÌïú ?®ÎÑê
///
/// ???òÎ?:
/// - Ï¥àÎ°ù: OK (ÏµúÍ∑º ?ÖÎç∞?¥Ìä∏)
/// - ?∏Îûë: STALE (?ºÏ†ï ?úÍ∞Ñ ?ÖÎç∞?¥Ìä∏ ?ÜÏùå)
/// - Îπ®Í∞ï: ERROR (ÏµúÍ∑º ?§Î•ò)
/// - ?åÏÉâ: OFF (?ÑÏßÅ ?ÖÎç∞?¥Ìä∏ ?ÜÏùå)
class EngineSignalSheetV1 {
  static void open(BuildContext context) {
    final t = NeonTheme.of(context);
    EngineSignalHub.I.start();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return DraggableScrollableSheet(
          initialChildSize: 0.62,
          minChildSize: 0.38,
          maxChildSize: 0.92,
          builder: (ctx, scroll) {
            return Container(
              decoration: BoxDecoration(
                color: t.card,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
                border: Border.all(color: t.border.withOpacity(0.5)),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 10),
                  Container(
                    width: 42,
                    height: 5,
                    decoration: BoxDecoration(
                      color: t.border.withOpacity(0.65),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Text('?îÏßÑ ?†Ìò∏', style: TextStyle(color: t.fg, fontSize: 16, fontWeight: FontWeight.w900)),
                        const Spacer(),
                        Text('Ï¥àÎ°ù=?ïÏÉÅ ¬∑ ?∏Îûë=Î©àÏ∂§ ¬∑ Îπ®Í∞ï=?§Î•ò', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ValueListenableBuilder<List<EngineSignal>>(
                      valueListenable: EngineSignalHub.I.items,
                      builder: (_, list, __) {
                        return ListView.separated(
                          controller: scroll,
                          padding: const EdgeInsets.fromLTRB(14, 8, 14, 18),
                          itemCount: list.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
                          itemBuilder: (_, i) {
                            final s = list[i];
                            final c = _colorFor(t, s.status);
                            final ago = _ago(s.lastAt);
                            return Container(
                              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                              decoration: BoxDecoration(
                                color: t.bg,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: t.border.withOpacity(0.45)),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(color: c, shape: BoxShape.circle),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Text(s.name, style: TextStyle(color: t.fg, fontSize: 13, fontWeight: FontWeight.w900)),
                                            const SizedBox(width: 8),
                                            Text(ago, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
                                          ],
                                        ),
                                        if (s.detail.trim().isNotEmpty) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            s.detail,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    s.status,
                                    style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900),
                                  ),
                                ],
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  static Color _colorFor(NeonTheme t, String status) {
    switch (status) {
      case 'OK':
        return t.good;
      case 'STALE':
        return t.warn;
      case 'ERROR':
        return t.bad;
      case 'OFF':
      default:
        return t.muted.withOpacity(0.75);
    }
  }

  static String _ago(DateTime? at) {
    if (at == null) return 'Í∏∞Î°ù ?ÜÏùå';
    final d = DateTime.now().difference(at);
    if (d.inSeconds < 1) return 'Î∞©Í∏à';
    if (d.inSeconds < 60) return '${d.inSeconds}s ??;
    if (d.inMinutes < 60) return '${d.inMinutes}m ??;
    return '${d.inHours}h ??;
  }
}
