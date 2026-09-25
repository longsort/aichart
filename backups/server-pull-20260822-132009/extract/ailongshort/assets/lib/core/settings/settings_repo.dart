import 'fu_settings.dart';

class SettingsRepo {
  static final SettingsRepo I = SettingsRepo._();
  SettingsRepo._();
  FuSettings settings = FuSettings();
}
