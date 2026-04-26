
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import 'neon_theme.dart';

class MiniStatusBarV1 extends StatelessWidget {
  final double price;
  final double s1;
  final double r1;
  final int score;
  final int confidence;
  final int risk;
  final int evidenceHit;
  final int evidenceTotal;

  const MiniStatusBarV1({
    super.key,
    required this.price,
    required this.s1,
    required this.r1,
    required this.score,
    required this.confidence,
    required this.risk,
    required this.evidenceHit,
    required this.evidenceTotal,
  });

  String _pos() {
    if (price <= 0) return '중립';
    // 간단 구간 판정: s1/r1 기준으로 +/- 0.25%를 “구간”으로 처리
    final band = price * 0.0025;
    if ((price - s1).abs() <= band) return '지지 구간 안';
    if ((price - r1).abs() <= band) return '저항 구간 안';
    if (price < s1) return '지지 아래(주의)';
    if (price > r1) return '저항 위(돌파 후)';
    return '구간 사이(중립)';
  }

  int _strength() {
    // 초보용 강도(0~100): 신뢰+점수↑, 위험↓, 근거↑면 강도↑
    final e = (evidenceTotal <= 0) ? 0.0 : (evidenceHit / evidenceTotal).clamp(0.0, 1.0);
    final v = 15 + score*0.35 + confidence*0.35 + (100-risk)*0.20 + e*20;
    return v.round().clamp(0, 100);
  }

  int _holdPct() {
    // 유지 확률(간단): 신뢰↑, 위험↓, 강도↑
    final st = _strength();
    final v = 10 + confidence*0.35 + (100-risk)*0.35 + st*0.30;
    return v.round().clamp(0, 100);
  }

  String _action(int hold, int st) {
    // 초보 행동 1줄
    if (risk >= 75) return '초보: 거래금지(위험 높음) — 대기';
    if (hold >= 65 && st >= 60) return '초보: 분할 준비(규칙 충족 확인)';
    if (hold <= 40 || st <= 35) return '초보: 관망(근거 부족)';
    return '초보: 보수적 접근(확인 후)';
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);

    final pos = _pos();
    final st = _strength();
    final hold = _holdPct();
    final brk = 100 - hold;

    Color cPos() {
      if (pos.contains('지지')) return t.good;
      if (pos.contains('저항')) return t.bad;
      if (pos.contains('주의')) return t.warn;
      return t.muted;
    }

    Color cVal(int v) {
      if (v >= 70) return t.good;
      if (v >= 50) return t.warn;
      return t.bad;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('상태: ', style: TextStyle(color: t.muted, fontWeight: FontWeight.w900, fontSize: 12)),
              Text(pos, style: TextStyle(color: cPos(), fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('근거 $evidenceHit/$evidenceTotal', style: TextStyle(color: t.muted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _chip(t, '강도', '$st', cVal(st)),
              const SizedBox(width: 8),
              _chip(t, '유지', '$hold%', cVal(hold)),
              const SizedBox(width: 8),
              _chip(t, '붕괴', '$brk%', cVal(brk)),
            ],
          ),
          const SizedBox(height: 8),
          Text(_action(hold, st), style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12)),
          const SizedBox(height: 4),
          Text('※ 강도/확률은 참고용. 마감 후 신뢰가 올라갑니다.',
              style: TextStyle(color: t.muted, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _chip(NeonTheme t, String k, String v, Color col) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: t.bg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: t.border),
        ),
        child: Row(
          children: [
            Text(k, style: TextStyle(color: t.muted, fontWeight: FontWeight.w900, fontSize: 11)),
            const Spacer(),
            Text(v, style: TextStyle(color: col, fontWeight: FontWeight.w900, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
