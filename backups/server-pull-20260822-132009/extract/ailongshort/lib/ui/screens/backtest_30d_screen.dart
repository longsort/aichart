import 'package:flutter/material.dart';
import '../../core/db/app_db.dart';

class Backtest30dScreen extends StatefulWidget {
  const Backtest30dScreen({super.key});
  @override
  State<Backtest30dScreen> createState() => _Backtest30dScreenState();
}

class _Backtest30dScreenState extends State<Backtest30dScreen> {
  Future<_Bt> _load() async {
    final db = await AppDb.I.db;
    final since = DateTime.now().subtract(const Duration(days: 30)).millisecondsSinceEpoch;

    final rows = await db.rawQuery('''
SELECT o.ts_close, o.result, o.pnl, s.symbol, s.tf, s.dir, s.confidence
FROM outcomes o
JOIN signals s ON s.id=o.signal_id
WHERE o.ts_close >= ?
ORDER BY o.ts_close ASC
''', [since]);

    int w=0,l=0; double sum=0; double peak=0; double dd=0;
    final eq = <double>[];
    for (final r in rows) {
      final res = (r['result'] as String?) ?? '';
      final pnl = (r['pnl'] as num?)?.toDouble() ?? 0.0;
      if (res=='WIN') w++;
      if (res=='LOSS') l++;
      sum += pnl;
      eq.add(sum);
      if (sum>peak) peak=sum;
      final curdd = peak - sum;
      if (curdd>dd) dd=curdd;
    }
    final n = w+l;
    final wr = n>0 ? (w/n)*100.0 : 0.0;
    final avg = n>0 ? (sum/n) : 0.0;

    return _Bt(n: n, w: w, l: l, winrate: wr, sumR: sum, avgR: avg, maxDD: dd, equity: eq);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C10),
        title: const Text('30??Î∞±ÌÖå?§Ìä∏(Í∏∞Î°ù Í∏∞Î∞ò)', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: FutureBuilder<_Bt>(
        future: _load(),
        builder: (c,s) {
          if (s.hasError) {
            return Center(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Î∞±ÌÖå?§Ìä∏ ?§Ìå®: ${s.error}', style: const TextStyle(color: Colors.white70)),
            ));
          }
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final d = s.data!;
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              _card('?îÏïΩ', Wrap(spacing: 10, runSpacing: 8, children: [
                _pill('?∏Î†à?¥Îìú ${d.n}'),
                _pill('?πÎ•† ${d.winrate.toStringAsFixed(1)}%'),
                _pill('W/L ${d.w}/${d.l}'),
                _pill('Í∏∞Î?Í∞?${d.avgR.toStringAsFixed(3)}R'),
                _pill('?ÑÏ†Å ${d.sumR.toStringAsFixed(2)}R'),
                _pill('ÏµúÎ?DD ${d.maxDD.toStringAsFixed(2)}R'),
              ])),
              const SizedBox(height: 10),
              _card('?êÌÄ¥Ìã∞(?ÑÏ†ÅR)', SizedBox(
                height: 180,
                child: CustomPaint(painter: _EqPainter(d.equity)),
              )),
              const SizedBox(height: 30),
            ],
          );
        },
      ),
    );
  }

  Widget _card(String title, Widget child) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
      const SizedBox(height: 10),
      child,
    ]),
  );

  Widget _pill(String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
  );
}

class _Bt {
  final int n,w,l;
  final double winrate,sumR,avgR,maxDD;
  final List<double> equity;
  _Bt({required this.n,required this.w,required this.l,required this.winrate,required this.sumR,required this.avgR,required this.maxDD, required this.equity});
}

class _EqPainter extends CustomPainter {
  final List<double> eq;
  _EqPainter(this.eq);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    if (eq.isEmpty) {
      final tp = TextPainter(text: const TextSpan(text: '?∞Ïù¥???ÜÏùå', style: TextStyle(color: Colors.white70)), textDirection: TextDirection.ltr);
      tp.layout();
      tp.paint(canvas, Offset(10, size.height/2 - 8));
      return;
    }
    final minV = eq.reduce((a,b)=>a<b?a:b);
    final maxV = eq.reduce((a,b)=>a>b?a:b);
    final span = (maxV - minV).abs() < 1e-9 ? 1.0 : (maxV - minV);

    Offset map(int i) {
      final x = (i/(eq.length-1)) * size.width;
      final y = size.height - ((eq[i]-minV)/span) * size.height;
      return Offset(x,y);
    }

    final path = Path()..moveTo(map(0).dx, map(0).dy);
    for (int i=1;i<eq.length;i++){
      final o = map(i);
      path.lineTo(o.dx,o.dy);
    }
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant _EqPainter oldDelegate) => oldDelegate.eq != eq;
}
