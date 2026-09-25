import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// 세력/고래 CSV 분석 화면 (자동매매 없음)
/// CSV 형식(예시): time_utc,price,qty,quote,side,is_big,cvd_quote
/// 사용법:
/// 1) 폰 파일매니저에서 아래 폴더에 CSV 넣기
/// 2) 화면에서 '불러오기' 누르기
class WhaleScreenV82 extends StatefulWidget {
  const WhaleScreenV82({super.key});

  @override
  State<WhaleScreenV82> createState() => _WhaleScreenV82State();
}

class _WhaleScreenV82State extends State<WhaleScreenV82> {
  String folderPath = "";
  String status = "대기 중";
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
      status = "불러오는 중...";
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
        setState(() => status = "CSV가 없습니다. 아래 폴더에 넣어주세요.");
        return;
      }

      final file = files.first;
      final r = await _analyzeTail(file);
      setState(() {
        result = r;
        status = "완료: 알아보기 쉬운 요약 표시";
      });
    } catch (e) {
      setState(() => status = "오류: $e");
    }
  }

  Future<Map<String, dynamic>> _analyzeTail(File file) async {
    // 마지막 약 250KB만 읽어서(빠름) 최근 흐름만 계산
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
      throw Exception("CSV 라인이 너무 적습니다.");
    }

    // 헤더 제거(있으면)
    if (lines.first.toLowerCase().startsWith('time_utc')) {
      lines.removeAt(0);
    }

    // 최근 600줄만 사용
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
        ? "고래 매집(모으는 중)"
        : (deltaCvd < 0 && bigSell > bigBuy)
            ? "고래 분산(파는 중)"
            : "중립(애매함)";

    // 초보용 신뢰도(0~100): 증거 간단 합성
    double score = 50;
    if (bigBuy + bigSell >= 20) score += 10;
    if (deltaCvd.abs() > 100000) score += 15;
    if ((bigBuy - bigSell).abs() >= 10) score += 10;
    score = score.clamp(0, 100);

    final conclusion = score >= 78
        ? "유리(진입 후보)"
        : score <= 35
            ? "위험(대기 추천)"
            : "관망(추가 확인)";

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
              const Text("고래/세력 분석(실데이터)",
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(height: 10),
              Text("CSV 폴더: $folderPath",
                  style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: folderPath.isEmpty ? null : _load,
                  child: const Text("불러오기"),
                ),
              ),
              const SizedBox(height: 10),
              Text(status, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (r != null) ...[
                _row("파일", r["file"].toString()),
                _row("시간", r["time"].toString()),
                _row("대량 매수", "${r["bigBuy"]}"),
                _row("대량 매도", "${r["bigSell"]}"),
                _row("CVD 변화", "${(r["deltaCvd"] as double).toStringAsFixed(2)}"),
                const SizedBox(height: 8),
                Text("고래 상태: ${r["whale"]}",
                    style: const TextStyle(color: Colors.tealAccent, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text("AI 요약: ${r["conclusion"]} / 신뢰도 ${r["confidence"]}%",
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                const Text("※ 자동매매/투자권유 아님 · 참고용",
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
