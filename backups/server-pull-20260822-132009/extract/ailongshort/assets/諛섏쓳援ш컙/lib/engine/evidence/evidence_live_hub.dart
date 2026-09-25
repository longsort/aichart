
// PATCH-1: Disable demo evidence when offline
Evidence buildEvidence(Store store) {
  if (!store.online) {
    return Evidence.empty(reason: EvidenceBlockReason.offline);
  }
  // existing logic continues...
}
