class AiReason {
  final String title;
  final String desc;
  AiReason(this.title, this.desc);
}

List<AiReason> buildReasons({
  required int evidence,
  required bool whaleAcc,
  required bool whaleDis,
}) {
  final List<AiReason> r = [];
  r.add(AiReason("증거", "확보 $evidence/6"));
  if (whaleAcc) r.add(AiReason("고래", "매집 감지"));
  if (whaleDis) r.add(AiReason("고래", "분산 감지"));
  if (!whaleAcc && !whaleDis) r.add(AiReason("고래", "중립"));
  return r;
}
