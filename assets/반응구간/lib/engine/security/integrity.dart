import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart';
import '../update/patch_manager.dart';

/// S-16: 설정/로그 무결성 — 손상 감지 시 자동 백업 복구. 일부 파일 손상돼도 앱 실행.
class Integrity {
  static const _configName = 'config.json';
  static const _configBackup = 'config.json.bak';

  /// config.json 무결성 확인. 손상 시 백업에서 복구.
  static Future<IntegrityResult> ensureConfigIntegrity() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final file = File(path);
      if (!await file.exists()) return IntegrityResult(ok: true, message: 'no config');

      final content = await file.readAsString();
      if (content.trim().isEmpty) {
        await _restoreBackup(path, bakPath);
        return IntegrityResult(ok: true, message: 'restored empty config');
      }

      try {
        final decoded = jsonDecode(content);
        if (decoded is! Map) throw FormatException('not a map');
      } catch (_) {
        await _restoreBackup(path, bakPath);
        return IntegrityResult(ok: true, message: 'restored corrupted config');
      }

      return IntegrityResult(ok: true, message: 'ok');
    } catch (e) {
      return IntegrityResult(ok: false, message: e.toString());
    }
  }

  static Future<void> _restoreBackup(String configPath, String bakPath) async {
    try {
      final bak = File(bakPath);
      if (await bak.exists()) {
        await bak.copy(configPath);
      }
    } catch (_) {}
  }

  /// 적용 전 config 백업 생성 (PatchManager와 연동)
  static Future<void> backupConfigBeforeApply() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final file = File(path);
      if (await file.exists()) await file.copy(bakPath);
    } catch (_) {}
  }

  /// 단순 checksum (문자열 해시). 검증용.
  static int checksum(String content) {
    return content.hashCode;
  }
}

class IntegrityResult {
  final bool ok;
  final String message;
  IntegrityResult({required this.ok, required this.message});
}
