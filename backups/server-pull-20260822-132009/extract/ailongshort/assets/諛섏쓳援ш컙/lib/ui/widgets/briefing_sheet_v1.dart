
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
              Text('$tf 마감 브리핑', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
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
          _line('판결', _judge()),
          _line('신뢰', '${s.confidence}%  (근거 ${s.evidenceHit}/${s.evidenceTotal})'),
          _line('리스크', '${s.risk}%'),
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
                const Text('다음 봉 예고', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
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
                const Text('핵심 가격', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                _priceRow('VWAP', s.vwap),
                _priceRow('지지(S1)', s.s1),
                _priceRow('저항(R1)', s.r1),
                if (s.zoneValid > 0) _priceRow('안착 기준', s.zoneValid),
                if (s.zoneInvalid > 0) _priceRow('무효 기준', s.zoneInvalid),
                if (s.zoneTargets.isNotEmpty) _priceRow('목표1', s.zoneTargets.first),
              ],
            ),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기'),
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
    if (s.score >= 60) return '상방 우세';
    if (s.score <= 40) return '하방 우세';
    return '관망';
  }

  String _nextCandleHint() {
    // minimal deterministic hint: close above/below zoneValid/zoneInvalid
    if (s.zoneValid > 0 && s.zoneInvalid > 0) {
      return '종가가 ${s.zoneValid.toStringAsFixed(0)} 위에서 안착하면 상방 시나리오 유지.\n'
             '종가가 ${s.zoneInvalid.toStringAsFixed(0)} 아래로 이탈하면 시나리오 무효/관망 전환.';
    }
    if (s.s1 > 0 && s.r1 > 0) {
      return '종가가 ${s.r1.toStringAsFixed(0)} 돌파 안착 시 상방 가속.\n'
             '종가가 ${s.s1.toStringAsFixed(0)} 이탈 시 하방 재확인.';
    }
    return '다음 봉에서 체결/오더북 흐름이 유지되면 추세 연장.\n약화되면 되돌림(관망) 우선.';
  }
}
