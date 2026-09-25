import 'package:flutter/material.dart';
import '../../data/evidence_weights_db.dart';

/// Simple viewer widget for latest auto-tune logs.
class AutoTuneLogPanel extends StatefulWidget {
  const AutoTuneLogPanel({super.key});

  @override
  State<AutoTuneLogPanel> createState() => _AutoTuneLogPanelState();
}

class _AutoTuneLogPanelState extends State<AutoTuneLogPanel> {
  List<Map<String, Object?>> rows = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await EvidenceWeightsDb.recentLogs(limit: 18);
    if (!mounted) return;
    setState(() => rows = r);
  }

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: Text(
          'AUTO-TUNE LOG 없음 (아직 결과 데이터 부족)',
          style: TextStyle(fontSize: 11, color: Colors.white70),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.all(10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.45),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.tune, size: 14, color: Colors.white70),
              const SizedBox(width: 8),
              const Text(
                'AUTO-TUNE LOG',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white),
              ),
              const Spacer(),
              TextButton(
                onPressed: _load,
                child: const Text('새로고침', style: TextStyle(fontSize: 10)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          for (final r in rows.take(10)) _row(r),
        ],
      ),
    );
  }

  Widget _row(Map<String, Object?> r) {
    final sym = (r['symbol'] ?? '').toString();
    final tf = (r['tf'] ?? '').toString();
    final res = (r['result'] ?? '').toString();
    final dt = (r['delta_threshold'] ?? '').toString();
    final note = (r['note'] ?? '').toString();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Text(
        '$sym $tf · $res · ΔTH $dt\n$note',
        style: const TextStyle(fontSize: 10, height: 1.25, color: Colors.white70),
      ),
    );
  }
}