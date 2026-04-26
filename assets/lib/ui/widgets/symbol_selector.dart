import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants.dart';

/// S-19: 멀티자산 + 즐겨찾기 — 심볼별 데이터/차트 분리
class SymbolSelector extends StatefulWidget {
  final String value;
  final ValueChanged<String?> onChanged;

  const SymbolSelector({super.key, required this.value, required this.onChanged});

  @override
  State<SymbolSelector> createState() => _SymbolSelectorState();
}

class _SymbolSelectorState extends State<SymbolSelector> {
  List<String> _favorites = [];

  @override
  void initState() {
    super.initState();
    _loadFavorites();
  }

  Future<void> _loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(Constants.favoriteSymbolsKey);
    setState(() => _favorites = list ?? [Constants.defaultSymbol]);
  }

  Future<void> _toggleFavorite(String symbol) async {
    final prefs = await SharedPreferences.getInstance();
    final list = List<String>.from(_favorites);
    if (list.contains(symbol)) {
      list.remove(symbol);
      if (list.isEmpty) list.add(Constants.defaultSymbol);
    } else {
      list.insert(0, symbol);
    }
    await prefs.setStringList(Constants.favoriteSymbolsKey, list);
    setState(() => _favorites = list);
  }

  List<String> get _orderedSymbols {
    final rest = Constants.symbolList.where((s) => !_favorites.contains(s)).toList();
    return [..._favorites, ...rest];
  }

  @override
  Widget build(BuildContext context) {
    var ordered = _orderedSymbols;
    if (!ordered.contains(widget.value)) ordered = [widget.value, ...ordered];
    final value = ordered.contains(widget.value) ? widget.value : (ordered.isNotEmpty ? ordered.first : Constants.defaultSymbol);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        DropdownButton<String>(
          value: value,
          items: ordered.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
          onChanged: (v) => widget.onChanged(v),
        ),
        IconButton(
          icon: Icon(_favorites.contains(value) ? Icons.star : Icons.star_border),
          onPressed: () => _toggleFavorite(value),
          tooltip: _favorites.contains(widget.value) ? '즐겨찾기 해제' : '즐겨찾기',
        ),
      ],
    );
  }
}
