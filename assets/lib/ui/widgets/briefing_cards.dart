import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

/// 브리핑용 공통 카드 스타일(분리된 카드 단위로 재사용)
Widget _cardWrap({required Widget child}) {
  return Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white.withOpacity(0.04),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.white.withOpacity(0.08)),
    ),
    child: child,
  );
}

/// 판결 카드 — 롱/숏/관망/NO-TRADE
class BriefingCardJudge extends StatelessWidget {
  final String title;
  final String value;

  const BriefingCardJudge({super.key, required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return _cardWrap(
      child: Row(
        children: [
          Text(title, style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.w700)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

/// 신뢰도 카드 — 확률 + 근거 hit/total
class BriefingCardConfidence extends StatelessWidget {
  final int confidence;
  final int evidenceHit;
  final int evidenceTotal;

  const BriefingCardConfidence({
    super.key,
    required this.confidence,
    required this.evidenceHit,
    required this.evidenceTotal,
  });

  @override
  Widget build(BuildContext context) {
    return _cardWrap(
      child: Row(
        children: [
          const Text('신뢰', style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w700)),
          const Spacer(),
          Text(
            '$confidence%  (근거 $evidenceHit/$evidenceTotal)',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

/// 리스크 카드
class BriefingCardRisk extends StatelessWidget {
  final int riskPct;

  const BriefingCardRisk({super.key, required this.riskPct});

  @override
  Widget build(BuildContext context) {
    return _cardWrap(
      child: Row(
        children: [
          const Text('리스크', style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w700)),
          const Spacer(),
          Text(
            '$riskPct%',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

/// 다음 봉 예고 카드
class BriefingCardNextCandle extends StatelessWidget {
  final String hintText;

  const BriefingCardNextCandle({super.key, required this.hintText});

  @override
  Widget build(BuildContext context) {
    return _cardWrap(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('다음 봉 예고', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(hintText, style: const TextStyle(color: Colors.white70, height: 1.3)),
        ],
      ),
    );
  }
}

/// 핵심 가격 카드 — VWAP, S1, R1, zoneValid, zoneInvalid, 목표
class BriefingCardPrices extends StatelessWidget {
  final double vwap;
  final double s1;
  final double r1;
  final double zoneValid;
  final double zoneInvalid;
  final List<double> zoneTargets;

  const BriefingCardPrices({
    super.key,
    required this.vwap,
    required this.s1,
    required this.r1,
    this.zoneValid = 0,
    this.zoneInvalid = 0,
    this.zoneTargets = const [],
  });

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

  @override
  Widget build(BuildContext context) {
    return _cardWrap(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('핵심 가격', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          _priceRow('VWAP', vwap),
          _priceRow('지지(S1)', s1),
          _priceRow('저항(R1)', r1),
          if (zoneValid > 0) _priceRow('안착 기준', zoneValid),
          if (zoneInvalid > 0) _priceRow('무효 기준', zoneInvalid),
          if (zoneTargets.isNotEmpty) _priceRow('목표1', zoneTargets.first),
        ],
      ),
    );
  }
}

/// FuState 한 번에 넣어서 브리핑용 판결/다음봉 문구 생성
class BriefingHelpers {
  static String judgeFrom(FuState s) {
    if (s.locked) return s.lockedReason.isEmpty ? 'NO-TRADE' : s.lockedReason;
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) return t;
    if (s.score >= 60) return '상방 우세';
    if (s.score <= 40) return '하방 우세';
    return '관망';
  }

  static String nextCandleHintFrom(FuState s) {
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
