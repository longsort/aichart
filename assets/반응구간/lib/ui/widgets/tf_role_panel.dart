
import 'package:flutter/material.dart';
import '../../../engine/models/engine_output.dart';

class TfRolePanel extends StatelessWidget {
  final EngineOutput? engineOutput;
  const TfRolePanel({super.key, required this.engineOutput});

  @override
  Widget build(BuildContext context) {
    // EngineOutput 내부 구조가 프로젝트마다 달라 안전하게 "없으면 숨김"
    final eo = engineOutput;
    if (eo == null) return const SizedBox.shrink();

    // meta에 tf alignment 정보가 있으면 활용
    final meta = eo.meta ?? const {};
    final map = (meta['tfRole'] is Map) ? Map<String, dynamic>.from(meta['tfRole']) : null;
    if (map == null || map.isEmpty) return const SizedBox.shrink();

    List<Widget> chips = [];
    map.forEach((k,v){
      final s = (v ?? '').toString();
      Color c = Colors.grey.shade700;
      if (s.toLowerCase().contains('ok') || s.toLowerCase().contains('agree') || s.contains('합의')) c = Colors.greenAccent.withOpacity(0.8);
      if (s.toLowerCase().contains('conflict') || s.contains('충돌')) c = Colors.redAccent.withOpacity(0.8);
      chips.add(_chip(k, s, c));
    });

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade800),
        color: Colors.black.withOpacity(0.10),
      ),
      child: Wrap(spacing: 8, runSpacing: 8, children: chips),
    );
  }

  Widget _chip(String k, String v, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.8)),
      ),
      child: Text('$k $v', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
