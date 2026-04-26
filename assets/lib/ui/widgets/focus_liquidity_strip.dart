import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/analysis/structure_marks_engine_fu.dart';
import '../../core/utils/candle_close_util.dart';
import 'neon_theme.dart';

/// 포커스 화면: 유동성 · 균형선 · 강한고저 · 분/시간/일/주/달봉 종가 마감(떠있는 표시)
class FocusLiquidityStrip extends StatelessWidget {
  final FuState s;
  final double livePrice;
  final NeonTheme t;

  static const List<String> _closeTfs = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

  const FocusLiquidityStrip({
    super.key,
    required this.s,
    required this.livePrice,
    required this.t,
  });

  CandleCloseInfo _eval(String tfLabel) => CandleCloseUtil.evaluate(
        tfLabel: tfLabel,
        price: livePrice,
        vwap: s.vwap,
        score: s.score,
        confidence: s.confidence,
        risk: s.risk,
      );

  @override
  Widget build(BuildContext context) {
    final marks = StructureMarksEngineFu.build(s.candles, maxMarks: 16);
    double? strongHigh;
    double? strongLow;
    for (final m in marks.reversed) {
      if (m.tag == 'EQH' && strongHigh == null) strongHigh = m.price;
      if (m.tag == 'EQL' && strongLow == null) strongLow = m.price;
    }
    if (strongHigh == null && s.candles.length >= 10) {
      final recent = s.candles.sublist(s.candles.length - 30);
      strongHigh = recent.map((c) => c.high).reduce((a, b) => a > b ? a : b);
    }
    if (strongLow == null && s.candles.length >= 10) {
      final recent = s.candles.sublist(s.candles.length - 30);
      strongLow = recent.map((c) => c.low).reduce((a, b) => a < b ? a : b);
    }

    final ob = s.obImbalance.clamp(0, 100);
    final tape = s.tapeBuyPct.clamp(0, 100);
    final liquidityBalance = ob == 50 ? '균형' : (ob > 50 ? '매수우세' : '매도우세');

    Color verdictColor(String v) {
      if (v == '좋음') return t.good;
      if (v == '나쁨') return t.bad;
      return t.warn;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.card.withOpacity(0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('유동성 · 균형선 · 강한고저 · 분/시/일/주/달봉 종가 마감', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _chip(t, '유동성', '$liquidityBalance(${ob}%/${tape}%)', t.fg),
              _chip(t, '균형선', s.vwap > 0 ? s.vwap.toStringAsFixed(0) : '—', t.accent),
              if (strongHigh != null) _chip(t, '강한고점', strongHigh!.toStringAsFixed(0), t.bad),
              if (strongLow != null) _chip(t, '강한저점', strongLow!.toStringAsFixed(0), t.good),
              ..._closeTfs.map((tf) {
                final info = _eval(tf);
                return _chip(t, '$tf 마감', '${info.verdict} ${CandleCloseUtil.fmtRemain(info.remaining)}', verdictColor(info.verdict));
              }),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(NeonTheme t, String label, String value, Color valueColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: t.bg.withOpacity(0.5),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.border.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w700)),
          const SizedBox(width: 6),
          Text(value, style: TextStyle(color: valueColor, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
