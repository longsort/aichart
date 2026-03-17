
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// PATCH-8: in-app config patch with rollback.
/// This does NOT replace code. It swaps config.json / patch.json and keeps backups.
class PatchManager {
  static const _cfgName = 'config.json';
  static const _bakName = 'config.bak.json';
  static const _logName = 'patch_apply.log';

  Future<Directory> _dir() async => await getApplicationDocumentsDirectory();

  Future<File> _cfg() async => File('${(await _dir()).path}/$_cfgName');
  Future<File> _bak() async => File('${(await _dir()).path}/$_bakName');
  Future<File> _log() async => File('${(await _dir()).path}/$_logName');

  Future<Map<String, dynamic>> readConfig({Map<String, dynamic> fallback = const {}}) async {
    final f = await _cfg();
    if (!await f.exists()) return fallback;
    try {
      final txt = await f.readAsString();
      final m = jsonDecode(txt);
      return (m is Map<String, dynamic>) ? m : fallback;
    } catch (_) {
      return fallback;
    }
  }

  Future<void> writeConfig(Map<String, dynamic> cfg) async {
    final f = await _cfg();
    await f.create(recursive: true);
    await f.writeAsString(const JsonEncoder.withIndent('  ').convert(cfg));
  }

  Future<void> applyPatchJsonString(String patchJson) async {
    final cfgFile = await _cfg();
    final bakFile = await _bak();
    final logFile = await _log();

    // backup
    if (await cfgFile.exists()) {
      await cfgFile.copy(bakFile.path);
    }

    try {
      final patch = jsonDecode(patchJson);
      if (patch is! Map) throw Exception('patch json is not a map');
      final patchMap = Map<String, dynamic>.from(patch);

      // merge onto existing config
      final current = await readConfig(fallback: {});
      final merged = {...current, ...patchMap};

      await writeConfig(merged);
      await logFile.writeAsString('[OK] apply ${patchMap["version"] ?? "unknown"}\n', mode: FileMode.append);
    } catch (e) {
      // rollback
      if (await bakFile.exists()) {
        await bakFile.copy(cfgFile.path);
      }
      await logFile.writeAsString('[FAIL] $e\n', mode: FileMode.append);
      rethrow;
    }
  }

  Future<bool> rollback() async {
    final cfgFile = await _cfg();
    final bakFile = await _bak();
    final logFile = await _log();
    if (!await bakFile.exists()) return false;
    await bakFile.copy(cfgFile.path);
    await logFile.writeAsString('[ROLLBACK]\n', mode: FileMode.append);
    return true;
  }

  Future<String> readLog({int maxLines = 30}) async {
    final f = await _log();
    if (!await f.exists()) return '';
    final lines = await f.readAsLines();
    final tail = lines.length <= maxLines ? lines : lines.sublist(lines.length - maxLines);
    return tail.join('\n');
  }
}
