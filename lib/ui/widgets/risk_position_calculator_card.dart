// Type-safe RiskPositionCalculatorCard (num->double safe)
// Replaces previous implementation to avoid Windows build errors.

import 'package:flutter/material.dart';
import '../../core/services/exchange_ticket.dart';

class RiskPositionCalculatorCard extends StatefulWidget {
  final double riskPct;
  const RiskPositionCalculatorCard({super.key, this.riskPct = 0.05});

  @override
  State<RiskPositionCalculatorCard> createState() => _RiskPositionCalculatorCardState();
}

class _RiskPositionCalculatorCardState extends State<RiskPositionCalculatorCard> {
  final _balance = TextEditingController();
  final _entry = TextEditingController();
  final _stop = TextEditingController();
  final _tp = TextEditingController();
  String _side = 'LONG';

  double _riskUsd = 0.0;
  double _slPct = 0.0;
  double _notional = 0.0;
  double _maxLev = 0.0;
  double _qty = 0.0;

  double _profitUsd = 0.0;
  double _rr = 0.0;

  @override
  void dispose() {
    _balance.dispose();
    _entry.dispose();
    _stop.dispose();
    _tp.dispose();
    super.dispose();
  }

  double _toD(num v) => v.toDouble();
  String f2(num v) => _toD(v).toStringAsFixed(2);
  String f4(num v) => _toD(v).toStringAsFixed(4);

  void _calc() {
    final bal = double.tryParse(_balance.text.trim()) ?? 0;
    final entry = double.tryParse(_entry.text.trim()) ?? 0;
    final stop = double.tryParse(_stop.text.trim()) ?? 0;
    final tp = double.tryParse(_tp.text.trim()) ?? 0;
    if (bal <= 0 || entry <= 0 || stop <= 0) return;

    final riskUsd = bal * widget.riskPct;
    final slPct = ((entry - stop).abs() / entry);
    final safeSl = slPct <= 0 ? 0.0000001 : slPct;

    final notional = riskUsd / safeSl; // ?¬ì???ê·œëª¨
    final maxLev = notional / riskUsd; // = 1/SL%
    final qty = notional / entry;

    // TP/?˜ìµ(? íƒ) + RR
    double profitUsd = 0.0;
    if (tp > 0) {
      if (_side == 'LONG') {
        profitUsd = qty * (tp - entry);
      } else {
        profitUsd = qty * (entry - tp);
      }
    }
    final double rr = (riskUsd > 0.0) ? (profitUsd / riskUsd) : 0.0;

    setState(() {
      _riskUsd = riskUsd;
      _slPct = slPct;
      _notional = notional;
      _maxLev = maxLev;
      _qty = qty;

      _profitUsd = profitUsd;
      _rr = rr;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('RISK 5% ê³„ì‚°', style: TextStyle(fontWeight: FontWeight.w900)),
            const Spacer(),
            _toggle(),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field('?œë“œ(USDT)', _balance)),
            const SizedBox(width: 8),
            Expanded(child: _field('ì§„ìž…ê°€', _entry)),
            const SizedBox(width: 8),
            Expanded(child: _field('?ì ˆê°€', _stop)),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _field('ëª©í‘œê°€(TP)', _tp)),
            const SizedBox(width: 8),
            const Expanded(child: SizedBox()),
            const SizedBox(width: 8),
            const Expanded(child: SizedBox()),
          ]),
          const SizedBox(height: 10),
          ElevatedButton(onPressed: _calc, child: const Text('?ë™ ê³„ì‚°')),
          const SizedBox(height: 10),
          _row('ë¦¬ìŠ¤??USDT)', f2(_riskUsd)),
          _row('?ì ˆ??%)', '${f2(_slPct * 100)}%'),
          _row('?¬ì???ê·œëª¨', f2(_notional)),
          _row('ìµœë? ?ˆë²„', '${f2(_maxLev)}x'),
          _row('?˜ëŸ‰(Qty)', f4(_qty)),
          _row('?ˆìƒ ?˜ìµ(USDT)', f2(_profitUsd)),
          _row('RR(?˜ìµ/ë¦¬ìŠ¤??', f2(_rr)),
          const SizedBox(height: 4),
          const Text('???ˆë²„=1/?ì ˆ?? (?¸ë ˆ?´ë”??', style: TextStyle(fontSize: 11)),
        ]),
      ),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          Expanded(child: Text(k)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w900)),
        ]),
      );

  Widget _toggle() {
    return Row(children: [
      ChoiceChip(
        label: const Text('LONG'),
        selected: _side == 'LONG',
        onSelected: (_) => setState(() => _side = 'LONG'),
      ),
      const SizedBox(width: 6),
      ChoiceChip(
        label: const Text('SHORT'),
        selected: _side == 'SHORT',
        onSelected: (_) => setState(() => _side = 'SHORT'),
      ),
    ]);
  }

  Widget _field(String label, TextEditingController c) {
    return TextField(
      controller: c,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
    );
  }
}
const SizedBox(height: 8),
Row(
  children: [
    Expanded(
      child: OutlinedButton(
        onPressed: () async {
          final txt = ExchangeTicket.build(
            symbol: st.symbol,
            dir: st.signalDir,
            entry: st.entry > 0 ? st.entry : st.price,
            sl: st.stop > 0 ? st.stop : (st.signalDir == 'LONG' ? st.price * 0.99 : st.price * 1.01),
            tp: st.target > 0 ? st.target : (st.signalDir == 'LONG' ? st.price * 1.02 : st.price * 0.98),
            lev: st.leverage > 0 ? st.leverage : st.posLev.toDouble(),
          );
          await ExchangeTicket.copy(txt);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('ê±°ëž˜???°ì¼“ ë³µì‚¬??)));
          }
        },
        child: const Text('?°ì¼“ ë³µì‚¬'),
      ),
    ),
    const SizedBox(width: 8),
    Expanded(
      child: ElevatedButton(
        onPressed: () async {
          await ExchangeTicket.openBitget(st.symbol);
        },
        child: const Text('Bitget ?´ê¸°'),
      ),
    ),
  ],
),

