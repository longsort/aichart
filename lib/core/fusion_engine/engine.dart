import 'models.dart';

FusionResult fuse(FusionInput input) {
  if (input.whaleState == 'BLOCK') {
    return FusionResult('BLOCK', 0, '?�력 차단');
  }

  if (input.signalState != 'SIGNAL') {
    return FusionResult('WAIT', 0, '?�호 조건 미달');
  }

  int baseProb = 40;

  if (input.spineState != 'WAIT') baseProb += 20;
  baseProb += (input.tfScore ~/ 5); // TF ?�의 반영
  if (input.whaleState == 'SUPPORT') baseProb += 10;
  if (input.whaleState == 'PRESSURE') baseProb -= 10;

  if (baseProb < 0) baseProb = 0;
  if (baseProb > 100) baseProb = 100;

  return FusionResult(
    input.spineState,
    baseProb,
    '?�진 결과 종합',
  );
}
