/// Reaction Event Engine
/// - Detects when price enters/exits a zone (support/resistance/OB/FVG)
/// - Emits lightweight events so UI can update probabilities in real-time
///
/// Inputs per tick:
/// - price
/// - zones (each has top/bottom bounds in price terms)
///
/// Output:
/// - lastEvent (enter/exit + zoneId)
/// - approach score (0~1) based on distance to nearest zone
class ZoneType { static const sr='SR'; static const ob='OB'; static const fvg='FVG'; static const bpr='BPR'; }

class ZoneInfo {
  final String id;
  final String type; // SR/OB/FVG/BPR
  final double low;
  final double high;

  const ZoneInfo({
    required this.id,
    required this.type,
    required this.low,
    required this.high,
  });

  bool contains(double price) => price >= low && price <= high;

  double distance(double price) {
    if (contains(price)) return 0;
    if (price < low) return (low - price);
    return (price - high);
  }
}

class ReactionEvent {
  final String zoneId;
  final String type;
  final bool entered; // true=enter, false=exit
  final double price;

  const ReactionEvent({
    required this.zoneId,
    required this.type,
    required this.entered,
    required this.price,
  });
}

class ReactionEngine {
  String? _insideZoneId;

  ReactionEvent? lastEvent;

  /// 0~1: 1 means very close to some zone, 0 means far.
  double approachScore = 0;

  /// Update engine with current price and zones.
  /// Returns lastEvent if occurred.
  ReactionEvent? tick({
    required double price,
    required List<ZoneInfo> zones,
    double nearRange = 0.003, // 0.3% default; tune by ATR later
  }) {
    // Determine nearest zone
    zones = zones.isEmpty ? zones : zones;
    double nearestDist = double.infinity;
    ZoneInfo? nearest;
    for (final z in zones) {
      final d = z.distance(price);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = z;
      }
    }

    // Approach score based on % distance
    // if nearestDist <= price*nearRange => high score
    final thr = price * nearRange;
    if (nearest == null) {
      approachScore = 0;
    } else {
      approachScore = (1 - (nearestDist / thr)).clamp(0.0, 1.0);
    }

    // Enter/exit detection
    ZoneInfo? inside;
    for (final z in zones) {
      if (z.contains(price)) {
        inside = z;
        break;
      }
    }

    if (_insideZoneId == null && inside != null) {
      _insideZoneId = inside.id;
      lastEvent = ReactionEvent(zoneId: inside.id, type: inside.type, entered: true, price: price);
      return lastEvent;
    }

    if (_insideZoneId != null) {
      // still inside?
      final still = zones.where((z) => z.id == _insideZoneId).toList();
      final ok = still.isNotEmpty && still.first.contains(price);
      if (!ok) {
        final zid = _insideZoneId!;
        _insideZoneId = null;
        final zt = still.isNotEmpty ? still.first.type : ZoneType.sr;
        lastEvent = ReactionEvent(zoneId: zid, type: zt, entered: false, price: price);
        return lastEvent;
      }
    }

    lastEvent = null;
    return null;
  }

  bool get isInsideAny => _insideZoneId != null;
  String? get insideZoneId => _insideZoneId;
}