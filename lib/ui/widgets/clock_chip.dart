import 'dart:async';

import 'package:flutter/material.dart';

import 'neon_theme.dart';

/// ?�단바에 붙이??'?�재?�간' �?(HH:mm)
class ClockChip extends StatefulWidget {
  const ClockChip({super.key});

  @override
  State<ClockChip> createState() => _ClockChipState();
}

class _ClockChipState extends State<ClockChip> {
  late DateTime _now;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    // 초보?? 15초마?�만 갱신 (가벼�?)
    _timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _hhmm(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.schedule, size: 14, color: t.muted),
          const SizedBox(width: 6),
          Text(_hhmm(_now), style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12)),
        ],
      ),
    );
  }
}
