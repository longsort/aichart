import 'dart:convert';
import 'dart:io';
import 'trade_journal.dart';

class JournalRepo {
  static final JournalRepo I = JournalRepo._();
  JournalRepo._();

  final List<TradeJournalItem> _items = [];
  List<TradeJournalItem> get items => List.unmodifiable(_items);

  // ?Œì¼ ê¸°ë¡(?µì…˜): ?±ì´ ?¤í–‰???´ë”??fulink_journal.jsonl ?ì„±
  Future<void> add(TradeJournalItem item) async {
    _items.insert(0, item);
    try {
      final f = File('fulink_journal.jsonl');
      await f.writeAsString(jsonEncode(item.toJson()) + '\n', mode: FileMode.append, flush: true);
    } catch (_) {}
  }
}
