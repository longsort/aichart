import 'package:flutter/material.dart';

import '../../core/diagnostics/engine_signal_hub.dart';
import 'neon_theme.dart';

/// 엔진/기능별 "작동 신호"를 한눈에 보기 위한 패널
///
/// 색 의미:
/// - 초록: OK (최근 업데이트)
/// - 노랑: STALE (일정 시간 업데이트 없음)
/// - 빨강: ERROR (최근 오류)
/// - 회색: OFF (아직 업데이트 없음)
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
                        Text('엔진 신호', style: TextStyle(color: t.fg, fontSize: 16, fontWeight: FontWeight.w900)),
                        const Spacer(),
                        Text('초록=정상 · 노랑=멈춤 · 빨강=오류', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
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
    if (at == null) return '기록 없음';
    final d = DateTime.now().difference(at);
    if (d.inSeconds < 1) return '방금';
    if (d.inSeconds < 60) return '${d.inSeconds}s 전';
    if (d.inMinutes < 60) return '${d.inMinutes}m 전';
    return '${d.inHours}h 전';
  }
}
