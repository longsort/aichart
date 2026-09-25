import 'dart:math';

import 'fu_bitget_api.dart';

/// STEP 6+7: ë¹„íŠ¸ê²??¤ë”ë¶?ì²´ê²° ê¸°ë°˜ ?¤ë”?Œë¡œ???”ì•½ ??dto(Map)??ì£¼ì…
/// - dtoê°€ Map?´ë©´ ?ë™ ?™ì‘
/// - dto??'bitgetApi' ?†ìœ¼ë©?FuBitgetApië¥??ë™ ?ì„±/ì£¼ì…(ê³µê°œ API)
class BitgetOrderflowService {
  static Future<void> injectToDto(Map<String, dynamic> dto,
      {int depth = 20, int fills = 80}) async {
    // STEP7: ?ë™ ì£¼ì…
    dto['bitgetApi'] ??= FuBitgetApi();

    final api = dto['bitgetApi'];
    final symbol = (dto['symbol'] as String?) ?? 'BTCUSDT';
    if (api == null) return;

    dynamic ob;
    dynamic trades;

    try {
      ob = await (api as dynamic).getOrderBook(symbol: symbol, limit: depth);
    } catch (_) {
      try {
        ob = await (api as dynamic).getOrderBook(symbol, depth);
      } catch (_) {}
    }

    try {
      trades = await (api as dynamic).getRecentFills(symbol: symbol, limit: fills);
    } catch (_) {
      try {
        trades = await (api as dynamic).getRecentFills(symbol, fills);
      } catch (_) {}
    }

    if (ob == null) return;

    // ?¤ì–‘???‘ë‹µ ?•íƒœ ?€??(Bitget v2??data ?ˆì— bids/asksê°€ ?¤ì–´?¤ëŠ” ì¼€?´ìŠ¤ ë§ìŒ)
    final root = (ob is Map && ob['data'] is Map) ? ob['data'] : ob;

    final bids = _extractLevels(root, 'bids') ?? const <List<double>>[];
    final asks = _extractLevels(root, 'asks') ?? const <List<double>>[];

    if (bids.isEmpty || asks.isEmpty) return;

    final bidVol = bids.take(depth).fold<double>(0, (a, e) => a + e[1]);
    final askVol = asks.take(depth).fold<double>(0, (a, e) => a + e[1]);

    final bestBid = bids.first[0];
    final bestAsk = asks.first[0];
    final mid = (bestBid + bestAsk) / 2.0;
    final spreadBp = mid == 0 ? 0.0 : ((bestAsk - bestBid) / mid) * 10000.0;

    String bias = 'ì¤‘ë¦½';
    final ratio = askVol == 0 ? 9e9 : (bidVol / askVol);
    if (ratio >= 1.12) bias = 'ë§¤ìˆ˜?°ìœ„';
    if (ratio <= 0.88) bias = 'ë§¤ë„?°ìœ„';

    final topBidVol =
        bids.take(min(5, bids.length)).fold<double>(0, (a, e) => a + e[1]);
    final topAskVol =
        asks.take(min(5, asks.length)).fold<double>(0, (a, e) => a + e[1]);
    final topDepth = topBidVol + topAskVol;

    String liqRisk = 'ë³´í†µ';
    if (spreadBp >= 6.0 || topDepth < (bidVol + askVol) * 0.18) liqRisk = '?’ìŒ';
    if (spreadBp <= 2.0 && topDepth > (bidVol + askVol) * 0.28) liqRisk = '??Œ';

    if (trades != null) {
      final t = _extractTrades(trades);
      if (t.isNotEmpty) {
        final buy = t
            .where((e) => e['side'] == 'buy')
            .fold<double>(0, (a, e) => a + (e['qty'] as double));
        final sell = t
            .where((e) => e['side'] == 'sell')
            .fold<double>(0, (a, e) => a + (e['qty'] as double));
        final tot = buy + sell;
        if (tot > 0) {
          final buyP = (buy / tot) * 100.0;
          final sellP = (sell / tot) * 100.0;
          dto['fillsBuyP'] = buyP.round();
          dto['fillsSellP'] = sellP.round();
          if (buyP >= 56 && bias != 'ë§¤ë„?°ìœ„') bias = 'ë§¤ìˆ˜?°ìœ„';
          if (sellP >= 56 && bias != 'ë§¤ìˆ˜?°ìœ„') bias = 'ë§¤ë„?°ìœ„';
        }
      }
    }

    dto['orderbookBias'] = bias;
    dto['liquidityRisk'] = liqRisk;
    dto['orderbookBidVol'] = bidVol;
    dto['orderbookAskVol'] = askVol;
    dto['orderbookImbalance'] = ((ratio - 1.0) * 100.0).round();
    dto['spreadBp'] = spreadBp.round();

    final longP = (50 + (ratio - 1.0) * 40).clamp(0, 100).round();
    final shortP = (100 - longP).clamp(0, 100).round();
    dto['longP'] = longP;
    dto['shortP'] = shortP;
    dto['neutralP'] = (100 - longP - shortP).abs().clamp(0, 30);
  }

  static List<List<double>>? _extractLevels(dynamic ob, String key) {
    dynamic v;
    if (ob is Map) v = ob[key];
    if (v == null) return null;

    if (v is List) {
      final out = <List<double>>[];
      for (final row in v) {
        if (row is List && row.length >= 2) {
          final p = _toD(row[0]);
          final q = _toD(row[1]);
          if (p != null && q != null) out.add([p, q]);
        } else if (row is Map) {
          final p = _toD(row['price'] ?? row['p']);
          final q = _toD(row['size'] ?? row['qty'] ?? row['q']);
          if (p != null && q != null) out.add([p, q]);
        }
      }
      out.sort((a, b) => b[0].compareTo(a[0]));
      if (key.contains('ask')) out.sort((a, b) => a[0].compareTo(b[0]));
      return out;
    }
    return null;
  }

  static List<Map<String, Object>> _extractTrades(dynamic trades) {
    dynamic v = trades;
    if (trades is Map) {
      v = trades['data'] ?? trades['trades'] ?? trades['fills'] ?? trades['list'];
    }
    if (v is Map) {
      v = v['data'] ?? v['list'] ?? v['fills'] ?? v['trades'];
    }
    if (v is List) {
      final out = <Map<String, Object>>[];
      for (final row in v) {
        if (row is Map) {
          final sideRaw =
              (row['side'] ?? row['S'] ?? row['direction'] ?? '').toString().toLowerCase();
          final side =
              sideRaw.contains('buy') || sideRaw.contains('bid') ? 'buy' : 'sell';
          final q =
              _toD(row['size'] ?? row['qty'] ?? row['q'] ?? row['amount']) ?? 0.0;
          out.add({'side': side, 'qty': q});
        } else if (row is List && row.length >= 3) {
          // ?¼ë? API??[price, size, side] ?•íƒœ
          final sideRaw = row.last.toString().toLowerCase();
          final side = sideRaw.contains('buy') ? 'buy' : 'sell';
          final q = _toD(row[1]) ?? 0.0;
          out.add({'side': side, 'qty': q});
        }
      }
      return out;
    }
    return const [];
  }

  static double? _toD(dynamic v) {
    if (v == null) return null;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}
