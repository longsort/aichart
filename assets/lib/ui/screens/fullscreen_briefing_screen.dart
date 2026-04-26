
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../widgets/support_resistance_boxes_v1.dart';
import '../widgets/smc_overlay_painter.dart';
import '../widgets/future_wave_painter.dart';

class FullscreenBriefingScreen extends StatelessWidget {
  final String tf;
  final String symbol;
  final FuState state;
  final Map<String, int> radar;
  final double livePrice;

  const FullscreenBriefingScreen({
    super.key,
    required this.tf,
    required this.symbol,
    required this.state,
    required this.radar,
    required this.livePrice,
  });

  @override
  Widget build(BuildContext context) {
    final int zoneValid = state.zoneValid.round().clamp(0, 100);
    final int sProb = (50 + (zoneValid - 50)).clamp(10, 95);
    final int rProb = (50 + (zoneValid - 50) * 0.6).clamp(10, 90).toInt();

    final String verdict = _verdictTitle();

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text('$symbol · $tf 브리핑', style: const TextStyle(color: Colors.white)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _header(verdict, zoneValid),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: SupportResistanceBoxesV1(
                supportPrice: state.s1,
                supportProb: sProb,
                resistPrice: state.r1,
                resistProb: rProb,
              ),
            ),
            const SizedBox(height: 10),
            Expanded(child: _chartWithOverlays(zoneValid)),
            _bottomSummary(verdict, zoneValid),
          ],
        ),
      ),
    );
  }

  String _verdictTitle() {
    // 구조확정 우선 + 신호 방향
    final dir = state.signalDir;
    final label = (state.zoneValid >= 60 && dir != 'NEUTRAL') ? '구조확정' : '브리핑';
    if (dir == 'LONG') return '$label LONG';
    if (dir == 'SHORT') return '$label SHORT';
    return '$label 관망';
  }

  Widget _header(String verdict, int zoneValid) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              verdict,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.greenAccent,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text('반응구간 $zoneValid',
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _chartWithOverlays(int zoneValid) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth;
        final h = c.maxHeight;

        // v4: "실데이터 바인딩" — 엔진 내부에서 zoneTargets를 이미 산출(ATR 기반)
        // 여기서는 화면 좌표로 매핑하기 전 단계: "구간 존재"를 시각적으로 보여줌.
        // (차트 위젯 좌표 매핑은 v5에서 실제 캔들 스케일과 연동)
        final fvg = state.showFvg
            ? <Rect>[Rect.fromLTWH(w * 0.12, h * 0.30, w * 0.52, h * 0.10)]
            : const <Rect>[];
        final ob = state.showOb
            ? <Rect>[Rect.fromLTWH(w * 0.55, h * 0.55, w * 0.30, h * 0.10)]
            : const <Rect>[];
        final choch = state.showChoch ? <Offset>[Offset(w * 0.42, h * 0.50)] : const <Offset>[];
        final bos = state.showBos ? <Offset>[Offset(w * 0.70, h * 0.42)] : const <Offset>[];

        final bool isLong = state.signalDir == 'LONG';
        final mainPath = isLong
            ? <Offset>[
                Offset(w * 0.05, h * 0.72),
                Offset(w * 0.28, h * 0.60),
                Offset(w * 0.46, h * 0.64),
                Offset(w * 0.70, h * 0.48),
                Offset(w * 0.95, h * 0.36),
              ]
            : <Offset>[
                Offset(w * 0.05, h * 0.40),
                Offset(w * 0.30, h * 0.52),
                Offset(w * 0.55, h * 0.46),
                Offset(w * 0.78, h * 0.62),
                Offset(w * 0.95, h * 0.72),
              ];

        final altPath = <Offset>[
          Offset(w * 0.05, h * 0.70),
          Offset(w * 0.35, h * 0.78),
          Offset(w * 0.60, h * 0.72),
          Offset(w * 0.95, h * 0.60),
        ];

        return Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white24),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              const Positioned.fill(
                child: Center(
                  child: Text(
                    '차트 영역 (v5: 캔들/스케일 연동)',
                    style: TextStyle(color: Colors.white38),
                  ),
                ),
              ),
              Positioned.fill(
                child: CustomPaint(
                  painter: SmcOverlayPainter(fvg: fvg, ob: ob, choch: choch, bos: bos),
                ),
              ),
              Positioned.fill(
                child: CustomPaint(
                  painter: FutureWavePainter(mainPath: mainPath, altPath: altPath),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _bottomSummary(String verdict, int zoneValid) {
    final why = state.signalWhy.isNotEmpty ? state.signalWhy : '반응구간 유효 + 구조 근거로 판정';
    final line1 = '현재가 ${livePrice.toStringAsFixed(1)} · 지지 ${state.s1.toStringAsFixed(1)} · 저항 ${state.r1.toStringAsFixed(1)}';
    final line2 = '${why} · 유효도 $zoneValid';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('핵심',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(line1, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 4),
          Text(line2, style: const TextStyle(color: Colors.white60, fontSize: 12)),
        ],
      ),
    );
  }
}
