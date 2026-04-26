import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart';
import 'logger.dart';

/// PHASE H ??patch/config ÍµêÏ≤¥, ?§Ìå® ???¥Ï†Ñ ?åÏùºÎ°?Î°§Î∞±
class PatchLoader {
  static const _configName = 'config.json';
  static const _configBackup = 'config.json.bak';

  static Future<Map<String, dynamic>?> loadConfig() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final file = File(path);
      if (!await file.exists()) return null;
      final content = await file.readAsString();
      final decoded = jsonDecode(content) as Map<String, dynamic>?;
      if (decoded == null) return null;
      return decoded;
    } catch (e) {
      logError('loadConfig', e);
      return null;
    }
  }

  static Future<bool> applyPatch(String jsonContent) async {
    try {
      final decoded = jsonDecode(jsonContent) as Map<String, dynamic>?;
      if (decoded == null) return false;
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final file = File(path);
      if (await file.exists()) await file.copy(bakPath);
      await file.writeAsString(jsonContent);
      log('patch applied');
      return true;
    } catch (e) {
      logError('applyPatch', e);
      await _rollback();
      return false;
    }
  }

  static Future<void> _rollback() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final bak = File(bakPath);
      if (await bak.exists()) {
        await bak.copy(path);
        log('rollback done');
      }
    } catch (e) {
      logError('rollback', e);
    }
  }
}
