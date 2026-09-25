import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import 'neon_theme.dart';

/// ??메인 ?�체 기능???�나�?묶�? **?�합 롱숏 결정 ?�정** ?�널.
/// - 결정(�???관�? · ?�신 · 게이??· 진입/?�절/목표 · 근거�????�면???�시.
class UnifiedDecisionPanel extends StatelessWidget {
  final FuState state;
  final double? livePrice;
  final String? symbol;

  const UnifiedDecisionPanel({
    super.key,
    required this.state,
    this.livePrice,
    this.symbol,
  });

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final s = state;
    final dir = (s.pLocked && s.pLockDir != 'NO' ? s.pLockDir : s.signalDir).toUpperCase();
    final isLong = dir.contains('LONG');
    final isShort = dir.contains('SHORT');
    final dirKo = isLong ? '�? : (isShort ? '?? : '관�?);
    final c = isLong ? t.good : (isShort ? t.bad : t.muted);
    final conf = s.confidence.clamp(0, 100);
    final isNoTrade = s.locked || s.decisionTitle.toUpperCase().contains('NO-TRADE');
    final gateLabel = isNoTrade ? '거래금�?' : '진입가??;
    final gateColor = isNoTrade ? t.bad : t.good;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.withOpacity(0.4)),
        boxShadow: [
          BoxShadow(color: c.withOpacity(0.1), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // ?�목
          Row(
            children: [
              Text('?�합 롱숏 결정 ?�정', style: TextStyle(color: t.textStrong, fontSize: 14, fontWeight: FontWeight.w900)),
              const Spacer(),
              if (symbol != null && symbol!.isNotEmpty)
                Text(symbol!, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 12),

          // 1) 결정 · ?�신 · 게이??(??�?
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: c.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: c.withOpacity(0.4)),
            ),
            child: Row(
              children: [
                Text('결정: ', style: TextStyle(color: t.muted, fontSize: 13, fontWeight: FontWeight.w700)),
                Text(dirKo, style: TextStyle(color: c, fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(width: 12),
                Text('· ?�신 ', style: TextStyle(color: t.muted, fontSize: 13, fontWeight: FontWeight.w700)),
                Text('$conf%', style: TextStyle(color: c, fontSize: 16, fontWeight: FontWeight.w900)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: gateColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: gateColor.withOpacity(0.6)),
                  ),
                  child: Text('게이?? $gateLabel', style: TextStyle(color: gateColor, fontSize: 12, fontWeight: FontWeight.w900)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // 2) 진입 · ?�절 · 목표
          Row(
            children: [
              _kv(t, '진입', _fmt(s.entry)),
              const SizedBox(width: 12),
              _kv(t, '?�절', _fmt(s.stop)),
              const SizedBox(width: 12),
              _kv(t, '목표', _fmt(s.target)),
              const Spacer(),
              if (s.leverage > 0) Text('?�버 ${s.leverage.toStringAsFixed(1)}x', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),

          // 3) 근거 · ?�의/ROI
          Row(
            children: [
              Text('근거 ', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
              Text('${s.evidenceHit}/${s.evidenceTotal}', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(width: 10),
              if (!s.consensusOk) _smallPill(t, '?�의부�?, t.bad),
              if (!s.consensusOk) const SizedBox(width: 6),
              if (!s.roiOk) _smallPill(t, 'ROI부�?, t.bad),
              const Spacer(),
              Text(conf >= 75 ? '믿을 만함' : (conf >= 50 ? '참고' : '??��'), style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w600)),
            ],
          ),
          if (s.signalKo.isNotEmpty || s.finalDecisionReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              s.signalKo.isNotEmpty ? s.signalKo : s.finalDecisionReason,
              style: TextStyle(color: t.muted, fontSize: 11, height: 1.25),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          if (livePrice != null && livePrice! > 0) ...[
            const SizedBox(height: 6),
            Text('?�재가 ${livePrice!.toStringAsFixed(0)} (거래???�동)', style: TextStyle(color: t.muted.withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }

  String _fmt(double v) => v.isFinite && v > 0 ? v.toStringAsFixed(0) : '-';

  Widget _kv(NeonTheme t, String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
      ],
    );
  }

  Widget _smallPill(NeonTheme t, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}
