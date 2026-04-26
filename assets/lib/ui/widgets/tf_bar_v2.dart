
import 'dart:async';
import 'package:flutter/material.dart';

import '../../core/chart_prefs.dart';

/// TF Bar + 종가(마감) 토글 + 마감 카운트다운
/// - 외부 모델(Candle/Tf) 의존 없이 String label만 받음
class TFBarV2 extends StatefulWidget {
  final List<String> tfs; // e.g., ['1m','5m','15m','1h','4h','1D','1W','1M']
  final String selected;
  final void Function(String tf) onSelect;

  const TFBarV2({
    super.key,
    required this.tfs,
    required this.selected,
    required this.onSelect,
  });

  @override
  State<TFBarV2> createState() => _TFBarV2State();
}

class _TFBarV2State extends State<TFBarV2> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Duration _tfToDuration(String tf) {
    switch (tf) {
      case '1m': return const Duration(minutes: 1);
      case '5m': return const Duration(minutes: 5);
      case '15m': return const Duration(minutes: 15);
      case '30m': return const Duration(minutes: 30);
      case '1h': return const Duration(hours: 1);
      case '2h': return const Duration(hours: 2);
      case '4h': return const Duration(hours: 4);
      case '1D': return const Duration(days: 1);
      case '1W': return const Duration(days: 7);
      case '1M': return const Duration(days: 30); // 근사
      default: return const Duration(minutes: 15);
    }
  }

  String _fmt(Duration d) {
    final s = d.inSeconds.clamp(0, 999999);
    final hh = s ~/ 3600;
    final mm = (s % 3600) ~/ 60;
    final ss = s % 60;
    if (hh > 0) return '${hh.toString().padLeft(2,'0')}:${mm.toString().padLeft(2,'0')}:${ss.toString().padLeft(2,'0')}';
    return '${mm.toString().padLeft(2,'0')}:${ss.toString().padLeft(2,'0')}';
  }

  Duration _timeToClose(String tf) {
    final dur = _tfToDuration(tf);
    final now = DateTime.now().toUtc();
    final durMs = dur.inMilliseconds;
    final nowMs = now.millisecondsSinceEpoch;
    final openMs = (nowMs ~/ durMs) * durMs;
    final closeMs = openMs + durMs;
    return Duration(milliseconds: closeMs - nowMs);
  }

  @override
  Widget build(BuildContext context) {
    final ttl = _fmt(_timeToClose(widget.selected));
    final useClose = ChartPrefs.useClose;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.black.withOpacity(0.28),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        children: [
          // TF buttons
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: widget.tfs.map((tf) {
                  final on = tf == widget.selected;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: InkWell(
                      onTap: () => widget.onSelect(tf),
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: on ? Colors.white.withOpacity(0.16) : Colors.transparent,
                          border: Border.all(color: on ? Colors.white54 : Colors.white24),
                        ),
                        child: Text(tf, style: const TextStyle(fontSize: 11)),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Close toggle
          InkWell(
            onTap: () => setState(() => ChartPrefs.useClose = !ChartPrefs.useClose),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: useClose ? Colors.white.withOpacity(0.16) : Colors.transparent,
                border: Border.all(color: useClose ? Colors.white54 : Colors.white24),
              ),
              child: Text(useClose ? '종가' : '고저', style: const TextStyle(fontSize: 11)),
            ),
          ),
          const SizedBox(width: 8),
          // Countdown
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white24),
            ),
            child: Text('마감 $ttl', style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ),
        ],
      ),
    );
  }
}
