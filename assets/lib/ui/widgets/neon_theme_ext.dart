import 'package:flutter/material.dart';

import 'neon_theme.dart';

extension NeonThemeExt on NeonTheme {
  Color get text => fg;
  Color get stroke => border;
}
