import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import 'neon_theme.dart';

/// PROCION vNext: A 카드(최종 판단 카드)
/// - 한 장으로 결론 + 이유 + 다음 행동(3개) + 무효 조건
/// - 전문용어/영어/가격계산 표시 금지(숫자 남발 방지)
class ProcionACardV1 extends StatelessWidget {
  final FuState s;
  final double livePrice;
  final String tf;
  final bool compact;

  const ProcionACardV1({
    super.key,
    required this.s,
    required this.livePrice,
    required this.tf,
    this.compact = false,
  });

  /// 상태 머신 3단계: 준비/경고/확정
  String _stage() {
    if (s.locked) return '경고';

    final p = s.signalProb.clamp(0, 100);
    // ✅ ROI 25% 게이트와 동일 기준으로 '확정' 단계 판정
    final strong = s.showSignal && s.expectedRoiPct >= 25 && p >= 65 && s.evidenceHit >= 4;
    if (strong) return '확정';

    // 신호가 부족하거나 우위가 약하면 준비/경고로 나눔
    if (!s.showSignal) {
      // 근거가 어느 정도 모이면 "준비"
      if (s.evidenceTotal > 0 && s.evidenceHit >= (s.evidenceTotal >= 5 ? 3 : 2)) return '준비';
      return '준비';
    }
    return '경고';
  }

  String _dirKo() {
    final d = (s.signalDir).toUpperCase();
    if (d.contains('LONG')) return '상승';
    if (d.contains('SHORT')) return '하락';
    return '관망';
  }

  String _finalDecision() {
    if (s.locked) return '관망';
    final p = s.signalProb.clamp(0, 100);
    if (!s.showSignal) return '지켜보기';
    // ✅ ROI 25% 미만이면 확정 신호로 보지 않음
    if (s.expectedRoiPct < 25) return '지켜보기';
    if (p < 65) return '지켜보기';
    if (s.evidenceTotal > 0 && s.evidenceHit < 4) return '지켜보기';

    // 확정 구간
    final d = _dirKo();
    if (d == '상승') return '상승 유력';
    if (d == '하락') return '하락 유력';
    return '지켜보기';
  }

  String _oneLineSummary() {
    if (s.locked) return '지금은 위험해 보여서 쉬는 게 좋아요.';

    final d = _dirKo();
    final st = _stage();
    if (st == '확정') {
      if (d == '상승') return '지지에서 버티면 위로 갈 가능성이 커요.';
      if (d == '하락') return '저항에서 막히면 아래로 밀릴 가능성이 커요.';
    }

    if (st == '경고') {
      if (d == '상승') return '위로 가려면 한 번 더 힘이 필요해요.';
      if (d == '하락') return '아래로 가려면 한 번 더 힘이 필요해요.';
      return '방향이 아직 또렷하지 않아요.';
    }
    return '판이 만들어지는 중이라 조금만 더 보자.';
  }

  /// 구조/패턴/파동 3줄(고정)
  List<String> _structure3() {
    final structure = (s.structureTag.isNotEmpty) ? s.structureTag : '구조: 방향 형성 중';
    final pattern = (s.patternTag.isNotEmpty) ? s.patternTag : '패턴: 아직 뚜렷하지 않음';
    final wave = (s.waveTag.isNotEmpty) ? s.waveTag : '파동: 힘 모으는 중';

    // 최대한 쉬운 문장으로 정리
    String clean(String x, String fallback) {
      final v = x.trim();
      if (v.isEmpty) return fallback;
      // 너무 전문적인 토큰이 섞여도 사용자에게는 "설명"이 중요
      return v;
    }

    return [
      clean(structure.startsWith('구조') ? structure : '구조: $structure', '구조: 방향 형성 중'),
      clean(pattern.startsWith('패턴') ? pattern : '패턴: $pattern', '패턴: 아직 뚜렷하지 않음'),
      clean(wave.startsWith('파동') ? wave : '파동: $wave', '파동: 힘 모으는 중'),
    ];
  }

  /// 롱 vs 숏 우세(상대 비교)
  ({int up, int dn}) _biasPair() {
    // 기본: signalProb를 현재 방향 확률로 보고, 반대는 100-p
    final p = s.signalProb.clamp(0, 100);
    final d = _dirKo();
    if (d == '상승') return (up: p, dn: 100 - p);
    if (d == '하락') return (up: 100 - p, dn: p);
    // 관망이면 근거 기반으로 대칭 처리
    return (up: (50 + (s.longPct * 50).round()).clamp(0, 100).toInt(), dn: (50 + (s.shortPct * 50).round()).clamp(0, 100).toInt());
  }

