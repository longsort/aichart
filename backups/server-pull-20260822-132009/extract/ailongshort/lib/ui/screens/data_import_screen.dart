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
      appBar: AppBar(title: const Text('?°ì´??ê°€?¸ì˜¤ê¸?)),
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
                    label: Text(_loading ? 'ê²€?¬ì¤‘...' : 'CSV ê²€??, style: const TextStyle(fontWeight: FontWeight.w900)),
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
                      child: Text('?„ì§ ê²€???„ì…?ˆë‹¤.\n???ˆë‚´?€ë¡?CSVë¥??£ê³  ?œCSV ê²€?¬â€ë? ?ŒëŸ¬ì£¼ì„¸??',
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
                          Text('?´ë”: ${res.folder}', style: TextStyle(color: Colors.white.withOpacity(0.65))),
                          const SizedBox(height: 10),
                          const Text('ê²€??ê²°ê³¼', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                          const SizedBox(height: 10),
                          ...res.rowsByFile.entries.map((e) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    Expanded(child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700))),
                                    Text('${e.value}ì¤?,
                                        style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
                                  ],
                                ),
                              )),
                          if (res.missing.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text('?†ìŒ(?„ë½)', style: TextStyle(color: Colors.redAccent.withOpacity(0.9), fontWeight: FontWeight.w900)),
                            const SizedBox(height: 6),
                            ...res.missing.map((m) => Text('??$m', style: TextStyle(color: Colors.white.withOpacity(0.75)))),
                          ] else ...[
                            const SizedBox(height: 12),
                            Text('???„ìˆ˜ ?Œì¼ ì¡´ì¬ ?•ì¸ ?„ë£Œ', style: TextStyle(color: Colors.greenAccent.withOpacity(0.9), fontWeight: FontWeight.w900)),
                          ],
                          const SizedBox(height: 10),
                          Text('?¤ìŒ ?¨ê³„: ???°ì´?°ë? ?´ìš©???œë????€?„í”„?ˆì„ ?©ì˜ + CVD/OI/?€???„í„°?ë? ?”ì§„???°ê²°?©ë‹ˆ??',
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
          const Text('?£ëŠ” ë°©ë²•(ì´ˆë³´??', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          const SizedBox(height: 8),
          Text('1) PC?ì„œ ?„ë˜ ?´ë”ë¥?ì°¾ê¸°\n2) fulink_data ?´ë” ë§Œë“¤ê¸?n3) CSV ?Œì¼???´ë¦„ ê·¸ë?ë¡?ë³µì‚¬',
              style: TextStyle(color: Colors.white.withOpacity(0.70), height: 1.35, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Text('?„ìˆ˜ ?Œì¼ ?ˆì‹œ(?¬ë³¼: $symbol)', style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('$symbol' '_1m.csv, ' '$symbol' '_15m.csv, ' '$symbol' '_1h.csv, ' '$symbol' '_4h.csv, ...',
              style: TextStyle(color: Colors.white.withOpacity(0.55))),
          const SizedBox(height: 10),
          Text('???´ë¦„???¤ë¥´ë©??¸ì‹?????©ë‹ˆ??\n??ì§€ê¸??”ë©´?€ ?œì¡´???‰ìˆ˜?ë§Œ ê²€?¬í•©?ˆë‹¤(ë¹ ë¦„).',
              style: TextStyle(color: Colors.white.withOpacity(0.50))),
        ],
      ),
    );
  }
}
