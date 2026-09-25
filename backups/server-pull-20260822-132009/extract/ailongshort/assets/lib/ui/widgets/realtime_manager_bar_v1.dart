import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/models/fu_state_ui_alias.dart';

/// 실시간 매니저 바 (안전감/생동감)
/// - 엔진 결론을 "한 줄"로 강하게 요약
/// - 세력/고래 포착(매수/매도) 이벤트를 감지해서 짧게 띄움
/// - LOCK/NO-TRADE 사유를 최우선으로 보여줌
class RealtimeManagerBarV1 extends StatefulWidget {
  final FuState s;
  final Map<String, int> radar; // buy/sell/ob/abs/inst/whale/whaleBuy/sweep
  final double livePrice;
  final String symbol;
  final String tf;

  const RealtimeManagerBarV1({
    super.key,
    required this.s,
    required this.radar,
    required this.livePrice,
    required this.symbol,
    required this.tf,
  });

  @override
  State<RealtimeManagerBarV1> createState() => _RealtimeManagerBarV1State();
}

class _RealtimeManagerBarV1State extends State<RealtimeManagerBarV1> {
  String _pulse = '';
  DateTime? _pulseAt;
  Map<String, int>? _prevRadar;

  @override
  void didUpdateWidget(covariant RealtimeManagerBarV1 oldWidget) {
    super.didUpdateWidget(oldWidget);
    _updatePulse();
  }

  void _updatePulse() {
    final r = widget.radar;
    final pr = _prevRadar;
    _prevRadar = Map<String, int>.from(r);

    final buy = r['buy'] ?? 0;
    final sell = r['sell'] ?? 0;
    final whale = r['whale'] ?? 0;
    final whaleBuy = r['whaleBuy'] ?? 0;
    final sweep = r['sweep'] ?? 0;
    final inst = r['inst'] ?? 0;

    bool crossed(int now, int before, int th) => before < th && now >= th;

    String? newPulse;

    // 1) 안전/금지 최우선
    if (widget.s.locked || widget.s.noTrade) {
      final reason = (widget.s.noTradeReason.isNotEmpty)
          ? widget.s.noTradeReason
          : (widget.s.locked ? 'LOCK (조건 미충족)' : 'NO-TRADE');
      newPulse = '🚫 $reason';
    } else if (pr != null) {
      final pBuy = pr['buy'] ?? 0;
      final pSell = pr['sell'] ?? 0;
      final pWhaleBuy = pr['whaleBuy'] ?? 0;
      final pSweep = pr['sweep'] ?? 0;

      // 2) 포착 이벤트 (임계값 교차)
      if (crossed(whaleBuy, pWhaleBuy, 70) && buy >= sell) {
        newPulse = '🐋 고래 매수 포착 (매수 비중 ${whaleBuy}%)';
      } else if (crossed(sell, pSell, 70) && sell > buy) {
        newPulse = '📉 강매도 포착 (매도 힘 ${sell}/100)';
      } else if (crossed(buy, pBuy, 70) && buy > sell) {
        newPulse = '📈 강매수 포착 (매수 힘 ${buy}/100)';
      } else if (crossed(sweep, pSweep, 70)) {
        newPulse = '⚠️ 털기 위험 급상승 (${sweep}/100)';
      }
    } else {
      // 최초: 현재 상태 요약
      if (whaleBuy >= 70 && buy >= sell) {
        newPulse = '🐋 고래 매수 우세 (매수 ${whaleBuy}%)';
      } else if (sweep >= 70) {
        newPulse = '⚠️ 털기 위험 높음 (${sweep}/100)';
      }
    }

    // 3) 그래도 아무 이벤트가 없으면, \"관리자 한 줄\" 유지
    newPulse ??= _managerOneLiner(
      buy: buy,
      sell: sell,
      whale: whale,
      whaleBuy: whaleBuy,
      sweep: sweep,
      inst: inst,
    );

    // 스팸 방지 (3초 내 동일 문구 갱신 금지)
    final now = DateTime.now();
    final same = newPulse == _pulse;
    final tooSoon = _pulseAt != null && now.difference(_pulseAt!).inSeconds < 3;
    if (same && tooSoon) return;

    setState(() {
      _pulse = newPulse!;
      _pulseAt = now;
    });
  }

  String _managerOneLiner({
    required int buy,
    required int sell,
    required int whale,
    required int whaleBuy,
    required int sweep,
    required int inst,
  }) {
    // 안전감: 위험 먼저, 그 다음 우세
    if (sweep >= 65) return '매니저: 변동/털기 위험. 추격 금지, 반응구간만.';
    if (widget.s.signalProb >= 65 && widget.s.expectedRoiPct >= 20) {
      return '매니저: 우세 구간. 조건 충족 시 진입(25%+만 확정).';
    }
    if (whaleBuy >= 65 && buy >= sell) return '매니저: 고래 매수 우세. 저항 돌파 전까지 분할 대기.';
    if (sell > buy && sell >= 60) return '매니저: 매도 우세. 손절라인 우선, 롱 추격 금지.';
    if (inst >= 60) return '매니저: 큰손 방향 ${inst}% 감지. 멀티TF 합의 체크.';
    return '매니저: 관찰(Watch). 확정 근거 5개 충족 시만 진입.';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final s = widget.s;

    final title = '${widget.symbol} · ${widget.tf}  |  ${widget.livePrice.toStringAsFixed(0)}';
    final decision = s.noTrade
        ? 'NO-TRADE'
        : (s.locked ? 'LOCK' : (s.finalDir.isEmpty ? s.signalDir : s.finalDir));
    final grade = (s.grade.isEmpty ? s.signalGrade : s.grade).toUpperCase();

    Color pillColor() {
      if (s.noTrade || s.locked) return cs.error;
      if (grade.startsWith('S')) return cs.primary;
      if (grade.startsWith('A')) return cs.primary.withOpacity(0.85);
      if (grade.startsWith('B')) return cs.outline;
      return cs.outline;
    }

    String pillText() {
      if (s.noTrade || s.locked) return 'X';
      if (grade.isNotEmpty) return grade;
      return 'W';
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title, style: TextStyle(color: cs.onSurface, fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: pillColor().withOpacity(0.18),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: pillColor().withOpacity(0.7)),
                ),
                child: Text(
                  pillText(),
                  style: TextStyle(color: pillColor(), fontSize: 12, fontWeight: FontWeight.w900),
                ),
              ),
              const SizedBox(width: 8),
              Text(decision, style: TextStyle(color: cs.onSurface.withOpacity(0.8), fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            child: Text(
              _pulse,
              key: ValueKey<String>(_pulse),
              style: TextStyle(
                color: (s.noTrade || s.locked) ? cs.error : cs.onSurface.withOpacity(0.75),
                fontSize: 12,
                fontWeight: FontWeight.w900,
                height: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
