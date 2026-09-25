
import 'package:flutter/material.dart';
import 'state_engine.dart';
import 'future_core.dart';

class RationaleSheet {
  static void show(
    BuildContext context, {
    required MarketState state,
    required double P,
    required double E,
    required double V,
    required double R,
    required List<Scenario> scenarios,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _Sheet(
        state: state, P: P, E: E, V: V, R: R, scenarios: scenarios,
      ),
    );
  }
}

class _Sheet extends StatelessWidget {
  final MarketState state;
  final double P,E,V,R;
  final List<Scenario> scenarios;
  const _Sheet({required this.state, required this.P, required this.E, required this.V, required this.R, required this.scenarios});

  String _stateText() {
    switch (state) {
      case MarketState.stable: return "稳定/안정";
      case MarketState.energy: return "能量/에너지";
      case MarketState.uncertain: return "不确定/불안";
      case MarketState.danger: return "危险/위험";
    }
  }

  @override
  Widget build(BuildContext context) {
    String pct(double x) => "${(x*100).round()}%";
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: const BoxDecoration(
        color: Color(0xFF0B0B0F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("进入依据 / 진입 근거", style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
              Text(_stateText(), style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _chip("P", pct(P)),
              _chip("E", pct(E)),
              _chip("V", pct(V)),
              _chip("R", pct(R)),
            ],
          ),
          const SizedBox(height: 12),
          const Text("未来/미래", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          ...scenarios.map((s) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                SizedBox(width: 22, child: Text(s.id, style: const TextStyle(color: Colors.white60, fontSize: 11))),
                Expanded(child: Text(s.name, style: const TextStyle(color: Colors.white60, fontSize: 11))),
                Text(pct(s.p), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
              ],
            ),
          )),
          const SizedBox(height: 12),
          const Text("简述/요약", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(_oneLine(), style: const TextStyle(color: Colors.white, fontSize: 12, height: 1.3)),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  static Widget _chip(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24, width: 1),
        color: const Color(0xFF121225),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(k, style: const TextStyle(color: Colors.white60, fontSize: 10)),
          const SizedBox(width: 6),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  String _oneLine() {
    if (state == MarketState.danger) return "风险偏高，先观望/리스크 높음 관망";
    if (state == MarketState.uncertain) return "分歧明显，等待更好点位/불확실 대기";
    if (state == MarketState.energy) return "能量聚集，关注回踩/에너지 축적 눌림 주시";
    return "状态稳定，可考虑进入/안정 진입 고려";
  }
}
