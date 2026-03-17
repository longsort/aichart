import 'package:flutter/material.dart';
import '../../core/tune/self_tune.dart';
import '../widgets/neon_theme.dart';
import '../widgets/fx.dart';
import '../widgets/fx_particles_bg.dart';
import '../widgets/fx_config.dart';
import '../widgets/neon_shimmer_button.dart';

class TuneScreen extends StatefulWidget {
  const TuneScreen({super.key});

  @override
  State<TuneScreen> createState() => _TuneScreenState();
}

class _TuneScreenState extends State<TuneScreen> {
  late Future<TuneState> st;
  late Future<List<Map<String, Object?>>> logs;

  void _reload() {
    st = SelfTune.getState();
    logs = SelfTune.recentLogs(limit: 200);
  }

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return FxParticlesBg(child: FxGlowBg(child: Scaffold(
      backgroundColor: t.bg,
      appBar: AppBar(
        backgroundColor: t.bg,
        elevation: 0,
        title: Text('자율 보정', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            tooltip: '새로고침',
            onPressed: () async {
              await SelfTune.refreshFromLogs(window: 30);
              setState(_reload);
            },
            icon: Icon(Icons.refresh, color: t.fg),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            FutureBuilder<TuneState>(
              future: st,
              builder: (context, snap) {
                final s = snap.data ??
                    const TuneState(
                      winStreak: 0,
                      lossStreak: 0,
                      effectiveMinProb: 70,
                      lockUntilTs: 0,
                      lastClosedWinRate: 0,
                      reason: '',
                    );

                final locked = s.locked;

                return Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: t.card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: t.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text('현재 상태', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                          const Spacer(),
                          Switch(
                            value: SelfTune.enabled,
                            onChanged: (v) => setState(() => SelfTune.enabled = v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('최근 승률(종료) : ${s.lastClosedWinRate}%',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text('최소 확률(자동) : ${s.effectiveMinProb}%',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text('이유 : ${s.reason.isEmpty ? "계산중" : s.reason}',
                          style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12)),
                      const SizedBox(height: 6),
                      Text('연승 ${s.winStreak}  ·  연패 ${s.lossStreak}',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 10),
                      if (locked) ...[
                        Text('NO-TRADE 잠금중', style: TextStyle(color: t.bad, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 6),
                        Text('남은시간 약 ${s.remainSec ~/ 60}분',
                            style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 10),
                        NeonShimmerButton(text: '잠금 해제', danger: true, onPressed: () async {
                            await SelfTune.clearLock();
                            setState(_reload);
                          }),
                      ] else ...[
                        Text('잠금 없음', style: TextStyle(color: t.good, fontWeight: FontWeight.w900)),
                      ],
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            Text('보정 로그', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            FutureBuilder<List<Map<String, Object?>>>(
              future: logs,
              builder: (context, snap) {
                final list = snap.data ?? const <Map<String, Object?>>[];
                if (list.isEmpty) {
                  return Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: t.card,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: t.border),
                    ),
                    child: Text('아직 보정 로그가 없습니다.', style: TextStyle(color: t.muted)),
                  );
                }
                return Column(
                  children: [
                    for (final x in list) ...[
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: t.card,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: t.border),
                        ),
                        child: Row(
                          children: [
                            Text('${x['event']}',
                                style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text('${x['detail']}',
                                  style: TextStyle(
                                      color: t.muted, fontWeight: FontWeight.w900, fontSize: 12)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    ))); 
  }
}
