import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/repository/bitget_public_api.dart';
import '../models/fu_state.dart';

/// ê¸?ê¸°ê°„ ìº”ë“¤(?¹íˆ 1D) ?„ì²´ ë¡œë“œ + ë¡œì»¬ ìºì‹œ.
/// - Bitget candles API??limit???‘ì•„??endTime ê¸°ë°˜?¼ë¡œ ?˜ì´ì§•í•´???Œì–´?µë‹ˆ??
/// - ìºì‹œ????ë¬¸ì„œ ?´ë”(history_cache) ??json?¼ë¡œ ?€?¥í•©?ˆë‹¤.
class BitgetHistoryService {
  BitgetHistoryService(this._api);
  final BitgetPublicApi _api;

  static const _cacheDirName = 'history_cache';

  Future<List<FuCandle>> load1D(
    String symbol, {
    required DateTime startUtc,
    int maxBars = 8000,
    bool forceRefresh = false,
  }) async {
    final cacheFile = await _cacheFile(symbol, '1D');

    // 1) ìºì‹œ ë¡œë“œ
    List<FuCandle> cached = const [];
    if (!forceRefresh && await cacheFile.exists()) {
      try {
        final txt = await cacheFile.readAsString();
        final j = jsonDecode(txt);
        if (j is List) {
          cached = j
              .whereType<List>()
              .map((e) => FuCandle(
                    ts: (e[0] as num).toInt(),
                    o: (e[1] as num).toDouble(),
                    h: (e[2] as num).toDouble(),
                    l: (e[3] as num).toDouble(),
                    c: (e[4] as num).toDouble(),
                    v: (e[5] as num).toDouble(),
                  ))
              .toList(growable: false);
        }
      } catch (_) {
        cached = const [];
      }
    }

    // 2) ?…ë°?´íŠ¸ ?„ìš” ?¬ë?
    final now = DateTime.now().toUtc();
    final startMs = startUtc.millisecondsSinceEpoch;
    final needBackfill = cached.isEmpty || cached.first.ts > startMs;
    final needForward = cached.isEmpty || cached.last.ts < now.subtract(const Duration(days: 2)).millisecondsSinceEpoch;

    if (!needBackfill && !needForward) {
      return cached;
    }

    // 3) API ?˜ì´ì§?    // Bitget candles ?‘ë‹µ?€ (?€ê°? ìµœì‹ ->ê³¼ê±°ë¡??´ë ¤?¤ë?ë¡? ?°ë¦¬??endTime???¤ë¡œ ë°€ë©´ì„œ ?„ì ?©ë‹ˆ??
    final merged = [...cached];

    // 3-1) ê³¼ê±° backfill
    if (needBackfill) {
      int? endTime = (cached.isEmpty ? null : cached.first.ts);
      while (merged.length < maxBars) {
        final raw = await _api.candles(
          symbol: symbol,
          granularity: '1D',
          limit: 400,
          productType: 'USDT-FUTURES',
          endTime: endTime,
        );
        if (raw.isEmpty) break;

        final parsed = _parse(raw);
        // ?•ë ¬(?¤ë¦„ì°¨ìˆœ)
        parsed.sort((a, b) => a.ts.compareTo(b.ts));

        // ë§??ì— ë¶™ì´ê¸?        // dedupe
        final existing = merged.map((e) => e.ts).toSet();
        final toAdd = parsed.where((c) => !existing.contains(c.ts)).toList();
        merged.insertAll(0, toAdd);

        final earliest = merged.first.ts;
        if (earliest <= startMs) break;

        // ?¤ìŒ ë£¨í”„????ê³¼ê±°ë¡?        endTime = earliest;
      }
    }

    // 3-2) ìµœê·¼ forward (ê°±ì‹ )
    if (needForward) {
      final raw = await _api.candles(
        symbol: symbol,
        granularity: '1D',
        limit: 400,
        productType: 'USDT-FUTURES',
      );
      final parsed = _parse(raw);
      parsed.sort((a, b) => a.ts.compareTo(b.ts));
      final existing = merged.map((e) => e.ts).toSet();
      for (final c in parsed) {
        if (!existing.contains(c.ts)) merged.add(c);
      }
      merged.sort((a, b) => a.ts.compareTo(b.ts));
    }

    // 4) start ì»?+ bar ì»?    final out = merged.where((c) => c.ts >= startMs).toList(growable: false);
    final clipped = out.length <= maxBars ? out : out.sublist(out.length - maxBars);

    // 5) ìºì‹œ ?€??    try {
      final encoded = jsonEncode(clipped
          .map((c) => [c.ts, c.o, c.h, c.l, c.c, c.v])
          .toList(growable: false));
      await cacheFile.writeAsString(encoded, flush: true);
    } catch (_) {}

    return clipped;
  }

  List<FuCandle> _parse(List<List<num>> raw) {
    // Bitget: [ts, open, high, low, close, vol, ...]
    return raw.map((r) {
      return FuCandle(
        ts: (r[0] as num).toInt(),
        o: (r[1] as num).toDouble(),
        h: (r[2] as num).toDouble(),
        l: (r[3] as num).toDouble(),
        c: (r[4] as num).toDouble(),
        v: (r.length > 5 ? (r[5] as num).toDouble() : 0.0),
      );
    }).toList(growable: false);
  }

  Future<File> _cacheFile(String symbol, String tf) async {
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory(p.join(dir.path, _cacheDirName));
    if (!await folder.exists()) {
      await folder.create(recursive: true);
    }
    final safe = symbol.replaceAll('/', '_').replaceAll(':', '_');
    return File(p.join(folder.path, '${safe}_$tf.json'));
  }
}
