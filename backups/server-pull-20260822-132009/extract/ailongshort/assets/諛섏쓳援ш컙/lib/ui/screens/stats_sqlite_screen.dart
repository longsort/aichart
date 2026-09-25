import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/db/reports_dao.dart';
import '../../core/db/tuning_dao.dart';
import '../../core/services/report_exporter.dart';
import '../../core/services/sqlite_trade_recorder.dart';
import '../../core/autotune/tuning_params.dart';

class StatsSQLiteScreen extends StatefulWidget {
  const StatsSQLiteScreen({super.key});
  @override
  State<StatsSQLiteScreen> createState() => _StatsSQLiteScreenState();
}

class _StatsSQLiteScreenState extends State<StatsSQLiteScreen> {
  Timer? _autoTimer;
  StreamSubscription<int>? _sub;

  final ReportsDao _r = ReportsDao();
  final TuningDao _t = TuningDao();

@override
void initState() {
  super.initState();
  // 5초마다 자동 새로고침 + 신호/결과 기록 시 즉시 새로고침
  _autoTimer = Timer.periodic(const Duration(seconds: 5), (_) {
    if (mounted) setState(() {});
  });
  _sub = SqliteTradeRecorder.I.tick.listen((_) {
    if (mounted) setState(() {});
  });
}

@override
void dispose() {
  _autoTimer?.cancel();
  _sub?.cancel();
  super.dispose();
}

  bool _seeding = false;

  Future<void> _seedDemo() async {
    if (_seeding) return;
    setState(() => _seeding = true);
    try {
      await _r.seedDemoData(n: 30);
    } finally {
      if (mounted) setState(() => _seeding = false);
    }
  }

