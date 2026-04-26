import 'package:flutter/material.dart';

/// STEP 3: 근거 자동 요약 카드
/// - dto(Map/Object)에서 가능한 필드를 뽑아 "왜 이런 판단인지" 한눈에 보여줌
class AiReasonsPanel extends StatefulWidget {
  final Object? dto;

  const AiReasonsPanel({super.key, required this.dto});

  @override
  State<AiReasonsPanel> createState() => _AiReasonsPanelState();
}

class _AiReasonsPanelState extends State<AiReasonsPanel> {
  bool _open = true;

  dynamic _pick(Object? dto, String key) {
    if (dto == null) return null;
    if (dto is Map) return dto[key];
    try {
      final d = dto as dynamic;
      return d[key];
    } catch (_) {}
    try {
      final d = dto as dynamic;
      return d.toJson()[key];
    } catch (_) {}
    return null;
  }

  bool _b(dynamic v) {
    if (v == null) return false;
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) {
      final s = v.toLowerCase();
      return s == 'true' || s == '1' || s == 'yes' || s == 'y';
    }
    return false;
  }

  int _i(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  String _s(dynamic v, String fb) => (v is String && v.isNotEmpty) ? v : fb;

  @override
  Widget build(BuildContext context) {
    final dto = widget.dto;

    final choch = _b(_pick(dto, 'choch') ?? _pick(dto, 'CHoCH'));
    final bos = _b(_pick(dto, 'bos') ?? _pick(dto, 'BOS'));
    final msb = _b(_pick(dto, 'msb') ?? _pick(dto, 'MSB'));
    final eql = _b(_pick(dto, 'eql') ?? _pick(dto, 'EQL'));
    final eqh = _b(_pick(dto, 'eqh') ?? _pick(dto, 'EQH'));

    final obBias = _s(_pick(dto, 'orderbookBias') ?? _pick(dto, 'obBias'), '중립');
    final liqRisk = _s(_pick(dto, 'liquidityRisk') ?? _pick(dto, 'stopHuntRisk'), '보통');
    final sim = _i(_pick(dto, 'patternSim') ?? _pick(dto, 'similarity'), 62);

    final tags = <String>[];
    if (choch) tags.add('CHoCH');
    if (bos) tags.add('BOS');
    if (msb) tags.add('MSB');
    if (eql) tags.add('EQL');
    if (eqh) tags.add('EQH');
    if (tags.isEmpty) tags.add('구조 신호 없음');

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('AI 근거 요약',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              GestureDetector(
                onTap: () => setState(() => _open = !_open),
                child: Text(_open ? '접기' : '펼치기',
                    style: const TextStyle(fontSize: 10)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: tags.map((t) => _chip(t)).toList(),
          ),
          if (_open) ...[
            const SizedBox(height: 10),
            _row('오더북', '체결 우위: $obBias'),
            const SizedBox(height: 6),
            _row('유동성', '스탑헌트/리스크: $liqRisk'),
            const SizedBox(height: 6),
            _row('패턴', '과거 유사도: $sim%'),
          ],
        ],
      ),
    );
  }

  Widget _chip(String t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x33FFFFFF)),
        color: const Color(0x14000000),
      ),
      child: Text(t, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  Widget _row(String k, String v) {
    return Row(
      children: [
        SizedBox(
          width: 46,
          child: Text(k,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(v, style: const TextStyle(fontSize: 10))),
      ],
    );
  }
}
