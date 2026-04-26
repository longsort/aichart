
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class BriefingSheetV1 extends StatelessWidget {
  final String tf;
  final FuState s;
  const BriefingSheetV1({super.key, required this.tf, required this.s});

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.of(context).padding.top;
    final h = MediaQuery.of(context).size.height;
    return Container(
      height: h * 0.72,
      padding: EdgeInsets.fromLTRB(14, 12 + safeTop * 0.0, 14, 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0D12),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('$tf 마감 브리??, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Text('${s.price.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _line('?�결', _judge()),
          _line('?�뢰', '${s.confidence}%  (근거 ${s.evidenceHit}/${s.evidenceTotal})'),
          _line('리스??, '${s.risk}%'),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('?�음 �??�고', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text(_nextCandleHint(), style: const TextStyle(color: Colors.white70, height: 1.3)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('?�심 가�?, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                _priceRow('VWAP', s.vwap),
                _priceRow('지지(S1)', s.s1),
                _priceRow('?�??R1)', s.r1),
                if (s.zoneValid > 0) _priceRow('?�착 기�?', s.zoneValid),
                if (s.zoneInvalid > 0) _priceRow('무효 기�?', s.zoneInvalid),
                if (s.zoneTargets.isNotEmpty) _priceRow('목표1', s.zoneTargets.first),
              ],
            ),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('?�기'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _line(String k, String v) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Text(k, style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.w700)),
        const Spacer(),
        Flexible(child: Text(v, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900), textAlign: TextAlign.right)),
      ],
    ),
  );

  Widget _priceRow(String k, double v) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Text(k, style: const TextStyle(color: Colors.white54)),
        const Spacer(),
        Text(v.toStringAsFixed(0), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ],
    ),
  );

  String _judge() {
    if (s.locked) return s.lockedReason.isEmpty ? 'NO-TRADE' : s.lockedReason;
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) return t;
    if (s.score >= 60) return '?�방 ?�세';
    if (s.score <= 40) return '?�방 ?�세';
    return '관�?;
  }

  String _nextCandleHint() {
    // minimal deterministic hint: close above/below zoneValid/zoneInvalid
    if (s.zoneValid > 0 && s.zoneInvalid > 0) {
      return '종�?가 ${s.zoneValid.toStringAsFixed(0)} ?�에???�착?�면 ?�방 ?�나리오 ?��?.\n'
             '종�?가 ${s.zoneInvalid.toStringAsFixed(0)} ?�래�??�탈?�면 ?�나리오 무효/관�??�환.';
    }
    if (s.s1 > 0 && s.r1 > 0) {
      return '종�?가 ${s.r1.toStringAsFixed(0)} ?�파 ?�착 ???�방 가??\n'
             '종�?가 ${s.s1.toStringAsFixed(0)} ?�탈 ???�방 ?�확??';
    }
    return '?�음 봉에??체결/?�더�??�름???��??�면 추세 ?�장.\n?�화?�면 ?�돌�?관�? ?�선.';
  }
}
