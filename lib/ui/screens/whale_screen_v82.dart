import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// ?¸ë ¥/ê³ ë˜ CSV ë¶„ì„ ?”ë©´ (?ë™ë§¤ë§¤ ?†ìŒ)
/// CSV ?•ì‹(?ˆì‹œ): time_utc,price,qty,quote,side,is_big,cvd_quote
/// ?¬ìš©ë²?
/// 1) ???Œì¼ë§¤ë‹ˆ?€?ì„œ ?„ë˜ ?´ë”??CSV ?£ê¸°
/// 2) ?”ë©´?ì„œ 'ë¶ˆëŸ¬?¤ê¸°' ?„ë¥´ê¸?class WhaleScreenV82 extends StatefulWidget {
  const WhaleScreenV82({super.key});

  @override
  State<WhaleScreenV82> createState() => _WhaleScreenV82State();
}

class _WhaleScreenV82State extends State<WhaleScreenV82> {
  String folderPath = "";
  String status = "?€ê¸?ì¤?;
  Map<String, dynamic>? result;

  @override
  void initState() {
    super.initState();
    _initFolder();
  }

  Future<void> _initFolder() async {
    final dir = await getApplicationDocumentsDirectory();
    final f = Directory('${dir.path}/fulink_data');
    if (!await f.exists()) {
      await f.create(recursive: true);
    }
    setState(() => folderPath = f.path);
  }

  Future<void> _load() async {
    setState(() {
      status = "ë¶ˆëŸ¬?¤ëŠ” ì¤?..";
      result = null;
    });

    try {
      final folder = Directory(folderPath);
      final files = folder
          .listSync()
          .whereType<File>()
          .where((f) => f.path.toLowerCase().endsWith('.csv'))
          .toList()
        ..sort((a, b) => b.path.compareTo(a.path));

      if (files.isEmpty) {
        setState(() => status = "CSVê°€ ?†ìŠµ?ˆë‹¤. ?„ë˜ ?´ë”???£ì–´ì£¼ì„¸??");
        return;
      }

      final file = files.first;
      final r = await _analyzeTail(file);
      setState(() {
        result = r;
        status = "?„ë£Œ: ?Œì•„ë³´ê¸° ?¬ìš´ ?”ì•½ ?œì‹œ";
      });
    } catch (e) {
      setState(() => status = "?¤ë¥˜: $e");
    }
  }

  Future<Map<String, dynamic>> _analyzeTail(File file) async {
    // ë§ˆì?ë§???250KBë§??½ì–´??ë¹ ë¦„) ìµœê·¼ ?ë¦„ë§?ê³„ì‚°
    final raf = await file.open();
    final len = await raf.length();
    final readSize = 250000;
    final start = (len > readSize) ? (len - readSize) : 0;
    await raf.setPosition(start);
    final bytes = await raf.read(len - start);
    await raf.close();

    final text = String.fromCharCodes(bytes);
    final lines = text.split(RegExp(r'\r?\n')).where((l) => l.contains(',')).toList();
    if (lines.length < 3) {
      throw Exception("CSV ?¼ì¸???ˆë¬´ ?ìŠµ?ˆë‹¤.");
    }

    // ?¤ë” ?œê±°(?ˆìœ¼ë©?
    if (lines.first.toLowerCase().startsWith('time_utc')) {
      lines.removeAt(0);
    }

    // ìµœê·¼ 600ì¤„ë§Œ ?¬ìš©
    final recent = lines.length > 600 ? lines.sublist(lines.length - 600) : lines;

    double lastCvd = 0;
    double firstCvd = 0;
    int bigBuy = 0;
    int bigSell = 0;
    double bigQuote = 0;
    String lastTime = "";
    int seen = 0;

    for (final l in recent) {
      final p = l.split(',');
      if (p.length < 7) continue;

      final time = p[0];
      final side = p[4].toLowerCase().trim();
      final isBig = p[5].toLowerCase().trim() == 'true' || p[5] == '1';
      final cvd = double.tryParse(p[6]) ?? 0.0;
      final quote = double.tryParse(p[3]) ?? 0.0;

      if (seen == 0) firstCvd = cvd;
      lastCvd = cvd;
      lastTime = time;
      seen++;

      if (isBig) {
        bigQuote += quote;
        if (side == 'buy') bigBuy++;
        if (side == 'sell') bigSell++;
      }
    }

    final deltaCvd = lastCvd - firstCvd;
    final whaleState = (deltaCvd > 0 && bigBuy > bigSell)
        ? "ê³ ë˜ ë§¤ì§‘(ëª¨ìœ¼??ì¤?"
        : (deltaCvd < 0 && bigSell > bigBuy)
            ? "ê³ ë˜ ë¶„ì‚°(?ŒëŠ” ì¤?"
            : "ì¤‘ë¦½(? ë§¤??";

    // ì´ˆë³´??? ë¢°??0~100): ì¦ê±° ê°„ë‹¨ ?©ì„±
    double score = 50;
    if (bigBuy + bigSell >= 20) score += 10;
    if (deltaCvd.abs() > 100000) score += 15;
    if ((bigBuy - bigSell).abs() >= 10) score += 10;
    score = score.clamp(0, 100);

    final conclusion = score >= 78
        ? "? ë¦¬(ì§„ì… ?„ë³´)"
        : score <= 35
            ? "?„í—˜(?€ê¸?ì¶”ì²œ)"
            : "ê´€ë§?ì¶”ê? ?•ì¸)";

    return {
      "file": file.path.split('/').last,
      "time": lastTime,
      "bigBuy": bigBuy,
      "bigSell": bigSell,
      "bigQuote": bigQuote,
      "deltaCvd": deltaCvd,
      "whale": whaleState,
      "confidence": score,
      "conclusion": conclusion,
    };
  }

  @override
  Widget build(BuildContext context) {
    final r = result;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Container(
          width: 360,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF0C0F14),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("ê³ ë˜/?¸ë ¥ ë¶„ì„(?¤ë°?´í„°)",
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(height: 10),
              Text("CSV ?´ë”: $folderPath",
                  style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: folderPath.isEmpty ? null : _load,
                  child: const Text("ë¶ˆëŸ¬?¤ê¸°"),
                ),
              ),
              const SizedBox(height: 10),
              Text(status, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (r != null) ...[
                _row("?Œì¼", r["file"].toString()),
                _row("?œê°„", r["time"].toString()),
                _row("?€??ë§¤ìˆ˜", "${r["bigBuy"]}"),
                _row("?€??ë§¤ë„", "${r["bigSell"]}"),
                _row("CVD ë³€??, "${(r["deltaCvd"] as double).toStringAsFixed(2)}"),
                const SizedBox(height: 8),
                Text("ê³ ë˜ ?íƒœ: ${r["whale"]}",
                    style: const TextStyle(color: Colors.tealAccent, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text("AI ?”ì•½: ${r["conclusion"]} / ? ë¢°??${r["confidence"]}%",
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                const Text("???ë™ë§¤ë§¤/?¬ìê¶Œìœ  ?„ë‹˜ Â· ì°¸ê³ ??,
                    style: TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w700)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.w800)),
          Flexible(
            child: Text(v,
                textAlign: TextAlign.right,
                style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}