  List<String> _nextActions() {
    final st = _stage();
    final d = _dirKo();
    if (s.locked) {
      return const [
        '1) 지금은 쉬기(무리 진입 금지)',
        '2) 다른 타임프레임으로 흐름만 확인',
        '3) 신호가 다시 살아날 때까지 대기',
      ];
    }
    if (st != '확정') {
      return const [
        '1) 지지/저항에 닿는지 기다리기',
        '2) 크게 흔들리면 그냥 보내기',
        '3) 방향이 확실해질 때만 행동',
      ];
    }
    if (d == '상승') {
      return const [
        '1) 천천히 진입(한 번에 몰빵 금지)',
        '2) 아래로 깨지면 바로 철수',
        '3) 위 구간에서 나눠서 정리',
      ];
    }
    if (d == '하락') {
      return const [
        '1) 천천히 진입(한 번에 몰빵 금지)',
        '2) 위로 뚫리면 바로 철수',
        '3) 아래 구간에서 나눠서 정리',
      ];
    }
    return const [
      '1) 방향 확인',
      '2) 무리 금지',
      '3) 확정될 때만 행동',
    ];
  }

  String _riskLine() {
    if (s.locked) return '무효: 변동이 너무 거칠어 보이면 오늘은 쉬기';
    final d = _dirKo();
    if (d == '상승') return '무효: 아래로 깨지고 회복 못 하면 판단 취소';
    if (d == '하락') return '무효: 위로 뚫고 버티면 판단 취소';
    return '무효: 방향이 계속 바뀌면 관망 유지';
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final stage = _stage();
    final decision = _finalDecision();
    final dir = _dirKo();
    final lines = _structure3();
    final bias = _biasPair();

    Color stageCol;
    if (stage == '확정') {
      stageCol = (dir == '하락') ? t.bad : t.good;
    } else if (stage == '경고') {
      stageCol = t.warn;
    } else {
      stageCol = t.muted;
    }

    Widget pill(String txt, Color c) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: c.withOpacity(0.12),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.withOpacity(0.35)),
        ),
        child: Text(txt, style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12)),
      );
    }

    Widget bar({required int left, required int right}) {
      final sum = (left + right).clamp(1, 200);
      final lp = left / sum;
      final rp = right / sum;
      return ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: Row(
          children: [
            Expanded(
              flex: (lp * 1000).round().clamp(1, 999),
              child: Container(height: 8, color: t.good.withOpacity(0.85)),
            ),
            Expanded(
              flex: (rp * 1000).round().clamp(1, 999),
              child: Container(height: 8, color: t.bad.withOpacity(0.85)),
            ),
          ],
        ),
      );
    }

    final actions = _nextActions();

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: t.border.withOpacity(0.85)),
        boxShadow: [
          BoxShadow(
            blurRadius: 18,
            spreadRadius: 0,
            offset: const Offset(0, 10),
            color: Colors.black.withOpacity(0.25),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              pill('최종: $decision', stageCol),
              const SizedBox(width: 8),
              pill('상태: $stage', stageCol.withOpacity(0.95)),
              const Spacer(),
              Text('TF: $tf', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),

          Text(
            _oneLineSummary(),
            maxLines: compact ? 2 : 4,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: t.fg, fontSize: 13, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),

          // 구조/패턴/파동 + 우세(컴팩트 최적화)
          if (compact) ...[
            // ✅ 한눈에: 구조 1줄만
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                lines.isNotEmpty ? lines.first : '구조: 방향 형성 중',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: t.fg.withOpacity(0.78), fontSize: 11, fontWeight: FontWeight.w800),
              ),
            ),
            // ✅ 한눈에: 우세 바만 (작게)
            Row(
              children: [
                Text('상승', style: TextStyle(color: t.good, fontSize: 10, fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: Row(
                      children: [
                        Expanded(
                          flex: bias.up.clamp(1, 999),
                          child: Container(height: 6, color: t.good.withOpacity(0.85)),
                        ),
                        Expanded(
                          flex: bias.dn.clamp(1, 999),
                          child: Container(height: 6, color: t.bad.withOpacity(0.85)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text('하락', style: TextStyle(color: t.bad, fontSize: 10, fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 10),
          ] else ...[
            // 구조/패턴/파동 3줄
            ...lines.map(
              (x) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(x, style: TextStyle(color: t.fg.withOpacity(0.78), fontSize: 11, fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(height: 8),
            // 방향 우세
            Row(
              children: [
                Text('상승', style: TextStyle(color: t.good, fontSize: 11, fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                Expanded(child: bar(left: bias.up, right: bias.dn)),
                const SizedBox(width: 8),
                Text('하락', style: TextStyle(color: t.bad, fontSize: 11, fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 10),
          ],
if (!compact) ...[
          // 다음 행동 3개
          Text('다음 행동(3개)', style: TextStyle(color: t.fg.withOpacity(0.90), fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          ...actions.map(
            (x) => Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(x, style: TextStyle(color: t.fg.withOpacity(0.82), fontSize: 11, fontWeight: FontWeight.w800)),
            ),
          ),

          ],

          const SizedBox(height: 8),
          Text(_riskLine(), style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}