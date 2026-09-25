double smoothPrice(double prev, double next, {double alpha = 0.25}) {
  return prev + (next - prev) * alpha;
}