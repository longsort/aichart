
// PATCH-1: Block signals when evidence invalid
if (!evidence.valid) {
  emitState(state.copyWith(
    signalDir: SignalDir.none,
    signalProb: 0,
    status: TradeStatus.offline,
  ));
  return;
}
