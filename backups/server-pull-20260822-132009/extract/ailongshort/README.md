# chart-analysis-step10-bundle

## 재고관리 WMS (스테인리스 플랜지·毛皮 반제품)

기본 URL `/` 은 **재고 대시보드**(`/dashboard`)로 연결됩니다. 기존 차트 분석은 **`/trading`** 입니다.

### 준비

1. `.env.local` (또는 `.env`) 에 SQLite URL 추가:

```env
DATABASE_URL="file:./dev.db"
```

(`file:./dev.db` 는 Prisma 기준 **`prisma/dev.db`** 파일입니다.)

2. 의존성 설치 및 DB:

```bash
npm install
npx prisma migrate dev --name init_wms
npx prisma db seed
```

3. 개발 서버:

```bash
npm run dev
```

브라우저: `http://localhost:3000/dashboard`

### PostgreSQL 로 전환할 때

- `DATABASE_URL` 을 PostgreSQL 접속 문자열로 변경
- `prisma/schema.prisma` 의 `datasource db` 의 `provider` 를 `postgresql` 로 변경
- `npx prisma migrate deploy` (또는 `migrate dev`)

### 주요 라우트

| 경로 | 설명 |
|------|------|
| `/dashboard` | 대시보드 |
| `/items` | 품목 마스터 |
| `/inventory` | LOT·Heat 재고 |
| `/stock/in` · `/stock/out` | 입고·출고 |
| `/process` | 毛皮 반제품 가공 |
| `/quality` | 검사·MTC |
| `/safety` | 안전재고 경고 |
| `/moves` | 재고이동 이력 |
| `/settings` | 위치·기초코드 |
| `/trading` | 기존 차트 분석 |

---

## run
npm install
npm run dev

## open
http://localhost:3000/dashboard (재고 WMS) · http://localhost:3000/trading (차트)

## 사이트 로그인
- 첫 화면에서 **아이디·비밀번호** 입력 후 접속합니다.
- 기본값: `aichart` / `longshort` (`.env.local`에서 `APP_BRIEFING_LOGIN_USER`, `APP_BRIEFING_LOGIN_PASSWORD`로 변경 가능)
- 운영 시 `APP_SESSION_SECRET`에 임의의 긴 문자열을 설정하세요 (세션 쿠키 서명).
- 로그인 성공 시 HttpOnly 쿠키가 발급되며, `/api/*`(인증 제외)는 쿠키 없으면 401입니다.

## added in step10
- premium / discount / equilibrium zone
- support / resistance trendlines
- top references panel improved
- analysis history panel
- live engine scores
- cleaner right-side dashboard

## 재고관리(WMS)

스테인리스 플랜지·毛皮 반제품 가공 재고 모듈입니다. 메인 화면 제목 아래 **「재고관리(WMS)」** 링크 또는 `http://localhost:3000/dashboard` 로 진입합니다.

### 사전 준비

1. `.env.local`에 SQLite URL을 넣을 수 있습니다. **없으면** 앱은 `file:./dev.db` 를 씁니다(Prisma 기준 **`prisma/dev.db`**). 수동으로 넣을 때도 **`file:./prisma/dev.db` 는 금지**(이중 `prisma` 폴더로 잘못 해석됨)이고, 아래처럼 **`file:./dev.db`** 만 사용하세요.

```env
DATABASE_URL="file:./dev.db"
```

2. 스키마 반영 및 시드:

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

마이그레이션 폴더를 쓰려면: `npm run db:migrate` (개발 DB에 `migrate dev` 적용).

### 개발 서버

```bash
npm run dev
```

- 차트 앱: `http://localhost:3000`
- WMS: `http://localhost:3000/dashboard` (메뉴: 대시보드, 품목, LOT, 입·출고, 가공, 검사, 안전재고, 이력, 설정)

### 기술 메모

- WMS UI는 `app/(wms)`·`components/wms`에 한정해 Tailwind를 쓰며, 루트 `globals.css`와 충돌을 줄이기 위해 `tailwind.config.ts`에서 `preflight`를 끕니다.
- PostgreSQL로 바꿀 때는 `prisma/schema.prisma`의 `datasource db` `provider`와 `DATABASE_URL`만 운영 값으로 맞추면 됩니다.
