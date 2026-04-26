import 'dart:convert';
import 'dart:io';

/// 아주 단순한 로컬 로그(자동 기록)
/// - 외부 패키지/DB 없이도 동작
/// - 줄단위 JSONL 로 저장: fulink_logs.jsonl
class LocalLog {
  static final File _file = File('${Directory.current.path}${Platform.pathSeparator}fulink_logs.jsonl');

  static Future<void> append(Map<String, dynamic> row) async {
    try {
      final line = jsonEncode({
        ...row,
        'ts': DateTime.now().toIso8601String(),
      });
      await _file.writeAsString('$line\n', mode: FileMode.append, flush: true);
    } catch (_) {
      // 로그 실패는 앱을 죽이지 않음
    }
  }

  static Future<List<Map<String, dynamic>>> readLast({int max = 30}) async {
    try {
      if (!await _file.exists()) return [];
      final lines = await _file.readAsLines();
      final tail = lines.length > max ? lines.sublist(lines.length - max) : lines;
      return tail.map((l) => jsonDecode(l) as Map<String, dynamic>).toList().reversed.toList();
    } catch (_) {
      return [];
    }
  }
}
