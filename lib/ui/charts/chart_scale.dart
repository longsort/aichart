
// AUTO PATCH v3
// Y-scale uses RAW OHLC only, overlays excluded
class ChartScale {
  static double minY(List<double> lows) {
    final m = lows.reduce((a,b)=>a<b?a:b);
    return m * 0.995;
  }
  static double maxY(List<double> highs) {
    final m = highs.reduce((a,b)=>a>b?a:b);
    return m * 1.005;
  }
}
