'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Candle } from '@/types';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { ElliottSchematicId } from '@/lib/mergedDeskElliottWave';
import { elliottHotspotKey } from '@/lib/mergedDeskElliottSchematic';
import {
  schoolFigures,
  schoolHint,
  type ClickableSchool,
  type SchoolSchematicPin,
} from '@/lib/mergedDeskSchoolSchematicCatalog';
import { formatSchematicPrice } from '@/lib/mergedDeskSchematicSeatPrice';
import {
  buildSchematicRatioOverlay,
  type SchematicRatioOverlay,
} from '@/lib/mergedDeskSchematicRatioOverlay';
import { schematicSeatPhrase } from '@/lib/mergedDeskSchematicShapeMatch';
import type { PriceBand } from '@/lib/mergedDeskSchematicTightZone';
import styles from './MergedAnalysisDesk.module.css';

type ViewMode = 'split' | 'overlay' | 'clean';

type Props = {
  school: ClickableSchool;
  pin?: SchoolSchematicPin | null;
  elliott?: MergedDeskElliottRead | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  candles?: Candle[];
  lastPrice?: number | null;
  buyBand?: PriceBand | null;
  sellBand?: PriceBand | null;
  onClose: () => void;
};

type OverlayFlags = {
  showLine: boolean;
  showZones: boolean;
  showLabs: boolean;
  opacity: number;
  labelPx: number;
};

type FigureKind = 'plain' | 'seat' | 'compare' | 'overlay';

function trailLabelSide(
  trail: NonNullable<SchematicRatioOverlay['trail']>,
  idx: number
): 'above' | 'below' {
  const p = trail[idx];
  if (!p) return 'above';
  const prev = trail[idx - 1];
  const next = trail[idx + 1];
  if (prev && next) {
    if (p.y <= prev.y && p.y <= next.y) return 'above';
    if (p.y >= prev.y && p.y >= next.y) return 'below';
  } else if (next) return p.y <= next.y ? 'above' : 'below';
  else if (prev) return p.y <= prev.y ? 'above' : 'below';
  return p.y < 48 ? 'above' : 'below';
}

