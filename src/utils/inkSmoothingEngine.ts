// ============================================================================
// ADAPTIVE INK SMOOTHING & VELOCITY-BASED STROKE PREDICTION ENGINE
// Supports Fountain Pen (Bút máy), Graphite Pencil (Bút chì), & Standard Pen
// ============================================================================

export type PenNibType = 'fountain' | 'pencil' | 'standard';

export interface InkPoint {
  x: number;
  y: number;
  pressure?: number;
  t?: number;
  wFactor?: number;
}

export interface InkSessionOptions {
  nibType: PenNibType;
  smoothingLevel: number; // 0..100
  predictionEnabled: boolean;
  zoom: number;
}

export interface InkFilterSession {
  nibType: PenNibType;
  smoothingLevel: number;
  predictionEnabled: boolean;
  // Filtered position & velocity state (One-Euro Filter)
  lastRawX: number;
  lastRawY: number;
  filtX: number;
  filtY: number;
  vx: number; // world px / ms
  vy: number; // world px / ms
  prevVx: number;
  prevVy: number;
  ax: number; // world px / ms^2
  ay: number; // world px / ms^2
  lastT: number;
  smoothedWidthFactor: number;
  turnDamping: number; // 0..1 (drops near sharp corners to avoid prediction overshoot)
  sampleCount: number;
}

export const DEFAULT_PEN_NIB_TYPE: PenNibType = 'fountain';
export const DEFAULT_PEN_SMOOTHING = 55; // 0..100 (55% = Chuẩn sư phạm)
export const DEFAULT_PEN_PREDICTION = true;

export const SMOOTHING_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Nhẹ', value: 25 },
  { label: 'Chuẩn', value: 55 },
  { label: 'Mượt cao', value: 85 },
];

export function getSmoothingLabel(level: number): string {
  if (level <= 0) return 'Tắt';
  if (level <= 35) return 'Nhẹ';
  if (level <= 70) return 'Chuẩn';
  return 'Mượt cao';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function oneEuroAlpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(0.05, cutoffHz));
  return 1 / (1 + tau / Math.max(0.001, dtSec));
}

/**
 * Initialize a new per-stroke adaptive smoothing + velocity prediction session on pointerdown.
 */
export function createInkFilterSession(
  startPt: { x: number; y: number; pressure?: number; t?: number },
  pointerType: string,
  options: InkSessionOptions
): { session: InkFilterSession; initialPoint: InkPoint } {
  const t0 = startPt.t ?? performance.now();
  const initialW = computeInitialNibWidthFactor(options.nibType, pointerType, startPt.pressure);

  const session: InkFilterSession = {
    nibType: options.nibType,
    smoothingLevel: clamp(options.smoothingLevel, 0, 100),
    predictionEnabled: options.predictionEnabled,
    lastRawX: startPt.x,
    lastRawY: startPt.y,
    filtX: startPt.x,
    filtY: startPt.y,
    vx: 0,
    vy: 0,
    prevVx: 0,
    prevVy: 0,
    ax: 0,
    ay: 0,
    lastT: t0,
    smoothedWidthFactor: initialW,
    turnDamping: 1,
    sampleCount: 1,
  };

  return {
    session,
    initialPoint: {
      x: startPt.x,
      y: startPt.y,
      pressure: startPt.pressure,
      t: t0,
      wFactor: initialW,
    },
  };
}

function computeInitialNibWidthFactor(
  nibType: PenNibType,
  pointerType: string,
  pressure?: number
): number {
  if (nibType === 'standard') return 1;
  const hasRealPressure =
    pointerType === 'pen' &&
    typeof pressure === 'number' &&
    pressure > 0 &&
    Math.abs(pressure - 0.5) > 0.015;

  if (nibType === 'pencil') {
    if (hasRealPressure) return Number(clamp(0.84 + (pressure as number) * 0.28, 0.8, 1.15).toFixed(3));
    return 0.96;
  }
  // Fountain pen starts slightly tapered then swells smoothly
  if (hasRealPressure) return Number(clamp(0.62 + (pressure as number) * 0.65, 0.55, 1.35).toFixed(3));
  return 0.84;
}

