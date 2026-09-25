
import 'package:flutter/material.dart';

import '../../core/trade/paper_position.dart';
import '../widgets/neon_theme.dart';
import '../widgets/fx.dart';
import '../widgets/fx_particles_bg.dart';

class PositionScreen extends StatefulWidget {
  final double currentMark;
  final String symbol;
  const PositionScreen({super.key, required this.currentMark, required this.symbol});

  @override
  State<PositionScreen> createState() => _PositionScreenState();
}

class _PositionScreenState extends State<PositionScreen> {
  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final p = PaperTradeStore.position;

    return FxParticlesBg(
      child: FxGlowBg(
        child: Scaffold(
          backgroundColor: t.bg,
          appBar: AppBar(
            backgroundColor: t.bg,
            elevation: 0,
            title: Text('포지션', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
          ),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: p == null ? _empty(t) : _card(t, p),
            ),
          ),
        ),
      ),
    );
  }

  Widget _empty(NeonTheme t) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: t.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: t.border),
          ),
          child: Text('현재 열린 포지션이 없습니다.', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(height: 12),
        InkWell(
          onTap: () {
            // UI(화면) 데모용. 실제 자동매매 아님.
            PaperTradeStore.open(
              symbol: widget.symbol,
              isLong: true,
              qty: 0.0012,
              entry: widget.currentMark,
              mark: widget.currentMark,
              leverage: 34,
              riskPct: 5,
              sl: widget.currentMark - 250,
              tp: widget.currentMark + 500,
            );
            setState(() {});
          },
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: t.bg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: t.border),
            ),
            child: Center(child: Text('데모 포지션 생성', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900))),
          ),
        ),
      ],
    );
  }

  Widget _card(NeonTheme t, PaperPosition p) {
    final side = p.isLong ? 'LONG' : 'SHORT';
    final sl = p.sl;
    final tp = p.tp;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${p.symbol}  |  $side', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text('진입: ${p.entry.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
          Text('현재: ${p.mark.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
          Text('손절: ${sl == null ? '-' : sl.toStringAsFixed(1)}', style: TextStyle(color: t.bad, fontWeight: FontWeight.w900)),
          Text('목표: ${tp == null ? '-' : tp.toStringAsFixed(1)}', style: TextStyle(color: t.good, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () {
                    PaperTradeStore.close();
                    setState(() {});
                  },
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: t.bg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: t.border),
                    ),
                    child: Center(child: Text('닫기', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900))),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
