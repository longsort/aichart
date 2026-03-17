
import 'dart:convert';
import 'package:http/http.dart' as http;

/// PATCH-9: fetch patch.json from URL (HTTPS) and return as string.
/// Keep it simple: caller handles apply/rollback.
class RemotePatchFetcher {
  Future<String> fetch(String url, {Duration timeout = const Duration(seconds: 8)}) async {
    final uri = Uri.parse(url);
    final res = await http.get(uri).timeout(timeout);
    if (res.statusCode != 200) {
      throw Exception('HTTP ${res.statusCode}');
    }
    // validate JSON
    jsonDecode(res.body);
    return res.body;
  }
}
