extension EvidenceMapExt on Map<String, bool> {
  bool get flow => this['flow'] ?? false;
  bool get shape => this['shape'] ?? false;
  bool get bigHand => this['bigHand'] ?? false;
  bool get crowding => this['crowding'] ?? false;
  bool get risk => this['risk'] ?? false;
}