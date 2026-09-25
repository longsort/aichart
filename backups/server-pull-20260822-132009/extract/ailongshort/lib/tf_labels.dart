
class TfLabel {
  final String key;      // 1m/5m/...
  final String cn;       // China-ready
  final String kr;       // KR
  const TfLabel(this.key, this.cn, this.kr);
}

const tfLabels = <TfLabel>[
  TfLabel("1m", "快�?, "빠름"),
  TfLabel("5m", "很快", "매우빠름"),
  TfLabel("15m", "??�?, "보통"),
  TfLabel("1H", "稳定", "?�정"),
  TfLabel("4H", "大趋??, "?�추??),
  TfLabel("1D", "每日", "매일"),
  TfLabel("1W", "每周", "매주"),
  TfLabel("1M", "每月", "매달"),
];
