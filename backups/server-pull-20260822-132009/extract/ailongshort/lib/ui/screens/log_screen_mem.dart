
import 'package:flutter/material.dart';
import '../../core/log/signal_log_store.dart';
import '../../core/log/signal_log.dart';
import '../widgets/neon_theme.dart';

class LogScreenMem extends StatefulWidget {
  const LogScreenMem({super.key});

  @override
  State<LogScreenMem> createState() => _LogScreenMemState();
}

class _LogScreenMemState extends State<LogScreenMem> {
  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final logs = SignalLogStore.logs;

    final st = SignalLogStore.stats(limit: 500);
    final wr = st['winRate'] ?? 0;
    final win = st['win'] ?? 0;
    final loss = st['loss'] ?? 0;
    final open = st['open'] ?? 0;

    return Scaffold(
      backgroundColor: t.bg,
      appBar: AppBar(
        backgroundColor: t.bg,
        elevation: 0,
        title: Text('?†Ìò∏ Í∏∞Î°ù(?ÑÏãú)', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            _stats(t, wr, win, loss, open),
            const SizedBox(height: 10),
            if (logs.isEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: t.border),
                ),
                child: Text('?ÑÏßÅ Í∏∞Î°ù???ÜÏäµ?àÎã§.\n?†Ìò∏Í∞Ä ?®Î©¥ ?êÎèô?ºÎ°ú ?Ä?•Îê©?àÎã§.',
                    style: TextStyle(color: t.muted, height: 1.25)),
              ),
            for (final x in logs.reversed) ...[
              const SizedBox(height: 10),
              _row(t, x),
            ],
          ],
        ),
      ),
    );
  }

  Widget _stats(NeonTheme t, int wr, int win, int loss, int open) {
    Color c() {
      if (wr >= 60) return t.good;
      if (wr >= 45) return t.warn;
      return t.bad;
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Row(
        children: [
          Text('?πÎ•†', style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
          const SizedBox(width: 10),
          Text('$wr%', style: TextStyle(color: c(), fontWeight: FontWeight.w900, fontSize: 20)),
          const Spacer(),
          Text('W $win / L $loss / O $open', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _row(NeonTheme t, SignalLog x) {
    final isLong = x.dir == 'LONG';
    final sideCol = isLong ? t.good : t.bad;
    final resCol = x.result == 'WIN' ? t.good : (x.result == 'LOSS' ? t.bad : t.warn);
    final resText = x.result == 'WIN' ? '?±Í≥µ' : (x.result == 'LOSS' ? '?§Ìå®' : 'ÏßÑÌñâÏ§?);

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
              Text(x.symbol, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: sideCol.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: sideCol.withOpacity(0.35)),
                ),
                child: Text(isLong ? '?ÅÏäπ' : '?òÎùΩ', style: TextStyle(color: sideCol, fontWeight: FontWeight.w900, fontSize: 12)),
              ),
              const Spacer(),
              Text(resText, style: TextStyle(color: resCol, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Text('?ïÎ•† ${x.prob}% | Í∑ºÍ±∞ ${x.evidenceHit}/${x.evidenceTotal} | ?ÑÌóò ${x.risk}',
              style: TextStyle(color: t.muted, fontWeight: FontWeight.w900, fontSize: 12)),
          const SizedBox(height: 8),
          Text('ÏßÑÏûÖ ${x.entry.toStringAsFixed(1)}  ¬∑  ?êÏ†à ${x.sl.toStringAsFixed(1)}  ¬∑  Î™©Ìëú ${x.tp.toStringAsFixed(1)}',
              style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 13)),
          const SizedBox(height: 6),
          Text('?òÎüâ ${x.qty.toStringAsFixed(4)} BTC  ¬∑  ?àÎ≤ÑÎ¶¨Ï? ${x.leverage.toStringAsFixed(0)}x',
              style: TextStyle(color: t.muted, fontWeight: FontWeight.w900, fontSize: 12)),
        ],
      ),
    );
  }
}
