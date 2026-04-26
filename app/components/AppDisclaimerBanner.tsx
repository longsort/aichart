'use client';

import styles from './AppDisclaimerBanner.module.css';

/**
 * 투자 자문이 아닌 도구·데이터·교육 성격을 사용자에게 명확히 보여 주는 안내.
 * 스타일은 CSS 모듈로 번들에 포함되어 public/globals.css 배포와 무관하게 적용됩니다.
 */
export default function AppDisclaimerBanner({ variant }: { variant: 'login' | 'main' }) {
  if (variant === 'login') {
    return (
      <aside
        className={`${styles.disclaimer} ${styles.disclaimerLogin}`}
        role="note"
        aria-label="서비스 성격 및 면책"
      >
        <div className={styles.shell}>
          <div className={styles.rail} aria-hidden="true">
            i
          </div>
          <div className={styles.inner}>
            <span className={styles.kicker}>도구 · 정보 (투자 자문 아님)</span>
            <p className={styles.text}>
              본 화면은 <strong>투자 권유·자문·중개가 아닌</strong> 차트·데이터 분석 도구입니다. 접속 후 모든 투자
              판단과 손익 책임은 <strong>이용자 본인</strong>에게 있습니다.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`${styles.disclaimer} ${styles.disclaimerMain}`}
      role="note"
      aria-label="서비스 성격 및 면책"
    >
      <div className={styles.shell}>
        <div className={styles.rail} aria-hidden="true">
          i
        </div>
        <div className={styles.inner}>
          <div className={styles.mainHead}>
            <span className={styles.kicker}>도구 · 데이터 · 교육</span>
            <span className={styles.badge}>투자 자문 아님</span>
          </div>
          <ul className={styles.list}>
            <li>
              이 서비스는 <strong>투자 권유·자문·중개</strong>가 아닙니다. 차트·신호·확률·AI 브리핑은 교육·연구·
              분석을 위한 <strong>정보·도구</strong>로만 제공됩니다.
            </li>
            <li>
              모든 <strong>매매·포지션 결정과 손실·수익 책임</strong>은 전적으로 <strong>이용자 본인</strong>에게
              있습니다.
            </li>
            <li>
              과거·백테스트·시뮬·예시 결과는 <strong>미래 수익을 보장하지 않습니다.</strong>
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
