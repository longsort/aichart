import 'package:flutter/material.dart';
import '../../data/market/market_store.dart';
import '../../data/market/exchange.dart';
import '../../data/market/market_ticker.dart';

class MarketLiveHeader extends StatelessWidget {
  const MarketLiveHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<MarketTicker>(
      valueListenable: MarketStore.I.ticker,
      builder: (_, t, __) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white12),
          ),
          child: Row(
            children: [
              Expanded(
                child: ValueListenableBuilder<Exchange>(
                  valueListenable: MarketStore.I.exchange,
                  builder: (_, ex, __) {
                    final conn = t.connected ? '?°ê²°?? : '?°ê²°ì¤?;
                    return Text('${ex.label} ??${t.symbol} ??$conn',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                        overflow: TextOverflow.ellipsis);
                  },
                ),
              ),
              Text(t.last <= 0 ? '--' : t.last.toStringAsFixed(1),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(width: 8),
              InkWell(
                onTap: () => _open(context),
                child: const Icon(Icons.swap_horiz, color: Colors.white70, size: 18),
              ),
            ],
          ),
        );
      },
    );
  }

  void _open(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.black,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _tile(context, 'BINANCE', Exchange.binance),
              _tile(context, 'BITGET', Exchange.bitget),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, String title, Exchange ex) {
    return ListTile(
      title: Text(title, style: const TextStyle(color: Colors.white)),
      onTap: () {
        MarketStore.I.setExchange(ex);
        Navigator.pop(context);
      },
    );
  }
}
