
import 'package:flutter/material.dart';
import '../../core/utils/candle_close_util.dart';
import 'neon_theme.dart';

class CandleCloseBadgesV1 extends StatelessWidget {
  final List<CandleCloseInfo> infos;
  const CandleCloseBadgesV1({super.key, required this.infos});

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    Color colorFor(String v) {
      if (v == '좋음') return theme.good;
      if (v == '?�쁨') return theme.bad;
      return theme.warn;
    }

    Widget chip(CandleCloseInfo x) {
      return Container(
        margin: const EdgeInsets.only(right: 8, bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: theme.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: theme.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${x.tfLabel} 마감',
                style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900)),
            const SizedBox(width: 8),
            Text(x.verdict, style: TextStyle(color: colorFor(x.verdict), fontWeight: FontWeight.w900, fontSize: 11)),
            const SizedBox(width: 8),
            Text(CandleCloseUtil.fmtRemain(x.remaining),
                style: TextStyle(color: theme.fg, fontSize: 11, fontWeight: FontWeight.w900)),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('마감 체크(?�약)', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Wrap(children: infos.map(chip).toList()),
          Text('???�좋???�쁨?��? 초보??간단?�정. 마감 ?�정 ???�뢰가 ?�라갑니??',
              style: TextStyle(color: theme.muted, fontSize: 12, height: 1.2)),
        ],
      ),
    );
  }
}
