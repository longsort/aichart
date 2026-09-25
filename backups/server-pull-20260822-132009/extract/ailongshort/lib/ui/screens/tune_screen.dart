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
        title: Text('?êÏú® Î≥¥Ï†ï', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            tooltip: '?àÎ°úÍ≥†Ïπ®',
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
                          Text('?ÑÏû¨ ?ÅÌÉú', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                          const Spacer(),
                          Switch(
                            value: SelfTune.enabled,
                            onChanged: (v) => setState(() => SelfTune.enabled = v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('ÏµúÍ∑º ?πÎ•†(Ï¢ÖÎ£å) : ${s.lastClosedWinRate}%',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text('ÏµúÏÜå ?ïÎ•†(?êÎèô) : ${s.effectiveMinProb}%',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text('?¥Ïú† : ${s.reason.isEmpty ? "Í≥ÑÏÇ∞Ï§? : s.reason}',
                          style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12)),
                      const SizedBox(height: 6),
                      Text('?∞Ïäπ ${s.winStreak}  ¬∑  ?∞Ìå® ${s.lossStreak}',
                          style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 10),
                      if (locked) ...[
                        Text('NO-TRADE ?†Í∏àÏ§?, style: TextStyle(color: t.bad, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 6),
                        Text('?®Ï??úÍ∞Ñ ??${s.remainSec ~/ 60}Î∂?,
                            style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 10),
                        NeonShimmerButton(text: '?†Í∏à ?¥Ï†ú', danger: true, onPressed: () async {
                            await SelfTune.clearLock();
                            setState(_reload);
                          }),
                      ] else ...[
                        Text('?†Í∏à ?ÜÏùå', style: TextStyle(color: t.good, fontWeight: FontWeight.w900)),
                      ],
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            Text('Î≥¥Ï†ï Î°úÍ∑∏', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
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
                    child: Text('?ÑÏßÅ Î≥¥Ï†ï Î°úÍ∑∏Í∞Ä ?ÜÏäµ?àÎã§.', style: TextStyle(color: t.muted)),
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
