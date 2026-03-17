D:\apps\ailongshort 기준 STEP13 안정화 통합 패치

이 패치에서 한 번에 수정:
1. 분봉/시간봉/일봉 캔들 표시 수 확대
2. 시간봉별 visible candle 수 분리
3. 미래 Path가 차트 오른쪽 밖으로 밀리는 문제 제거
4. 라벨 겹침/오른쪽 몰림 완화
5. 확대/축소/이동 시 라벨 자석형 안정화 강화

덮어쓰기 파일:
- lib/market.ts
- lib/analyze.ts
- app/components/ChartView.tsx

적용:
1) ZIP 압축 해제
2) 안의 파일들을 D:\apps\ailongshort 에 그대로 덮어쓰기
3) npm run dev
