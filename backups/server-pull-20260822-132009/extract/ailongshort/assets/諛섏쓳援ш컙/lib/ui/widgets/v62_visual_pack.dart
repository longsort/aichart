import 'package:flutter/material.dart';

class RealtimeSparkline extends StatelessWidget {
  final String label;
  const RealtimeSparkline({super.key, this.label = 'LIVE'});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.black.withOpacity(0.25),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      alignment: Alignment.center,
      child: Text(label, style: const TextStyle(fontSize: 14)),
    );
  }
}

class ProbabilityPulse extends StatefulWidget {
  final String label;
  final int value;
  const ProbabilityPulse({super.key, required this.label, required this.value});

  @override
  State<ProbabilityPulse> createState() => _ProbabilityPulseState();
}

class _ProbabilityPulseState extends State<ProbabilityPulse> with SingleTickerProviderStateMixin {
  late final AnimationController c;

  @override
  void initState() {
    super.initState();
    c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.55, end: 1.0).animate(c),
      child: Text('${widget.label} ${widget.value}%', style: const TextStyle(fontSize: 16)),
    );
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }
}
