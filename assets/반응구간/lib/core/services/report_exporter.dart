import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../db/app_db.dart';

class ReportExporter {
  static Future<File> exportCsv30d({String fileName = 'fulink_report_30d.csv'}) async {
    final db = await AppDb.I.db;
    final since = DateTime.now().subtract(const Duration(days: 30)).millisecondsSinceEpoch;

    final rows = await db.rawQuery('''
SELECT o.ts_close, o.result, o.pnl, o.method,
       s.symbol, s.tf, s.dir, s.confidence, s.entry, s.sl, s.tp, s.leverage
FROM outcomes o
JOIN signals s ON s.id=o.signal_id
WHERE o.ts_close >= ?
ORDER BY o.ts_close ASC
''', [since]);

    final buf = StringBuffer();
    buf.writeln('ts_close,result,pnlR,method,symbol,tf,dir,confidence,entry,sl,tp,leverage');
    for (final r in rows) {
      buf.writeln([
        r['ts_close'],
        r['result'],
        r['pnl'],
        r['method'],
        r['symbol'],
        r['tf'],
        r['dir'],
        r['confidence'],
        r['entry'],
        r['sl'],
        r['tp'],
        r['leverage'],
      ].join(','));
    }

    final dir = await getApplicationDocumentsDirectory();
    final f = File('${dir.path}/$fileName');
    await f.writeAsString(buf.toString());
    return f;
  }

  static Future<void> shareFile(File f) async {
    await Share.shareXFiles([XFile(f.path)], text: 'FulinkPro 30일 리포트(CSV)');
  }
}
