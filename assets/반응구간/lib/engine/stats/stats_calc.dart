// v79 STATS CALC (FAST, JSONL BASED)
import 'dart:math';

class StatsSummary {
  final int total;
  final double avgEvidence;
  final double avgConfidence;
  final double longRate;
  final double shortRate;

  const StatsSummary({
    required this.total,
    required this.avgEvidence,
    required this.avgConfidence,
    required this.longRate,
    required this.shortRate,
  });
}

StatsSummary computeStats(List<Map<String, dynamic>> snaps) {
  if (snaps.isEmpty) {
    return const StatsSummary(
      total: 0,
      avgEvidence: 0,
      avgConfidence: 0,
      longRate: 0,
      shortRate: 0,
    );
  }

  double ev = 0;
  double conf = 0;
  int longN = 0;
  int shortN = 0;

  for (final s in snaps) {
    ev += (s['evidenceHit'] ?? 0).toDouble();
    conf += (s['confidence'] ?? 0).toDouble();
    final d = (s['decision'] ?? '').toString();
    if (d == 'LONG') longN++;
    if (d == 'SHORT') shortN++;
  }

  return StatsSummary(
    total: snaps.length,
    avgEvidence: ev / snaps.length,
    avgConfidence: conf / snaps.length,
    longRate: longN / snaps.length,
    shortRate: shortN / snaps.length,
  );
}