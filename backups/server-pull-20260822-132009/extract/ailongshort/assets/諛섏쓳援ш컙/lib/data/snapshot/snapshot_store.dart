import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

Future<File> _snapFile() async {
  final d = await getApplicationDocumentsDirectory();
  return File('${d.path}/snapshots.jsonl');
}

Future<void> saveSnapshot(Map<String, dynamic> snap) async {
  final f = await _snapFile();
  await f.writeAsString(jsonEncode(snap) + '\n', mode: FileMode.append);
}