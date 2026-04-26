import 'package:flutter/material.dart';

class EngineStatusCard extends StatelessWidget {
  final bool probOn;
  final bool eventOn;
  final bool tapeOn;
  final DateTime? lastReload;
  final DateTime? lastWs;
  final VoidCallback onToggleProb;
  final VoidCallback onToggleEvent;
  final VoidCallback onToggleTape;

  const EngineStatusCard({
    super.key,
    required this.probOn,
    required this.eventOn,
    required this.tapeOn,
    required this.lastReload,
    required this.lastWs,
    required this.onToggleProb,
    required this.onToggleEvent,
    required this.onToggleTape,
  });

  String _age(DateTime? t) {
    if (t == null) return '-';
    final d = DateTime.now().difference(t);
    if (d.inSeconds < 60) return '${d.inSeconds}s';
    if (d.inMinutes < 60) return '${d.inMinutes}m';
    return '${d.inHours}h';
  }

  Widget _row({required String label, required bool on, required VoidCallback tap}) {
    return InkWell(
      onTap: tap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
            Text(on ? 'ON' : 'OFF', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: on ? Colors.greenAccent : Colors.redAccent)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: const Color(0xFF11161B),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: Colors.white.withOpacity(0.08))),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('?”ì§„ ?íƒœ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                const Spacer(),
                Text('WS ${_age(lastWs)} Â· RELOAD ${_age(lastReload)}', style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.65))),
              ],
            ),
            const SizedBox(height: 8),
            _row(label: '?•ë¥  ?”ì§„', on: probOn, tap: onToggleProb),
            _row(label: '?´ë²¤???í–¥', on: eventOn, tap: onToggleEvent),
            _row(label: 'ì²´ê²° ê°•ë„', on: tapeOn, tap: onToggleTape),
            Text('???´ë¦­?˜ë©´ ON/OFF', style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.55))),
          ],
        ),
      ),
    );
  }
}
