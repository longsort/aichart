import 'dart:io';
import 'dart:convert';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../models/briefing_output.dart';

/// S-12: 브리???�????TXT 기본, ?�션 PDF. ?�???�일 경로 반환.
class ReportExporter {
  static const String _subdir = 'briefings';

  static Future<String> _dirPath() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/$_subdir');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir.path;
  }

  static String _toTxt(BriefingOutput b) {
    final buf = StringBuffer();
    buf.writeln('=== Fulink Pro 브리??===');
    buf.writeln('${b.symbol} / ${b.tf} / ${DateTime.now()}');
    buf.writeln('');
    buf.writeln('?�재가: ${b.lastPrice.toStringAsFixed(2)} | ?�태: ${b.status} | ?�뢰?? ${b.confidence}%');
    buf.writeln(b.summaryLine);
    if (b.lockReason != null) buf.writeln('매매 금�?: ${b.lockReason}');
    buf.writeln('');
    for (final e in b.evidenceBullets) buf.writeln('??$e');
    buf.writeln('');
    for (final s in b.scenarios) {
      buf.writeln('${s.name}: ${s.condition} (?�률 ${s.prob}%)');
      buf.writeln('  진입 ${s.entry?.toStringAsFixed(0)} ?�절 ${s.sl?.toStringAsFixed(0)} 목표 ${s.tp?.toStringAsFixed(0)} RR ${s.rr}');
      if (s.positionSize != null) buf.writeln('  ?�량 ${s.positionSize!.toStringAsFixed(4)}');
    }
    buf.writeln('');
    buf.writeln(b.managerComment);
    return buf.toString();
  }

  /// TXT ?�?? 반환: ?�?�된 ?�일 경로.
  static Future<String> exportTxt(BriefingOutput b) async {
    final dir = await _dirPath();
    final name = 'briefing_${DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first}.txt';
    final path = '$dir/$name';
    await File(path).writeAsString(_toTxt(b), encoding: utf8);
    return path;
  }

  /// PDF ?�??(?�션). 반환: ?�?�된 ?�일 경로.
  static Future<String> exportPdf(BriefingOutput b) async {
    final dir = await _dirPath();
    final name = 'briefing_${DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first}.pdf';
    final path = '$dir/$name';
    final pdf = pw.Document();
    pdf.addPage(
      pw.MultiPage(
        build: (ctx) => [
          pw.Text('Fulink Pro 브리??, style: pw.TextStyle(fontSize: 18)),
          pw.Paragraph(text: '${b.symbol} / ${b.tf} / ${DateTime.now()}'),
          pw.Paragraph(text: '?�재가: ${b.lastPrice.toStringAsFixed(2)} | ${b.status} | ?�뢰??${b.confidence}%'),
          pw.Paragraph(text: b.summaryLine),
          if (b.lockReason != null) pw.Paragraph(text: '매매 금�?: ${b.lockReason}'),
          ...b.evidenceBullets.map((e) => pw.Paragraph(text: '??$e')),
          ...b.scenarios.map((s) => pw.Paragraph(text: '${s.name}: ${s.condition} (${s.prob}%) 진입 ${s.entry?.toStringAsFixed(0)} SL ${s.sl?.toStringAsFixed(0)} TP ${s.tp?.toStringAsFixed(0)}')),
          pw.Paragraph(text: b.managerComment),
        ],
      ),
    );
    final file = File(path);
    await file.writeAsBytes(await pdf.save());
    return path;
  }

  /// ?�?�된 브리???�일 목록 (경로, ?�일�? ?�정?�간).
  static Future<List<SavedReportEntry>> listSaved() async {
    final dir = await _dirPath();
    final list = <SavedReportEntry>[];
    try {
      await for (final e in Directory(dir).list()) {
        if (e is File && (e.path.endsWith('.txt') || e.path.endsWith('.pdf'))) {
          final stat = await e.stat();
          list.add(SavedReportEntry(path: e.path, name: e.uri.pathSegments.last, modified: stat.modified));
        }
      }
      list.sort((a, b) => b.modified.compareTo(a.modified));
    } catch (_) {}
    return list;
  }

  static Future<String?> readSavedContent(String path) async {
    try {
      return await File(path).readAsString(encoding: utf8);
    } catch (_) {
      return null;
    }
  }
}

class SavedReportEntry {
  final String path;
  final String name;
  final DateTime modified;
  SavedReportEntry({required this.path, required this.name, required this.modified});
}