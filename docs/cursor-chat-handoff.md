# 다른 Cursor 채팅방에서 맥락 이어가기

## 새 채팅에서 이렇게 쓰면 됩니다

1. **이 파일을 열어 둔 채** 새 Composer/Chat을 연다.
2. 입력창에 **`@docs/cursor-chat-handoff.md`** 처럼 이 파일을 **멘션(@)** 하거나, 필요한 단만 복사해 붙여넣는다.
3. 이어서 할 일을 한 줄로 적는다. 예: *“analyze API 쪽만 더 줄이고 싶어”*, *“AbortError 또 나면 어디 보면 돼?”*

> 전체 대화가 자동으로 다른 방에 복사되지는 않습니다. **요약·결정 사항은 이 문서(또는 `.cursor/rules`)에 남기는 방식**이 가장 확실합니다.

---

## 이 레포에서 최근에 맞춘 것 (요약)

### 문제

- 캔들은 빨라졌는데 **차트 전체 분석(`/api/analyze`, `collect=1`)** 이 오래 걸리거나 멈춘 것처럼 보임.
- **MTF 멀티 타임프레임** effect 정리 시 `AbortController.abort()` → `fetch` 가 `AbortError` 로 끊기는데, **Promise에 `.catch()` 가 없어** “Unhandled Runtime Error: AbortError” 발생.

### 서버·데이터

- `lib/data/dataService.ts`  
  - 체결·호가·펀딩·OI 수집에 **`withTimeout`** (각각 수 초 상한). `fetch` 가 영원히 안 오면 나머지 분석이 막히지 않도록.
- `app/api/analyze/route.ts`  
  - `fetchMarketData` 에 **`Promise.race` 12초** — 넘으면 캔들만 `fetchMarketCandles` 로 폴백.

### 클라이언트

- `app/HomePageContent.tsx` — `load(..., fastMode === false)` 일 때  
  1. **`collect=0`** 으로 먼저 분석·오버레이 표시 (로딩 해제).  
  2. **`collect=1`** 은 **백그라운드**로 보강. 실패해도 빠른 결과 유지. 보강만 적용할 때는 **히스토리 중복 방지** (`skipHistory`).
- 같은 파일 — `fetchMtfStaggered()` 호출에 **`.catch(() => {})`** 추가 (abort 시 미처리 거부 방지).

### 공통

- `lib/fetchWithRetry.ts` — **`AbortError` 는 재시도 없이 즉시 throw** (abort 후 불필요한 대기 방지).

---

## 규칙을 영구히 남기고 싶을 때

- 프로젝트 전역: `.cursor/rules/` 아래 규칙 파일 추가.
- 사용자 전체: Cursor 설정의 **Rules for AI** (User Rules).

이 파일은 필요할 때마다 위 요약을 **직접 수정·덧붙이면** 됩니다.
