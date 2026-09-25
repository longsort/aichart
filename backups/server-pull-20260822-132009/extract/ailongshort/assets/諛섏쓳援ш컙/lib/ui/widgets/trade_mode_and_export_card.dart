import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/local_log.dart';

/// TOP1 FINAL v5
/// - LIVE/연습 모드 토글(SharedPreferences)
/// - 최근 로그를 CSV로 생성해 클립보드로 복사
/// - 외부 패키지 없이(파일 저장/공유 없이) 안전하게 동작
class TradeModeAndExportCard extends StatefulWidget {
  final String symbol;

  const TradeModeAndExportCard({
    super.key,
    required this.symbol,
  });

  @override
  State<TradeModeAndExportCard> createState() => _TradeModeAndExportCardState();
}

class _TradeModeAndExportCardState extends State<TradeModeAndExportCard> {
  static const _kModeKey = 'fulink_mode_live';

  bool _live = true;
  bool _busy = false;
  String? _toast;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final sp = await SharedPreferences.getInstance();
    setState(() => _live = sp.getBool(_kModeKey) ?? true);
  }

  Future<void> _setLive(bool v) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setBool(_kModeKey, v);
    setState(() => _live = v);
  }

  Future<void> _copyCsv() async {
    setState(() {
      _busy = true;
      _toast = null;
    });
    try {
      final rows = await LocalLog.readLast(max: 60);
      final now = DateTime.now().toIso8601String();
      final header = <String>[
        'export_ts',
        'symbol',
        'mode',
        'ts',
        'title',
        'score',
        'confidence',
        'evidenceHit',
        'evidenceTotal',
        'price',
      ].join(',');

      final lines = <String>[header];
      for (final r in rows) {
        String s(Object? v) {
          // CSV 안전 처리(쉼표/줄바꿈/따옴표)
          final str = (v ?? '').toString();
          final safe = str.replaceAll('"', '""');
          return '"$safe"';
        }

        lines.add([
          s(now),
          s(widget.symbol),
          s(_live ? 'LIVE' : 'PAPER'),
          s(r['ts']),
          s(r['title']),
          s(r['score']),
          s(r['confidence']),
          s(r['evidenceHit']),
          s(r['evidenceTotal']),
          s(r['price']),
        ].join(','));
      }

      final csv = lines.join('\n');
      await Clipboard.setData(ClipboardData(text: csv));
      setState(() => _toast = 'CSV 복사 완료 (${rows.length}행)');
    } catch (e) {
      setState(() => _toast = 'CSV 생성 실패: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '모드',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                _live ? 'LIVE' : 'PAPER',
                style: TextStyle(
                  color: _live ? cs.primary : muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 8),
              Switch(
                value: _live,
                onChanged: (v) => _setLive(v),
              ),
            ],
          ),
          Text(
            _live ? '실전 모드: 경고/LOCK이 더 보수적으로 동작' : '연습 모드: 신호 관찰/복기용',
            style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _busy ? null : _copyCsv,
                  icon: const Icon(Icons.copy, size: 18),
                  label: Text(_busy ? '생성중…' : '최근 로그 CSV 복사'),
                ),
              ),
            ],
          ),
          if (_toast != null) ...[
            const SizedBox(height: 8),
            Text(
              _toast!,
              style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ],
        ],
      ),
    );
  }
}
