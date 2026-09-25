
// fu156: zone -> evidence hard wire
// When support/resist exceeds threshold, push to evidence count.

import 'zone_score_engine.dart';
import '../central_engine.dart';

class ZoneEvidenceWire {
  static void bind() {
    ZoneScoreEngine.scores.addListener(() {
      final map = ZoneScoreEngine.scores.value;
      int hits = 0;
      for (final s in map.values) {
        if (s.support > 70 || s.resist > 70) hits++;
      }
      CentralEngine.evidenceCount.value = hits.clamp(0, 10);
    });
  }
}
