
import 'dart:convert';
import 'package:http/http.dart' as http;

class BitgetMetrics {
  static Future<double> volumeScore() async {
    final r = await http.get(Uri.parse(
      'https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT'));
    final j = jsonDecode(r.body);
    final vol = double.parse(j['data'][0]['baseVol']);
    return (vol.log() % 1).clamp(0.0,1.0);
  }

  static Future<double> fundingScore() async {
    final r = await http.get(Uri.parse(
      'https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT'));
    final j = jsonDecode(r.body);
    final f = double.parse(j['data'][0]['fundingRate']);
    return (f.abs()*10).clamp(0.0,1.0);
  }
}
