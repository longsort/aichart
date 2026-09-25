/**
 * 타점엔진 차트 작도 — TradingView 지표 스타일.
 * 존 = 반투명 밴드 · 실행/구조 = 전폭 가격선 · 이벤트 = 캔들 마크.
 * ※ lightweight-charts 금지 (서버 API에서도 호출).
 */
import { zoneVisibleInDefaultUi } from "@/lib/eagle1/zoneEngine";
import { pickVisibleSweepEvents } from "./sweepLiveSignalTap";

export type TapointChartLineStyle = "solid" | "dashed" | "dotted" | "sparse";

export type TapointChartLine = {
  id?: string;
  title: string;
  price: number;
  color: string;
  lineStyle?: TapointChartLineStyle;
  lineWidth?: number;
  labelSide?: "above" | "below";
  group?: string;
};

export type TapointChartZoneBand = {
  id?: string;
  title?: string;
  lo: number;
  hi: number;
  color?: string;
  fillOpacity?: number;
  borderColor?: string;
  priority?: number;
  fill?: string;
  stroke?: string;
};

export type TapointChartMarker = {
  time: number;
  price?: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  label: string;
};

export type TapointChartSignals = {
  lines?: TapointChartLine[];
  zones?: TapointChartZoneBand[];
  markers?: TapointChartMarker[];
  legendKo?: string[];
};

