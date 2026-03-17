import 'api_config.dart';

enum RegionMode { KR, CN }

/// 런타임 모드(삭제 없이 기능 ON/OFF)
/// - KR: 풀기능(HTTP/WS/실시간 ON)
/// - CN: 중국/연변 우회모드(HTTP ON + 우회 주소 사용, WS는 필요 시 OFF)
RegionMode regionMode = RegionMode.KR;

bool wsEnabled = true;
bool realtimeEnabled = true;
bool httpEnabled = true;

void applyRegion(RegionMode r) {
  regionMode = r;
  if (regionMode == RegionMode.CN) {
    // ✅ 중국 환경: DNS 차단이 잦아서 WS는 꺼두고, HTTP는 유지(우회 주소로)
    wsEnabled = false;
    realtimeEnabled = true;
    httpEnabled = true;
    ApiConfig.setPreset('중국(우회)');
  } else {
    wsEnabled = true;
    realtimeEnabled = true;
    httpEnabled = true;
    ApiConfig.setPreset('기본(권장)');
  }
}
