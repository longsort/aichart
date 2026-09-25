import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';

/// Îß§Îß§?? Ï∞®Ìä∏Îß??¨Í≤å Î≥¥Îäî ?ÑÏö© ?îÎ©¥
/// - Ïπ¥Îìú/?§Î™Ö ÏµúÏÜå??/// - TF ?úÏ§Ñ + Ï∞®Ìä∏ + ?áÏ? AIÎ∞?class TradeChartOnlyScreen extends StatefulWidget {
  final String symbol;
  final String initialTf;
  final List<String> tfs;
  final Map<String, FuState> tfSnap;
  final double livePrice;

  const TradeChartOnlyScreen({
    super.key,
    required this.symbol,
    required this.initialTf,
    required this.tfs,
    required this.tfSnap,
    required this.livePrice,
  });

  @override
  State<TradeChartOnlyScreen> createState() => _TradeChartOnlyScreenState();
}

class _TradeChartOnlyScreenState extends State<TradeChartOnlyScreen> {
  late String _tf;

  @override
  void initState() {
    super.initState();
    _tf = widget.initialTf;
  }

  FuState? get _s => widget.tfSnap[_tf];

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final s = _s;

    return Scaffold(
      backgroundColor: t.bg,
      body: SafeArea(
        child: Column(
          children: [
            // ?ÅÎã®: ÏµúÏÜå ?§Îçî(?§Î°ú + ?¨Î≥º)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
              child: Row(
                children: [
                  IconButton(
                    tooltip: '?§Î°ú',
                    onPressed: () => Navigator.pop(context),
                    icon: Icon(Icons.arrow_back_ios_new, color: t.muted, size: 18),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${widget.symbol} ¬∑ $_tf',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: t.fg,
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // TF ?úÏ§Ñ: ÏµúÎ?????Ï§??†Ï?(Í∞ÄÎ°??§ÌÅ¨Î°?
            SizedBox(
              height: 46,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(
                  children: widget.tfs.map((tf) {
                    final selected = tf == _tf;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => setState(() => _tf = tf),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: selected ? t.card.withOpacity(0.9) : t.card.withOpacity(0.55),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: selected ? t.border.withOpacity(0.9) : t.border.withOpacity(0.35),
                            ),
                          ),
                          child: Text(
                            tf,
                            style: TextStyle(
                              color: selected ? t.fg : t.muted,
                              fontWeight: FontWeight.w400,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),

            const SizedBox(height: 6),

            // Î©îÏù∏: Ï∞®Ìä∏ ÏµúÎ???            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                child: Container(
                  decoration: BoxDecoration(
                    color: t.card.withOpacity(0.55),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: t.border.withOpacity(0.35)),
                  ),
                  padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
                  child: s == null
                      ? Center(
                          child: Text(
                            '?∞Ïù¥??Ï§ÄÎπÑÏ§ë',
                            style: TextStyle(color: t.muted, fontWeight: FontWeight.w400),
                          ),
                        )
                      : LayoutBuilder(
                          builder: (context, cts) {
                            final h = cts.maxHeight;
                            // Ï∞®Ìä∏??Í∞Ä?•Ìïú ?¨Í≤å: Ïπ¥Îìú/?çÏä§??ÏµúÏÜå??                            return Column(
                              children: [
                                Expanded(
                                  child: MiniChartV4(
                                    candles: s.candles,
                                    fvgZones: s.fvgZones,
                                    title: '',
                                    price: widget.livePrice,
                                    s1: s.s1,
                                    r1: s.r1,
                                    structureTag: s.structureTag,
                                    reactLevel: s.reactLevel,
                                    reactLow: s.reactLow,
                                    reactHigh: s.reactHigh,
                                    bias: s.signalDir,
                                    prob: s.signalProb,
                                    showPlan: s.showSignal && !s.locked && s.expectedRoiPct >= 25,
                                    entry: s.entry,
                                    stop: s.stop,
                                    target: s.target,
                                    overlayLines: const [],
                                    overlayLabel: '',
                                    // ?íÏù¥ Í∞ïÏ†ú: ?¥Î? clamp Î¨¥Ïãú
                                    heightOverride: (h * 0.86).clamp(280.0, 900.0),
                                    heightMin: 280.0,
                                    heightMax: 900.0,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                _AiBar(t: t, dir: s.signalDir, prob: s.signalProb),
                              ],
                            );
                          },
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AiBar extends StatelessWidget {
  final NeonTheme t;
  final String? dir;
  final int? prob;
  const _AiBar({required this.t, required this.dir, required this.prob});

  @override
  Widget build(BuildContext context) {
    final p = (prob ?? 0).clamp(0, 100);
    // ?®Ïàú: LONG?¥Î©¥ ?ºÏ™Ω(?ÅÏäπ) Ï±ÑÏ?, SHORTÎ©??§Î•∏Ï™??òÎùΩ) Ï±ÑÏ?, LOCKÎ©?Ï§ëÎ¶Ω
    final isLong = (dir ?? '').toUpperCase().contains('LONG');
    final isShort = (dir ?? '').toUpperCase().contains('SHORT');
    final left = isLong ? p : (isShort ? (100 - p) : 50);
    final right = 100 - left;

    Widget seg(int v, Color col) {
      return Expanded(
        flex: v,
        child: Container(
          height: 10,
          decoration: BoxDecoration(
            color: col.withOpacity(0.55),
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: t.bg.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Text('?ÅÏäπ', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w400)),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              children: [
                seg(left, t.good),
                const SizedBox(width: 6),
                seg(right, t.bad),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${isLong ? 'Î°? : isShort ? '?? : 'Í¥ÄÎß?} $p%',
            style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w400),
          ),
        ],
      ),
    );
  }
}
