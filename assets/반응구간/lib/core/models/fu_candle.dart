// FU-LINK: FuCandle 타입을 별도 파일로 노출(호환용)
// 프로젝트 기존 구조상 FuCandle은 fu_state.dart 안에 정의돼 있음.
// 신규 엔진 파일들이 fu_candle.dart를 import 하도록 맞춰두면
// 향후 모델 분리에도 영향이 최소화됨.

export 'fu_state.dart' show FuCandle;
