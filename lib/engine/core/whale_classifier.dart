class WhaleClassifier {
  // Volume-based baseline. Later we can replace with z-score & impact.
  String classify(List<double> volumes) {
    if (volumes.isEmpty) return 'LOW';
    double sum = 0.0;
    for (final v in volumes) {
      sum += v.toDouble();
    }
    if (sum >= 1e7) return 'ULTRA';
    if (sum >= 1e6) return 'HIGH';
    if (sum >= 1e5) return 'MID';
    return 'LOW';
  }
}
