import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/analysis/risk_calc.dart';
import '../../core/settings/app_settings.dart';
import 'neon_theme.dart';

/// 미니차트 아래에 붙는 "한방" 판단 카드
/// - 지금 상태(금지/관망/진입가능/확정)
/// - 방향(B/S)
/// - 확률/타점(간단)
/// - 미니 원형 게이지(움직임)
/// - 확정일 때만: 진입/손절/목표 + 수수료 포함 수익/손실 + 포지션/레버
class DecisionHubCardV2 extends StatelessWidget {
  final FuState s;
  final double livePrice;

  const DecisionHubCardV2({
    super.key,
    required this.s,
    required this.livePrice,
  });

  String _actionText() {
    if (s.locked) return '지금은 매매 금지';
    final g = (s.signalGrade).toUpperCase();
    if (!s.showSignal || g == 'WATCH') return '지금은 지켜보기';
    if (s.expectedRoiPct < 20) return '지금은 지켜보기';
    // showSignal + 20% 이상이면 진입 가능/확정
    // grade에 따라 표현을 조금 강하게
    if (g.contains('S') || g.contains('A') || g.contains('SS') || g.contains('S++')) return '확정 진입';
    return '진입 가능';
  }

  Color _actionColor(NeonTheme t) {
    if (s.locked) return t.bad;
    if (!s.showSignal || s.expectedRoiPct < 20) return t.warn;
    return t.good;
  }

  String _dirKo() {
    final d = (s.signalDir).toUpperCase();
    if (d.contains('LONG')) return 'B';
    if (d.contains('SHORT')) return 'S';
    return '-';
  }

  String _dirKoLong() {
    final d = (s.signalDir).toUpperCase();
    if (d.contains('LONG')) return '롱';
    if (d.contains('SHORT')) return '숏';
    return '관망';
  }

  String _timingLabel() {
    // 타점은 현재는 간단화: 지지/저항/반응구간 근접 + 확률 기반
    final p = s.signalProb.clamp(0, 100);
    if (s.locked) return '나쁨';
    if (p >= 75 && s.showSignal) return '우수';
    if (p >= 65) return '보통';
    return '나쁨';
  }

  String _whyLine() {
    // "왜 지금은 관망/금지인가"를 한 줄로 고정 표기 (애매함 제거)
    if (s.locked) return '사유: NO-TRADE(잠금)';
    if (!s.showSignal) return '사유: 신호 조건 부족';
    if (s.expectedRoiPct < 20) return '사유: 우위 부족(<20%)';
    if (s.evidenceTotal > 0 && s.evidenceHit < 4) {
      return '사유: 근거 부족(${s.evidenceHit}/${s.evidenceTotal})';
    }
    final p = s.signalProb.clamp(0, 100);
    if (p < 65) return '사유: 확률 부족($p%)';
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);

    final actionTxt = _actionText();
    final actionCol = _actionColor(t);
    final dTag = _dirKo();
    final dKo = _dirKoLong();
    final p = s.signalProb.clamp(0, 100);
    final why = _whyLine();

