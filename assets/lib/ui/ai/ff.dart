import '../ai/feature_flags.dart';

/// Small helpers to reduce boilerplate in call-sites.
class FF {
  static bool get futOverlay => FeatureFlags.enableFutureProjectionOverlay;
  static bool get zoneProb => FeatureFlags.enableZoneProbLabels;
  static bool get entryMark => FeatureFlags.enableEntryMarkers;

  static bool get dbLogs => FeatureFlags.enableSqliteTradeLogs;
  static bool get autoJudge => FeatureFlags.enableAutoJudge;
  static bool get rolling => FeatureFlags.enableRollingHitRate;
  static bool get confScale => FeatureFlags.enableConfidenceScaling;
  static bool get lock => FeatureFlags.enableNoTradeLock;
  static bool get tune => FeatureFlags.enableAutoTune;

  static bool get watch20 => FeatureFlags.strictWatchUnder20;
}