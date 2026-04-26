import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// SmartLayoutPanel (v55.1 HOTFIX)
///
/// Root cause of the ?œfold/unfold flicker??in a specific area:
/// - On desktop, scrollbars/height changes can jitter the available width by a few pixels.
/// - Any 1-col <-> 2-col switch inside a live-updating dashboard can look like a ?œpanel auto collapsing??
///
/// Fix:
/// - On desktop (Windows/macOS/Linux), FORCE single-column (vertical) layout.
///   This completely eliminates width-driven layout oscillation.
/// - On mobile/web, keep the original hysteresis behavior.
class SmartLayoutPanel extends StatefulWidget {
  final Widget left;
  final Widget right;

  final double breakpoint;
  final double hysteresis;

  const SmartLayoutPanel({
    super.key,
    required this.left,
    required this.right,
    this.breakpoint = 900,
    this.hysteresis = 40,
  });

  @override
  State<SmartLayoutPanel> createState() => _SmartLayoutPanelState();
}

class _SmartLayoutPanelState extends State<SmartLayoutPanel> {
  bool _twoCol = false;

  bool get _isDesktop {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.macOS ||
        defaultTargetPlatform == TargetPlatform.linux;
  }

  void _scheduleMode(bool next) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_twoCol == next) return;
      setState(() => _twoCol = next);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Initialize once.
    final w = MediaQuery.of(context).size.width;
    _twoCol = w >= widget.breakpoint;
  }

  @override
  Widget build(BuildContext context) {
    // HARD LOCK for desktop to eliminate flicker.
    if (_isDesktop) {
      return Column(
        children: [
          RepaintBoundary(child: widget.left),
          const SizedBox(height: 12),
          RepaintBoundary(child: widget.right),
        ],
      );
    }

    // Mobile/web: keep hysteresis switching.
    return LayoutBuilder(
      builder: (_, c) {
        final w = c.maxWidth;
        final enterTwo = widget.breakpoint + widget.hysteresis;
        final exitTwo = widget.breakpoint - widget.hysteresis;

        if (_twoCol) {
          if (w <= exitTwo) _scheduleMode(false);
        } else {
          if (w >= enterTwo) _scheduleMode(true);
        }

        if (!_twoCol) {
          return Column(
            children: [
              widget.left,
              const SizedBox(height: 12),
              widget.right,
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: widget.left),
            const SizedBox(width: 12),
            Expanded(child: widget.right),
          ],
        );
      },
    );
  }
}
