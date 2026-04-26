import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart';
import '../../core/logger.dart';
import '../security/integrity.dart';

/// S-09: config/patch 적용 + 실패 시 롤백 + 로그 남김
class PatchManager {
  static const _configName = 'config.json';
  static const _configBackup = 'config.json.bak';
  static const _applyLogName = 'patch_apply_log.txt';

  static Future<String> get currentVersion async {
    final cfg = await loadConfig();
    return cfg?['version']?.toString() ?? '1.0.0';
  }

  static Future<Map<String, dynamic>?> loadConfig() async {
    try {
      await Integrity.ensureConfigIntegrity();
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

  static Future<bool> _isValidJson(String jsonContent) async {
    try {
      final decoded = jsonDecode(jsonContent);
      return decoded is Map;
    } catch (_) {
      return false;
    }
  }

  static Future<String> get applyLog async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File(join(dir.path, _applyLogName));
      if (!await file.exists()) return '';
      return await file.readAsString();
    } catch (_) {
      return '';
    }
  }

  static Future<bool> applyPatch(String jsonContent) async {
    if (!await _isValidJson(jsonContent)) {
      await _appendLog('apply failed: invalid json');
      return false;
    }
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final file = File(path);
      if (await file.exists()) await file.copy(bakPath);
      await file.writeAsString(jsonContent);
      await _appendLog('apply ok: ${DateTime.now()}');
      log('patch applied');
      return true;
    } catch (e) {
      logError('applyPatch', e);
      await _appendLog('apply failed: $e');
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
        await _appendLog('rollback ok: ${DateTime.now()}');
        log('rollback done');
      }
    } catch (e) {
      logError('rollback', e);
      await _appendLog('rollback failed: $e');
    }
  }

  static Future<void> _appendLog(String line) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File(join(dir.path, _applyLogName));
      final existing = await file.exists() ? await file.readAsString() : '';
      await file.writeAsString('$existing$line\n');
    } catch (_) {}
  }
}
