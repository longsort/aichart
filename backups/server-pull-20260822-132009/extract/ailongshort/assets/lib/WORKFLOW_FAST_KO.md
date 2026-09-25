# Fulink Pro 빠른 패치 워크플로우(추천)

## 목표
- 매번 "zip 전체"를 갈아엎지 말고, **묶음 패치(zip)** 로만 교체
- 에러 재발 방지: **컴파일/분석 체크 + 체크리스트**

---

## A. 제일 빠른 방식(권장)
1) **기준 ZIP(정상 실행본)** 을 딱 1개로 고정
2) 변경은 한 번에 모아서 **하나의 묶음 패치(zip)** 로 제공
3) 너는 프로젝트 폴더에서 아래만 실행

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\apply_patch.ps1 .\PATCH.zip
```

### Termux/Linux
```bash
./tools/apply_patch.sh ./PATCH.zip
```

패치가 적용되면 자동으로 `_backup_시간` 폴더가 생김 → 문제 생기면 그 폴더로 롤백 가능.

---

## B. 에러 재발 방지(반드시)
패치 만들기 전에 아래 3개는 **자동으로** 돌림

```bash
flutter format .
flutter analyze
flutter build windows -v
```

- `required named parameter` 추가되면 → **기존 호출부 전부 수정**
- 새 필드 추가하면 → **State 클래스에 기본값/late 초기화**

---

## C. 우리 작업 규칙(실수 반복 방지)
- "캔들" 같은 핵심은 **차트 위젯 한 파일만 수정** (mini_chart_v4.dart)
- UI/문구는 화면 파일만 (ultra_home_screen.dart)
- 기능은 엔진 파일만 (services/engine)

---

## D. 다음 패치 순서(1→2→3)
1) **차트 확대/전체화면 + 캔들 안정화**
2) **반응구간(지지/저항) 2개 가격 라벨 + 투명도 조절(사용자 슬라이더)**
3) **OB/FVG/BPR 등 구간 오버레이(표시/숨김 토글, 한글 라벨)**
