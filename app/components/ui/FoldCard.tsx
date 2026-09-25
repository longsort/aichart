'use client';

/**
 * 접기/펴기 카드 — 기능 삭제·숨김 아님. 내용 많은 패널 정리용.
 */
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const LS_PREFIX = 'ailongshort-fold-card:';

type Props = {
  id: string;
  title: string;
  subtitle?: string;
  /** 기본 펼침 */
  defaultOpen?: boolean;
  /** 외부에서 강제 펼침 (칩으로 다시 열 때) */
  forceOpen?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** 헤더 우측 보조 칩 */
  badge?: ReactNode;
  /** 헤더에 닫기 버튼 */
  onClose?: () => void;
  closeTitle?: string;
};

export function FoldCard({
  id,
  title,
  subtitle,
  defaultOpen = false,
  forceOpen,
  children,
  className,
  style,
  badge,
  onClose,
  closeTitle = '닫기',
}: Props) {
  const storageKey = `${LS_PREFIX}${id}`;
  const [open, setOpen] = useState(defaultOpen || !!forceOpen);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === '0') setOpen(false);
      else if (raw === '1') setOpen(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  const stopChart = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  return (
    <section
      className={`fold-card${open ? ' fold-card--open' : ' fold-card--closed'}${className ? ` ${className}` : ''}`}
      style={style}
      data-fold-id={id}
      data-merged-fold-hud="fold-card"
      onPointerDown={stopChart}
      onTouchStart={stopChart}
    >
      <div className="fold-card__head-row">
        <button
          type="button"
          className="fold-card__head"
          onClick={toggle}
          onPointerDown={stopChart}
          aria-expanded={open}
          title={open ? '접기' : '펴기'}
        >
          <span className="fold-card__chev" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <span className="fold-card__titles">
            <span className="fold-card__title">{title}</span>
            {subtitle ? <span className="fold-card__sub">{subtitle}</span> : null}
          </span>
          {badge ? <span className="fold-card__badge">{badge}</span> : null}
          <span className="fold-card__action">{open ? '접기' : '펴기'}</span>
        </button>
        {onClose ? (
          <button
            type="button"
            className="fold-card__close"
            title={closeTitle}
            aria-label={closeTitle}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={stopChart}
          >
            닫기
          </button>
        ) : null}
      </div>
      {open ? <div className="fold-card__body">{children}</div> : null}
    </section>
  );
}

export default FoldCard;