/**
 * Compute target width factor from smoothed cursor velocity + optional stylus pressure.
 * - Fountain pen: rich thick-thin calligraphic modulation (slow = fuller ink, fast = sleek thin stroke)
 * - Pencil: subtle organic graphite variation
 * - Standard: strictly uniform 1.0
 */
function computeTargetNibWidthFactor(
  nibType: PenNibType,
  speedPxPerMs: number,
  pointerType: string,
  pressure?: number
): number {
  if (nibType === 'standard') return 1;

  const hasRealPressure =
    pointerType === 'pen' &&
    typeof pressure === 'number' &&
    pressure > 0 &&
    Math.abs(pressure - 0.5) > 0.015;

  if (nibType === 'pencil') {
    const speedTerm = clamp(1.06 - speedPxPerMs * 0.14, 0.84, 1.08);
    if (hasRealPressure) {
      const pTerm = clamp(0.78 + (pressure as number) * 0.42, 0.78, 1.18);
      return 0.65 * pTerm + 0.35 * speedTerm;
    }
    return speedTerm;
  }

  // Fountain Pen (Bút máy): expressive calligraphy thick-thin variation
  // Slow movement (< 0.25 px/ms) -> ~1.36x; Fast movement (> 2.2 px/ms) -> ~0.52x
  const normalizedSpeed = clamp(speedPxPerMs / 2.2, 0, 1);
  const velocityWidth = 1.36 - Math.pow(normalizedSpeed, 0.75) * 0.84;

  if (hasRealPressure) {
    const pressureWidth = clamp(0.48 + (pressure as number) * 1.12, 0.48, 1.56);
    return 0.62 * pressureWidth + 0.38 * velocityWidth;
  }
  return clamp(velocityWidth, 0.52, 1.42);
}

/**
 * Feed one raw pointer sample into the Adaptive One-Euro Filter.
 * Returns the smoothed world point (with updated velocity, curvature damping, and nib width factor).
 */
export function filterInkSample(
  session: InkFilterSession,
  rawPt: { x: number; y: number; pressure?: number; t?: number },
  pointerType: string
): InkPoint {
  const nowT = rawPt.t ?? performance.now();
  const dtMs = clamp(nowT - session.lastT, 1, 64);
  const dtSec = dtMs / 1000;

  const rawDx = rawPt.x - session.lastRawX;
  const rawDy = rawPt.y - session.lastRawY;
  const instVx = rawDx / dtMs;
  const instVy = rawDy / dtMs;

  // Smooth velocity derivative (dCutoff = 2.4 Hz)
  const velAlpha = oneEuroAlpha(2.4, dtSec);
  const nextVx = session.vx + velAlpha * (instVx - session.vx);
  const nextVy = session.vy + velAlpha * (instVy - session.vy);

  // Acceleration estimate (clamped to prevent spike explosions)
  const instAx = clamp((nextVx - session.prevVx) / dtMs, -0.06, 0.06);
  const instAy = clamp((nextVy - session.prevVy) / dtMs, -0.06, 0.06);
  const accAlpha = 0.28;
  const nextAx = session.ax + accAlpha * (instAx - session.ax);
  const nextAy = session.ay + accAlpha * (instAy - session.ay);

  // Curvature / corner turn detector comparing prior heading against instantaneous movement vector
  // so sharp corners ("7", "x", "√", vertices) suppress prediction overshoot on the very first frame
  const prevSpeed = Math.hypot(session.vx, session.vy);
  const instSpeed = Math.hypot(instVx, instVy);
  const currSpeed = Math.hypot(nextVx, nextVy);
  let turnDamping = session.turnDamping;
  if (prevSpeed > 0.05 && instSpeed > 0.05) {
    const cosAngle = clamp(
      (session.vx * instVx + session.vy * instVy) / (prevSpeed * instSpeed),
      -1,
      1
    );
    // cosAngle = 1 (straight) -> 1.0; cosAngle <= 0.45 (>63° turn) -> drops immediately toward 0
    const instantTurn = clamp((cosAngle - 0.35) / 0.65, 0, 1);
    turnDamping = instantTurn < turnDamping
      ? turnDamping * 0.25 + instantTurn * 0.75
      : turnDamping * 0.55 + instantTurn * 0.45;
  } else {
    turnDamping = turnDamping * 0.7 + 0.3;
  }

  // Adaptive One-Euro Filter position smoothing (only for fountain/pencil OR when smoothing > 0)
  const s = session.smoothingLevel / 100; // 0..1
  let nextFiltX = rawPt.x;
  let nextFiltY = rawPt.y;

  if (s > 0.001) {
    // Higher smoothing => lower minCutoff (filters jitter strongly at low speed),
    // while beta scales cutoff up rapidly when moving fast so ink never feels sluggish!
    const minCutoff = 6.5 - s * 5.65; // 6.5 Hz (light) -> 0.85 Hz (high)
    const beta = 0.012 + (1 - s) * 0.022; // speed responsiveness
    const speedPxPerSec = currSpeed * 1000;
    const cutoff = minCutoff + beta * speedPxPerSec;
    const posAlpha = oneEuroAlpha(cutoff, dtSec);
    // Keep alpha bounded so even at 100% smoothing there is zero extreme rubber-band lag
    const safeAlpha = clamp(posAlpha, 0.18 + (1 - s) * 0.55, 1);

    nextFiltX = session.filtX + safeAlpha * (rawPt.x - session.filtX);
    nextFiltY = session.filtY + safeAlpha * (rawPt.y - session.filtY);
  }

  // Smooth nib width inertia
  const targetW = computeTargetNibWidthFactor(
    session.nibType,
    currSpeed,
    pointerType,
    rawPt.pressure
  );
  const widthLerp = session.nibType === 'fountain' ? 0.24 : 0.35;
  const nextWidthFactor =
    session.nibType === 'standard'
      ? 1
      : session.smoothedWidthFactor + widthLerp * (targetW - session.smoothedWidthFactor);

  // Commit session state
  session.lastRawX = rawPt.x;
  session.lastRawY = rawPt.y;
  session.filtX = nextFiltX;
  session.filtY = nextFiltY;
  session.prevVx = session.vx;
  session.prevVy = session.vy;
  session.vx = nextVx;
  session.vy = nextVy;
  session.ax = nextAx;
  session.ay = nextAy;
  session.lastT = nowT;
  session.smoothedWidthFactor = nextWidthFactor;
  session.turnDamping = turnDamping;
  session.sampleCount += 1;

  return {
    x: nextFiltX,
    y: nextFiltY,
    pressure: rawPt.pressure,
    t: nowT,
    wFactor: Number(nextWidthFactor.toFixed(3)),
  };
}

