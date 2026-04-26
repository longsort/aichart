# 패치 반영 확인 절차

## 1. 개발 서버 완전 재시작 (가장 중요)

`lib/analyze.ts` 등 서버 코드는 **핫 리로드가 잘 안 될 수 있습니다.**

```powershell
# 1) dev 서버 중지 (Ctrl+C)

# 2) .next 캐시 삭제
Remove-Item -Recurse -Force .next

# 3) dev 서버 다시 시작
npm run dev
```

## 2. 브라우저 강력 새로고침

- **Windows**: `Ctrl + Shift + R` 또는 `Ctrl + F5`
- 개발자도구(F12) → 네트워크 탭 → "캐시 비활성화" 체크 후 새로고침

## 3. 분석 재요청

- 타임프레임 변경 (예: 5m → 4h → 5m) 또는
- 심볼 변경 후 원래대로 돌리기
- 또는 페이지 전체 새로고침 (F5)

→ 새 API 호출이 일어나야 최신 `lib/analyze.ts` 결과가 반영됩니다.

## 4. 확인

- Supply/Demand 존: 형성 캔들 기준 **14봉 너비**로만 표시
- Strong High/Low: **12봉** 구간
- 반응구간: **마지막 32봉** 구간만 표시

이렇게 보이면 패치가 적용된 것입니다.
