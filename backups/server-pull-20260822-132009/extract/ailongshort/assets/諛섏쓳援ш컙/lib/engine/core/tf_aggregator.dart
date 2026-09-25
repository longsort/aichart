class TfAgg {
  final double momentum;
  final double volumeSum;

  const TfAgg({required this.momentum, required this.volumeSum});
}

class TfAggregator {
  TfAgg aggregate({
    required String tf,
    required List<double> prices,
    required List<double> volumes,
  }) {
    if (prices.isEmpty) return const TfAgg(momentum: 0, volumeSum: 0);

    final double first = prices.first.toDouble();
    final double last = prices.last.toDouble();
    final double denom = first == 0 ? 1.0 : first;
    final double momentum = (last - first) / denom;

    double vol = 0.0;
    for (final v in volumes) {
      vol += v.toDouble();
    }

    return TfAgg(momentum: momentum, volumeSum: vol);
  }
}
