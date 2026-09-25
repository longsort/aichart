import 'dart:async';
import 'package:flutter/material.dart';
import 'package:ailongshort/services/bitget_market_service.dart';

class LiveBitgetHeader extends StatefulWidget {
  final String symbol;
  final Duration interval;

  const LiveBitgetHeader({
    super.key,
    this.symbol = 'BTCUSDT',
    this.interval = const Duration(seconds: 2),
  });

  @override
  State<LiveBitgetHeader> createState() => _LiveBitgetHeaderState();
}

class _LiveBitgetHeaderState extends State<LiveBitgetHeader> {
  final _svc = BitgetMarketService();
  Timer? _t;
  BitgetTicker? _ticker;
  bool _ok = false;

  @override
  void initState() {
    super.initState();
    _poll();
    _t = Timer.periodic(widget.interval, (_) => _poll());
  }

  Future<void> _poll() async {
    final t = await _svc.fetchTicker(symbol: widget.symbol);
    if (!mounted) return;
    setState(() {
      _ticker = t;
      _ok = t != null;
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    _svc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final last = _ticker?.last;
    final chg = _ticker?.change24hPct;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        children: [
          const _PulseDot(),
          const SizedBox(width: 10),
          Text(widget.symbol, style: const TextStyle(fontWeight: FontWeight.bold)),
          const Spacer(),
          Text(
            last == null ? '--' : last.toStringAsFixed(1),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(width: 10),
          Text(
            chg == null ? '' : '${chg >= 0 ? '+' : ''}${chg.toStringAsFixed(2)}%',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: (chg ?? 0) >= 0 ? Colors.greenAccent : Colors.redAccent,
            ),
          ),
          const SizedBox(width: 10),
          Text(_ok ? 'LIVE' : 'WAIT', style: TextStyle(color: _ok ? Colors.greenAccent : Colors.white70)),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController c;

  @override
  void initState() {
    super.initState();
    c = AnimationController(vsync: this, duration: const Duration(milliseconds: 850))..repeat(reverse: true);
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(c),
      child: const Icon(Icons.circle, size: 10),
    );
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }
}