  Future<_Pack> _load() async {
    final p = await _t.loadOrCreate();
    final last = await _r.lastSignalsWithOutcomes(30);
    final logs = await _r.recentTuningLogs(12);
    final ses = await _r.winrateBySession(200);

    int w = 0, l = 0;
    double pnl = 0;
    for (final row in last) {
      final res = (row['result'] as String?) ?? '';
      if (res == 'WIN') w++;
      if (res == 'LOSS') l++;
      pnl += ((row['pnl'] as num?)?.toDouble() ?? 0);
    }
    final n = w + l;
    final wr = n > 0 ? (w / n) * 100.0 : 0.0;

    return _Pack(params: p, rows: last, logs: logs, winrate: wr, pnlSum: pnl, sessionRows: ses);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C10),
        title: const Text('통계(자율보정)', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: FutureBuilder<_Pack>(
        future: _load(),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('통계 로딩 실패', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text('${snap.error}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 12),
                    ElevatedButton(onPressed: () => setState(() {}), child: const Text('재시도')),
                  ],
                ),
              ),
            );
          }
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final d = snap.data!;
          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                if (d.rows.isEmpty)
                  _card(
                    title: '데이터 없음(정상)',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            SizedBox(
                              width: 10,
                              height: 10,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white38),
                            ),
                            const SizedBox(width: 8),
                            const Text('엔진 대기 중 · 확정 신호 저장 시 자동 반영', style: TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w800)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '아직 확정 신호/결과 기록이 없어서 0%로 보입니다.\n(신호가 저장되면 자동으로 누적/자율보정 됩니다.)',
                          style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.4),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            ElevatedButton(
                              onPressed: _seeding
                                  ? null
                                  : () async {
                                      await _seedDemo();
                                      if (mounted) setState(() {});
                                    },
                              child: Text(_seeding ? '생성 중…' : '테스트 데이터 생성'),
                            ),
                            const SizedBox(width: 10),
                            const Expanded(
                              child: Text(
                                '※ 실제 매매용 아님. DB·화면 연동 확인용.',
                                style: TextStyle(color: Colors.white38, fontSize: 11),
                                overflow: TextOverflow.ellipsis,
                              ),
                            )
                          ],
                        )
                      ],
                    ),
                  ),
                if (d.rows.isNotEmpty) _card(title: '엔진 연동 상태', child: _engineGauge(d)),
                _card(
                  title: '현재 튜닝 파라미터',
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      _pill('확정기준 ${(d.params.thrConfirm * 100).toStringAsFixed(0)}%'),
                      _pill('지지가중치 ${(d.params.wSupport * 100).toStringAsFixed(0)}'),
                      _pill('저항가중치 ${(d.params.wResist * 100).toStringAsFixed(0)}'),
                      _pill('구조가중치 ${(d.params.wStructure * 100).toStringAsFixed(0)}'),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                _card(
                  title: '최근 30(결과 있는 것만)',
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      _pill('승률 ${d.winrate.toStringAsFixed(1)}%'),
                      _pill('누적손익 ${d.pnlSum.toStringAsFixed(2)}R'),
                      _pill('승/패 ${d.w}/${d.l}'),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                _card(title: '시간대별 승률(최근 200)', child: _sessionTable(d.sessionRows)),
                const SizedBox(height: 10),
                _card(title: '최근 신호 30', child: Column(children: d.rows.map(_row).toList())),
                const SizedBox(height: 10),
                _card(
                  title: '튜닝 변경 로그',
                  child: Column(
                    children: d.logs.map((r) {
                      final ts = DateTime.fromMillisecondsSinceEpoch((r['ts'] as int?) ?? 0);
                      final note = (r['note'] as String?) ?? '';
                      final diff = (r['diff_json'] as String?) ?? '';
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${ts.month}/${ts.day} ${ts.hour.toString().padLeft(2,'0')}:${ts.minute.toString().padLeft(2,'0')} · $note',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 4),
                            Text(diff, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 30),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _sessionTable(List<Map<String, Object?>> rows) {
    if (rows.isEmpty) return const Text('데이터 없음', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w800));
    return Column(
      children: rows.take(8).map((r) {
        final k = (r['k'] as String?) ?? '';
        final w = (r['w'] as int?) ?? 0;
        final l = (r['l'] as int?) ?? 0;
        final n = w + l;
        final wr = n > 0 ? (w / n) * 100.0 : 0.0;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              SizedBox(width: 100, child: Text(k, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w900))),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: LinearProgressIndicator(
                    value: (wr / 100).clamp(0.0, 1.0),
                    minHeight: 10,
                    backgroundColor: const Color(0x22FFFFFF),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF1EEA6A)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 90,
                child: Text('${wr.toStringAsFixed(1)}% ($w/$l)', textAlign: TextAlign.right,
                    style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _row(Map<String, Object?> r) {
    final dir = (r['dir'] as String?) ?? '';
    final conf = (r['confidence'] as int?) ?? 0;
    final tf = (r['tf'] as String?) ?? '';
    final sym = (r['symbol'] as String?) ?? '';
    final res = (r['result'] as String?) ?? '';
    final method = (r['method'] as String?) ?? '';
    final ts = DateTime.fromMillisecondsSinceEpoch((r['ts'] as int?) ?? 0);
    final badge = res.isEmpty ? 'PENDING' : res;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 74,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dir, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text('확신 $conf%', style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$sym · $tf', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text('${ts.month}/${ts.day} ${ts.hour.toString().padLeft(2,'0')}:${ts.minute.toString().padLeft(2,'0')} · $method',
                    style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0x22FFFFFF)),
              color: badge == 'WIN' ? const Color(0x221EEA6A) : badge == 'LOSS' ? const Color(0x22FF4D4D) : const Color(0x11FFFFFF),
            ),
            child: Text(badge == 'WIN' ? '승' : (badge == 'LOSS' ? '패' : '대기'), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }

  Widget _engineGauge(_Pack d) {
    final n = d.w + d.l;
    final wr = n > 0 ? (d.winrate / 100).clamp(0.0, 1.0) : 0.0;
    return Row(
      children: [
        SizedBox(
          width: 12,
          height: 12,
          child: CircularProgressIndicator(
            value: null,
            strokeWidth: 2,
            color: const Color(0xFF1EEA6A),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('엔진 연동됨 · 신호 데이터 반영 중', style: TextStyle(color: Color(0xFF1EEA6A), fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: wr,
                  minHeight: 8,
                  backgroundColor: const Color(0x22FFFFFF),
                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF1EEA6A)),
                ),
              ),
              const SizedBox(height: 4),
              Text('승률 게이지 ${(wr * 100).toStringAsFixed(1)}% (승 ${d.w} / 패 ${d.l})', style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _card({required String title, required Widget child}) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0x22FFFFFF)),
          color: const Color(0x11000000),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          child,
        ]),
      );

  Widget _pill(String t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x22FFFFFF)),
          color: const Color(0x11000000),
        ),
        child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
      );
}

class _Pack {
  final TuningParams params;
  final List<Map<String, Object?>> rows;
  final List<Map<String, Object?>> logs;
  final List<Map<String, Object?>> sessionRows;
  final double winrate;
  final double pnlSum;
  int get w => rows.where((r) => (r['result'] as String?) == 'WIN').length;
  int get l => rows.where((r) => (r['result'] as String?) == 'LOSS').length;

  _Pack({required this.params, required this.rows, required this.logs, required this.winrate, required this.pnlSum, required this.sessionRows});
}
