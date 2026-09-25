import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/repository/bitget_public_api.dart';
import '../models/fu_state.dart';

/// 긴 기간 캔들(특히 1D) 전체 로드 + 로컬 캐시.
/// - Bitget candles API는 limit이 작아서 endTime 기반으로 페이징해서 끌어옵니다.
/// - 캐시는 앱 문서 폴더(history_cache) 내 json으로 저장합니다.
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

    // 1) 캐시 로드
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

    // 2) 업데이트 필요 여부
    final now = DateTime.now().toUtc();
    final startMs = startUtc.millisecondsSinceEpoch;
    final needBackfill = cached.isEmpty || cached.first.ts > startMs;
    final needForward = cached.isEmpty || cached.last.ts < now.subtract(const Duration(days: 2)).millisecondsSinceEpoch;

    if (!needBackfill && !needForward) {
      return cached;
    }

    // 3) API 페이징
    // Bitget candles 응답은 (대개) 최신->과거로 내려오므로, 우리는 endTime을 뒤로 밀면서 누적합니다.
    final merged = [...cached];

    // 3-1) 과거 backfill
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
        // 정렬(오름차순)
        parsed.sort((a, b) => a.ts.compareTo(b.ts));

        // 맨 앞에 붙이기
        // dedupe
        final existing = merged.map((e) => e.ts).toSet();
        final toAdd = parsed.where((c) => !existing.contains(c.ts)).toList();
        merged.insertAll(0, toAdd);

        final earliest = merged.first.ts;
        if (earliest <= startMs) break;

        // 다음 루프는 더 과거로
        endTime = earliest;
      }
    }

    // 3-2) 최근 forward (갱신)
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

    // 4) start 컷 + bar 컷
    final out = merged.where((c) => c.ts >= startMs).toList(growable: false);
    final clipped = out.length <= maxBars ? out : out.sublist(out.length - maxBars);

    // 5) 캐시 저장
    try {
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
