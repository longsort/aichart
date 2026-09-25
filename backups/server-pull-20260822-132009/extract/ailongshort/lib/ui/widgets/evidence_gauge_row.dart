import 'package:flutter/material.dart';
import 'package:ailongshort/engine/consensus/consensus_bus.dart';

class EvidenceGaugeRow extends StatefulWidget {
  const EvidenceGaugeRow({super.key});

  @override
  State<EvidenceGaugeRow> createState() => _EvidenceGaugeRowState();
}

class _EvidenceGaugeRowState extends State<EvidenceGaugeRow> {
  int hit = 0;
  int total = 10;
  Map<String, bool> flags = const {};
  bool _open = false;

  @override
  void initState() {
    super.initState();
    _sync();
    ConsensusBus.I.evidenceHit.addListener(_sync);
    ConsensusBus.I.evidenceTotal.addListener(_sync);
    ConsensusBus.I.evidenceFlags.addListener(_sync);
  }

  @override
  void dispose() {
    ConsensusBus.I.evidenceHit.removeListener(_sync);
    ConsensusBus.I.evidenceTotal.removeListener(_sync);
    ConsensusBus.I.evidenceFlags.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    if (!mounted) return;
    setState(() {
      hit = ConsensusBus.I.evidenceHit.value;
      total = ConsensusBus.I.evidenceTotal.value;
      flags = Map<String, bool>.from(ConsensusBus.I.evidenceFlags.value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final boxes = <Widget>[];
    final okCount = hit.clamp(0, total);
    for (int i = 0; i < total; i++) {
      final ok = i < okCount;
      boxes.add(Container(
        width: 10,
        height: 10,
        margin: const EdgeInsets.only(right: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(3),
          color: ok ? Colors.greenAccent.withOpacity(0.95) : Colors.redAccent.withOpacity(0.25),
          border: Border.all(color: Colors.white.withOpacity(0.12)),
        ),
      ));
    }

    return GestureDetector(
      onTap: () => setState(() => _open = !_open),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
        ),
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Ï¶ùÍ±∞', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w800)),
              const SizedBox(width: 8),
              Text('$hit/$total', style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(hit >= 9 ? 'Í≥†ÌôïÎ•? : (hit >= 7 ? 'Ï§ÄÎπ? : (hit >= 5 ? 'Í¥Ä?? : '?ÄÍ∏?)),
                  style: const TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(children: boxes),
          const SizedBox(height: 10),
          Text(_open ? '?ÅÏÑ∏(?∞Ïπò?òÎ©¥ ?ëÌûò)' : '?ÅÏÑ∏ Î≥¥Í∏∞(?∞Ïπò)',
              style: const TextStyle(fontSize: 11, color: Colors.white54, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: (flags.isEmpty
                    ? const <MapEntry<String, bool>>[]
                    : (_open ? flags.entries : flags.entries.take(4)))
                .map((e) {
              final ok = e.value;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: (ok ? Colors.greenAccent : Colors.white).withOpacity(ok ? 0.10 : 0.06),
                  border: Border.all(color: Colors.white.withOpacity(0.12)),
                ),
                child: Text(
                  '${e.key} ${ok ? "?? : "??}',
                  style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w800),
                ),
              );
            }).toList(growable: false),
          ),
        ],
        ),
      ),
    );
  }
}
