import 'dart:ui';

/// Label collision resolver (simple, fast)
///
/// Inputs: desired label rects with priority
/// Output: adjusted positions (rects) and hidden flags
///
/// Strategy:
/// 1) Sort by priority desc (higher first)
/// 2) Place label if it doesn't intersect any placed rect
/// 3) If intersects, try shifting in steps within viewport
/// 4) If still intersects -> hide (low priority only)
class LabelItem {
  final String id;
  final Rect desired;       // desired rect (in pixels)
  final int priority;       // higher wins
  final bool hideIfClash;   // if false, we never hide (for critical labels)
  final int maxTries;

  const LabelItem({
    required this.id,
    required this.desired,
    required this.priority,
    this.hideIfClash = true,
    this.maxTries = 10,
  });
}

class LabelPlaced {
  final String id;
  final Rect rect;
  final bool hidden;

  const LabelPlaced({required this.id, required this.rect, required this.hidden});
}

class LabelResolver {
  static List<LabelPlaced> resolve({
    required List<LabelItem> items,
    required Rect viewport,
    double step = 10,
  }) {
    final sorted = [...items]..sort((a, b) => b.priority.compareTo(a.priority));
    final placed = <LabelPlaced>[];
    final occupied = <Rect>[];

    for (final it in sorted) {
      Rect r = _clampRect(it.desired, viewport);
      bool ok = !_intersectsAny(r, occupied);

      if (!ok) {
        Rect best = r;
        bool found = false;

        // Try shifting (grid walk)
        for (int k = 1; k <= it.maxTries; k++) {
          final dx = (k % 2 == 0 ? k : -k) * step;
          final dy = (k) * (step * 0.8);
          final cand = _clampRect(r.shift(Offset(dx, dy)), viewport);
          if (!_intersectsAny(cand, occupied)) {
            best = cand;
            found = true;
            break;
          }
        }

        if (found) {
          r = best;
          ok = true;
        }
      }

      if (!ok && it.hideIfClash) {
        placed.add(LabelPlaced(id: it.id, rect: r, hidden: true));
        continue;
      }

      placed.add(LabelPlaced(id: it.id, rect: r, hidden: false));
      occupied.add(r);
    }

    // Return in original order for easier mapping
    final map = {for (final p in placed) p.id: p};
    return items
        .map((i) => map[i.id] ?? LabelPlaced(id: i.id, rect: i.desired, hidden: true))
        .toList();
  }

  static bool _intersectsAny(Rect r, List<Rect> list) {
    for (final o in list) {
      if (r.overlaps(o)) return true;
    }
    return false;
  }

  static Rect _clampRect(Rect r, Rect vp) {
    final w = r.width;
    final h = r.height;
    final left = r.left.clamp(vp.left, vp.right - w);
    final top = r.top.clamp(vp.top, vp.bottom - h);
    return Rect.fromLTWH(left.toDouble(), top.toDouble(), w, h);
  }
}