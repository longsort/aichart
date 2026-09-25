import 'dart:ui';
import 'label_resolver.dart';
import 'density_gate.dart';

/// AutoLabelManager
/// - TF density + label priority + collision resolver 를 한 번에 묶어서
///   "자동으로 깔끔"하게 만드는 매니저.
///
/// 사용:
/// 1) 후보 라벨들을 register로 추가
/// 2) buildPlacements(viewport) 호출
/// 3) 결과 placement로 Positioned 배치 (hidden이면 skip)
class AutoLabel {
  final String id;
  final Rect desired;
  final Size size;
  final int priority;
  final bool hideIfClash;

  const AutoLabel({
    required this.id,
    required this.desired,
    required this.size,
    required this.priority,
    this.hideIfClash = true,
  });
}

class AutoLabelPlaced {
  final String id;
  final Offset pos;
  final bool hidden;

  const AutoLabelPlaced({required this.id, required this.pos, required this.hidden});
}

class AutoLabelManager {
  final String tf;
  final List<AutoLabel> _labels = [];

  AutoLabelManager(this.tf);

  void clear() => _labels.clear();

  /// Add label candidate.
  void register(AutoLabel l) {
    _labels.add(l);
  }

  /// Max labels by TF density (hard cap)
  int _maxLabels() {
    final d = DensityGate.showMicroLabels(tf)
        ? 10
        : (DensityGate.showZoneLabels(tf) ? 7 : 4);
    return d;
  }

  /// Build placements with:
  /// - TF density gating (drop low priority when TF is high timeframe)
  /// - collision resolve with priority
  List<AutoLabelPlaced> buildPlacements(Rect viewport) {
    // sort by priority desc
    final sorted = [..._labels]..sort((a, b) => b.priority.compareTo(a.priority));

    // density cap: take only top N
    final capped = sorted.take(_maxLabels()).toList();

    // to LabelResolver items
    final items = capped.map((l) {
      final r = Rect.fromLTWH(l.desired.left, l.desired.top, l.size.width, l.size.height);
      return LabelItem(id: l.id, desired: r, priority: l.priority, hideIfClash: l.hideIfClash);
    }).toList();

    final placed = LabelResolver.resolve(items: items, viewport: viewport);

    return placed.map((p) => AutoLabelPlaced(id: p.id, pos: Offset(p.rect.left, p.rect.top), hidden: p.hidden)).toList();
  }
}