
enum MarketState { stable, energy, uncertain, danger }

MarketState computeState(double P, double E, double V, double R) {
  final EN = (E * 0.6) + (P * 0.2) + ((1 - V) * 0.2);
  final U  = (V * 0.5) + (-1.0 * (P - 0.5).abs()) + (R * 0.5);
  final D  = (R * 0.6) + (V * 0.3) + ((1 - P) * 0.1);

  if (D >= 0.65) return MarketState.danger;
  if (U >= 0.60) return MarketState.uncertain;
  if (EN >= 0.60) return MarketState.energy;
  return MarketState.stable;
}
