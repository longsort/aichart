
class ReviewEngine {
  String summarize(bool win, Map<String,dynamic> meta){
    if(win){
      return "성공: 구조/체결 일치. 다음에도 동일 패턴 우선.";
    }else{
      return "실패: 타임프레임 불일치 또는 체결 약화.";
    }
  }
}
