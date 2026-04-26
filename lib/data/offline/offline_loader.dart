import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

class OfflineLoadResult {
  final Map<String, int> rowsByFile;
  final List<String> missing;
  final String folder;
  OfflineLoadResult({required this.rowsByFile, required this.missing, required this.folder});
}

class OfflineLoader {
  OfflineLoader._();
  static final OfflineLoader I = OfflineLoader._();

  final ValueNotifier<OfflineLoadResult?> last = ValueNotifier(null);

  /// Î¨∏ÏÑú?¥Îçî/fulink_data ?ÑÎûò CSV?§ÏùÑ ?ΩÏñ¥??"Ï°¥Ïû¨/?âÏàò"Îß?Í≤Ä?¨Ìïú??
  Future<OfflineLoadResult> load({required String symbol}) async {
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory('${dir.path}/fulink_data');
    if (!folder.existsSync()) folder.createSync(recursive: true);

    final expected = <String>[
      '${symbol}_1m.csv',
      '${symbol}_5m_part1.csv',
      '${symbol}_5m_part2.csv',
      '${symbol}_15m.csv',
      '${symbol}_1h.csv',
      '${symbol}_4h.csv',
      '${symbol}_1d.csv',
      '${symbol}_1w.csv',
      '${symbol}_funding.csv',
      '${symbol}_oi_1h.csv',
      '${symbol}_bigtrades_cvd_part1.csv',
    ];

    final rows = <String, int>{};
    final missing = <String>[];

    for (final name in expected) {
      final f = File('${folder.path}/$name');
      if (!f.existsSync()) {
        missing.add(name);
        continue;
      }
      // Îπ†Î•∏ ?âÏàò(Î©îÎ™®Î¶??àÏïΩ): ?ºÏù∏ ?òÎßå ?ºÎã§
      int cnt = 0;
      try {
        final stream = f.openRead().transform(const SystemEncoding().decoder).transform(const LineSplitter());
        await for (final _ in stream) {
          cnt++;
          if (cnt > 2000000) break; // Í≥ºÎèÑ Î∞©Ï?
        }
      } catch (_) {
        // fallback
        cnt = await f.readAsLines().then((v) => v.length);
      }
      rows[name] = cnt;
    }

    final res = OfflineLoadResult(rowsByFile: rows, missing: missing, folder: folder.path);
    last.value = res;
    return res;
  }
}
