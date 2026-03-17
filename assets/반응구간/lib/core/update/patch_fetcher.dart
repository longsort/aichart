
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'patch_manager.dart';

/// PATCH-9: fetch patch.json from URL and apply with rollback.
class PatchFetcher {
  final PatchManager _pm = PatchManager();

  Future<void> applyFromUrl(String url) async {
    final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) {
      throw Exception('HTTP ${res.statusCode}');
    }
    await _pm.applyPatchJsonString(utf8.decode(res.bodyBytes));
  }
}
