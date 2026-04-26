
import 'package:flutter/material.dart';
import '../../core/trade/paper_position.dart';
import 'neon_theme.dart';

class PositionCardV1 extends StatelessWidget {
  final PaperPosition p;
  const PositionCardV1({super.key, required this.p});

  String fmt(double v, {int f=2}) => v.isNaN || v.isInfinite ? '-' : v.toStringAsFixed(f);

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final side = p.isLong ? 'Long' : 'Short';
    final sideCol = p.isLong ? t.good : t.bad;
    final pnlCol = p.pnl >= 0 ? t.good : t.bad;

    return Container(
      padding: const EdgeInsets.all(14),
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
              Text(p.symbol, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: sideCol.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: sideCol.withOpacity(0.35)),
                ),
                child: Text(side, style: TextStyle(color: sideCol, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: t.bg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: t.border),
                ),
                child: Text('${fmt(p.leverage, f:0)}X', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
              ),
              const Spacer(),
              Text('포지션 진입됨', style: TextStyle(color: t.warn, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(child: _kv(t, '미실현 손익(USDT)', '${p.pnl>=0?'+':''}${fmt(p.pnl, f:4)}', pnlCol)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, 'ROI', '${p.roiPct>=0?'+':''}${fmt(p.roiPct, f:2)}%', pnlCol)),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(child: _kv(t, '수량(BTC)', fmt(p.qty, f:4), t.fg)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, '증거금(USDT)', fmt(p.margin, f:4), t.fg)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, '증거금 비율', '${fmt(p.marginRatePct, f:2)}%', t.fg)),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(child: _kv(t, '진입가', fmt(p.entry, f:1), t.fg)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, '마크가', fmt(p.mark, f:1), t.fg)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, '예상 청산가', fmt(p.liq, f:1), t.warn)),
            ],
          ),
          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(child: _kv(t, 'TP', p.tp == null ? '--' : fmt(p.tp!, f:1), t.good)),
              const SizedBox(width: 10),
              Expanded(child: _kv(t, 'SL', p.sl == null ? '--' : fmt(p.sl!, f:1), t.bad)),
            ],
          ),
          const SizedBox(height: 14),

          Row(
            children: [
              Expanded(child: _btn(context, t, 'TP/SL', Icons.edit, () {})),
              const SizedBox(width: 10),
              Expanded(child: _btn(context, t, '추가', Icons.add, () {})),
              const SizedBox(width: 10),
              Expanded(child: _btn(context, t, '닫기', Icons.close, () {
                PaperTradeStore.close();
                Navigator.pop(context);
              })),
            ],
          ),
          const SizedBox(height: 6),
          Text('※ 현재는 “페이퍼 포지션(시뮬레이션)” 화면입니다. 실제 주문 연동은 옵션으로 분리합니다.',
              style: TextStyle(color: t.muted, fontSize: 11, height: 1.2)),
        ],
      ),
    );
  }

  Widget _kv(NeonTheme t, String k, String v, Color vc) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(k, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(v, style: TextStyle(color: vc, fontSize: 15, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _btn(BuildContext context, NeonTheme t, String txt, IconData ic, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: t.bg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: t.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(ic, color: t.fg, size: 18),
            const SizedBox(width: 8),
            Text(txt, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}