/**
 * Predict 1–3 ephemeral lookahead ink points based on smoothed pointer velocity
 * (and optional browser-native PointerEvent.getPredictedEvents() coordinates).
 *
 * CRITICAL: These points are ONLY rendered on the Active Canvas Layer while drawing
 * and are NEVER saved into the permanent stroke points array.
 */
export function predictStrokeTail(
  session: InkFilterSession,
  zoom: number,
  nativePredictedWorldPts?: Array<{ x: number; y: number }>
): InkPoint[] {
  if (!session.predictionEnabled || session.sampleCount < 3) {
    return [];
  }

  const speed = Math.hypot(session.vx, session.vy); // world px / ms
  // Ignore near-stationary micro-movements or sharp corner turns
  if (speed < 0.045 || session.turnDamping < 0.28) {
    return [];
  }

  const maxAheadWorld = 26 / Math.max(zoom, 0.5);
  const dirX = session.vx / speed;
  const dirY = session.vy / speed;

  // 1. If native browser prediction is available, blend up to 2 points cleanly with velocity guard
  if (nativePredictedWorldPts && nativePredictedWorldPts.length > 0) {
    const out: InkPoint[] = [];
    let prevX = session.filtX;
    let prevY = session.filtY;
    for (let i = 0; i < Math.min(2, nativePredictedWorldPts.length); i++) {
      const np = nativePredictedWorldPts[i];
      const dx = np.x - prevX;
      const dy = np.y - prevY;
      const segDist = Math.hypot(dx, dy);
      if (segDist < 0.8 || segDist > maxAheadWorld) break;
      // Reject native predicted point if it sharply contradicts current heading
      const align = (dx * dirX + dy * dirY) / segDist;
      if (align < 0.55) break;
      const weight = (0.72 - i * 0.18) * session.turnDamping;
      const px = prevX + dx * weight;
      const py = prevY + dy * weight;
      out.push({
        x: px,
        y: py,
        wFactor: session.smoothedWidthFactor,
      });
      prevX = px;
      prevY = py;
    }
    if (out.length > 0) return out;
  }

  // 2. Kinematic velocity + damped acceleration lookahead (12ms -> 24ms)
  // Scale horizon gently by speed and turn damping so fast strokes feel zero-latency
  const speedScale = clamp((speed - 0.045) / 1.1, 0.25, 1);
  const horizonMs = (12 + speedScale * 14) * session.turnDamping;
  const steps = horizonMs > 15 ? [0.5, 1.0] : [1.0];

  const predicted: InkPoint[] = [];
  for (const frac of steps) {
    const dt = horizonMs * frac;
    let dx = session.vx * dt + 0.3 * session.ax * dt * dt;
    let dy = session.vy * dt + 0.3 * session.ay * dt * dt;
    const dist = Math.hypot(dx, dy);
    if (dist > maxAheadWorld) {
      const scale = maxAheadWorld / dist;
      dx *= scale;
      dy *= scale;
    }
    if (dist < 0.6) continue;
    predicted.push({
      x: session.filtX + dx,
      y: session.filtY + dy,
      wFactor: session.smoothedWidthFactor,
    });
  }

  return predicted;
}

