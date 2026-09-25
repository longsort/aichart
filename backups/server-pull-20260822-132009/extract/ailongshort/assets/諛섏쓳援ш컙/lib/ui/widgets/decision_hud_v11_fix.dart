
// PATCH-3 FIX: expose flowHint safely
FlowHint get flowHintSafe => state.flowHint ?? FlowHint.neutral;
