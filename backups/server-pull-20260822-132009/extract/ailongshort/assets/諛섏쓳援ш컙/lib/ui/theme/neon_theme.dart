
import 'package:flutter/material.dart';

class NeonColors {
  final Color textPrimary;
  final Color textSecondary;
  final Color panel;
  final Color panel2;
  final Color body;
  final Color small;
  final Color shadow;

  NeonColors({
    required this.textPrimary,
    required this.textSecondary,
    required this.panel,
    required this.panel2,
    required this.body,
    required this.small,
    required this.shadow,
  });

  factory NeonColors.dark() => NeonColors(
        textPrimary: Colors.white,
        textSecondary: Colors.white70,
        panel: const Color(0xFF121826),
        panel2: const Color(0xFF1A2238),
        body: const Color(0xFF0B1020),
        small: Colors.white60,
        shadow: Colors.black54,
      );
}

class NeonTheme extends InheritedWidget {
  final NeonColors colors;

  const NeonTheme({
    Key? key,
    required this.colors,
    required Widget child,
  }) : super(key: key, child: child);

  static NeonTheme of(BuildContext context) {
    final NeonTheme? result =
        context.dependOnInheritedWidgetOfExactType<NeonTheme>();
    assert(result != null, 'NeonTheme not found in context');
    return result!;
  }

  @override
  bool updateShouldNotify(covariant NeonTheme oldWidget) => false;
}

extension NeonThemeGetters on NeonTheme {
  Color get textPrimary => colors.textPrimary;
  Color get textSecondary => colors.textSecondary;
  Color get panel => colors.panel;
  Color get panel2 => colors.panel2;
  Color get body => colors.body;
  Color get small => colors.small;
  Color get shadow => colors.shadow;

  /// 구버전 호환용(라인/경계선 색)
  /// 일부 UI 코드에서 `t.line` 을 참조하던 흔적을 안전하게 수용한다.
  Color get line => colors.panel2;
// Compatibility token: strong text color used by some UI patches
Color get textStrong => Colors.white; // fallback to existing text color

}
