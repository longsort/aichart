import 'package:flutter/material.dart';
import '../../data/bitget/bitget_live_store.dart';

class BitgetLiveHeader extends StatefulWidget {
  final String symbol;
  const BitgetLiveHeader({super.key, this.symbol = 'BTCUSDT'});

  @override
  State<BitgetLiveHeader> createState() => _BitgetLiveHeaderState();
}

class _BitgetLiveHeaderState extends State<BitgetLiveHeader> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
    BitgetLiveStore.I.start(symbol: widget.symbol);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = BitgetLiveStore.I;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        children: [
          FadeTransition(
            opacity: Tween(begin: 0.3, end: 1.0).animate(_c),
            child: ValueListenableBuilder<bool>(
              valueListenable: store.online,
              builder: (_, on, __) => Icon(Icons.circle, size: 10, color: on ? Colors.greenAccent : Colors.orangeAccent),
            ),
          ),
          const SizedBox(width: 8),
          Text(widget.symbol, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const Spacer(),
          ValueListenableBuilder(
            valueListenable: store.ticker,
            builder: (_, t, __) {
              final last = t?.last ?? 0.0;
              final chg = t?.change24hPct ?? 0.0;
              final txt = last == 0 ? '--' : last.toStringAsFixed(1);
              final c = chg >= 0 ? Colors.greenAccent : Colors.redAccent;
              return Row(
                children: [
                  Text(txt, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 10),
                  Text('${chg.toStringAsFixed(2)}%', style: TextStyle(color: c, fontSize: 13, fontWeight: FontWeight.bold)),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}