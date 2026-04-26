
import 'trade_log.dart';

class TradeStats {
  final int total;
  final int wins;
  final double winRate; // 0..100
  final double avgR; // optional placeholder

  const TradeStats({
    required this.total,
    required this.wins,
    required this.winRate,
    required this.avgR,
  });
}

class TradeStatsEngine {
  /// Aggregate by "tag" (e.g. meta['tag']='BPR2+PO3')
  TradeStats byTag(List<TradeLog> logs, String tagKey, String tagValue) {
    int t = 0, w = 0;
    for (final l in logs) {
      final mv = l.meta[tagKey]?.toString();
      if (mv == tagValue) {
        t++;
        if (l.win) w++;
      }
    }
    final wr = t == 0 ? 0.0 : (w / t) * 100.0;
    return TradeStats(total: t, wins: w, winRate: wr, avgR: 0.0);
  }

  TradeStats overall(List<TradeLog> logs) {
    final t = logs.length;
    final w = logs.where((e) => e.win).length;
    final wr = t == 0 ? 0.0 : (w / t) * 100.0;
    return TradeStats(total: t, wins: w, winRate: wr, avgR: 0.0);
  }

  /// Quick buckets the HUD can show without extra schema.
  Map<String, TradeStats> quickBuckets(List<TradeLog> logs) {
    final buckets = <String, List<TradeLog>>{
      '매수': [],
      '매도': [],
      'BPR2': [],
      'PO3': [],
      'FLOW': [],
    };

    for (final l in logs) {
      if (l.direction == 'buy') buckets['매수']!.add(l);
      if (l.direction == 'sell') buckets['매도']!.add(l);

      final tags = (l.meta['tags'] is List) ? (l.meta['tags'] as List).map((e) => e.toString()).toList() : <String>[];
      if (tags.contains('BPR2')) buckets['BPR2']!.add(l);
      if (tags.contains('PO3')) buckets['PO3']!.add(l);
      if (tags.contains('FLOW')) buckets['FLOW']!.add(l);
    }

    TradeStats _calc(List<TradeLog> ls) {
      final t = ls.length;
      final w = ls.where((e) => e.win).length;
      final wr = t == 0 ? 0.0 : (w / t) * 100.0;
      return TradeStats(total: t, wins: w, winRate: wr, avgR: 0.0);
    }

    return buckets.map((k, v) => MapEntry(k, _calc(v)));
  }
}
