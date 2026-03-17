import 'package:flutter/material.dart';

class BucketStats {
  final int win;
  final int loss;

  const BucketStats({required this.win, required this.loss});

  double get winRate {
    final d = win + loss;
    if (d == 0) return 0.0;
    return (win / d) * 100.0;
  }
}

class TraderStatsDashboardCard extends StatelessWidget {
  final int total;
  final int win;
  final int loss;
  final int timeout;
  final int open;

  final double winRate; // 0~100

  final BucketStats longStats;
  final BucketStats shortStats;

  final BucketStats confHigh;   // >= 75
  final BucketStats confMid;    // 60~74
  final BucketStats confLow;    // < 60

  const TraderStatsDashboardCard({
    super.key,
    required this.total,
    required this.win,
    required this.loss,
    required this.timeout,
    required this.open,
    required this.winRate,
    required this.longStats,
    required this.shortStats,
    required this.confHigh,
    required this.confMid,
    required this.confLow,
  });

  @override
  Widget build(BuildContext context) {
    return _card(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('승률/확률 대시보드', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),

          _progressRow('전체 승률', winRate),
          const SizedBox(height: 10),

          _sectionTitle('방향별 승률'),
          _miniRow('LONG', longStats, barColor: Colors.cyanAccent),
          _miniRow('SHORT', shortStats, barColor: Colors.orangeAccent),

          const SizedBox(height: 10),
          _sectionTitle('신뢰도 구간별 승률'),
          _miniRow('확신 ≥ 75', confHigh, barColor: Colors.greenAccent),
          _miniRow('60~74', confMid, barColor: Colors.white70),
          _miniRow('< 60', confLow, barColor: Colors.redAccent),

          const Divider(height: 18),
          _kv('총 기록', '$total'),
          _kv('WIN / LOSS', '$win / $loss'),
          _kv('TIMEOUT / OPEN', '$timeout / $open'),
          const SizedBox(height: 2),
          const Text('※ 승률은 WIN/(WIN+LOSS) 기준. TIMEOUT/OPEN은 제외.',
              style: TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _sectionTitle(String t) =>
      Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)));

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
            Text(v, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      );

  Widget _progressRow(String label, double pct) {
    final p = (pct.clamp(0, 100)) / 100.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12))),
            Text('${pct.toStringAsFixed(1)}%', style: const TextStyle(color: Colors.cyanAccent, fontSize: 12, fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: LinearProgressIndicator(
            value: p.isNaN ? 0 : p,
            minHeight: 10,
            backgroundColor: Colors.white.withOpacity(0.08),
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.cyanAccent),
          ),
        ),
      ],
    );
  }

  Widget _miniRow(String name, BucketStats s, {required Color barColor}) {
    final pct = s.winRate;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(width: 86, child: Text(name, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: LinearProgressIndicator(
                value: (pct.clamp(0, 100)) / 100.0,
                minHeight: 10,
                backgroundColor: Colors.white.withOpacity(0.08),
                valueColor: AlwaysStoppedAnimation<Color>(barColor),
              ),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 90,
            child: Text(
              '${pct.toStringAsFixed(1)}%  (${s.win}/${s.loss})',
              textAlign: TextAlign.right,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(Widget child) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: child,
    );
  }
}
