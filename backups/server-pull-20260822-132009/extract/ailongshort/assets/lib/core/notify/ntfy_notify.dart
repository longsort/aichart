
import 'dart:convert';
import 'dart:io';

class NtfyNotify {
  static Future<void> send({
    required String url,
    required String title,
    required String body,
  }) async {
    try {
      final uri = Uri.parse(url);
      final client = HttpClient();
      final req = await client.postUrl(uri);
      req.headers.set('Content-Type', 'text/plain; charset=utf-8');
      req.headers.set('Title', title);
      // high priority in many ntfy clients
      req.headers.set('Priority', 'high');
      req.add(utf8.encode(body));
      final resp = await req.close();
      await resp.drain();
      client.close();
    } catch (_) {
      // 무시(네트워크 실패 시 앱 동작 영향 X)
    }
  }
}