/**
 * Corner-preserving post-stroke smoothing + fountain pen start/end tapering on pointerup.
 * Only modifies freehand strokes when smoothingLevel > 0 or nibType === 'fountain'.
 */
export function finalizeSmoothedStrokePoints(
  points: InkPoint[],
  nibType: PenNibType,
  smoothingLevel: number
): InkPoint[] {
  if (points.length < 3) return points;

  let current = points.map((p) => ({ ...p }));
  const s = clamp(smoothingLevel, 0, 100) / 100;

  // 1. Corner-preserving weighted Laplacian smoothing pass(es)
  if (s > 0.05 && current.length >= 4) {
    const passes = s >= 0.65 ? 2 : 1;
    const strength = clamp(0.18 + s * 0.34, 0.18, 0.52);

    for (let pass = 0; pass < passes; pass++) {
      const next = current.map((p) => ({ ...p }));
      for (let i = 1; i < current.length - 1; i++) {
        const prev = current[i - 1];
        const curr = current[i];
        const nxt = current[i + 1];

        const v1x = curr.x - prev.x;
        const v1y = curr.y - prev.y;
        const v2x = nxt.x - curr.x;
        const v2y = nxt.y - curr.y;
        const l1 = Math.hypot(v1x, v1y);
        const l2 = Math.hypot(v2x, v2y);

        // Preserve intentional sharp corners (e.g. "x", "7", "√", triangle vertices)
        let cornerFactor = 1;
        if (l1 > 0.5 && l2 > 0.5) {
          const cosTurn = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
          // cos(48°) ≈ 0.67; sharper corners drop smoothing locally toward 0
          cornerFactor = clamp((cosTurn - 0.55) / 0.45, 0, 1);
        }

        const k = strength * cornerFactor;
        const avgX = (prev.x + nxt.x) * 0.5;
        const avgY = (prev.y + nxt.y) * 0.5;
        next[i].x = curr.x + (avgX - curr.x) * k;
        next[i].y = curr.y + (avgY - curr.y) * k;

        if (curr.wFactor !== undefined) {
          const pw = prev.wFactor ?? curr.wFactor;
          const nw = nxt.wFactor ?? curr.wFactor;
          next[i].wFactor = Number((curr.wFactor * 0.6 + (pw + nw) * 0.2).toFixed(3));
        }
      }
      current = next;
    }
  }

  // 2. Graceful Fountain Pen start/end calligraphic tapering
  if (nibType === 'fountain' && current.length >= 4) {
    const startPt = current[0];
    const secondPt = current[1];
    const startFactor = startPt.wFactor ?? 0.85;
    startPt.wFactor = Number(Math.min(startFactor, 0.62).toFixed(3));
    if (secondPt && secondPt.wFactor !== undefined) {
      secondPt.wFactor = Number((secondPt.wFactor * 0.85).toFixed(3));
    }

    const lastIdx = current.length - 1;
    const endPt = current[lastIdx];
    const prevEndPt = current[lastIdx - 1];
    const endFactor = endPt.wFactor ?? 0.8;
    endPt.wFactor = Number(Math.min(endFactor, 0.48).toFixed(3));
    if (prevEndPt && prevEndPt.wFactor !== undefined) {
      prevEndPt.wFactor = Number((prevEndPt.wFactor * 0.78).toFixed(3));
    }
  }

  return current;
}

