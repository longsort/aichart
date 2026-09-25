/// Central feature switches (UI status bar uses these)
class FeatureFlags {
  // Visualization
  static const bool enableFutureProjectionOverlay = true;
  static const bool enableZoneProbLabels = true;
  static const bool enableEntryMarkers = true;

  // DB / Judge / Metrics / Lock / Tune
  static const bool enableSqliteTradeLogs = true;
  static const bool enableAutoJudge = true;
  static const bool enableRollingHitRate = true;
  static const bool enableNoTradeLock = true;
  static const bool enableAutoTune = true;
}