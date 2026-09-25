import 'package:flutter/material.dart';

import '../../engine/modules/trade_tape_aggregator_v47.dart';
import '../../services/bitget_api.dart';

class TradeTapeStrengthBoxesV47 extends StatefulWidget {
  final String category;
  final String symbol;
  final double lastPrice;

  const TradeTapeStrengthBoxesV47({
    super.key,
    required this.category,
    required this.symbol,
    required this.lastPrice,
  });

  @override
  State<TradeTapeStrengthBoxesV47> createState() =>
      _TradeTapeStrengthBoxesV47State();
}

class _TradeTapeStrengthBoxesV47State extends State<TradeTapeStrengthBoxesV47> {
  late Future<List<PublicFill>> _future;
  static const double _fixedHeight = 260; // 로딩/전환 시 화면이 밀리는 현상 방지

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  @override
  void didUpdateWidget(covariant TradeTapeStrengthBoxesV47 oldWidget) {
    super.didUpdateWidget(oldWidget);
    // IMPORTANT: Don't refetch on every parent rebuild (lastPrice updates frequently).
    // Refetch only when the data identity changed.
    if (oldWidget.symbol != widget.symbol || oldWidget.category != widget.category) {
      _future = _fetch();
    }
  }

  Future<List<PublicFill>> _fetch() {
    return BitgetApi.getRecentFills(
      category: widget.category,
      symbol: widget.symbol,
      limit: 100,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _fixedHeight,
      child: FutureBuilder<List<PublicFill>>(
      // Use a cached Future so we don't constantly reset into "loading" during periodic UI refreshes.
      future: _future,
      builder: (ctx, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return _loadingCard();
        }
        final fills = snap.data ?? const <PublicFill>[];
        if (fills.isEmpty || widget.lastPrice <= 0) {
          return _card(const Text('체결 데이터 없음', style: TextStyle(color: Colors.white70)));
        }

        final bands = TradeTapeAggregatorV47.aggregate(
          fills,
          lastPrice: widget.lastPrice,
          bandPcnt: 0.001,
          maxBands: 12,
        );
        if (bands.isEmpty) {
          return _card(const Text('체결 밴드 없음', style: TextStyle(color: Colors.white70)));
        }

        final buy = [...bands]..sort((a, b) => (b.buyVol - b.sellVol).compareTo(a.buyVol - a.sellVol));
        final sell = [...bands]..sort((a, b) => (b.sellVol - b.buyVol).compareTo(a.sellVol - a.buyVol));

        final buyTop = buy.take(3).toList();
        final sellTop = sell.take(3).toList();

        return _card(
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('체결 강한 가격대(최근 100체결)',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _sideBox(title: 'BUY 우세', items: buyTop, isBuy: true)),
              const SizedBox(width: 10),
              Expanded(child: _sideBox(title: 'SELL 우세', items: sellTop, isBuy: false)),
            ]),
            const SizedBox(height: 6),
            Text('밴드 폭: 약 ${(widget.lastPrice * 0.001).toStringAsFixed(1)}',
                style: const TextStyle(color: Colors.white54, fontSize: 11)),
          ]),
        );
      },
      ),
    );
  }

  Widget _card(Widget child) {
    return Card(
      color: Colors.black87,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(padding: const EdgeInsets.all(12), child: child),
    );
  }

  /// Fixed-height placeholder so the list doesn't jump when real data arrives.
  Widget _loadingCard() {
    return _card(
      SizedBox(
        height: 155,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '체결강도(PRICE) 불러오는 중...',
              style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: Row(
                children: [
                  Expanded(child: _skeletonSide('BUY 우세')),
                  const SizedBox(width: 12),
                  Expanded(child: _skeletonSide('SELL 우세')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _skeletonSide(String title) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.w900)),
      const SizedBox(height: 6),
      for (int i = 0; i < 2; i++)
        Container(
          height: 44,
          margin: const EdgeInsets.only(bottom: 6),
          decoration: BoxDecoration(
            color: Colors.white10,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white12, width: 1),
          ),
        ),
    ]);
  }

  Widget _sideBox({required String title, required List<TapeBand> items, required bool isBuy}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: TextStyle(color: isBuy ? Colors.greenAccent : Colors.redAccent, fontWeight: FontWeight.w900)),
      const SizedBox(height: 6),
      for (final b in items) _item(b, isBuy),
    ]);
  }

  Widget _item(TapeBand b, bool isBuy) {
    final dom = isBuy ? b.buyPct : b.sellPct;
    final left = b.low.toStringAsFixed(1);
    final right = b.high.toStringAsFixed(1);
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12, width: 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$left ~ $right', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        LinearProgressIndicator(
          value: (dom.clamp(0.0, 100.0)) / 100.0,
          backgroundColor: Colors.white12,
          valueColor: AlwaysStoppedAnimation(isBuy ? Colors.green : Colors.red),
          minHeight: 8,
        ),
        const SizedBox(height: 4),
        Text('${dom.toStringAsFixed(0)}% · trades ${b.trades}',
            style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ]),
    );
  }
}
