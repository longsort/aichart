import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// ✅ API 접속 프리셋 (DNS/국가망 문제 대비)
/// - “국적/지역 선택”을 깔끔하게 구현하기 위한 1차 버전
const Map<String, String> presetsHttp = {
  '기본(Bitget)': 'https://api.bitget.com',
  '글로벌(대체)': 'https://api.bitget.com', // 나중에 대체 도메인 생기면 여기만 교체
};

const Map<String, String> presetsWs = {
  '기본(Bitget)': 'wss://ws.bitget.com/spot/v1/stream',
  '글로벌(대체)': 'wss://ws.bitget.com/spot/v1/stream',
};

class HelpCheatsheetSheet extends StatefulWidget {
  const HelpCheatsheetSheet({super.key});

  @override
  State<HelpCheatsheetSheet> createState() => _HelpCheatsheetSheetState();
}

class _HelpCheatsheetSheetState extends State<HelpCheatsheetSheet> {
  String _httpKey = presetsHttp.keys.first;
  String _wsKey = presetsWs.keys.first;

  final _customHttp = TextEditingController();
  final _customWs = TextEditingController();

  @override
  void dispose() {
    _customHttp.dispose();
    _customWs.dispose();
    super.dispose();
  }

  String get _httpUrl => (_customHttp.text.trim().isNotEmpty)
      ? _customHttp.text.trim()
      : (presetsHttp[_httpKey] ?? 'https://api.bitget.com');

  String get _wsUrl => (_customWs.text.trim().isNotEmpty)
      ? _customWs.text.trim()
      : (presetsWs[_wsKey] ?? 'wss://ws.bitget.com/spot/v1/stream');

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return SafeArea(
      child: Material(
        color: cs.surface,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 헤더
              Row(
                children: [
                  Text(
                    '앱 사용 설명(초보용)',
                    style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon:
                        Icon(Icons.close, color: cs.onSurface.withOpacity(0.8)),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // 핵심 치트시트
              _bullet(
                '결정칩(상단)',
                '지금 결론: 롱/숏/관망. 점수=유리함, 신뢰=확실함. LOCK면 쉬어라.',
              ),
              _bullet(
                'Zone(구간)',
                '가격대 “핵심 구간”. 1/3/5봉 확률로 다음 움직임 기대치를 보여줌.',
              ),
              _bullet(
                'Flow Radar',
                '체결/오더북 힘싸움. 매수 강도↑ + 흡수↑면 상승 쪽에 유리.',
              ),
              _bullet(
                'TF 히트맵',
                '분/시간/일봉이 같은 방향이면 강함. 서로 다르면 관망이 안전.',
              ),
              const SizedBox(height: 10),

              // 네트워크/DNS 도움
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cs.surface.withOpacity(0.92),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: cs.outline.withOpacity(0.35)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '친구 폰 “Failed host lookup” 해결',
                      style: TextStyle(
                        color: cs.onSurface,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '이건 앱/코드 문제가 아니라 DNS/네트워크 문제일 때가 대부분.\n'
                      '1) 와이파이 ↔ 데이터 전환\n'
                      '2) 개인 DNS 끄기(자동/사용안함)\n'
                      '3) VPN/광고차단 앱 끄기',
                      style: TextStyle(
                        color: muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // ✅ 아래 “URL/설정값 노출” 섹션은 초보에게 혼란 + 오버플로우 원인이어서 제거
              // 고급 설정은 별도 화면(톱니바퀴/설정)에서만 보여주도록 분리
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: cs.outline.withOpacity(0.25)),
                ),
                child: Text(
                  '※ 접속 주소(HTTP/WS) 변경은 “설정(고급)”에서만 제공합니다.\n초보는 여기서 건드릴 필요 없습니다.',
                  style: TextStyle(
                    color: muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    height: 1.25,
                  ),
                ),
              ),

              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String t) {
    final cs = Theme.of(context).colorScheme;
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        t,
        style: TextStyle(
          color: cs.onSurface,
          fontSize: 13,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }

  Widget _bullet(String title, String desc) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color: cs.primary.withOpacity(0.9),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        color: cs.onSurface,
                        fontSize: 12,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(desc,
                    style: TextStyle(
                        color: muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        height: 1.2)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dropdown(String label, String value, List<String> items,
      void Function(String v) onChanged) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outline.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  color: muted, fontSize: 11, fontWeight: FontWeight.w800)),
          DropdownButton<String>(
            isExpanded: true,
            value: value,
            underline: const SizedBox.shrink(),
            items: items
                .map((e) => DropdownMenuItem<String>(
                      value: e,
                      child: Text(e,
                          style: TextStyle(
                              color: cs.onSurface,
                              fontWeight: FontWeight.w900)),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ],
      ),
    );
  }

  Widget _input(String label, TextEditingController c, {String? hint}) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return TextField(
      controller: c,
      style: TextStyle(
          color: cs.onSurface, fontWeight: FontWeight.w900, fontSize: 12),
      decoration: InputDecoration(
        labelText: label,
        labelStyle:
            TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w800),
        hintText: hint,
        hintStyle: TextStyle(
            color: muted.withOpacity(0.7),
            fontSize: 11,
            fontWeight: FontWeight.w700),
        filled: true,
        fillColor: Colors.black.withOpacity(0.05),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.outline.withOpacity(0.25)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.primary.withOpacity(0.65)),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }
}
