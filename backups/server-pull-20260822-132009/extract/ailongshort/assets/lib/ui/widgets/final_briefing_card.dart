import 'package:flutter/material.dart';

import '../../models/decision.dart';
import '../../models/plan.dart';
import '../../models/ultra_result.dart';

/// 초보용: “롱/숏/관망을 한 줄로 정리” + “어떤 시간대가 더 중요했는지”
class FinalBriefingCard extends StatelessWidget {
  final UltraResult result;
  final String timeframeLabel;
  final bool swingMode;

  /// 1=현물(레버리지 없음)
  final int leverage;
  final ValueChanged<int> onLeverageChanged;

  /// 초보/고수 문장 톤 분리
  final bool beginnerMode;
  final ValueChanged<bool> onBeginnerModeChanged;

  const FinalBriefingCard({
    super.key,
    required this.result,
    required this.timeframeLabel,
    required this.swingMode,
    required this.leverage,
    required this.onLeverageChanged,
    required this.beginnerMode,
    required this.onBeginnerModeChanged,
  });

  @override
  Widget build(BuildContext context) {
    final d = result.decision;
    final e = result.evidence;

    final dir = _dirText(d);
    final lockTxt = d.locked ? ' (LOCK: 쉬는 구간)' : '';

    final risk = (e.risk).clamp(0, 100);
    final vol = _volatilityRangePct(risk);
    final levLabel = leverage == 1 ? '현물' : '${leverage}x';

    final plan = result.plan;
    final stopInfo = _stopLossInfo(d, plan, leverage);

    String why() {
      // “기계적으로” 2~3개만 뽑아 설명
      final items = <MapEntry<String, int>>[
        MapEntry('흐름(방향)', e.flow),
        MapEntry('차트 모양', e.shape),
        MapEntry('큰손 움직임', e.bigHand),
        MapEntry('쏠림/급등락', e.crowding),
        MapEntry('위험', e.risk),
      ]..sort((a, b) => b.value.compareTo(a.value));

      final top = items.take(3).toList();
      return top.map((x) => '${x.key} ${x.value}점').join(' · ');
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.article_outlined, size: 18),
              const SizedBox(width: 8),
              const Text(
                '최종 브리핑(초보용)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
              ),
              const Spacer(),
              // 초보/고수 토글
              _miniToggle(
                value: beginnerMode,
                onChanged: onBeginnerModeChanged,
                onLabel: '초보',
                offLabel: '고수',
              ),
              const SizedBox(width: 8),
              Text(
                swingMode ? '스윙' : '단타',
                style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 12),
              ),
              const SizedBox(width: 8),
              Text(
                timeframeLabel,
                style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '지금 결론: $dir$lockTxt',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            beginnerMode
                ? '이유(요약): ${_autoSentence(dir: dir, locked: d.locked, risk: risk, confidence: d.confidence)}'
                : '이유(요약): ${d.detail}',
            style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12, height: 1.25),
          ),
          const SizedBox(height: 6),
          Text(
            '근거(점수): ${why()}',
            style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 12),
          ),

          const SizedBox(height: 10),

          // ===== 1) 위험 → 현물 변동폭(%) + 2) 레버리지 기준 보기 =====
          _sectionTitle('변동 위험(확률형)', icon: Icons.warning_amber_rounded),
          const SizedBox(height: 6),
          Text(
            '현물 기준 예상 흔들림: ±${vol.low.toStringAsFixed(1)} ~ ${vol.high.toStringAsFixed(1)}%',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            beginnerMode
                ? '※ 이건 “방향”이 아니라 “얼마나 흔들릴 수 있는지(위험)”입니다.'
                : 'Volatility proxy based on risk score.',
            style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11, height: 1.2),
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              _levChip('현물', 1),
              const SizedBox(width: 6),
              _levChip('5x', 5),
              const SizedBox(width: 6),
              _levChip('10x', 10),
              const SizedBox(width: 6),
              _levChip('25x', 25),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            leverage == 1
                ? '레버리지: 현물(1x)'
                : '레버리지: $levLabel 기준 → 체감 변동: ±${(vol.low * leverage).toStringAsFixed(0)} ~ ${(vol.high * leverage).toStringAsFixed(0)}%',
            style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11, height: 1.2),
          ),

          // ===== 4) 손절 예상가격/손실% =====
          if (stopInfo != null) ...[
            const SizedBox(height: 10),
            _sectionTitle('손절(예상)', icon: Icons.shield_outlined),
            const SizedBox(height: 6),
            Text(
              stopInfo.title,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              stopInfo.detail,
              style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11, height: 1.2),
            ),
            if (stopInfo.warn != null) ...[
              const SizedBox(height: 4),
              Text(
                stopInfo.warn!,
                style: TextStyle(color: Colors.orangeAccent.withOpacity(0.95), fontSize: 11, fontWeight: FontWeight.w900),
              ),
            ],
          ],

          const SizedBox(height: 10),
          Text(
            beginnerMode
                ? '팁: 롱=상승쪽(매수) / 숏=하락쪽(매도) / 관망=안 들어감. LOCK가 보이면 “쉬는 구간”.'
                : 'Tip: Long/Short/No-trade. When LOCK is on, do nothing.',
            style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11, height: 1.25),
          ),
        ],
      ),
    );
  }

  String _dirText(UiDecision d) {
    final t = d.title;
    if (t.contains('롱') || t.contains('상승')) return '롱(매수)';
    if (t.contains('숏') || t.contains('하락') || t.contains('내리는')) return '숏(매도)';
    return '관망(노트레이드)';
  }

  // --- UI helpers ---
  Widget _sectionTitle(String t, {required IconData icon}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.white.withOpacity(0.9)),
        const SizedBox(width: 6),
        Text(
          t,
          style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 12, fontWeight: FontWeight.w900),
        ),
      ],
    );
  }

  Widget _miniToggle({
    required bool value,
    required ValueChanged<bool> onChanged,
    required String onLabel,
    required String offLabel,
  }) {
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.07),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.14)),
        ),
        child: Text(
          value ? onLabel : offLabel,
          style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 11, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }

  Widget _levChip(String label, int v) {
    final on = leverage == v;
    return InkWell(
      onTap: () => onLeverageChanged(v),
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: on ? Colors.white.withOpacity(0.16) : Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(on ? 0.25 : 0.12)),
        ),
        child: Text(
          label,
          style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 11, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }

  // --- Logic helpers ---
  String _autoSentence({
    required String dir,
    required bool locked,
    required int risk,
    required int confidence,
  }) {
    // ✅ “지금 결론” 자동 문장 규칙(초보용)
    // - 방향 예측보다 “행동”이 먼저 보이게
    if (locked || risk >= 80 || confidence < 45) {
      return '변동/불확실 구간이라 진입보다 관망이 유리합니다.';
    }

    if (dir.contains('롱')) {
      if (risk >= 70) return '상승 쪽이 우세하지만 흔들림이 커서 분할 진입만 유리합니다.';
      return '상승(매수) 쪽이 유리합니다. 조정(눌림)에서 분할이 유리합니다.';
    }

    if (dir.contains('숏')) {
      if (risk >= 70) return '하락 쪽이 우세하지만 급반등 위험이 있어 추격은 불리합니다.';
      return '하락(매도) 쪽이 유리합니다. 반등 추격은 피하는 게 유리합니다.';
    }

    // 관망 기본
    if (risk >= 60) return '방향이 애매하고 흔들림이 커서 쉬는 게 전략입니다.';
    return '방향 확신이 부족해 관망이 유리합니다.';
  }

  String _beginnerWhy(String s) {
    // 너무 긴 문장은 초보에게 부담 → 1줄로 다듬기
    final t = s.trim();
    if (t.isEmpty) return '근거가 부족하거나 위험도가 높아 쉬는 구간입니다.';
    if (t.length <= 44) return t;
    return t.substring(0, 44) + '…';
  }

  _VolRange _volatilityRangePct(int risk0to100) {
    // “정확한 미래 예측”이 아니라 “보수적 변동폭 가이드”
    // - 초보 보호 목적: 위험이 높을수록 크게 잡는다.
    if (risk0to100 <= 30) return const _VolRange(0.3, 0.8);
    if (risk0to100 <= 60) return const _VolRange(0.8, 1.8);
    if (risk0to100 <= 80) return const _VolRange(1.8, 3.5);
    return const _VolRange(3.5, 7.0);
  }

  _StopInfo? _stopLossInfo(UiDecision d, Plan? p, int lev) {
    if (p == null) return null;
    final entry = p.entry;
    final stop = p.stop;
    if (entry <= 0 || stop <= 0) return null;

    final movePct = ((stop - entry).abs() / entry) * 100.0;
    final effPct = movePct * lev;

    final dir = _dirText(d);
    final title = '진입 ${_fmt(entry)} → 손절 ${_fmt(stop)} (약 ${movePct.toStringAsFixed(2)}%)';

    String detail;
    if (lev == 1) {
      detail = '현물 기준 손절 변동폭: 약 ${movePct.toStringAsFixed(2)}%';
    } else {
      detail = '${lev}x 기준 체감 변동: 약 ${effPct.toStringAsFixed(0)}% (레버리지일수록 빠르게 손절/청산 위험)';
    }

    String? warn;
    if (lev >= 10 && effPct >= 80) {
      warn = '⚠ ${lev}x에서는 한 번 흔들림으로 강제 청산 위험이 큼';
    } else if (lev >= 5 && effPct >= 50) {
      warn = '⚠ ${lev}x에서는 변동이 커서 손절이 빨리 터질 수 있음';
    }

    // 방향 문장도 한 줄로
    final dirHint = dir.contains('롱')
        ? '롱이면 손절가는 “아래”에 있음'
        : dir.contains('숏')
            ? '숏이면 손절가는 “위”에 있음'
            : '관망이면 설계는 참고만';

    return _StopInfo(
      title: title,
      detail: '$detail · $dirHint',
      warn: warn,
    );
  }

  String _fmt(double v) {
    // 가격 표기(너무 길게 안)
    if (v >= 1000) return v.toStringAsFixed(0);
    if (v >= 100) return v.toStringAsFixed(1);
    return v.toStringAsFixed(2);
  }
}

class _VolRange {
  final double low;
  final double high;
  const _VolRange(this.low, this.high);
}

class _StopInfo {
  final String title;
  final String detail;
  final String? warn;
  const _StopInfo({required this.title, required this.detail, this.warn});
}
