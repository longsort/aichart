import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';

/// 매매용: 차트만 크게 보는 전용 화면
/// - 카드/설명 최소화
/// - TF 한줄 + 차트 + 얇은 AI바
class TradeChartOnlyScreen extends StatefulWidget {
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
            // 상단: 최소 헤더(뒤로 + 심볼)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
              child: Row(
                children: [
                  IconButton(
                    tooltip: '뒤로',
                    onPressed: () => Navigator.pop(context),
                    icon: Icon(Icons.arrow_back_ios_new, color: t.muted, size: 18),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${widget.symbol} · $_tf',
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

            // TF 한줄: 최대한 한 줄 유지(가로 스크롤)
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

            // 메인: 차트 최대화
            Expanded(
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
                            '데이터 준비중',
                            style: TextStyle(color: t.muted, fontWeight: FontWeight.w400),
                          ),
                        )
                      : LayoutBuilder(
                          builder: (context, cts) {
                            final h = cts.maxHeight;
                            // 차트는 가능한 크게: 카드/텍스트 최소화
                            return Column(
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
                                    // 높이 강제: 내부 clamp 무시
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
    // 단순: LONG이면 왼쪽(상승) 채움, SHORT면 오른쪽(하락) 채움, LOCK면 중립
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
          Text('상승', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w400)),
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
            '${isLong ? '롱' : isShort ? '숏' : '관망'} $p%',
            style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w400),
          ),
        ],
      ),
    );
  }
}
