export type ResizeHandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface TransformBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeHandleConfig {
  dir: ResizeHandleDir;
  leftPct: number;
  topPct: number;
  isCorner: boolean;
  baseAngle: number;
  label: string;
}

export const RESIZE_HANDLE_CONFIGS: ResizeHandleConfig[] = [
  {
    dir: 'nw',
    leftPct: 0,
    topPct: 0,
    isCorner: true,
    baseAngle: 315,
    label: 'Góc trên-trái (kéo tự do hoặc giữ Shift để giữ tỷ lệ)',
  },
  {
    dir: 'n',
    leftPct: 50,
    topPct: 0,
    isCorner: false,
    baseAngle: 0,
    label: 'Cạnh trên (kéo co giãn dọc, cố định cạnh dưới)',
  },
  {
    dir: 'ne',
    leftPct: 100,
    topPct: 0,
    isCorner: true,
    baseAngle: 45,
    label: 'Góc trên-phải (kéo tự do hoặc giữ Shift để giữ tỷ lệ)',
  },
  {
    dir: 'e',
    leftPct: 100,
    topPct: 50,
    isCorner: false,
    baseAngle: 90,
    label: 'Cạnh phải (kéo co giãn ngang, cố định cạnh trái)',
  },
  {
    dir: 'se',
    leftPct: 100,
    topPct: 100,
    isCorner: true,
    baseAngle: 135,
    label: 'Góc dưới-phải (kéo tự do hoặc giữ Shift để giữ tỷ lệ)',
  },
  {
    dir: 's',
    leftPct: 50,
    topPct: 100,
    isCorner: false,
    baseAngle: 180,
    label: 'Cạnh dưới (kéo co giãn dọc, cố định cạnh trên)',
  },
  {
    dir: 'sw',
    leftPct: 0,
    topPct: 100,
    isCorner: true,
    baseAngle: 225,
    label: 'Góc dưới-trái (kéo tự do hoặc giữ Shift để giữ tỷ lệ)',
  },
  {
    dir: 'w',
    leftPct: 0,
    topPct: 50,
    isCorner: false,
    baseAngle: 270,
    label: 'Cạnh trái (kéo co giãn ngang, cố định cạnh phải)',
  },
];

export function normalizeAngleDeg(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  return mod >= 359.5 ? 0 : mod;
}

export function snapRotationDeg(rawDeg: number, shiftKey: boolean): number {
  const norm = normalizeAngleDeg(rawDeg);
  if (shiftKey) {
    return normalizeAngleDeg(Math.round(norm / 15) * 15);
  }
  // Gentle magnetic snap to cardinal 0°, 90°, 180°, 270° within ±2°
  const cardinals = [0, 90, 180, 270, 360];
  for (const c of cardinals) {
    if (Math.abs(norm - c) <= 2) {
      return c === 360 ? 0 : c;
    }
  }
  return Math.round(norm);
}

