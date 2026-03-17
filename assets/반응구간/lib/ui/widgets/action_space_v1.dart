
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class ActionSpaceV1 extends StatelessWidget {
  final FuState state;
  const ActionSpaceV1({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final gate = _gate();
    final bias = state.finalDir;
    final conf = state.confidence.clamp(0, 100);
    final risk = state.risk.clamp(0, 100);

    final mainProb = conf;
    final altProb = (100 - conf).clamp(0, 100);
    final failProb = (risk >= 80 ? 40 : 15);

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F14),
        border: Border(left: BorderSide(color: Colors.white.withOpacity(0.08))),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          color: Colors.black.withOpacity(0.22),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _stateHeader(gate, bias, conf, risk),
              const SizedBox(height: 12),

              _scenarioCard(
                title: "MAIN (메인)",
                subtitle: _mainText(),
                prob: mainProb,
              ),
              const SizedBox(height: 8),
              _scenarioCard(
                title: "ALT (대체)",
                subtitle: _altText(),
                prob: altProb,
              ),
              const SizedBox(height: 8),
              _scenarioCard(
                title: "FAIL (무효)",
                subtitle: _failText(),
                prob: failProb,
                danger: true,
              ),
              const Spacer(),
              _oneLineAction(),
            ],
          ),
        ),
      ),
    );
  }

  String _gate() {
    if (state.noTradeLock) return "NO-TRADE";
    // 트레이더 모드: 확정 컷 상향(남발 방지)
    if (state.showSignal && state.confidence >= 75) return "ENTER";
    if (state.confidence >= 40) return "WATCH";
    return "WAIT";
  }

  Widget _stateHeader(String gate, String bias, int conf, int risk) {
    return Row(
      children: [
        _pill(gate, gate == "ENTER" ? const Color(0xFF6BE7B6) : (gate == "NO-TRADE" ? const Color(0xFFFF6B6B) : const Color(0xFFF7C948))),
        const SizedBox(width: 8),
        _pill("BIAS: $bias", Colors.white.withOpacity(0.6)),
        const Spacer(),
        _mini("확신", "$conf%"),
        const SizedBox(width: 8),
        _mini("RISK", "$risk%"),
      ],
    );
  }

  Widget _scenarioCard({required String title, required String subtitle, required int prob, bool danger = false}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        color: Colors.white.withOpacity(0.05),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900))),
              Text("$prob%", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: danger ? const Color(0xFFFF6B6B) : Colors.white)),
            ],
          ),
          const SizedBox(height: 6),
          Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11)),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (prob.clamp(0, 100)) / 100.0,
              minHeight: 8,
              backgroundColor: Colors.white.withOpacity(0.08),
              color: danger ? const Color(0xFFFF6B6B) : const Color(0xFF6BE7B6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _oneLineAction() {
    final gate = _gate();
    if (gate == "ENTER") return _actionText("ACTION: ENTER NOW (5% risk)  →  follow MAIN");
    if (gate == "WATCH") return _actionText("ACTION: WATCH  →  wait trigger (break/reject)");
    if (gate == "NO-TRADE") return _actionText("ACTION: NO-TRADE  →  wait risk drop / TF align");
    return _actionText("ACTION: WAIT  →  no edge");
  }

  Widget _actionText(String t) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: Colors.black.withOpacity(0.20),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
        ),
        child: Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
      );

  String _mainText() {
    if (state.entry > 0 && state.target > 0) {
      return "Entry ${state.entry.toStringAsFixed(0)}  →  Target ${state.target.toStringAsFixed(0)}";
    }
    return "Primary path based on structure + zone";
  }

  String _altText() => "Switch when trigger hits (break/retest)";
  String _failText() => "Invalid below/above FAIL level (stop/lock)";
  Widget _pill(String t, Color c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: c.withOpacity(0.12),
          border: Border.all(color: c.withOpacity(0.35)),
        ),
        child: Text(t, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900)),
      );

  Widget _mini(String k, String v) => Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(k, style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 10, fontWeight: FontWeight.w800)),
          Text(v, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      );
}
