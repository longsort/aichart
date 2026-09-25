// FAST SNAPSHOT LOAD (JSONL)
import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

Future<List<Map<String, dynamic>>> loadSnapshots({int limit = 200}) async {
  final d = await getApplicationDocumentsDirectory();
  final f = File('${d.path}/snapshots.jsonl');
  if (!await f.exists()) return [];
  final lines = await f.readAsLines();
  return lines.reversed.take(limit).map((e)=>jsonDecode(e) as Map<String,dynamic>).toList();
}