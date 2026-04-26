import 'package:permission_handler/permission_handler.dart';

class AppPermissions {
  AppPermissions._();

  static Future<void> requestBasics() async {
    // Android 13+ ?�림 권한
    await Permission.notification.request();
  }
}