// ============================================================================
// DETERMINISTIC GRAPHITE PENCIL RENDERER (FLICKER-FREE MICRO-GRAIN)
// ============================================================================

function deterministicHash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

/**
 * Renders a realistic soft graphite Pencil (Bút chì) stroke with subtle deterministic
 * carbon grain along the smoothed curve. Uses integerized world coordinates for grain
 * seeding so texture NEVER shimmers during pan, zoom, or redraw.
 */
export function renderPencilStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  baseWidth: number,
  color: string,
  baseOpacity: number,
  toScreen: (p: { x: number; y: number }) => { x: number; y: number },
  zoom: number,
  lineDash: number[] = []
): void {
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(lineDash);

  const screenBaseW = Math.max(1.2, baseWidth * zoom);

  // Single dot pencil tap
  if (points.length === 1) {
    const sp = toScreen(points[0]);
    ctx.globalAlpha = baseOpacity * 0.72;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, screenBaseW * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Pass 1: Soft translucent graphite core body
  ctx.globalAlpha = baseOpacity * 0.62;
  ctx.lineWidth = screenBaseW * 0.92;
  ctx.beginPath();
  const p0 = toScreen(points[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < points.length - 1; i++) {
    const curr = toScreen(points[i]);
    const next = toScreen(points[i + 1]);
    ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
  }
  const pLast = toScreen(points[points.length - 1]);
  ctx.lineTo(pLast.x, pLast.y);
  ctx.stroke();

  // Pass 2: Subtle offset inner graphite lead ridge (gives authentic pencil paper-tooth edge)
  ctx.globalAlpha = baseOpacity * 0.34;
  ctx.lineWidth = Math.max(0.8, screenBaseW * 0.48);
  const off = Math.max(0.45, screenBaseW * 0.14);
  ctx.beginPath();
  ctx.moveTo(p0.x + off, p0.y - off * 0.6);
  for (let i = 1; i < points.length - 1; i++) {
    const curr = toScreen(points[i]);
    const next = toScreen(points[i + 1]);
    ctx.quadraticCurveTo(
      curr.x + off,
      curr.y - off * 0.6,
      (curr.x + next.x) / 2 + off,
      (curr.y + next.y) / 2 - off * 0.6
    );
  }
  ctx.lineTo(pLast.x + off, pLast.y - off * 0.6);
  ctx.stroke();

  // Pass 3: Deterministic micro-grain graphite stipples along the path (skipped for dashed lines)
  if (lineDash.length === 0) {
    ctx.setLineDash([]);
    const stepWorld = Math.max(2.2, baseWidth * 0.55);
    const grainRadius = Math.max(0.55, Math.min(1.4, screenBaseW * 0.16));

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.4) continue;

      // Perpendicular unit vector in world space
      const nx = -dy / segLen;
      const ny = dx / segLen;
      const steps = Math.min(14, Math.max(1, Math.floor(segLen / stepWorld)));
      const wf = a.wFactor ?? 1;
      const halfSpread = baseWidth * 0.46 * wf;

      for (let s = 0; s < steps; s++) {
        const frac = s / steps;
        const wx = a.x + dx * frac;
        const wy = a.y + dy * frac;
        const ix = Math.round(wx * 2);
        const iy = Math.round(wy * 2);

        // 2 micro-grains per sample step
        for (let g = 0; g < 2; g++) {
          const r1 = deterministicHash(ix, iy, g * 3 + 1);
          const r2 = deterministicHash(ix, iy, g * 3 + 2);
          const lat = (r1 - 0.5) * 2 * halfSpread;
          const gx = wx + nx * lat;
          const gy = wy + ny * lat;
          const sg = toScreen({ x: gx, y: gy });

          ctx.globalAlpha = baseOpacity * (0.2 + r2 * 0.32);
          ctx.fillRect(sg.x - grainRadius * 0.5, sg.y - grainRadius * 0.5, grainRadius, grainRadius);
        }
      }
    }
  }

  ctx.restore();
}
