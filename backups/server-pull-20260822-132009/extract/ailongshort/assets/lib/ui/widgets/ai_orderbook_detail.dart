import 'package:flutter/material.dart';

/// STEP9: 오더북 상세 카드(숫자/체결/스프레드/불균형)
class AiOrderbookDetail extends StatelessWidget {
  final String bias;
  final String liq;
  final int spreadBp;
  final int imbalanceP;
  final double bidVol;
  final double askVol;
  final int fillsBuyP;
  final int fillsSellP;

  const AiOrderbookDetail({
    super.key,
    required this.bias,
    required this.liq,
    required this.spreadBp,
    required this.imbalanceP,
    required this.bidVol,
    required this.askVol,
    required this.fillsBuyP,
    required this.fillsSellP,
  });

  Color _cBias(String t) {
    if (t.contains('매수')) return const Color(0xFF1EEA6A);
    if (t.contains('매도')) return const Color(0xFFEA2A2A);
    return const Color(0xFF4DA3FF);
  }

  Widget _kv(String k, String v, {Color? c}) {
    return Row(
      children: [
        SizedBox(width: 64, child: Text(k, style: const TextStyle(fontSize: 10))),
        Expanded(
          child: Text(
            v,
            textAlign: TextAlign.right,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: c),
          ),
        ),
      ],
    );
  }

  Widget _bar(String name, int v, Color c) {
    return Row(
      children: [
        SizedBox(width: 64, child: Text(name, style: const TextStyle(fontSize: 10))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (v.clamp(0, 100)) / 100.0,
              minHeight: 8,
              backgroundColor: const Color(0x22FFFFFF),
              valueColor: AlwaysStoppedAnimation<Color>(c),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 34,
          child: Text('$v%',
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
        ),
      ],
    );
  }

  String _fmtVol(double v) {
    if (v >= 1e9) return '${(v / 1e9).toStringAsFixed(2)}B';
    if (v >= 1e6) return '${(v / 1e6).toStringAsFixed(2)}M';
    if (v >= 1e3) return '${(v / 1e3).toStringAsFixed(2)}K';
    return v.toStringAsFixed(0);
  }

  @override
  Widget build(BuildContext context) {
    final cb = _cBias(bias);
    final spreadC = spreadBp >= 6 ? const Color(0xFFEA2A2A) : const Color(0xFF4DA3FF);
    final liqC = liq.contains('높')
        ? const Color(0xFFEA2A2A)
        : (liq.contains('낮') ? const Color(0xFF1EEA6A) : const Color(0xFF4DA3FF));

    final buyOk = fillsBuyP >= 0 && fillsSellP >= 0;
    final buyC = const Color(0xFF1EEA6A);
    final sellC = const Color(0xFFEA2A2A);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('오더북 상세',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),

          _kv('편향', bias, c: cb),
          const SizedBox(height: 4),
          _kv('유동성', liq, c: liqC),
          const SizedBox(height: 4),
          _kv('스프레드', '${spreadBp}bp', c: spreadC),
          const SizedBox(height: 4),
          _kv('불균형', '${imbalanceP}%', c: cb),
          const SizedBox(height: 6),
          _kv('Bid Vol', _fmtVol(bidVol), c: buyC),
          const SizedBox(height: 2),
          _kv('Ask Vol', _fmtVol(askVol), c: sellC),

          const SizedBox(height: 10),

          if (buyOk) ...[
            _bar('체결 매수', fillsBuyP, buyC),
            const SizedBox(height: 6),
            _bar('체결 매도', fillsSellP, sellC),
          ] else ...[
            const Text('체결 데이터 없음(대기중)',
                style: TextStyle(fontSize: 10)),
          ],
        ],
      ),
    );
  }
}
