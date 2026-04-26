
// PATCH-3 FIX: flow decision hint helper
enum FlowHint { buy, sell, neutral }

FlowHint flowDecisionHint(double buyPct, double sellPct) {
  if (buyPct - sellPct > 10) return FlowHint.buy;
  if (sellPct - buyPct > 10) return FlowHint.sell;
  return FlowHint.neutral;
}
