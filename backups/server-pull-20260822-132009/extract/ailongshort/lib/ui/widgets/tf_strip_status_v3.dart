
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class TfStripStatusV3 extends StatefulWidget {
  final Map<String, FuState> tfSnap;
  final String selectedTf;
  final ValueChanged<String> onSelectTf;

  const TfStripStatusV3({
    super.key,
    required this.tfSnap,
    required this.selectedTf,
    required this.onSelectTf,
  });

  @override
  State<TfStripStatusV3> createState() => _TfStripStatusV3State();
}

class _TfStripStatusV3State extends State<TfStripStatusV3> {

  bool _isConfirmed(FuState? s) {
    if (s == null) return false;
    return s.zoneValid >= 60 && s.hasStructure && s.tfAgree && !s.noTrade;
  }

  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState((){}); });
  }
  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tfs = const ['1m','5m','15m','1h','4h','1D','1W','1M'];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: tfs.map((tf) {
          final s = widget.tfSnap[tf];
          final badge = _badgeFor(s);
          final isSel = tf == widget.selectedTf;
          final secs = _secsToClose(tf);
          final closingSoon = secs >= 0 && secs <= 60;
          final baseColor = badge == 'B' ? Colors.greenAccent : badge == 'S' ? Colors.redAccent : badge == 'N' ? Colors.orangeAccent : Colors.white70;
          final confirmed = _isConfirmed(s);
          final pulse = 0.55 + 0.45 * (0.5 + 0.5 * math.sin(DateTime.now().millisecondsSinceEpoch / 180.0));
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => widget.onSelectTf(tf),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(isSel ? 0.55 : 0.32),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: (closingSoon ? baseColor : (isSel ? Colors.white : Colors.white70)).withOpacity(closingSoon ? 0.35 : 0.12),
                  ),
                  boxShadow: confirmed ? [
                    BoxShadow(color: baseColor.withOpacity(0.28 * pulse), blurRadius: 14 * pulse, spreadRadius: 1.2 * pulse),
                  ] : const [],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(tf, style: TextStyle(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.w800, fontSize: 12)),
                    const SizedBox(width: 6),
                    Text(badge, style: TextStyle(color: baseColor, fontWeight: FontWeight.w900, fontSize: 12)),
                    if (closingSoon) ...[
                      const SizedBox(width: 6),
                      Text('${secs}s', style: TextStyle(color: baseColor.withOpacity(0.9), fontSize: 11, fontWeight: FontWeight.w800)),
                    ],
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _badgeFor(FuState? s) {
    if (s == null) return 'W';
    if (s.locked) return 'N';
    final t = (s.decisionTitle).toLowerCase();
    if (t.contains('�?) || t.contains('매수') || t.contains('?�승')) return 'B';
    if (t.contains('??) || t.contains('매도') || t.contains('?�락')) return 'S';
    if (s.score >= 60 && s.confidence >= 55) return 'B';
    if (s.score <= 40 && s.confidence >= 55) return 'S';
    return 'W';
  }

  int _secsToClose(String tf) {
    final now = DateTime.now();
    int secPer;
    switch (tf) {
      case '1m': secPer = 60; break;
      case '5m': secPer = 300; break;
      case '15m': secPer = 900; break;
      case '1h': secPer = 3600; break;
      case '4h': secPer = 14400; break;
      case '1D': secPer = 86400; break;
      case '1W': secPer = 604800; break;
      case '1M': return -1; // month close varies; skip countdown
      default: secPer = 900;
    }
    final epoch = now.millisecondsSinceEpoch ~/ 1000;
    final next = ((epoch ~/ secPer) + 1) * secPer;
    return next - epoch;
  }
}
