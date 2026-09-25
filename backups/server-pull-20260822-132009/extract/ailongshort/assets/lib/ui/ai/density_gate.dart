import 'tf_theme.dart';

class DensityGate {
  static bool showZoneLabels(String tf) => TfTheme.of(tf).densityLevel >= 3;
  static bool showEntryMarkers(String tf) => TfTheme.of(tf).densityLevel >= 3;
  static bool showMicroLabels(String tf) => TfTheme.of(tf).densityLevel >= 4;
}