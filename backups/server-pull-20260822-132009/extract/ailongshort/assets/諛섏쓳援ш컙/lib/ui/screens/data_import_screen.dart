import 'package:flutter/material.dart';
import '../../core/symbol_controller.dart';
import '../../data/offline/offline_loader.dart';

class DataImportScreen extends StatefulWidget {
  const DataImportScreen({super.key});

  @override
  State<DataImportScreen> createState() => _DataImportScreenState();
}

class _DataImportScreenState extends State<DataImportScreen> {
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    final symbol = SymbolController.I.symbol.value;

    return Scaffold(
      appBar: AppBar(title: const Text('데이터 가져오기')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            _howToCard(symbol),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _loading
                        ? null
                        : () async {
                            setState(() => _loading = true);
                            try {
                              await OfflineLoader.I.load(symbol: symbol);
                            } finally {
                              if (mounted) setState(() => _loading = false);
                            }
                          },
                    icon: const Icon(Icons.cloud_download),
                    label: Text(_loading ? '검사중...' : 'CSV 검사', style: const TextStyle(fontWeight: FontWeight.w900)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ValueListenableBuilder<OfflineLoadResult?>(
                valueListenable: OfflineLoader.I.last,
                builder: (context, res, _) {
                  if (res == null) {
                    return Center(
                      child: Text('아직 검사 전입니다.\n위 안내대로 CSV를 넣고 “CSV 검사”를 눌러주세요.',
                          textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withOpacity(0.70))),
                    );
                  }

                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withOpacity(0.10)),
                      color: Colors.white.withOpacity(0.04),
                    ),
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('폴더: ${res.folder}', style: TextStyle(color: Colors.white.withOpacity(0.65))),
                          const SizedBox(height: 10),
                          const Text('검사 결과', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                          const SizedBox(height: 10),
                          ...res.rowsByFile.entries.map((e) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    Expanded(child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700))),
                                    Text('${e.value}줄',
                                        style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
                                  ],
                                ),
                              )),
                          if (res.missing.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text('없음(누락)', style: TextStyle(color: Colors.redAccent.withOpacity(0.9), fontWeight: FontWeight.w900)),
                            const SizedBox(height: 6),
                            ...res.missing.map((m) => Text('• $m', style: TextStyle(color: Colors.white.withOpacity(0.75)))),
                          ] else ...[
                            const SizedBox(height: 12),
                            Text('✅ 필수 파일 존재 확인 완료', style: TextStyle(color: Colors.greenAccent.withOpacity(0.9), fontWeight: FontWeight.w900)),
                          ],
                          const SizedBox(height: 10),
                          Text('다음 단계: 이 데이터를 이용해 “멀티 타임프레임 합의 + CVD/OI/펀딩 필터”를 엔진에 연결합니다.',
                              style: TextStyle(color: Colors.white.withOpacity(0.55))),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _howToCard(String symbol) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        color: Colors.white.withOpacity(0.04),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('넣는 방법(초보용)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          const SizedBox(height: 8),
          Text('1) PC에서 아래 폴더를 찾기\n2) fulink_data 폴더 만들기\n3) CSV 파일을 이름 그대로 복사',
              style: TextStyle(color: Colors.white.withOpacity(0.70), height: 1.35, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Text('필수 파일 예시(심볼: $symbol)', style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('$symbol' '_1m.csv, ' '$symbol' '_15m.csv, ' '$symbol' '_1h.csv, ' '$symbol' '_4h.csv, ...',
              style: TextStyle(color: Colors.white.withOpacity(0.55))),
          const SizedBox(height: 10),
          Text('※ 이름이 다르면 인식이 안 됩니다.\n※ 지금 화면은 “존재/행수”만 검사합니다(빠름).',
              style: TextStyle(color: Colors.white.withOpacity(0.50))),
        ],
      ),
    );
  }
}
