import 'dart:math';

import 'package:flutter/material.dart';
import 'package:ailongshort/engine/paper/trade_cost_model.dart';
import 'package:ailongshort/engine/paper/paper_trade_engine.dart';
import 'package:ailongshort/engine/risk/risk_sizing.dart';

class AccountProfitTargetsCard extends StatelessWidget {
  final double balance; // (ë¯¸ì‚¬?? ê³¼ê±° ê³„ì¢Œê¸°ì? ?¸í™˜??
  final double entry;
  final double sl;
  final List<double> tps;
  final List<double> prices;


  const AccountProfitTargetsCard({
    super.key,
    required this.balance,
    required this.entry,
    required this.sl,
    required this.tps,
    required this.prices,
  });

double _atrPct(List<double> prices) {
  // ATR% ê·¼ì‚¬: ìµœê·¼ Nê°?ê°€ê²©ì˜ ?‰ê·  ?ˆë?ë³€?”ìœ¨(%) ?¬ìš© (OHLC ?†ì„ ???ˆì •?ì¸ ?€??
  final n = prices.length;
  if (n < 5) return 0.0;
  final N = 14;
  final start = (n - N).clamp(1, n - 1);
  double sum = 0.0;
  int cnt = 0;
  for (int i = start; i < n; i++) {
    final a = prices[i - 1];
    final b = prices[i];
    if (a == 0) continue;
    sum += ((b - a).abs() / a);
    cnt += 1;
  }
  if (cnt == 0) return 0.0;
  return (sum / cnt).clamp(0.0, 0.50); // 0~50%
}

  @override
  Widget build(BuildContext context) {
    if (tps.isEmpty || entry <= 0) return const SizedBox.shrink();

    final s = RiskSizing.size(balance: balance, entry: entry, sl: sl);
    final qty = (s['qty'] ?? 0.0) as double;
    final lev = (s['leverage'] ?? 1) as int;

    final sizeUsd = qty * entry; // notional
    const feePct = 0.0010; // ?•ë³µ ?˜ìˆ˜ë£?ë³´ìˆ˜??

    List<_Line> lines = [];
    for (int i = 0; i < tps.length && i < 3; i++) {
      final tp = tps[i];
      final movePct = ((tp - entry).abs() / entry).clamp(0.0, 1.0);
      final roePct = (movePct * lev - feePct); // ë§¤ë§¤ ê¸°ì? ?˜ìµë¥?ROE)
      final pnlPct = roePct;

      lines.add(_Line(
        label: 'ëª©í‘œ${i + 1}',
        price: tp,
        pnlPct: pnlPct,
      ));
    }

    final tp1 = lines.isNotEmpty ? lines[0].pnlPct : 0.0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ëª©í‘œ ?˜ìµ(ë§¤ë§¤ ê¸°ì?, ?ˆìƒ)',
              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('ê¸°ì?: ?œë“œ 5% ?ì‹¤ + ?ˆë²„ë¦¬ì? ?ë™ ê³„ì‚° + ?˜ìˆ˜ë£??¬í•¨',
              style: TextStyle(color: Colors.white54, fontSize: 11)),
          const SizedBox(height: 10),
          ...lines.map((e) => _row(e)),
          const SizedBox(height: 8),
          const SizedBox(height: 8),
          Text(_hint(tp1),
              style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _row(_Line e) {
    final pct = (e.pnlPct * 100);
    final tag = _tag(pct);

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 60, child: Text(e.label, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Expanded(
            child: Text('${e.price.toStringAsFixed(2)}',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
          Text('${pct.toStringAsFixed(1)}%',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(tag, style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  String _tag(double pct) {
    if (pct >= 30) return 'ê°?;
    if (pct >= 20) return 'ì¢‹ìŒ';
    if (pct >= 10) return 'ê°€??;
    if (pct > 0) return '?‘ìŒ';
    return '?„í—˜';
  }

  String _hint(double tp1Pct01) {
    final p = tp1Pct01 * 100;
    if (p >= 10 && p <= 30) {
      return '??ëª©í‘œ1???œí˜„?¤ì (10~30%)??êµ¬ê°„?…ë‹ˆ??';
    }
    if (p < 10 && p > 0) {
      return '? ï¸ ëª©í‘œ1 ?˜ìµ??10% ë¯¸ë§Œ?…ë‹ˆ?? (?˜ìˆ˜ë£??¬ë¦¬?¼ì? ê³ ë ¤) ëª©í‘œ2ê¹Œì? ë´ë„ ?©ë‹ˆ??';
    }
    if (p > 30) {
      return '? ï¸ ëª©í‘œ1 ?˜ìµ??30% ì´ˆê³¼?…ë‹ˆ?? ?ˆë¬´ ?•ì‹¬?´ë©´ ëª©í‘œë¥???¶°???©ë‹ˆ??';
    }
    return '? ï¸ ?˜ìµ/?„í—˜ ê³„ì‚°??ë¹„ì •?ì…?ˆë‹¤. ì§„ì…/?ì ˆ ê°’ì„ ?•ì¸?˜ì„¸??';
  }
}

class _Line {
  final String label;
  final double price;
  final double pnlPct;

  _Line({
    required this.label,
    required this.price,
    required this.pnlPct,
  });
}