    // 게이지 값(0..1)
    final evidence = (s.evidenceTotal <= 0) ? 0.0 : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0);
    final prob = (p / 100.0).clamp(0.0, 1.0);
    final risk = (s.risk / 100.0).clamp(0.0, 1.0);
    final timing = ((p - 55) / 45).clamp(0.0, 1.0);
    final exp = ((s.expectedRoiPct - 10) / 50).clamp(0.0, 1.0);

    final showPlan = s.showSignal && !s.locked && s.expectedRoiPct >= 20;
    final rc = showPlan
        ? RiskCalc.compute(
            entry: s.entry,
            stop: s.stop,
            target: s.target,
            qty: s.qty,
            leverage: s.leverage,
          )
        : null;

    // RiskCalc.compute()가 입력값이 비정상이면 null을 반환할 수 있으므로
    // rc가 있을 때만 '확정 진입' 카드(계산 결과)를 표시한다.
    final canPlan = showPlan && rc != null;

    final bannerTitle = s.locked
        ? 'NO-TRADE'
        : (canPlan
            ? ('${_dirKoLong().toUpperCase()} 확정')
            : '관망');
    final bannerColor = s.locked ? t.bad : (canPlan ? (dKo == '롱' ? t.good : t.bad) : t.warn);

    Widget rowKey(String k, String v, {Color? vColor}) {
      return Row(
        children: [
          Expanded(
            child: Text(k, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
          Text(v, style: TextStyle(color: vColor ?? t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 확정 배너(한 눈에 LONG/SHORT/관망)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: bannerColor.withOpacity(0.10),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: bannerColor.withOpacity(0.35)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    bannerTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: bannerColor, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.2),
                  ),
                ),
                Text(
                  '${p.toStringAsFixed(0)}%',
                  style: TextStyle(color: t.fg, fontSize: 16, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // 상단 1줄: 상태 + B/S + 확률
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: actionCol.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: actionCol.withOpacity(0.35)),
                ),
                child: Text(actionTxt, style: TextStyle(color: actionCol, fontWeight: FontWeight.w900, fontSize: 12)),
              ),
              const SizedBox(width: 10),
              if (dTag != '-')
                _BlinkBadge(
                  text: dTag,
                  color: dTag == 'B' ? t.good : t.bad,
                  enabled: canPlan,
                ),
              const Spacer(),
              Text('$p%', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 14)),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              Text('방향: $dKo', style: TextStyle(color: t.fg.withOpacity(0.85), fontSize: 11, fontWeight: FontWeight.w800)),
              const SizedBox(width: 10),
              Text('근거: ${s.evidenceHit}/${s.evidenceTotal}', style: TextStyle(color: t.fg.withOpacity(0.75), fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('타점: ${_timingLabel()}', style: TextStyle(color: t.fg.withOpacity(0.80), fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
          if (why.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(why, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
          ],
          const SizedBox(height: 10),

          // 미니 원형 게이지(한눈)
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MiniRing(label: '근거', value: evidence, color: t.accent),
              _MiniRing(label: '확률', value: prob, color: t.good),
              _MiniRing(label: '위험', value: risk, color: t.bad),
              _MiniRing(label: '타이밍', value: timing, color: t.warn),
              _MiniRing(label: '기대', value: exp, color: t.good),
            ],
          ),

          if (canPlan) ...[
            const SizedBox(height: 10),
            // canPlan이 true면 rc는 null이 아니다.
            Builder(
              builder: (_) {
                final r = rc!;
                return Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  decoration: BoxDecoration(
                    color: t.bg.withOpacity(0.35),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: (dTag == 'B' ? t.good : t.bad).withOpacity(0.35)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Text('확정 진입', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12)),
                          const Spacer(),
                          Text('리스크 ${AppSettings.riskPct.toStringAsFixed(0)}% 고정', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w800)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      rowKey('진입', s.entry > 0 ? s.entry.toStringAsFixed(0) : '--', vColor: t.fg),
                      rowKey('손절', s.stop > 0 ? '${s.stop.toStringAsFixed(0)}  (-${r.slPct.toStringAsFixed(2)}%)' : '--', vColor: t.bad),
                      rowKey('목표', s.target > 0 ? '${s.target.toStringAsFixed(0)}  (+${r.tpPct.toStringAsFixed(2)}%)' : '--', vColor: t.good),
                      rowKey('예상 손실', '${r.slUsdt.toStringAsFixed(1)} USDT', vColor: t.bad),
                      rowKey('예상 수익', '${r.tpUsdt.toStringAsFixed(1)} USDT', vColor: t.good),
                      rowKey('RR', '${s.rr.toStringAsFixed(2)}', vColor: t.fg),
                      const SizedBox(height: 6),
                      rowKey('포지션', '${r.notionalUsdt.toStringAsFixed(0)} USDT', vColor: t.fg),
                      rowKey('수량', '${s.qty.toStringAsFixed(4)}', vColor: t.fg),
                      rowKey('레버리지', '${s.leverage.toStringAsFixed(1)}x', vColor: t.fg),
                      rowKey('증거금', '${r.marginUsdt.toStringAsFixed(0)} USDT', vColor: t.warn),
                      const SizedBox(height: 6),
                      rowKey('수수료(왕복)', '${(AppSettings.feeRoundTrip * 100).toStringAsFixed(3)}%', vColor: t.muted),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _BlinkBadge extends StatefulWidget {
  final String text;
  final Color color;
  final bool enabled;
  const _BlinkBadge({required this.text, required this.color, required this.enabled});

  @override
  State<_BlinkBadge> createState() => _BlinkBadgeState();
}

class _BlinkBadgeState extends State<_BlinkBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    if (widget.enabled) _ac.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _BlinkBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.enabled && !_ac.isAnimating) {
      _ac.repeat(reverse: true);
    }
    if (!widget.enabled && _ac.isAnimating) {
      _ac.stop();
    }
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.enabled ? _ac : null;
    return AnimatedBuilder(
      animation: a ?? kAlwaysDismissedAnimation,
      builder: (context, _) {
        final blink = widget.enabled ? (0.35 + 0.65 * _ac.value) : 1.0;
        final scale = widget.enabled ? (1.0 + 0.12 * _ac.value) : 1.0;
        return Transform.scale(
          scale: scale,
          child: Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: widget.color.withOpacity(0.10 * blink),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: widget.color.withOpacity(0.60 * blink)),
          ),
          child: Text(widget.text, style: TextStyle(color: widget.color.withOpacity(0.95), fontWeight: FontWeight.w900)),
          ),
        );
      },
    );
  }
}

class _MiniRing extends StatelessWidget {
  final String label;
  final double value; // 0..1
  final Color color;
  const _MiniRing({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final v = value.clamp(0.0, 1.0);
    return SizedBox(
      width: 74,
      child: Column(
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: v),
            duration: const Duration(milliseconds: 850),
            curve: Curves.easeOutCubic,
            builder: (context, vv, _) => CustomPaint(
              size: const Size(44, 44),
              painter: _RingPainter(
                value: vv,
                color: color,
                bg: t.border.withOpacity(0.25),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double value;
  final Color color;
  final Color bg;
  _RingPainter({required this.value, required this.color, required this.bg});

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = (size.width / 2) - 3;
    final pBg = Paint()
      ..color = bg
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final pFg = Paint()
      ..color = color.withOpacity(0.90)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(c, r, pBg);
    final sweep = 6.283185307179586 * value.clamp(0.0, 1.0);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -1.5707963267948966, sweep, false, pFg);
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) {
    return oldDelegate.value != value || oldDelegate.color != color || oldDelegate.bg != bg;
  }
}
class _DecisionBanner extends StatelessWidget {
  const _DecisionBanner({
    required this.actionText,
    required this.isLong,
    required this.showSignal,
  });

  final String actionText;
  final bool isLong;
  final bool showSignal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final border = showSignal
        ? (isLong ? const Color(0xFF37F29C) : const Color(0xFFFF4D6D))
        : const Color(0xFF8AA0FF);
    final bg = border.withOpacity(0.10);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border.withOpacity(0.70), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: border.withOpacity(0.18),
            blurRadius: 18,
            spreadRadius: 0,
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(
            showSignal ? (isLong ? Icons.trending_up : Icons.trending_down) : Icons.visibility,
            color: border,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              actionText,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}