export function getRotatedResizeCursor(dir: ResizeHandleDir, rotationDeg = 0): string {
  const cfg = RESIZE_HANDLE_CONFIGS.find((h) => h.dir === dir);
  if (!cfg) return 'nwse-resize';
  const a = (((cfg.baseAngle + rotationDeg) % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ns-resize';
  if (a < 67.5) return 'nesw-resize';
  if (a < 112.5) return 'ew-resize';
  return 'nwse-resize';
}

export function rotatePointAround(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number
): { x: number; y: number } {
  if (Math.abs(deg) < 0.001) return { x, y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function computeRotatedBoxAABB(
  box: TransformBox,
  rotationDeg = 0
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
} {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const corners = [
    rotatePointAround(box.x, box.y, cx, cy, rotationDeg),
    rotatePointAround(box.x + box.width, box.y, cx, cy, rotationDeg),
    rotatePointAround(box.x + box.width, box.y + box.height, cx, cy, rotationDeg),
    rotatePointAround(box.x, box.y + box.height, cx, cy, rotationDeg),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of corners) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function computeResizedBox(params: {
  origBox: TransformBox;
  dir: ResizeHandleDir;
  worldDx: number;
  worldDy: number;
  rotationDeg: number;
  lockAspectRatio: boolean;
  minWidth: number;
  minHeight: number;
}): TransformBox {
  const {
    origBox,
    dir,
    worldDx,
    worldDy,
    rotationDeg,
    lockAspectRatio,
    minWidth,
    minHeight,
  } = params;

  const origW = Math.max(1, origBox.width);
  const origH = Math.max(1, origBox.height);
  const origCx = origBox.x + origW / 2;
  const origCy = origBox.y + origH / 2;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Project world drag delta onto the object's rotated local X / Y axes
  const localDx = worldDx * cos + worldDy * sin;
  const localDy = -worldDx * sin + worldDy * cos;

  const hasW = dir === 'nw' || dir === 'w' || dir === 'sw';
  const hasE = dir === 'ne' || dir === 'e' || dir === 'se';
  const hasN = dir === 'nw' || dir === 'n' || dir === 'ne';
  const hasS = dir === 'sw' || dir === 's' || dir === 'se';
  const isCorner = (hasW || hasE) && (hasN || hasS);

  const rawW = origW + (hasE ? localDx : 0) - (hasW ? localDx : 0);
  const rawH = origH + (hasS ? localDy : 0) - (hasN ? localDy : 0);

  let newW = Math.max(minWidth, rawW);
  let newH = Math.max(minHeight, rawH);

  if (isCorner && lockAspectRatio) {
    const scaleX = newW / origW;
    const scaleY = newH / origH;
    const minScale = Math.max(minWidth / origW, minHeight / origH);
    const chosenScale = Math.max(
      minScale,
      Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
    );
    newW = origW * chosenScale;
    newH = origH * chosenScale;
  }

  // Keep the exact opposite edge / corner fixed as the anchor point
  const deltaW = newW - origW;
  const deltaH = newH - origH;
  const shiftLocalX = hasE ? deltaW / 2 : hasW ? -deltaW / 2 : 0;
  const shiftLocalY = hasS ? deltaH / 2 : hasN ? -deltaH / 2 : 0;

  // Rotate local center shift back into world coordinates
  const shiftWorldX = shiftLocalX * cos - shiftLocalY * sin;
  const shiftWorldY = shiftLocalX * sin + shiftLocalY * cos;

  const newCx = origCx + shiftWorldX;
  const newCy = origCy + shiftWorldY;

  return {
    x: newCx - newW / 2,
    y: newCy - newH / 2,
    width: newW,
    height: newH,
  };
}

export function mapPointsToResizedBox<
  T extends { x: number; y: number; pressure?: number; t?: number; wFactor?: number }
>(
  origPoints: T[],
  origRawBounds: { minX: number; maxX: number; minY: number; maxY: number },
  newBox: TransformBox,
  pad = 8
): T[] {
  const origRawW = origRawBounds.maxX - origRawBounds.minX;
  const origRawH = origRawBounds.maxY - origRawBounds.minY;
  const targetMinX = newBox.x + pad;
  const targetMinY = newBox.y + pad;
  const targetW = Math.max(0, newBox.width - pad * 2);
  const targetH = Math.max(0, newBox.height - pad * 2);

  return origPoints.map((p) => {
    const u = origRawW > 0.5 ? (p.x - origRawBounds.minX) / origRawW : 0.5;
    const v = origRawH > 0.5 ? (p.y - origRawBounds.minY) / origRawH : 0.5;
    return {
      ...p,
      x: targetMinX + u * targetW,
      y: targetMinY + v * targetH,
    };
  });
}

export interface Point2D {
  x: number;
  y: number;
}

export interface AABB2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function computePointsAABB(pts: Point2D[]): AABB2D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

export function doesAABBOverlap(a: AABB2D, b: AABB2D): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Exact ray-casting Point-in-Polygon test for arbitrary closed freehand lasso polygons.
 */
export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function orientation2D(a: Point2D, b: Point2D, c: Point2D): number {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment2D(a: Point2D, b: Point2D, c: Point2D): boolean {
  return (
    b.x <= Math.max(a.x, c.x) + 1e-6 &&
    b.x >= Math.min(a.x, c.x) - 1e-6 &&
    b.y <= Math.max(a.y, c.y) + 1e-6 &&
    b.y >= Math.min(a.y, c.y) - 1e-6
  );
}

/**
 * Exact 2D segment-segment intersection test (handles proper crossing + collinear overlap).
 */
export function doSegmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  q1: Point2D,
  q2: Point2D
): boolean {
  const o1 = orientation2D(p1, p2, q1);
  const o2 = orientation2D(p1, p2, q2);
  const o3 = orientation2D(q1, q2, p1);
  const o4 = orientation2D(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment2D(p1, q1, p2)) return true;
  if (o2 === 0 && onSegment2D(p1, q2, p2)) return true;
  if (o3 === 0 && onSegment2D(q1, p1, q2)) return true;
  if (o4 === 0 && onSegment2D(q1, p2, q2)) return true;
  return false;
}

/**
 * Checks whether a rotated rectangular box (e.g., 3D template figure or floating widget)
 * lies inside or intersects a closed freehand lasso polygon.
 */
export function doesRotatedBoxIntersectPolygon(
  box: TransformBox,
  rotationDeg: number,
  polygon: Point2D[],
  polyAABB?: AABB2D
): boolean {
  if (polygon.length < 3) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const corners: Point2D[] = [
    rotatePointAround(box.x, box.y, cx, cy, rotationDeg),
    rotatePointAround(box.x + box.width, box.y, cx, cy, rotationDeg),
    rotatePointAround(box.x + box.width, box.y + box.height, cx, cy, rotationDeg),
    rotatePointAround(box.x, box.y + box.height, cx, cy, rotationDeg),
  ];

  const boxAABB = computePointsAABB(corners);
  const pAABB = polyAABB || computePointsAABB(polygon);
  if (!doesAABBOverlap(boxAABB, pAABB)) return false;

  // 1. Center or any corner of the box is inside the lasso polygon
  if (isPointInPolygon({ x: cx, y: cy }, polygon)) return true;
  for (const c of corners) {
    if (isPointInPolygon(c, polygon)) return true;
  }

  // 2. Any lasso polygon vertex falls inside the rotated box
  for (const pv of polygon) {
    const localPt = rotatePointAround(pv.x, pv.y, cx, cy, -rotationDeg);
    if (
      localPt.x >= box.x &&
      localPt.x <= box.x + box.width &&
      localPt.y >= box.y &&
      localPt.y <= box.y + box.height
    ) {
      return true;
    }
  }

  // 3. Any box edge intersects any lasso polygon edge
  const nPoly = polygon.length;
  for (let bi = 0; bi < 4; bi++) {
    const b1 = corners[bi];
    const b2 = corners[(bi + 1) % 4];
    for (let pi = 0; pi < nPoly; pi++) {
      const p1 = polygon[pi];
      const p2 = polygon[(pi + 1) % nPoly];
      if (doSegmentsIntersect(b1, b2, p1, p2)) return true;
    }
  }

  return false;
}

/**
 * Checks whether a stroke polyline (already rotated into world space) lies inside or
 * intersects a closed freehand lasso polygon.
 */
export function doesPolylineIntersectPolygon(
  worldPoints: Point2D[],
  polygon: Point2D[],
  polyAABB?: AABB2D,
  isClosedShape = false
): boolean {
  if (worldPoints.length === 0 || polygon.length < 3) return false;
  const strokeAABB = computePointsAABB(worldPoints);
  const pAABB = polyAABB || computePointsAABB(polygon);
  if (!doesAABBOverlap(strokeAABB, pAABB)) return false;

  // 1. Any vertex of the stroke is inside the lasso polygon
  for (let i = 0; i < worldPoints.length; i++) {
    if (isPointInPolygon(worldPoints[i], polygon)) return true;
  }

  // 2. Any segment of the stroke crosses any edge of the closed lasso polygon
  const nPoly = polygon.length;
  const segCount = isClosedShape ? worldPoints.length : Math.max(0, worldPoints.length - 1);
  // Decimate very dense handwriting paths slightly for segment-edge checks while keeping accuracy
  const step = worldPoints.length > 160 ? 2 : 1;
  for (let i = 0; i < segCount; i += step) {
    const s1 = worldPoints[i];
    const s2 = worldPoints[(i + step) % worldPoints.length];
    if (!isClosedShape && i + step >= worldPoints.length) break;
    const segMinX = Math.min(s1.x, s2.x);
    const segMaxX = Math.max(s1.x, s2.x);
    const segMinY = Math.min(s1.y, s2.y);
    const segMaxY = Math.max(s1.y, s2.y);
    if (
      segMaxX < pAABB.minX ||
      segMinX > pAABB.maxX ||
      segMaxY < pAABB.minY ||
      segMinY > pAABB.maxY
    ) {
      continue;
    }
    for (let j = 0; j < nPoly; j++) {
      const p1 = polygon[j];
      const p2 = polygon[(j + 1) % nPoly];
      if (doSegmentsIntersect(s1, s2, p1, p2)) return true;
    }
  }

  // 3. If the stroke is a closed 2D shape (circle/rect/triangle), check if the lasso lies inside it
  if (isClosedShape && worldPoints.length >= 3) {
    if (isPointInPolygon(polygon[0], worldPoints)) return true;
  }

  return false;
}

/**
 * Computes the tight axis-aligned TransformBox enclosing a list of TransformBoxes.
 */
export function computeUnionTransformBox(boxes: TransformBox[]): TransformBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(24, maxX - minX),
    height: Math.max(24, maxY - minY),
  };
}

