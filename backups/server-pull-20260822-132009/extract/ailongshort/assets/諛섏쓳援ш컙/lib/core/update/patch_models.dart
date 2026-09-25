class PatchManifest {
  final String app;
  final String channel;
  final String version;
  final String minAppVersion;
  final String releasedAt;
  final List<String> notes;

  PatchManifest({
    required this.app,
    required this.channel,
    required this.version,
    required this.minAppVersion,
    required this.releasedAt,
    required this.notes,
  });

  factory PatchManifest.fromJson(Map<String, dynamic> j) {
    return PatchManifest(
      app: (j['app'] ?? '').toString(),
      channel: (j['channel'] ?? '').toString(),
      version: (j['version'] ?? '').toString(),
      minAppVersion: (j['min_app_version'] ?? '').toString(),
      releasedAt: (j['released_at'] ?? '').toString(),
      notes: (j['notes'] as List? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
