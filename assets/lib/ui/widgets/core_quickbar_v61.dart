import 'package:flutter/material.dart';
import '../../engine/core/core_engine.dart';

class CoreQuickBarV61 extends StatelessWidget {
  final CoreSnapshot snap;
  const CoreQuickBarV61({super.key, required this.snap});

  Color _gradeColor(String g) {
    switch (g) {
      case 'ULTRA':
        return Colors.purpleAccent;
      case 'HIGH':
        return Colors.redAccent;
      case 'MID':
        return Colors.orangeAccent;
      default:
        return Colors.greenAccent;
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gradeColor(snap.whaleGrade);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.28),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: g.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          _PulseDot(color: g),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'CORE ${snap.tf}  ↑${snap.breakoutUp.toStringAsFixed(0)}%  ↓${snap.breakoutDown.toStringAsFixed(0)}%  WHALE ${snap.whaleGrade}  RISK ${(snap.risk*100).toStringAsFixed(0)}%',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: g, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  final Color color;
  const _PulseDot({required this.color});

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_c),
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: widget.color,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [BoxShadow(color: widget.color.withOpacity(0.55), blurRadius: 10)],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }
}
