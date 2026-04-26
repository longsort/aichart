
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
        title: Text('$symbol ¬∑ $tf Î∏åÎ¶¨??, style: const TextStyle(color: Colors.white)),
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
    // Íµ¨Ï°∞?ïÏ†ï ?∞ÏÑ† + ?†Ìò∏ Î∞©Ìñ•
    final dir = state.signalDir;
    final label = (state.zoneValid >= 60 && dir != 'NEUTRAL') ? 'Íµ¨Ï°∞?ïÏ†ï' : 'Î∏åÎ¶¨??;
    if (dir == 'LONG') return '$label LONG';
    if (dir == 'SHORT') return '$label SHORT';
    return '$label Í¥ÄÎß?;
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
          Text('Î∞òÏùëÍµ¨Í∞Ñ $zoneValid',
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

        // v4: "?§Îç∞?¥ÌÑ∞ Î∞îÏù∏?? ???îÏßÑ ?¥Î??êÏÑú zoneTargetsÎ•??¥Î? ?∞Ï∂ú(ATR Í∏∞Î∞ò)
        // ?¨Í∏∞?úÎäî ?îÎ©¥ Ï¢åÌëúÎ°?Îß§Ìïë?òÍ∏∞ ???®Í≥Ñ: "Íµ¨Í∞Ñ Ï°¥Ïû¨"Î•??úÍ∞Å?ÅÏúºÎ°?Î≥¥Ïó¨Ï§?
        // (Ï∞®Ìä∏ ?ÑÏ†Ø Ï¢åÌëú Îß§Ìïë?Ä v5?êÏÑú ?§Ï†ú Ï∫îÎì§ ?§Ï??ºÍ≥º ?∞Îèô)
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
                    'Ï∞®Ìä∏ ?ÅÏó≠ (v5: Ï∫îÎì§/?§Ï????∞Îèô)',
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
    final why = state.signalWhy.isNotEmpty ? state.signalWhy : 'Î∞òÏùëÍµ¨Í∞Ñ ?†Ìö® + Íµ¨Ï°∞ Í∑ºÍ±∞Î°??êÏ†ï';
    final line1 = '?ÑÏû¨Í∞Ä ${livePrice.toStringAsFixed(1)} ¬∑ ÏßÄÏßÄ ${state.s1.toStringAsFixed(1)} ¬∑ ?Ä??${state.r1.toStringAsFixed(1)}';
    final line2 = '${why} ¬∑ ?†Ìö®??$zoneValid';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('?µÏã¨',
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
