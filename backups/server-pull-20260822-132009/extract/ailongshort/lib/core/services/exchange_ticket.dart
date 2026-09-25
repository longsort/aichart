import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

class ExchangeTicket {
  static String build({
    required String symbol,
    required String dir,
    required double entry,
    required double sl,
    required double tp,
    required double lev,
  }) {
    return '[$symbol]\nDIR:$dir\nENTRY:${entry.toStringAsFixed(2)}\nSL:${sl.toStringAsFixed(2)}\nTP:${tp.toStringAsFixed(2)}\nLEV:${lev.toStringAsFixed(1)}x';
  }

  static Future<void> copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
  }

  // Bitget app/web deep link (best-effort)
  static Future<void> openBitget(String symbol) async {
    final u1 = Uri.parse('https://www.bitget.com/en/futures/usdt/$symbol');
    if (await canLaunchUrl(u1)) {
      await launchUrl(u1, mode: LaunchMode.externalApplication);
    }
  }
}
