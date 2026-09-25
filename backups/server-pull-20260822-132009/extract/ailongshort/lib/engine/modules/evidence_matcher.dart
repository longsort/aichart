
class EvidenceMatcher {
  static int matchCount({
    required bool tyron,
    required bool wave,
    required bool zone,
    required bool volume,
    required bool history,
  }) {
    int c = 0;
    if (tyron) c++;
    if (wave) c++;
    if (zone) c++;
    if (volume) c++;
    if (history) c++;
    return c;
  }
}
