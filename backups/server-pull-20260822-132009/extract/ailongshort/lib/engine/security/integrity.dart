import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart';
import '../update/patch_manager.dart';

/// S-16: ?¤ì •/ë¡œê·¸ ë¬´ê²°?????ìƒ ê°ì? ???ë™ ë°±ì—… ë³µêµ¬. ?¼ë? ?Œì¼ ?ìƒ?¼ë„ ???¤í–‰.
class Integrity {
  static const _configName = 'config.json';
  static const _configBackup = 'config.json.bak';

  /// config.json ë¬´ê²°???•ì¸. ?ìƒ ??ë°±ì—…?ì„œ ë³µêµ¬.
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

  /// ?ìš© ??config ë°±ì—… ?ì„± (PatchManager?€ ?°ë™)
  static Future<void> backupConfigBeforeApply() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = join(dir.path, _configName);
      final bakPath = join(dir.path, _configBackup);
      final file = File(path);
      if (await file.exists()) await file.copy(bakPath);
    } catch (_) {}
  }

  /// ?¨ìˆœ checksum (ë¬¸ì???´ì‹œ). ê²€ì¦ìš©.
  static int checksum(String content) {
    return content.hashCode;
  }
}

class IntegrityResult {
  final bool ok;
  final String message;
  IntegrityResult({required this.ok, required this.message});
}
