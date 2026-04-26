import 'package:flutter/material.dart';

class BriefingFlashCardV1 extends StatefulWidget {
  final Widget child;
  final bool flash;
  final Color color;

  const BriefingFlashCardV1({
    super.key,
    required this.child,
    required this.flash,
    required this.color,
  });

  @override
  State<BriefingFlashCardV1> createState() => _BriefingFlashCardV1State();
}

class _BriefingFlashCardV1State extends State<BriefingFlashCardV1>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    if (widget.flash) _c.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant BriefingFlashCardV1 oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.flash && !_c.isAnimating) _c.repeat(reverse: true);
    if (!widget.flash && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final v = widget.flash ? _c.value : 0.0;
        final glow = widget.color.withOpacity(widget.flash ? (0.25 + 0.35 * v) : 0.0);
        return Container(
          decoration: BoxDecoration(
            boxShadow: [
              if (widget.flash)
                BoxShadow(
                  color: glow,
                  blurRadius: 10 + 22 * v,
                  spreadRadius: 0.5 + 2 * v,
                ),
            ],
          ),
          child: widget.child,
        );
      },
    );
  }
}