function near(a, b, epsRel = 0.0007) {
    if (!(a > 0) || !(b > 0)) return false;
    return Math.abs(a - b) / Math.max(a, b) < epsRel;
}
function pushLine(out, line, budget, opts) {
    if (!(line.price > 0) || !Number.isFinite(line.price)) return;
    if (!opts?.force && out.some((x)=>near(x.price, line.price))) return;
    if (!opts?.force && budget.n <= 0) return;
    out.push(line);
    if (!opts?.force) budget.n -= 1;
}
function fmtK(n) {
    if (!(n > 0)) return "—";
    if (n >= 1000) {
        const k = n / 1000;
        const s = k >= 100 ? k.toFixed(0) : k.toFixed(1);
        return `${s.replace(/\.0$/, "")}K`;
    }
    return n >= 100 ? n.toFixed(0) : n.toFixed(2);
}
function zoneRangeLabel(lo, hi, name) {
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return `${name} ${fmtK(a)}-${fmtK(b)}`;
}
function zoneVisual(src, bias) {
    const s = String(src || "").toLowerCase();
    /** 사용자 팔레트: 지지=흰 · 저항=빨강 · 주요=노랑 · FVG=연녹 · 하락FVG=연분홍 · 롱=캔들녹 */ if (s === "fvg" || s === "bpr") {
        if (bias === "bearish") {
            return {
                fill: "rgba(251,207,232,0.28)",
                stroke: "#f9a8d4",
                name: "하락FVG"
            };
        }
        return {
            fill: "rgba(187,247,208,0.28)",
            stroke: "#86efac",
            name: "FVG"
        };
    }
    if (s === "supply") {
        return {
            fill: "rgba(239,68,68,0.22)",
            stroke: "#ef4444",
            name: "매도공급"
        };
    }
    if (s === "demand") {
        return {
            fill: "rgba(248,250,252,0.14)",
            stroke: "#f8fafc",
            name: "지지"
        };
    }
    if (bias === "bearish" && (s === "ob" || s === "breaker")) {
        return {
            fill: "rgba(239,68,68,0.16)",
            stroke: "#f87171",
            name: s === "ob" ? "OB저항" : "Breaker ↓"
        };
    }
    if (bias === "bullish" && (s === "ob" || s === "breaker")) {
        return {
            fill: "rgba(34,197,94,0.14)",
            stroke: "#22c55e",
            name: s === "ob" ? "OB지지" : "Breaker ↑"
        };
    }
    if (s === "ob") {
        return {
            fill: "rgba(56,189,248,0.14)",
            stroke: "#38bdf8",
            name: "OB"
        };
    }
    if (s === "breaker") {
        return {
            fill: "rgba(167,139,250,0.14)",
            stroke: "#a78bfa",
            name: "Breaker"
        };
    }
    if (s === "liquidity") {
        return {
            fill: "rgba(251,146,60,0.14)",
            stroke: "#fb923c",
            name: "유동성"
        };
    }
    if (s === "poc" || s === "vah" || s === "val" || s === "hvn" || s === "lvn") {
        return {
            fill: "rgba(148,163,184,0.12)",
            stroke: "#94a3b8",
            name: s.toUpperCase()
        };
    }
    if (bias === "bearish") {
        return {
            fill: "rgba(239,68,68,0.16)",
            stroke: "#ef4444",
            name: "저항"
        };
    }
    if (bias === "bullish") {
        return {
            fill: "rgba(248,250,252,0.12)",
            stroke: "#f8fafc",
            name: "지지"
        };
    }
    return {
        fill: "rgba(250,204,21,0.14)",
        stroke: "#facc15",
        name: s || "구간"
    };
}
/** 롱/구조 상승 = 캔들 초록 */ const LONG_CANDLE = "#22c55e";
const RESIST = "#ef4444";
const SUPPORT = "#f8fafc";
const KEY_ZONE = "#facc15";
function eventColor(kind, bias) {
    if (kind === "SWEEP") return bias === "bullish" ? LONG_CANDLE : "#fb923c";
    if (kind === "FAILED_BREAK") return bias === "bullish" ? LONG_CANDLE : RESIST;
    if (kind === "CHOCH") return bias === "bullish" ? LONG_CANDLE : "#c084fc";
    if (kind === "BOS") return bias === "bullish" ? LONG_CANDLE : "#a78bfa";
    return "#94a3b8";
}
function barTimeSec(bars, idx) {
    if (!(idx >= 0) || idx >= bars.length) return null;
    const raw = Number(bars[idx]?.time);
    if (!(raw > 0)) return null;
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
}
/** known_at/index 는 봉 인덱스 · at 이 유닉스면 그대로 · 아니면 bars[i].time */ function eventCandleTimeSec(ev, bars) {
    const at = Number(ev.at);
    if (Number.isFinite(at) && at > 1e9) {
        return at > 1e12 ? Math.floor(at / 1000) : Math.floor(at);
    }
    const idxRaw = Number(ev.known_at);
    const idx = Number.isFinite(idxRaw) && idxRaw >= 0 && idxRaw < bars.length ? Math.floor(idxRaw) : Number.isFinite(Number(ev.index)) && Number(ev.index) >= 0 && Number(ev.index) < bars.length ? Math.floor(Number(ev.index)) : -1;
    if (idx < 0) return null;
    const t = Number(bars[idx]?.time);
    if (!(t > 0)) return null;
    return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
}
function pushZone(out, z, budget, opts) {
    const lo = Math.min(z.lo, z.hi);
    const hi = Math.max(z.lo, z.hi);
    if (!(lo > 0) || !(hi > 0) || hi <= lo) return;
    /** 너무 얇으면 최소 두께(상대) 보정 */ let lo2 = lo;
    let hi2 = hi;
    if ((hi - lo) / hi < 0.0008) {
        const mid = (lo + hi) / 2;
        const pad = mid * 0.0012;
        lo2 = mid - pad;
        hi2 = mid + pad;
    }
    if (out.some((x)=>near(x.lo, lo2, 0.002) && near(x.hi, hi2, 0.002))) return;
    if (!opts?.force && budget.n <= 0) return;
    out.push({
        ...z,
        lo: lo2,
        hi: hi2,
        priority: z.priority ?? 0
    });
    if (!opts?.force) budget.n -= 1;
}
/**
 * 파이프라인 + 타점 결정 → TV식 작도 팩.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTapointChartSignals(params: any) {
    const lines = [];
    const zones = [];
    const markers = [];
    const legendKo = [];
    const lineBudget = {
        n: 22
    };
    /** 전투·f시작·br시작 슬롯 확보 (공동 폭락존과 겹쳐도 유지) */ const zoneBudget = {
        n: 14
    };
    /** 구조선(BOS/CHoCH/EQL) 전용 — 실행선에 예산 뺏기지 않게 */ const structLineBudget = {
        n: 16
    };
    const pipe = params.pipe;
    const bars = params.bars || [];
    const nBars = bars.length;
    const entryColor = params.direction === "SHORT" ? RESIST : LONG_CANDLE;
    const addExec = (price, title, color, style = "solid", width = 2)=>{
        if (!(price != null && price > 0)) return;
        pushLine(lines, {
            id: `exec-${title}`,
            price,
            title,
            color,
            lineWidth: width,
            lineStyle: style,
            group: "exec"
        }, lineBudget);
    };
    /** 1) 실행선 — 타점 플랜 단일 소스 (숏: TP < 진입 < 손절) */ const hasTapExec = params.entry != null && params.entry > 0 || params.sl != null && params.sl > 0 || params.tp1 != null && params.tp1 > 0;
    addExec(params.entry, "진입", entryColor, "solid", 3);
    addExec(params.sl, "손절", RESIST, "solid", 2);
    addExec(params.tp1, "익절1", LONG_CANDLE, "solid", 2);
    addExec(params.tp2, "익절2", "#16a34a", "dashed", 1);
    addExec(params.tp3, "익절3", "#15803d", "dashed", 1);
    if (hasTapExec) legendKo.push("실행선(타점)");
    /**
   * eagle1 practicalPriceLines 는 별도 E/SL/TP(제목 `TP3 86562` 등)를 또 그림.
   * 타점 플랜이 있으면 중복·방향 충돌만 생기므로 넣지 않음.
   */ if (!hasTapExec) {
        for (const pl of pipe?.executionLevels?.practicalPriceLines || []){
            pushLine(lines, {
                id: `prac-${pl.role}-${pl.price}`,
                price: pl.price,
                title: pl.title,
                color: pl.color,
                lineWidth: Math.min(3, Math.max(1, pl.lineWidth)),
                lineStyle: pl.lineStyle === "dashed" ? "dashed" : pl.lineStyle === "dotted" ? "dotted" : "solid",
                group: "exec"
            }, lineBudget);
        }
    }
    /** 2) 전투구간(Battle) = 노랑 밴드 — 다중 존/유동성 겹침 영역(넓을 수 있음=설계) */ if (params.battleZone) {
        const z = params.battleZone;
        const evidence = Math.max(z.sources?.length || 0, 1);
        const name = evidence >= 3 ? `전투구간·합류${evidence}` : z.labelKo || `전투후보·합류${evidence}`;
        const srcN = z.sources?.length || 0;
        const mid = z.mid > 0 ? z.mid : (z.lo + z.hi) / 2;
        pushZone(zones, {
            id: "battle",
            lo: z.lo,
            hi: z.hi,
            labelKo: zoneRangeLabel(z.lo, z.hi, name),
            fill: "rgba(250,204,21,0.14)",
            stroke: KEY_ZONE,
            kind: "battle",
            priority: 100
        }, zoneBudget, {
            force: true
        });
        /** 우측 가격축에도 동일 라벨 — HTML이 가려져도 보이게 */ pushLine(lines, {
            id: `battle-mid-${Math.round(mid)}`,
            price: mid,
            title: name.slice(0, 22),
            color: KEY_ZONE,
            lineWidth: 1,
            lineStyle: "dashed",
            group: "structure"
        }, lineBudget, {
            force: true
        });
        legendKo.push(srcN > 0 ? `주요 전투구간·합류${srcN}` : `전투합류 ${name}`);
    }
    const rec = pipe?.zones?.recommended;
    if (rec) {
        const lo = Number(rec.lower);
        const hi = Number(rec.upper);
        if (lo > 0 && hi > 0) {
            pushZone(zones, {
                id: "cluster",
                lo,
                hi,
                labelKo: zoneRangeLabel(lo, hi, rec.labelKo || "주요구간"),
                fill: "rgba(250,204,21,0.18)",
                stroke: KEY_ZONE,
                kind: "cluster",
                priority: 90
            }, zoneBudget);
        }
    }
    const rawZones = (pipe?.zones?.zones || []).filter((z)=>zoneVisibleInDefaultUi(z));
    const priority = (z)=>{
        const src = z.source_type;
        let s = z.tier === "S" ? 40 : z.tier === "A" ? 25 : 10;
        /** FVG·Breaker·OB 우선 — 공동 레이어와 겹쳐도 라벨 유지 */ if (src === "fvg" || src === "bpr") s += 32;
        if (src === "breaker") s += 30;
        if (src === "ob") s += 22;
        if (src === "demand" || src === "supply") s += 18;
        if (src === "liquidity") s += 8;
        if (src === "poc") s += 12;
        return s;
    };
    const mustKinds = new Set([
        "fvg",
        "bpr",
        "breaker",
        "ob"
    ]);
    const mustZones = rawZones.filter((z)=>mustKinds.has(String(z.source_type)));
    const restZones = rawZones.filter((z)=>!mustKinds.has(String(z.source_type)));
    const topZones = [
        ...[
            ...mustZones
        ].sort((a, b)=>priority(b) - priority(a)),
        ...[
            ...restZones
        ].sort((a, b)=>priority(b) - priority(a))
    ].slice(0, 12);
    if (topZones.length) {
        legendKo.push(`존 ${[
            ...new Set(topZones.map((z)=>z.source_type))
        ].slice(0, 5).join("/")}`);
    }
    for (const z of topZones){
        const lo = Number(z.lower);
        const hi = Number(z.upper);
        if (!(lo > 0) || !(hi > 0)) continue;
        /** POC 등은 단일선 */ if (z.source_type === "poc" || z.source_type === "vah" || z.source_type === "val") {
            const mid = Number(z.midpoint) || (lo + hi) / 2;
            pushLine(lines, {
                id: `prof-${z.source_type}-${mid}`,
                price: mid,
                title: String(z.source_type).toUpperCase(),
                color: "#e879f9",
                lineWidth: 1,
                lineStyle: "dashed",
                group: "profile"
            }, lineBudget);
            continue;
        }
        const vis = zoneVisual(String(z.source_type), z.bias);
        const tier = z.tier ? ` ${z.tier}` : "";
        const labelKo = zoneRangeLabel(lo, hi, `${vis.name}${tier}`);
        const isCoreFace = mustKinds.has(String(z.source_type));
        pushZone(zones, {
            id: `z-${z.zone_id}`,
            lo,
            hi,
            labelKo,
            fill: vis.fill,
            stroke: vis.stroke,
            kind: String(z.source_type),
            priority: priority(z)
        }, zoneBudget, isCoreFace ? {
            force: true
        } : undefined);
        /** FVG·Breaker·OB — 우측 가격축 라벨 백업 (진입/손절과 같은 축) */ if (isCoreFace) {
            const mid = Number(z.midpoint) || (lo + hi) / 2;
            pushLine(lines, {
                id: `zline-${z.zone_id}`,
                price: mid,
                title: labelKo.slice(0, 24),
                color: vis.stroke,
                lineWidth: 1,
                lineStyle: "dotted",
                group: "structure"
            }, lineBudget, {
                force: true
            });
        }
    }
    /** 3) 구조 이벤트 — BOS/CHoCH=전폭 가로줄+라벨 · SWEEP=가로 노랑점선+라벨 */ const structure = pipe?.structure;
    const minIdx = Math.max(0, nBars - 160);
    /** SWEEP은 축소·스크롤해도 남도록 더 긴 히스토리 */ const minSweepIdx = Math.max(0, nBars - 520);
    const events = (structure?.events || []).filter((e)=>{
        if (e.kind === "SWING") return false;
        const isSweep = String(e.kind || "").toUpperCase() === "SWEEP";
        const floor = isSweep ? minSweepIdx : minIdx;
        const ix = Number(e.known_at);
        if (Number.isFinite(ix) && ix >= 0 && ix < nBars) return ix >= floor;
        const ii = Number(e.index);
        if (Number.isFinite(ii) && ii >= 0 && ii < nBars) return ii >= floor;
        return true;
    });
    const recentEv = events.slice(-24);
    if (recentEv.length) {
        legendKo.push(`구조 ${[
            ...new Set(recentEv.map((e)=>e.kind))
        ].join("/")}`);
    }
    const sweepMarkers = [];
    const visibleSweeps = pickVisibleSweepEvents(events, 80, 2);
    if (visibleSweeps.length) {
        legendKo.push(visibleSweeps.length >= 2 ? `SWEEP ${visibleSweeps.length}` : "SWEEP");
    }
    const seenSweepLine = new Set();
    const seenSweepBarTime = new Set();
    for (const ev of visibleSweeps){
        const lvl = Number(ev.level) || Number(ev.price);
        const wick = Number(ev.price) || lvl;
        if (!(lvl > 0) && !(wick > 0)) continue;
        const tSec = eventCandleTimeSec(ev, bars);
        const swingIdx = Number.isFinite(Number(ev.index)) ? Math.floor(Number(ev.index)) : -1;
        const breakIdx = Number.isFinite(Number(ev.known_at)) ? Math.floor(Number(ev.known_at)) : swingIdx;
        const iFrom = Math.min(swingIdx >= 0 ? swingIdx : Math.max(0, breakIdx), breakIdx >= 0 ? breakIdx : Math.max(0, swingIdx));
        const iTo = Math.max(swingIdx, breakIdx, iFrom + 4, Math.min(nBars - 1, (Number.isFinite(breakIdx) && breakIdx >= 0 ? breakIdx : iFrom) + 12));
        const tFrom = barTimeSec(bars, Math.max(0, iFrom)) ?? (tSec != null && tSec > 0 ? tSec : null);
        const tTo = barTimeSec(bars, Math.min(nBars - 1, Math.max(iTo, iFrom + 1))) ?? (tSec != null && tSec > 0 ? tSec : null);
        const lineKey = `${Math.round(lvl)}`;
        if (lvl > 0 && !seenSweepLine.has(lineKey)) {
            seenSweepLine.add(lineKey);
            pushLine(lines, {
                id: `ev-SWEEP-${ev.index}-${Math.round(lvl)}`,
                price: lvl,
                title: "SWEEP",
                color: "#facc15",
                lineWidth: 1,
                lineStyle: "dashed",
                group: "structure",
                timeFrom: tFrom != null && tFrom > 0 ? tFrom : undefined,
                timeTo: tTo != null && tTo > 0 ? tTo : undefined,
                labelSide: ev.bias === "bullish" ? "below" : "above"
            }, structLineBudget, {
                force: true
            });
        }
        if (tSec != null && tSec > 0 && !seenSweepBarTime.has(tSec)) {
            seenSweepBarTime.add(tSec);
            sweepMarkers.push({
                time: tSec,
                price: wick > 0 ? wick : lvl,
                label: "SWEEP",
                color: "#facc15",
                position: ev.bias === "bullish" ? "belowBar" : "aboveBar",
                shape: "circle"
            });
        }
    }
    for (const ev of recentEv){
        const lvl = Number(ev.level) || Number(ev.price);
        if (!(lvl > 0)) continue;
        const kind = String(ev.kind || "").toUpperCase();
        const title = `${kind}${ev.bias === "bullish" ? " ↑" : " ↓"}`;
        const tSec = eventCandleTimeSec(ev, bars);
        if (kind === "SWEEP") continue;
        if (kind === "BOS" || kind === "CHOCH" || kind === "CHoCH") {
            const labelKo = kind === "CHOCH" || kind === "CHoCH" ? `CHoCH${ev.bias === "bullish" ? " ↑" : " ↓"}` : title;
            /** 이미지형: 스윙(index)에서 돌파(known_at)까지 가로줄 */ const swingIdx = Number.isFinite(Number(ev.index)) ? Math.floor(Number(ev.index)) : -1;
            const breakIdx = Number.isFinite(Number(ev.known_at)) ? Math.floor(Number(ev.known_at)) : swingIdx;
            const iFrom = Math.min(swingIdx >= 0 ? swingIdx : Math.max(0, breakIdx), breakIdx >= 0 ? breakIdx : Math.max(0, swingIdx));
            const iTo = Math.max(swingIdx, breakIdx);
            const tFrom = barTimeSec(bars, iFrom) ?? (tSec != null && tSec > 0 ? tSec : null);
            const tTo = barTimeSec(bars, iTo) ?? (tSec != null && tSec > 0 ? tSec : null);
            pushLine(lines, {
                id: `ev-${kind}-${ev.index}-${Math.round(lvl)}`,
                price: lvl,
                title: labelKo,
                color: eventColor(kind === "CHoCH" ? "CHOCH" : kind, ev.bias),
                lineWidth: 2,
                lineStyle: "solid",
                group: "structure",
                timeFrom: tFrom != null && tFrom > 0 ? tFrom : undefined,
                timeTo: tTo != null && tTo > 0 ? tTo : undefined,
                /** 이미지형: 하방 BOS는 선 아래, 상방 구조는 선 위 */ labelSide: ev.bias === "bullish" ? "above" : "below"
            }, structLineBudget, {
                force: true
            });
        }
    }
    /** 4) 유동성 EQH/EQL — 가로줄 + 선 위/아래 글자 */ for (const p of (structure?.equalHighs || []).slice(-2)){
        pushLine(lines, {
            id: `eqh-${p}`,
            price: p,
            title: "EQH",
            color: "#fb923c",
            lineWidth: 1,
            lineStyle: "sparse",
            group: "liquidity",
            timeFrom: barTimeSec(bars, Math.max(0, nBars - 48)) || undefined,
            timeTo: nBars > 0 ? barTimeSec(bars, nBars - 1) || undefined : undefined,
            labelSide: "above"
        }, structLineBudget, {
            force: true
        });
    }
    for (const p of (structure?.equalLows || []).slice(-2)){
        pushLine(lines, {
            id: `eql-${p}`,
            price: p,
            title: "EQL",
            color: SUPPORT,
            lineWidth: 1,
            lineStyle: "sparse",
            group: "liquidity",
            timeFrom: barTimeSec(bars, Math.max(0, nBars - 48)) || undefined,
            timeTo: nBars > 0 ? barTimeSec(bars, nBars - 1) || undefined : undefined,
            labelSide: "below"
        }, structLineBudget, {
            force: true
        });
    }
    const allowUx = /^(POC|EQH|EQL|SSL|BSL|STOP|ENTRY|TP\d|무효)/i;
    for (const pl of pipe?.chartUx?.priceLines || []){
        const title = String(pl.title || "").trim();
        if (!allowUx.test(title)) continue;
        if (/^(EQH|EQL)$/i.test(title)) continue; /** 위에서 이미 force */ 
        const isInvalid = /무효|invalid/i.test(title);
        pushLine(lines, {
            id: `ux-${title}-${pl.price}`,
            price: pl.price,
            title,
            color: pl.color || (isInvalid ? "#f43f5e" : "#94a3b8"),
            lineWidth: Math.min(2, Math.max(1, Number(pl.lineWidth) || 1)),
            lineStyle: pl.lineStyle === "dashed" ? "dashed" : pl.lineStyle === "dotted" ? "dotted" : "solid",
            group: isInvalid ? "invalid" : /EQH|EQL|SSL|BSL/i.test(title) ? "liquidity" : "profile"
        }, lineBudget);
    }
    if (params.extreme && params.extreme.kind !== "NONE") {
        legendKo.push(`이벤트 ${params.extreme.kind}`);
    }
    if (params.direction) legendKo.push(`방향 ${params.direction}`);
    /** 선진거래량 선행봉 마크 (LWC series marker — time/position만 사용) */ const av = params.advVolume;
    if (av && av.time > 0 && (av.notable || av.action === "long-ref" || av.action === "short-ref")) {
        const tSec = av.time > 1e12 ? Math.floor(av.time / 1000) : Math.floor(av.time);
        markers.push({
            time: tSec,
            price: 0,
            label: av.action === "short-ref" ? "선진↓" : av.action === "long-ref" ? "선진↑" : "선진V",
            color: av.action === "short-ref" ? "#ef4444" : "#22c55e",
            position: av.action === "short-ref" ? "aboveBar" : "belowBar",
            shape: "square"
        });
        legendKo.push(`선진거래량 ${av.actionKo || av.action}`);
    }
    if (params.dailyFace?.labelKo) {
        legendKo.push(params.dailyFace.labelKo);
    }
    const vb = params.volRoeBurst;
    if (vb?.fired && vb.barTime > 0 && (vb.direction === "LONG" || vb.direction === "SHORT")) {
        const tSec = vb.barTime > 1e12 ? Math.floor(vb.barTime / 1000) : Math.floor(vb.barTime);
        markers.push({
            time: tSec,
            price: 0,
            label: vb.direction === "SHORT" ? "폭V↓" : "폭V↑",
            color: vb.direction === "SHORT" ? "#ef4444" : "#22c55e",
            position: vb.direction === "SHORT" ? "aboveBar" : "belowBar",
            shape: vb.direction === "SHORT" ? "arrowDown" : "arrowUp"
        });
        legendKo.push(`볼륨폭발 ${vb.direction === "SHORT" ? "숏" : "롱"} RVOL${vb.rvol.toFixed(1)}`);
    }
    zones.sort((a, b)=>b.priority - a.priority);
    /** SWEEP 라벨 우선 · 로켓에 밀리지 않게 앞에 둠 */ const mergedMarkers = [
        ...sweepMarkers.slice(-24),
        ...markers.slice(-10)
    ];
    return {
        lines,
        zones,
        markers: mergedMarkers,
        legendKo: legendKo.slice(0, 10)
    };
}