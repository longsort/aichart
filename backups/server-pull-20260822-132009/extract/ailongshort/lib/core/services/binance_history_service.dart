import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Binance Í≥ºÍ±∞ Ï∫îÎì§(klines) ?êÎèô ?òÏßë ?úÎπÑ??/// - ???¥Î??êÏÑú 3?ÑÏπò(?îÏ≤≠) ?∞Ïù¥?∞Î? Î∂ÑÌï† ?§Ïö¥Î°úÎìú
/// - Ï§ëÎã®/?¨Ïãú?????¥Ïñ¥Î∞õÍ∏∞(resume)
/// - ?Ä?•Ï? Î°úÏª¨ CSV + Î©îÌ?(JSON)
class BinanceHistoryService {
  BinanceHistoryService._();
  static final BinanceHistoryService I = BinanceHistoryService._();

  static const _base = 'https://api.binance.com/api/v3/klines';

  /// ÏßÑÌñâÎ•? 0.0~1.0
  final ValueNotifier<double> progress = ValueNotifier<double>(0);
  final ValueNotifier<String> status = ValueNotifier<String>('?ÄÍ∏?);
  final ValueNotifier<bool> running = ValueNotifier<bool>(false);

  bool _cancel = false;

  void cancel() {
    _cancel = true;
  }

  Future<Directory> _rootDir() async {
    // ?∞Ïä§?¨ÌÉë(?àÎèÑ???êÏÑú???ôÏûë?òÎèÑÎ°? Í∞Ä?•ÌïòÎ©?Î¨∏ÏÑú ?îÎ†â?∞Î¶¨ ?¨Ïö©
    try {
      final d = await getApplicationDocumentsDirectory();
      final dir = Directory(p.join(d.path, 'FulinkPro', 'history'));
      if (!dir.existsSync()) dir.createSync(recursive: true);
      return dir;
    } catch (_) {
      final cwd = Directory.current;
      final dir = Directory(p.join(cwd.path, 'data', 'history'));
      if (!dir.existsSync()) dir.createSync(recursive: true);
      return dir;
    }
  }

  String _toBinanceInterval(String tf) {
    switch (tf) {
      case '5m':
      case '15m':
      case '1h':
      case '4h':
        return tf;
      case '1D':
        return '1d';
      case '1W':
        return '1w';
      case '1M':
        return '1M';
      default:
        return '15m';
    }
  }

  int _tfMillis(String tf) {
    switch (tf) {
      case '5m':
        return 5 * 60 * 1000;
      case '15m':
        return 15 * 60 * 1000;
      case '1h':
        return 60 * 60 * 1000;
      case '4h':
        return 4 * 60 * 60 * 1000;
      case '1D':
        return 24 * 60 * 60 * 1000;
      case '1W':
        return 7 * 24 * 60 * 60 * 1000;
      case '1M':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 15 * 60 * 1000;
    }
  }

  /// 3?ÑÏπò ?êÎèô ?òÏßë(?îÏ≤≠ Í∏∞Ï?)
  /// - Í∏∞Î≥∏: BTCUSDT 15m + 1D
  Future<void> download3y({
    String symbol = 'BTCUSDT',
    List<String> tfs = const ['15m', '1D'],
  }) async {
    if (running.value) return;
    running.value = true;
    _cancel = false;
    progress.value = 0;
    status.value = 'Ï§ÄÎπ?;

    try {
      final dir = await _rootDir();
      final now = DateTime.now().toUtc().millisecondsSinceEpoch;
      final start = DateTime.now().toUtc().subtract(const Duration(days: 365 * 3)).millisecondsSinceEpoch;

      // ÏßÑÌñâÎ•?Î∂ÑÎ∞∞(15m???ÄÎ∂ÄÎ∂?
      final weights = <String, double>{};
      double totalW = 0;
      for (final tf in tfs) {
        final w = tf == '15m' ? 0.9 : 0.1;
        weights[tf] = w;
        totalW += w;
      }

      double doneW = 0;
      for (final tf in tfs) {
        if (_cancel) break;
        final w = (weights[tf] ?? 1) / totalW;
        await _downloadTf(symbol: symbol, tf: tf, dir: dir, startMs: start, endMs: now, baseProgress: doneW, weight: w);
        doneW += w;
        progress.value = doneW.clamp(0, 1);
      }

      if (_cancel) {
        status.value = 'Ï∑®ÏÜå??;
      } else {
        status.value = '?ÑÎ£å';
        progress.value = 1.0;
      }
    } catch (e) {
      status.value = '?§Ìå®: $e';
    } finally {
      running.value = false;
    }
  }

  Future<void> _downloadTf({
    required String symbol,
    required String tf,
    required Directory dir,
    required int startMs,
    required int endMs,
    required double baseProgress,
    required double weight,
  }) async {
    final interval = _toBinanceInterval(tf);
    final tfMs = _tfMillis(tf);
    final csvPath = p.join(dir.path, '${symbol}_$tf.csv');
    final metaPath = p.join(dir.path, '${symbol}_$tf.meta.json');

    int cursor = startMs;
    // resume: meta??lastEndÍ∞Ä ?àÏúºÎ©?Í±∞Í∏∞???¥Ïñ¥Î∞õÍ∏∞
    if (File(metaPath).existsSync()) {
      try {
        final m = jsonDecode(File(metaPath).readAsStringSync());
        final last = (m is Map && m['lastCloseTime'] is int) ? (m['lastCloseTime'] as int) : null;
        if (last != null && last > cursor) {
          cursor = (last + tfMs).clamp(startMs, endMs);
        }
      } catch (_) {}
    }

    final csvFile = File(csvPath);
    final hasHeader = csvFile.existsSync() && csvFile.lengthSync() > 0;
    final sink = csvFile.openWrite(mode: FileMode.append);
    if (!hasHeader) {
      sink.writeln('timestamp,open,high,low,close,volume');
    }

    status.value = '$tf Í≥ºÍ±∞ ?§Ïö¥Î°úÎìú';

    int totalSteps = ((endMs - startMs) / (tfMs * 1000)).ceil();
    if (totalSteps <= 0) totalSteps = 1;
    int step = ((cursor - startMs) / (tfMs * 1000)).floor().clamp(0, totalSteps);

    while (cursor <= endMs && !_cancel) {
      // limit=1000Î°?startTimeÎ∂Ä??      final uri = Uri.parse(_base).replace(queryParameters: {
        'symbol': symbol,
        'interval': interval,
        'startTime': cursor.toString(),
        'limit': '1000',
      });

      final res = await http.get(uri, headers: {'Accept': 'application/json'});
      if (res.statusCode != 200) {
        throw StateError('Binance ?ëÎãµ ?§Î•ò(${res.statusCode}): ${res.body}');
      }
      final list = jsonDecode(res.body);
      if (list is! List || list.isEmpty) break;

      int lastCloseTime = cursor;
      for (final row in list) {
        // [ openTime, open, high, low, close, volume, closeTime, ... ]
        if (row is List && row.length >= 7) {
          final openTime = row[0] as int;
          final open = row[1].toString();
          final high = row[2].toString();
          final low = row[3].toString();
          final close = row[4].toString();
          final vol = row[5].toString();
          final closeTime = row[6] as int;
          lastCloseTime = closeTime;

          // endMs ?òÏúºÎ©??Ä??Ï§ëÎã®
          if (openTime > endMs) break;

          sink.writeln('$openTime,$open,$high,$low,$close,$vol');
        }
      }
      await sink.flush();

      // meta ?Ä??      File(metaPath).writeAsStringSync(jsonEncode({
        'symbol': symbol,
        'tf': tf,
        'interval': interval,
        'lastCloseTime': lastCloseTime,
        'updatedAt': DateTime.now().toUtc().millisecondsSinceEpoch,
      }));

      cursor = lastCloseTime + tfMs;
      step += 1000;
      final pLocal = ((cursor - startMs) / (endMs - startMs)).clamp(0.0, 1.0);
      progress.value = (baseProgress + weight * pLocal).clamp(0.0, 1.0);

      // rate limit Î≥¥Ìò∏
      await Future.delayed(const Duration(milliseconds: 220));
    }

    await sink.close();
  }
}
