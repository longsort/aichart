
import 'package:flutter/material.dart';
import '../../zone/user_zones_store.dart';
import '../../engine/zone/zone_score_engine.dart';
import 'zone_gauge_card.dart';

class ZonePanel extends StatefulWidget{
  const ZonePanel({super.key});
  @override State<ZonePanel> createState()=>_ZonePanelState();
}

class _ZonePanelState extends State<ZonePanel>{
  final _c = List.generate(5, (_)=>TextEditingController());

  @override
  void initState(){
    super.initState();
    UserZonesStore.load().then((_){
      final v = UserZonesStore.zones.value;
      for(int i=0;i<5;i++){
        _c[i].text = v[i]==0 ? '' : v[i].toStringAsFixed(0);
      }
      // start engine (DEMO hooks run if real hooks not set)
      ZoneScoreEngine.start(v);
      setState((){});
    });
  }

  List<double> _read(){
    return List.generate(5, (i){
      final t=_c[i].text.trim();
      return double.tryParse(t) ?? 0;
    });
  }

  @override
  Widget build(BuildContext context){
    final cp = ZoneScoreEngine.currentPrice?.call() ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _inputs(cp),
        const SizedBox(height: 10),
        ValueListenableBuilder<Map<double,ZoneScore>>(
          valueListenable: ZoneScoreEngine.scores,
          builder: (_, map, __){
            if(map.isEmpty) return const SizedBox.shrink();
            final items = map.entries.toList()..sort((a,b)=>a.key.compareTo(b.key));
            return Column(
              children: items.map((e)=>ZoneGaugeCard(price:e.key, s:e.value)).toList(),
            );
          },
        ),
      ],
    );
  }

  Widget _inputs(double cp){
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('?ÖÎ†• Íµ¨Í∞Ñ 5Í∞?, style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              Text(cp==0?'--':cp.toStringAsFixed(1),
                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: List.generate(5, (i)=>SizedBox(
              width: (MediaQuery.of(context).size.width-60)/2,
              child: TextField(
                controller: _c[i],
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'P${i+1}',
                  hintStyle: const TextStyle(color: Colors.white38),
                  filled: true,
                  fillColor: Colors.white10,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                ),
              ),
            )),
          ),
          const SizedBox(height: 10),
          ElevatedButton(
            onPressed: () async {
              final v=_read();
              await UserZonesStore.save(v);
              ZoneScoreEngine.start(v);
              setState((){});
            },
            child: const Text('?Ä???ÅÏö©'),
          )
        ],
      ),
    );
  }
}
