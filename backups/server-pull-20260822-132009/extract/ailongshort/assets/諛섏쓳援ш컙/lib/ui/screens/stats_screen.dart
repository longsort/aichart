import 'package:flutter/material.dart';
import '../../data/signal_log_store.dart';

class StatsScreen extends StatelessWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: ValueListenableBuilder(
            valueListenable: SignalLogStore.I.entries,
            builder: (_, list, __) {
              final total = list.length;
              final highWhale = list.where((e) => e.whale == 'HIGH' || e.whale == 'ULTRA').length;
              final avgUp15 = total == 0 ? 0 : (list.map((e) => e.up15).reduce((a,b)=>a+b) / total).round();
              final avgRisk = total == 0 ? 0 : (list.map((e) => e.risk).reduce((a,b)=>a+b) / total).round();
        final avgEvidence = total == 0 ? 0 : (list.map((e) => e.evidenceHit).reduce((a,b)=>a+b) / total).round();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('STATS', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  _kv('Snapshots', '$total'),
                  _kv('High/Ultra Whale', '$highWhale'),
                  _kv('Avg UP(15m)', '$avgUp15%'),
                  _kv('Avg Risk', '$avgRisk'),
                  _kv('Avg Evidence', '$avgEvidence/10'),
                  const SizedBox(height: 18),
                  const Text('Recent', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView.builder(
                      itemCount: list.take(30).length,
                      itemBuilder: (_, i) {
                        final e = list[i];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            '${e.ts.month}/${e.ts.day} ${e.ts.hour.toString().padLeft(2,'0')}:${e.ts.minute.toString().padLeft(2,'0')}  '
                            'UP ${e.up15}/${e.up1h}/${e.up4h}  WHALE ${e.whale}x${e.whaleStreak}  RISK ${e.risk}',
                            style: const TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        );
                      },
                    ),
                  )
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}