function SchematicFigure({
  src,
  alt,
  overlay,
  nowPhrase,
  sideClass,
  verdict,
  kind,
  flags,
}: {
  src: string;
  alt: string;
  overlay: SchematicRatioOverlay | null;
  nowPhrase: string;
  sideClass: string;
  verdict: string;
  kind: FigureKind;
  flags: OverlayFlags;
}) {
  const trailPoly = overlay?.trail.map((p) => `${p.x},${p.y}`).join(' ');
  const poly = overlay?.path.map((p) => `${p.x},${p.y}`).join(' ');
  const match = overlay?.match;
  const nowPt = overlay?.now;
  const sellBox = overlay?.sellZone;
  const buyBox = overlay?.buyZone;
  const hideTextbook = kind === 'compare';
  const showCompare = kind === 'compare' || kind === 'overlay';
  const showSeat = kind === 'seat' || kind === 'overlay' || kind === 'compare';
  const layerOpacity =
    kind === 'seat' || kind === 'compare' ? 1 : Math.max(0.15, Math.min(1, flags.opacity / 100));
  const room = overlay?.room;
  const upY = kind === 'compare' ? room?.upYMap : room?.upYNative;
  const downY = kind === 'compare' ? room?.downYMap : room?.downYNative;

  return (
    <div className={`${styles.schematicImgWrap} ${hideTextbook ? styles.schematicImgWrapBare : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={hideTextbook ? '' : alt} className={hideTextbook ? styles.schematicImgGhost : styles.schematicImg} />
      {overlay && showSeat && (
        <div
          className={styles.schematicOverlayLayer}
          style={{
            opacity: layerOpacity,
            ['--schematic-lab-px' as string]: `${flags.labelPx}px`,
          }}
        >
          {showCompare && flags.showLine && (
            <svg className={styles.schematicRatioSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
              {trailPoly && (
                <polyline points={trailPoly} className={styles.schematicTrailPath} fill="none" />
              )}
              {poly && (
                <>
                  <polyline points={poly} className={styles.schematicLivePathHalo} fill="none" />
                  <polyline points={poly} className={styles.schematicLivePath} fill="none" />
                </>
              )}
              {nowPt && (
                <g className={styles.schematicNowCross}>
                  <line x1={nowPt.x - 2.4} x2={nowPt.x + 2.4} y1={nowPt.y} y2={nowPt.y} />
                  <line x1={nowPt.x} x2={nowPt.x} y1={nowPt.y - 2.4} y2={nowPt.y + 2.4} />
                </g>
              )}
              {overlay.bounceY != null && match && (
                <line
                  x1={Math.max(2, match.left - 8)}
                  x2={Math.min(98, match.left + 8)}
                  y1={overlay.bounceY}
                  y2={overlay.bounceY}
                  className={styles.schematicBounceLine}
                />
              )}
              {overlay.dumpY != null && match && (
                <line
                  x1={Math.max(2, match.left - 8)}
                  x2={Math.min(98, match.left + 8)}
                  y1={overlay.dumpY}
                  y2={overlay.dumpY}
                  className={styles.schematicDumpLine}
                />
              )}
            </svg>
          )}
          {kind !== 'seat' &&
            overlay.trail.map((p) => {
              if (!p.key) return null;
              const isBest = p.key === match?.hotspotKey;
              if (kind === 'compare' && !flags.showLabs && !isBest) return null;
              return (
                <span
                  key={`ring-${p.key}`}
                  className={styles.schematicLabPin}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <span
                    className={`${styles.schematicLabRing} ${
                      isBest ? styles.schematicLabRingBest : ''
                    }`}
                  />
                </span>
              );
            })}
          {showCompare &&
            flags.showLabs &&
            overlay.trail.map((p, idx) => {
              if (!p.key) return null;
              const isBest = p.key === match?.hotspotKey;
              const onPath = overlay.path.some((q) => q.key === p.key);
              const side = trailLabelSide(overlay.trail, idx);
              return (
                <span
                  key={`lab-${p.key}`}
                  className={`${
                    isBest
                      ? styles.schematicSpotLabBest
                      : onPath
                        ? styles.schematicSpotLab
                        : styles.schematicSpotLabSoon
                  } ${side === 'above' ? styles.schematicSpotLabAbove : styles.schematicSpotLabBelow}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  {isBest ? `★${p.label}` : p.label}
                </span>
              );
            })}
          {showCompare && flags.showZones && sellBox && (
            <span
              className={styles.schematicZoneBoxSell}
              style={{
                left: `${sellBox.left}%`,
                top: `${sellBox.top}%`,
                width: `${sellBox.width}%`,
                height: `${sellBox.height}%`,
              }}
            >
              <span className={styles.schematicZoneBoxLab}>
                매도ZONE {formatSchematicPrice(sellBox.lo)}–{formatSchematicPrice(sellBox.hi)}
              </span>
            </span>
          )}
          {showCompare && flags.showZones && buyBox && (
            <span
              className={styles.schematicZoneBoxBuy}
              style={{
                left: `${buyBox.left}%`,
                top: `${buyBox.top}%`,
                width: `${buyBox.width}%`,
                height: `${buyBox.height}%`,
              }}
            >
              <span className={styles.schematicZoneBoxLab}>
                매수ZONE {formatSchematicPrice(buyBox.lo)}–{formatSchematicPrice(buyBox.hi)}
              </span>
            </span>
          )}
          {showCompare && room?.up && upY != null && (
            <span className={styles.schematicRoomRailUp} style={{ top: `${upY}%` }} />
          )}
          {showCompare && room?.down && downY != null && (
            <span className={styles.schematicRoomRailDown} style={{ top: `${downY}%` }} />
          )}
          {kind === 'seat' && match && (
            <span
              className={`${styles.schematicHot} ${styles.schematicHotGreen}`}
              style={{
                left: `${nowPt?.lx ?? match.left}%`,
                top: `${nowPt?.ly ?? match.top}%`,
              }}
            >
              <span className={styles.schematicHotPin}>
                <span className={styles.schematicHotRing} />
              </span>
            </span>
          )}
          {showCompare && flags.showLabs && match && (
            <span
              className={`${styles.schematicHot} ${styles.schematicHotGreen}`}
              style={{ left: `${nowPt?.x ?? match.left}%`, top: `${nowPt?.y ?? match.top}%` }}
            >
              <span className={styles.schematicHotPin}>
                <span className={styles.schematicHotRing} />
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function MergedDeskSchematicViewer({
  school,
  pin,
  elliott,
  wyckoff,
  candles,
  lastPrice,
  buyBand,
  sellBand,
  onClose,
}: Props) {
  const figures = schoolFigures(school);
  const [figOverride, setFigOverride] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [opacity, setOpacity] = useState(62);
  const [showLine, setShowLine] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showLabs, setShowLabs] = useState(true);
  const [labelPx, setLabelPx] = useState(11);
  const [mounted, setMounted] = useState(false);
  const figId = figOverride ?? pin?.figureId ?? figures[0]?.id ?? '';
  const fig = figures.find((f) => f.id === figId) ?? figures[0] ?? null;

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const overlay = useMemo(
    () =>
      buildSchematicRatioOverlay({
        school,
        figureId: fig?.id,
        pin,
        elliott: school === 'elliott' ? elliott : null,
        wyckoff: school === 'wyckoff' ? wyckoff : null,
        candles,
        lastPrice,
        buyBand,
        sellBand,
      }),
    [pin, elliott, wyckoff, candles, lastPrice, school, fig?.id, buyBand, sellBand]
  );

  const model = useMemo(() => {
    if (!fig) return null;
    let key = pin?.hotspotKey ?? '';
    if (school === 'elliott' && elliott) {
      key = elliottHotspotKey(elliott, fig.id as ElliottSchematicId);
    }
    const rawPx = overlay?.now.price ?? lastPrice ?? pin?.lastPrice ?? pin?.eventPrice;
    const nowPx = Number.isFinite(rawPx) && Number(rawPx) > 0 ? Number(rawPx) : null;
    const verdict = overlay?.verdict ?? '대기';
    return {
      title: overlay?.match?.labelKo || pin?.titleEn || pin?.headlineKo || fig.tabKo,
      hint: schoolHint(school),
      src: fig.src,
      alt: pin?.headlineKo || fig.tabKo,
      engineKey: key,
      seatKo: pin?.seatKo ?? overlay?.verdict ?? '대기',
      verdict,
      nowPx,
      zoneLow: overlay?.buyZone?.lo ?? overlay?.sellZone?.lo ?? pin?.zoneLow,
      zoneHigh: overlay?.buyZone?.hi ?? overlay?.sellZone?.hi ?? pin?.zoneHigh,
      bounceTo: pin?.bounceTo,
      dumpTo: pin?.dumpTo,
      bounceKo: pin?.bounceKo,
      invalKo: pin?.invalKo ?? '확정 진입 아님 · 조건부 해석.',
      explain: pin?.explainKo ?? ['현재 자리는 미검출. 교재 도식만 표시. 확정 아님.'],
      caption: fig.captionKo,
      similarKo: overlay?.match?.similarKo ?? '',
    };
  }, [fig, pin, school, elliott, lastPrice, overlay]);

  if (!model || !mounted) return null;

  const sideClass =
    model.verdict === '빅롱' || model.verdict === '롱'
      ? styles.schematicSeatLong
      : model.verdict === '숏' || model.verdict === '폭락'
        ? styles.schematicSeatShort
        : styles.schematicSeatWait;

  const match = overlay?.match;
  const sellBox = overlay?.sellZone;
  const buyBox = overlay?.buyZone;
  const nowPhrase = match ? schematicSeatPhrase(match.hotspotKey, match.score) : overlay?.now.label ?? '';
  const flags: OverlayFlags = { showLine, showZones, showLabs, opacity, labelPx };
  const paneProps = {
    src: model.src,
    alt: model.alt,
    overlay,
    nowPhrase,
    sideClass,
    verdict: model.verdict,
    flags,
  };

  return createPortal(
    <div
      className={styles.schematicBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${school} 도식`}
      data-merged-schematic-backdrop="1"
      onClick={onClose}
    >
      <div
        className={`${styles.schematicPanel} ${viewMode === 'split' ? styles.schematicPanelWide : ''}`}
        data-merged-schematic-panel="1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={styles.schematicHead}>
          <strong>
            결론 · {model.verdict}
            {model.nowPx != null ? ` · ${formatSchematicPrice(model.nowPx)}` : ''}
          </strong>
          <button
            type="button"
            className={styles.schematicClose}
            data-merged-schematic-ctrl="1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            닫기
          </button>
        </div>
        <p className={styles.schematicHint}>
          원본은 도식 라벨 위 원만(문자 없음). 우측 글자 크기는 슬라이더로. Esc·바깥·닫기=종료. 확정 아님.
        </p>
        {model.similarKo ? <p className={styles.schematicSimilar}>{model.similarKo}</p> : null}
        {figures.length > 0 && (
          <div className={styles.schematicTabs} data-merged-schematic-ctrl="1">
            {figures.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`${styles.schematicTab} ${fig?.id === f.id ? styles.schematicTabOn : ''}`}
                data-merged-schematic-ctrl="1"
                title={f.captionKo}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFigOverride(f.id);
                }}
              >
                {f.tabKo}
              </button>
            ))}
          </div>
        )}
        {figures.length > 1 && (
          <div className={styles.schematicThumbRow} data-merged-schematic-ctrl="1" aria-label="원본 도식">
            {figures.map((f) => (
              <button
                key={`thumb-${f.id}`}
                type="button"
                className={`${styles.schematicThumb} ${fig?.id === f.id ? styles.schematicThumbOn : ''}`}
                data-merged-schematic-ctrl="1"
                title={f.captionKo}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFigOverride(f.id);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} alt={f.tabKo} />
                <span>{f.tabKo}</span>
              </button>
            ))}
          </div>
        )}
        <div className={styles.schematicViewBar} data-merged-schematic-ctrl="1">
          <div className={styles.schematicViewModes}>
            {(
              [
                ['split', '나란히'],
                ['overlay', '겹침'],
                ['clean', '원본만'],
              ] as const
            ).map(([id, lab]) => (
              <button
                key={id}
                type="button"
                className={`${styles.schematicViewBtn} ${viewMode === id ? styles.schematicViewBtnOn : ''}`}
                data-merged-schematic-ctrl="1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setViewMode(id);
                }}
              >
                {lab}
              </button>
            ))}
          </div>
          {viewMode === 'overlay' && (
            <label className={styles.schematicOpacityLab}>
              비교 투명도 {opacity}%
              <input
                type="range"
                min={20}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
          )}
          {viewMode !== 'clean' && (
            <label className={styles.schematicOpacityLab}>
              우측 글자 {labelPx}px
              <input
                type="range"
                min={8}
                max={20}
                value={labelPx}
                onChange={(e) => setLabelPx(Number(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
          )}
          {viewMode !== 'clean' && (
            <div className={styles.schematicLayerToggles}>
              <label>
                <input
                  type="checkbox"
                  checked={showLine}
                  onChange={(e) => setShowLine(e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                비교줄
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={(e) => setShowZones(e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                ZONE
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showLabs}
                  onChange={(e) => setShowLabs(e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                약어
              </label>
            </div>
          )}
        </div>
        {viewMode === 'split' ? (
          <div className={styles.schematicSplit}>
            <div>
              <p className={styles.schematicPaneCap}>원본 · 지금 자리만</p>
              <SchematicFigure {...paneProps} kind="seat" />
            </div>
            <div className={styles.schematicCompareCol}>
              <p className={styles.schematicPaneCap}>현물도식 · 아래</p>
              <div className={styles.schematicCompareDock}>
                <SchematicFigure {...paneProps} kind="compare" />
                <div
                  className={styles.schematicCompareNote}
                  style={{ ['--schematic-lab-px' as string]: `${labelPx}px` }}
                >
                  <span className={styles.schematicWhereBest}>
                    최고일치 ★{nowPhrase || '—'}
                    {model.nowPx != null ? ` · ${formatSchematicPrice(model.nowPx)}` : ''}
                    {match && match.score > 0 ? ` · ${Math.round(match.score)}` : ''}
                  </span>
                  {overlay?.room?.up ? (
                    <span className={styles.schematicWhereSell}>{overlay.room.up.ko}</span>
                  ) : null}
                  {overlay?.room?.down ? (
                    <span className={styles.schematicWhereBuy}>{overlay.room.down.ko}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <SchematicFigure {...paneProps} kind={viewMode === 'overlay' ? 'overlay' : 'plain'} />
        )}
        <div className={`${styles.schematicSeatBar} ${sideClass}`}>
          <span className={styles.schematicSeatTag}>{model.verdict}</span>
          <span>
            도식자리 <strong>{nowPhrase || match?.labelKo || '—'}</strong>
          </span>
          <span>
            지금가 <strong>{model.nowPx != null ? formatSchematicPrice(model.nowPx) : '—'}</strong>
          </span>
          {overlay?.room?.up && (
            <span>
              상승여유 <strong>{overlay.room.up.ko}</strong>
            </span>
          )}
          {overlay?.room?.down && (
            <span>
              하락여유 <strong>{overlay.room.down.ko}</strong>
            </span>
          )}
          {buyBox && (
            <span>
              매수ZONE{' '}
              <strong>
                {formatSchematicPrice(buyBox.lo)}–{formatSchematicPrice(buyBox.hi)}
              </strong>
            </span>
          )}
          {sellBox && (
            <span>
              매도ZONE{' '}
              <strong>
                {formatSchematicPrice(sellBox.lo)}–{formatSchematicPrice(sellBox.hi)}
              </strong>
            </span>
          )}
          {Number.isFinite(model.bounceTo) && Number(model.bounceTo) > 0 && (
            <span>
              {model.bounceKo || '반등 목표'} <strong>{formatSchematicPrice(model.bounceTo!)}</strong>
            </span>
          )}
          {Number.isFinite(model.dumpTo) && Number(model.dumpTo) > 0 && (
            <span>
              폭락목표 <strong>{formatSchematicPrice(model.dumpTo!)}</strong>
            </span>
          )}
          <span className={styles.schematicSeatInval}>{model.invalKo}</span>
        </div>
        {model.caption ? <p className={styles.schematicCaption}>{model.caption}</p> : null}
        {model.explain.length > 0 && (
          <ul className={styles.schematicExplain}>
            {model.explain.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}
