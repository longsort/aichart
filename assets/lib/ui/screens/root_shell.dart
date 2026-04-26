import 'stats_sqlite_screen.dart';
import 'package:fulink_pro_ultra/ui/screens/signals_screen_v82.dart';
import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/ui/screens/ultra_home_screen.dart';

// Optional screens (if present in your project). If not, comment them out.
// We keep them as soft imports by using conditional runtime routing via Builder.
// But Dart requires imports to exist, so we avoid importing missing files here.

class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      const UltraHomeScreen(),
      const SignalsScreenV82(),
      const StatsSQLiteScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.candlestick_chart), label: '차트'),
          BottomNavigationBarItem(icon: Icon(Icons.assistant), label: '플랜'),
          BottomNavigationBarItem(icon: Icon(Icons.insights), label: '통계'),
        ],
      ),
    );
  }

  Widget _placeholder(String title) {
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      child: Text('$title (wiring next)', style: const TextStyle(color: Colors.white70)),
    );
  }
}