import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/utils/kst_close_util.dart';

/// Fulink Pro 전용: “미니차트만 보고 있어도” 한 장으로 끝나는 강력 브리핑 카드.
/// - 다른 사람 문체/내용을 따라하지 않고, 행동/구간/트리거 중심.
/// - KST 마감 기준 카운트다운 표시.
class StrongBriefingCard extends StatelessWidget {
  final FuState s;
  final String tf;
  final double livePrice;

  const StrongBriefingCard({
    super.key,
    required this.s,
    required this.tf,
    required this.livePrice,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = tf.trim();
    final closeKst = KstCloseUtil.nextCloseKst(t);
    final nowKst = KstCloseUtil.nowKst();
    final left = closeKst.difference(nowKst);
    final leftTxt = KstCloseUtil.formatCountdown(left);

    final mode = _tfMode(t);
    final action = _actionLine(s, mode);
    final nums = _numLine(s, mode);
    final zones = _zonesLine(s);
    final triggers = _triggers(s, mode);
    final plan = _oneLinePlan(s);

    Color badge;
    if (!s.dataLive) {
      badge = Colors.blueGrey;
    } else if (s.locked) {
      badge = Colors.redAccent;
    } else if (s.showSignal && s.expectedRoiPct >= 20) {
      badge = (s.signalDir.toUpperCase() == 'LONG') ? Colors.greenAccent : Colors.redAccent;
    } else {
      badge = Colors.orangeAccent;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withOpacity(0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 18),
              const SizedBox(width: 8),
              const Text('강력 브리핑', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: badge.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: badge.withOpacity(0.60)),
                ),
                child: Text(
                  '${_tfLabel(t)} · KST 마감 $leftTxt',
                  style: TextStyle(color: badge.withOpacity(0.95), fontSize: 11, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(action, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(nums, style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(zones, style: TextStyle(color: Colors.white.withOpacity(0.80), fontSize: 12, fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 8),
          ...triggers.map((x) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('• $x', style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11, fontWeight: FontWeight.w800, height: 1.15)),
              )),
          if (plan != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withOpacity(0.10)),
              ),
              child: Text(plan, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            _closingQuestion(s, mode),
            style: TextStyle(color: Colors.white.withOpacity(0.62), fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }

  static String _tfMode(String tf) {
    final t = tf.toLowerCase();
    if (t == '15m' || t == '1h') return 'SCALP';
    if (t == '4h' || t == '1d') return 'MAIN';
    return 'MACRO';
  }

  static String _tfLabel(String tf) {
    final t = tf.toLowerCase();
    if (t == '15m') return '15분';
    if (t == '1h') return '1시간';
    if (t == '4h') return '4시간';
    if (t == '1d') return '1일';
    if (t == '1w') return '1주';
    if (t == '1m') return '1달';
    if (t == '1y') return '1년';
    return tf;
  }

  static String _actionLine(FuState s, String mode) {
    if (!s.dataLive) {
      return '지금 할 일: 🔒 관망 (데이터 불안정: ${s.dataStatus})';
    }
    if (s.locked) {
      final why = (s.lockedReason.isNotEmpty) ? s.lockedReason : '쉬는 구간';
      return '지금 할 일: 🔴 금지 ($why)';
    }
    if (s.showSignal && s.expectedRoiPct >= 20) {
      final dir = (s.signalDir.toUpperCase() == 'LONG') ? '🟣 B(롱) 확정' : '🟣 S(숏) 확정';
      return '지금 할 일: $dir · 마감 기준 실행';
    }
    // 준비/관망
    final p = s.signalProb;
    if (p >= 65 && s.evidenceHit >= 3) {
      return '지금 할 일: 🟢 진입가능(준비) · 타점 구간 접근 대기';
    }
    return '지금 할 일: 🟡 관망 · 조건 더 필요';
  }

  static String _numLine(FuState s, String mode) {
    final prob = s.signalProb.clamp(0, 100);
    final risk = s.risk.clamp(0, 100);
    final roi = s.expectedRoiPct;
    final ev = (s.evidenceTotal <= 0) ? 0 : ((s.evidenceHit / s.evidenceTotal) * 100).round();
    final riskTag = (risk >= 70) ? '높음' : (risk <= 35) ? '낮음' : '보통';
    final roiTxt = (roi <= 0) ? '-' : '${roi.toStringAsFixed(0)}%';
    return '확률 ${prob}% · 위험 $riskTag · ROI $roiTxt · 근거 $ev%';
  }

  static String _zonesLine(FuState s) {
    final s1 = s.s1;
    final r1 = s.r1;
    final rl = s.reactLow;
    final rh = s.reactHigh;
    final hasBand = (rl > 0 && rh > 0);
    final band = hasBand ? '반응구간 ${rl.toStringAsFixed(1)}~${rh.toStringAsFixed(1)}' : '반응구간 -';
    return '지지 ${s1.toStringAsFixed(1)} · $band · 저항 ${r1.toStringAsFixed(1)}';
  }

  static List<String> _triggers(FuState s, String mode) {
    final out = <String>[];
    final bl = s.breakLevel;
    if (bl > 0) {
      out.add('결정가격 ${bl.toStringAsFixed(1)} 위/아래 마감으로 방향 확인');
    }
    if (s.reactLow > 0 && s.reactHigh > 0) {
      out.add('반응구간 안에서만 진입 판단(추격 금지)');
    }

    if (mode == 'SCALP') {
      out.add('15m/1h는 “한 번 더 확인 후” 들어간다(마감 우선)');
    } else if (mode == 'MAIN') {
      out.add('4h/1D는 “오늘 방향” 기준(역방향 추격 금지)');
    } else {
      out.add('주/월/년은 “금지구간/유리구간”만 본다(단타 신호 아님)');
    }

    // 세력 힌트(과장 금지)
    final whale = s.whaleScore;
    final force = s.forceScore;
    final inst = s.instBias;
    if (whale >= 70 || force >= 70 || inst >= 70) {
      out.add('세력 유입 신호 ↑ (고래 $whale / 세력 $force / 기관 $inst)');
    }
    if (s.sweepRisk >= 70) {
      out.add('스윕 위험 ↑ (손절 쓸림 주의)');
    }
    return out.take(4).toList();
  }

  static String? _oneLinePlan(FuState s) {
    if (!s.dataLive) return null;
    if (!s.showSignal) return null;
    if (s.locked) return null;
    if (s.expectedRoiPct < 20) return null;
    final e = s.entry;
    final sl = s.stop;
    final tp1 = s.target;
    if (e <= 0 || sl <= 0 || tp1 <= 0) return null;
    final dir = (s.signalDir.toUpperCase() == 'LONG') ? 'B' : 'S';
    return '계획($dir): 진입 ${e.toStringAsFixed(1)} / 손절 ${sl.toStringAsFixed(1)} / 목표1 ${tp1.toStringAsFixed(1)}  (ROI ${s.expectedRoiPct.toStringAsFixed(0)}%)';
  }

  static String _closingQuestion(FuState s, String mode) {
    if (!s.dataLive) return '질문: 데이터가 LIVE로 돌아왔나? (LIVE 아니면 거래 금지)';
    if (mode == 'SCALP') return '질문: 지금은 “진입”이 아니라 “반응 확인” 구간인가?';
    if (mode == 'MAIN') return '질문: 오늘은 반응구간을 지키고 마감했나, 깨고 마감했나?';
    return '질문: 이 구간은 추격 금지인가, 유리구간 접근인가?';
  }
}
