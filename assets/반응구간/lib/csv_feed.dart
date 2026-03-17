
import 'package:flutter/services.dart' show rootBundle;
import 'package:csv/csv.dart';

class CsvFeed {
  Future<List<List<dynamic>>> load(String assetPath) async {
    final raw = await rootBundle.loadString(assetPath);
    return const CsvToListConverter().convert(raw);
  }

  Map<String, double> calcPER(List<List<dynamic>> rows) {
    if (rows.length < 2) {
      return {"P": 0.5, "E": 0.5, "V": 0.2, "R": 0.2};
    }

    final last = rows.last;
    final close = _d(last[4]);
    final volume = _d(last[5]);

    final P = (0.5 + (close % 10) / 20).clamp(0.0, 1.0);
    final E = (volume % 1000 / 1000).clamp(0.0, 1.0);
    final V = 0.2;
    final R = 0.2;

    return {"P": P, "E": E, "V": V, "R": R};
  }

  double _d(dynamic v) {
    if (v == null) return 0.0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0.0;
  }
}
