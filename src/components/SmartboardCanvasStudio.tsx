import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { saveAs } from 'file-saver';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle as CircleIcon,
  ClipboardCopy,
  ClipboardPaste,
  Columns2,
  Compass,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileDown,
  FileQuestion,
  Grid,
  GripVertical,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Layers,
  LayoutPanelLeft,
  Lock,
  Maximize2,
  Minimize2,
  MousePointer,
  Move,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  PenTool,
  Play,
  Plus,
  QrCode,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Send,
  Shapes,
  Sparkles,
  Square,
  SunDim,
  Tag,
  Trash2,
  Triangle,
  Undo2,
  Unlock,
  Video,
  Wand2,
  X,
  Youtube,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BankQuestion } from '../types/eduplan';
import { MathText } from './MathText';
import { ExamDiagram } from './ExamDiagrams';
import { buildMultiPageSmartboardPdf } from '../utils/smartboardPdfExporter';
import {
  buildSmartFigureGeometry,
  createDefaultTemplateConfig,
  getCanvasLineDash,
  LINE_STYLE_PRESETS,
  SMART_TEMPLATE_CATALOG,
  SmartShapeCategoryTab,
  SmartTemplateConfig,
  SmartTemplateId,
  StrokeLineStyle,
} from '../utils/smartboardShapes3DAndConics';
import {
  computePointsAABB,
  computeResizedBox,
  computeRotatedBoxAABB,
  computeUnionTransformBox,
  doesPolylineIntersectPolygon,
  doesRotatedBoxIntersectPolygon,
  getRotatedResizeCursor,
  mapPointsToResizedBox,
  normalizeAngleDeg,
  RESIZE_HANDLE_CONFIGS,
  ResizeHandleDir,
  rotatePointAround,
  snapRotationDeg,
  TransformBox,
} from '../utils/smartboardTransform';
import {
  SplitBoardData,
  SplitRightBoardController,
  SplitRightBoardPane,
} from './SplitRightBoardPane';
import {
  formatMcqOptionDisplay,
  normalizeSolutionSteps,
  stripAnswerPrefix,
  stripDuplicateHeadingFromStem,
  stripMcqOptionPrefix,
} from '../utils/solutionFormat';

// ============================================================================
// TYPES & INTERFACES FOR SMARTBOARD CANVAS STUDIO
// ============================================================================

export type CanvasBackgroundType =
  | 'plain_white'
  | 'square_grid'
  | 'ruled_lines'
  | 'chalkboard_dark'
  | 'cartesian_oxy';

export type SmartboardTool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'smart_shape'
  | 'pan'
  | 'select'
  | 'ai_lasso';

export type SmartShapeSubMode =
  | 'auto'
  | 'line'
  | 'arrow'
  | 'circle'
  | 'triangle'
  | 'rectangle';

export type EraserSubMode = 'stroke' | 'area';

export type ToolbarDockPosition = 'bottom' | 'left' | 'right';

export interface StrokePoint {
  x: number;
  y: number;
  /** Optional stylus pressure (0..1) or normalized width factor */
  pressure?: number;
  /** Event timestamp in ms for velocity-based width smoothing */
  t?: number;
  /** Computed smoothed width multiplier (0.72..1.24) */
  wFactor?: number;
}

export interface SnapTarget {
  x: number;
  y: number;
  kind: 'endpoint' | 'vertex' | 'midpoint';
}

const SNAP_RADIUS_SCREEN_PX = 16;

export function getStrokeRawBounds(st: SmartboardStroke): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
} {
  if (st.templateBox) {
    const { x, y, width, height } = st.templateBox;
    return {
      minX: x,
      maxX: x + width,
      minY: y,
      maxY: y + height,
      cx: x + width / 2,
      cy: y + height / 2,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of st.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 200, maxX: 300, minY: 200, maxY: 260, cx: 250, cy: 230 };
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function getStrokeRotationDeg(st: SmartboardStroke): number {
  if (st.templateId && st.templateConfig?.rotationDeg !== undefined) {
    return st.templateConfig.rotationDeg || 0;
  }
  return st.rotationDeg || 0;
}

export function collectCanvasSnapTargets(strokes: SmartboardStroke[]): SnapTarget[] {
  const targets: SnapTarget[] = [];
  for (const st of strokes) {
    if (st.templateId && st.templateBox) {
      const cfg = st.templateConfig || createDefaultTemplateConfig(st.templateId);
      const fig = buildSmartFigureGeometry(st.templateId, st.templateBox, cfg);
      for (const lb of fig.labels) {
        targets.push({ x: lb.x, y: lb.y, kind: 'vertex' });
      }
      for (const seg of fig.segments) {
        if (seg.points.length >= 2) {
          const pA = seg.points[0];
          const pB = seg.points[seg.points.length - 1];
          targets.push({ x: pA.x, y: pA.y, kind: 'endpoint' });
          targets.push({ x: pB.x, y: pB.y, kind: 'endpoint' });
          if (seg.points.length === 2) {
            targets.push({
              x: (pA.x + pB.x) / 2,
              y: (pA.y + pB.y) / 2,
              kind: 'midpoint',
            });
          }
        }
      }
      continue;
    }

    const rotDeg = getStrokeRotationDeg(st);
    const rawBounds = getStrokeRawBounds(st);
    const pushPt = (x: number, y: number, kind: SnapTarget['kind']) => {
      const rp = rotatePointAround(x, y, rawBounds.cx, rawBounds.cy, rotDeg);
      targets.push({ x: rp.x, y: rp.y, kind });
    };

    if (st.tool === 'shape' && st.points.length >= 2) {
      if (st.shapeKind === 'line' || st.shapeKind === 'arrow') {
        const a = st.points[0];
        const b = st.points[st.points.length - 1];
        pushPt(a.x, a.y, 'endpoint');
        pushPt(b.x, b.y, 'endpoint');
        pushPt((a.x + b.x) / 2, (a.y + b.y) / 2, 'midpoint');
      } else if (st.shapeKind === 'triangle' || st.shapeKind === 'rectangle') {
        for (let i = 0; i < st.points.length - 1; i++) {
          const a = st.points[i];
          const b = st.points[i + 1];
          pushPt(a.x, a.y, 'vertex');
          pushPt((a.x + b.x) / 2, (a.y + b.y) / 2, 'midpoint');
        }
      } else if (st.shapeKind === 'circle') {
        const { minX, maxX, minY, maxY, cx, cy } = rawBounds;
        pushPt(cx, cy, 'midpoint');
        pushPt(minX, cy, 'vertex');
        pushPt(maxX, cy, 'vertex');
        pushPt(cx, minY, 'vertex');
        pushPt(cx, maxY, 'vertex');
      }
      continue;
    }

    if (st.tool === 'pen' && st.points.length >= 2) {
      const first = st.points[0];
      const last = st.points[st.points.length - 1];
      pushPt(first.x, first.y, 'endpoint');
      pushPt(last.x, last.y, 'endpoint');
    }
  }
  return targets;
}

export function findNearestSnapTarget(
  worldPt: StrokePoint,
  targets: SnapTarget[],
  zoom: number,
  excludeNearPt?: StrokePoint | null
): SnapTarget | null {
  if (targets.length === 0) return null;
  const maxWorldDist = SNAP_RADIUS_SCREEN_PX / Math.max(zoom, 0.25);
  let best: SnapTarget | null = null;
  let bestScore = Infinity;

  for (const t of targets) {
    if (excludeNearPt && Math.hypot(t.x - excludeNearPt.x, t.y - excludeNearPt.y) < 3 / Math.max(zoom, 0.25)) {
      continue;
    }
    const d = Math.hypot(t.x - worldPt.x, t.y - worldPt.y);
    if (d <= maxWorldDist) {
      // Slightly prefer vertices/endpoints over midpoints when overlapping
      const priorityBias = t.kind === 'midpoint' ? 2.5 / Math.max(zoom, 0.25) : 0;
      const score = d + priorityBias;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
  }
  return best;
}

export function drawSnapIndicatorOnContext(
  ctx: CanvasRenderingContext2D,
  target: SnapTarget,
  panX: number,
  panY: number,
  zoom: number,
  isLocked = false
) {
  const sx = target.x * zoom + panX;
  const sy = target.y * zoom + panY;

  ctx.save();
  ctx.setLineDash([]);

  // Outer glowing emerald halo
  ctx.beginPath();
  ctx.arc(sx, sy, isLocked ? 14 : 12, 0, Math.PI * 2);
  ctx.fillStyle = isLocked ? 'rgba(34, 197, 94, 0.24)' : 'rgba(16, 185, 129, 0.18)';
  ctx.fill();

  // Crisp magnetic snap ring
  ctx.beginPath();
  ctx.arc(sx, sy, isLocked ? 8.5 : 7.5, 0, Math.PI * 2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = isLocked ? '#16A34A' : '#10B981';
  ctx.stroke();

  // Bright center pinpoint
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#22C55E';
  ctx.fill();

  // Compact badge label
  const tagText = target.kind === 'midpoint' ? 'Trung điểm' : 'Khớp đỉnh';
  ctx.font = '700 10.5px "Be Vietnam Pro", sans-serif';
  const textW = ctx.measureText(tagText).width;
  const bx = sx + 12;
  const by = sy - 22;
  ctx.fillStyle = 'rgba(15, 41, 34, 0.9)';
  ctx.beginPath();
  ctx.roundRect(bx, by, textW + 10, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#86EFAC';
  ctx.fillText(tagText, bx + 5, by + 12.5);

  ctx.restore();
}

export interface SmartboardStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'shape';
  shapeKind?: 'line' | 'arrow' | 'circle' | 'triangle' | 'rectangle' | 'template_figure';
  lineStyle?: StrokeLineStyle;
  rotationDeg?: number;
  templateId?: SmartTemplateId;
  templateBox?: { x: number; y: number; width: number; height: number };
  templateConfig?: SmartTemplateConfig;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
}

export type SmartboardWidgetType =
  | 'bank_question'
  | 'image'
  | 'youtube'
  | 'geogebra_3d'
  | 'ai_katex_card';

export interface SmartboardWidget {
  id: string;
  type: SmartboardWidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  borderStyle?: StrokeLineStyle;
  borderColor?: string;
  title: string;
  // For bank_question
  question?: BankQuestion;
  showSolution?: boolean;
  // For image
  imageUrl?: string;
  // For youtube
  youtubeEmbedUrl?: string;
  // For geogebra_3d / desmos
  mathAppletMode?: 'geogebra_3d' | 'desmos_2d' | 'interactive_solid';
  solidKind?: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane';
  // For ai_katex_card
  katexContent?: string;
  stepsContent?: Array<{ title: string; leadIn: string; mathDetail: string }>;
  finalAnswer?: string;
}

export interface SmartboardHistorySnapshot {
  strokes: SmartboardStroke[];
  widgets: SmartboardWidget[];
}

export interface SmartboardPage {
  id: string;
  title: string;
  background: CanvasBackgroundType;
  strokes: SmartboardStroke[];
  undoStack: SmartboardHistorySnapshot[];
  redoStack: SmartboardHistorySnapshot[];
  widgets: SmartboardWidget[];
}

export interface PopQuizResponseItem {
  id: string;
  studentName: string;
  studentClass?: string;
  choice?: 'A' | 'B' | 'C' | 'D';
  comment?: string;
  submittedAt: string;
}

export interface PopQuizSessionState {
  quizId: string;
  questionTitle: string;
  questionStem?: string;
  options: [string, string, string, string];
  correctOption?: 'A' | 'B' | 'C' | 'D';
  isOpen: boolean;
  createdAt: string;
  responses: PopQuizResponseItem[];
}

export interface SmartboardCanvasStudioProps {
  bankItems: BankQuestion[];
  schoolName?: string;
  teacherName?: string;
  onSwitchTeachingTab?: (tab: 'function_plot' | 'geometry_3d' | 'slides' | 'realworld') => void;
  onOpenJsonBankLoader?: () => void;
  onPublishToStudentNotebook?: (payload: {
    title: string;
    className: string;
    grade: '10' | '11' | '12';
    pageImages: string[];
    summaryText: string;
  }) => Promise<void>;
  availableClasses?: Array<{ id: string; name: string; grade: '10' | '11' | '12' }>;
  activeClassName?: string;
  pendingIncomingWidget?: {
    id: string;
    title: string;
    imageDataUrl?: string;
    solidKind?: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane';
    question?: BankQuestion;
  } | null;
  onClearPendingIncomingWidget?: () => void;
  isOwnerAdmin?: boolean;
}

// ============================================================================
// CONSTANTS & PRESETS
// ============================================================================

const PEN_COLORS: Array<{ color: string; label: string; border?: string }> = [
  { color: '#0F172A', label: 'Đen' },
  { color: '#DC2626', label: 'Đỏ' },
  { color: '#0284C7', label: 'Xanh dương' },
  { color: '#EAB308', label: 'Vàng' },
  { color: '#FFFFFF', label: 'Trắng', border: 'border-slate-400' },
];

const HIGHLIGHTER_COLORS: Array<{ color: string; label: string }> = [
  { color: '#FACC15', label: 'Dạ quang Vàng' },
  { color: '#4ADE80', label: 'Dạ quang Xanh lá' },
  { color: '#38BDF8', label: 'Dạ quang Xanh dương' },
  { color: '#F472B6', label: 'Dạ quang Hồng' },
];

const STROKE_WIDTHS = [2, 4, 6, 10];

const BACKGROUND_OPTIONS: Array<{
  id: CanvasBackgroundType;
  label: string;
  shortLabel: string;
  desc: string;
}> = [
  {
    id: 'plain_white',
    label: 'Trắng trơn',
    shortLabel: 'Trắng',
    desc: 'Nền bảng trắng tiêu chuẩn độ tương phản cao',
  },
  {
    id: 'square_grid',
    label: 'Ô ly vuông',
    shortLabel: 'Ô ly',
    desc: 'Lưới ô vuông chuẩn hỗ trợ căn chỉnh hình học và biểu thức',
  },
  {
    id: 'ruled_lines',
    label: 'Dòng kẻ ngang',
    shortLabel: 'Kẻ ngang',
    desc: 'Dòng kẻ vở giúp viết trình bày lời giải thẳng hàng',
  },
  {
    id: 'chalkboard_dark',
    label: 'Bảng đen chống lóa',
    shortLabel: 'Bảng đen',
    desc: 'Tông xanh đen phấn trắng chống mỏi mắt cho màn hình 65–86 inch',
  },
  {
    id: 'cartesian_oxy',
    label: 'Hệ trục tọa độ Oxy',
    shortLabel: 'Trục Oxy',
    desc: 'Hệ trục tọa độ Đề-các Oxy có chia vạch đơn vị chuẩn SGK',
  },
];

const CURATED_MATH_VIDEOS: Array<{ title: string; embedUrl: string; topic: string }> = [
  {
    title: 'Khảo sát sự biến thiên và vẽ đồ thị hàm số bậc ba (Toán 12 KNTT)',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    topic: 'Giải tích 12 - Chương I',
  },
  {
    title: 'Hình học không gian: Khoảng cách và Thể tích khối chóp S.ABCD',
    embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A',
    topic: 'Hình học 11 & 12',
  },
];

// ============================================================================
// SMART SHAPE GEOMETRY RECOGNIZER
// ============================================================================

export function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(pts: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += distance(pts[i - 1], pts[i]);
  }
  return len;
}

function simplifyRDP(points: StrokePoint[], epsilon: number): StrokePoint[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let maxDist = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const mag = Math.hypot(dx, dy);
    const d =
      mag === 0
        ? distance(p, first)
        : Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / mag;
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }

  if (maxDist > epsilon && index !== -1) {
    const left = simplifyRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyRDP(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

export function buildSmartShapePoints(
  rawPoints: StrokePoint[],
  requestedMode: SmartShapeSubMode
): {
  shapeKind: 'line' | 'arrow' | 'circle' | 'triangle' | 'rectangle';
  points: StrokePoint[];
} {
  if (rawPoints.length < 2) {
    return { shapeKind: 'line', points: rawPoints };
  }

  const start = rawPoints[0];
  const end = rawPoints[rawPoints.length - 1];
  const totalLen = Math.max(pathLength(rawPoints), 1);
  const directDist = distance(start, end);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rawPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const boxW = Math.max(maxX - minX, 12);
  const boxH = Math.max(maxY - minY, 12);
  const diag = Math.hypot(boxW, boxH);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let detected: 'line' | 'arrow' | 'circle' | 'triangle' | 'rectangle' = 'line';

  if (requestedMode !== 'auto') {
    detected = requestedMode;
  } else {
    // Auto-detect shape from freehand trajectory
    const isLinear = directDist / totalLen > 0.84;
    const isClosed = directDist < diag * 0.38 && totalLen > diag * 1.4;

    if (isLinear) {
      detected = 'line';
    } else if (isClosed) {
      // Check circularity vs polygon corners
      const radii = rawPoints.map((p) => Math.hypot(p.x - cx, p.y - cy));
      const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
      const varianceR =
        radii.reduce((acc, r) => acc + Math.pow(r - meanR, 2), 0) / radii.length;
      const relStd = Math.sqrt(varianceR) / Math.max(meanR, 1);

      const simplified = simplifyRDP(rawPoints, diag * 0.085);
      // Remove closure duplicate vertex
      const vertices =
        simplified.length > 2 &&
        distance(simplified[0], simplified[simplified.length - 1]) < diag * 0.35
          ? simplified.slice(0, -1)
          : simplified;

      if (relStd < 0.17 && boxW / boxH > 0.65 && boxW / boxH < 1.45) {
        detected = 'circle';
      } else if (vertices.length === 3) {
        detected = 'triangle';
      } else if (vertices.length === 4) {
        detected = 'rectangle';
      } else if (relStd < 0.24) {
        detected = 'circle';
      } else {
        detected = 'rectangle';
      }
    } else {
      // Open curved or hooked stroke: check if it has 3 vertices (open triangle) or arrow hook at end
      const simplified = simplifyRDP(rawPoints, diag * 0.09);
      if (simplified.length === 3 && directDist / totalLen > 0.65) {
        detected = 'arrow';
      } else if (simplified.length === 4) {
        detected = 'triangle';
      } else {
        detected = 'line';
      }
    }
  }

  if (detected === 'line' || detected === 'arrow') {
    return {
      shapeKind: detected,
      points: [start, end],
    };
  }

  if (detected === 'circle') {
    const r = Math.max(boxW, boxH) / 2;
    const circlePts: StrokePoint[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      circlePts.push({
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
      });
    }
    return {
      shapeKind: 'circle',
      points: circlePts,
    };
  }

  if (detected === 'triangle') {
    const simplified = simplifyRDP(rawPoints, diag * 0.09);
    const uniqueVerts =
      simplified.length >= 4 &&
      distance(simplified[0], simplified[simplified.length - 1]) < diag * 0.4
        ? simplified.slice(0, 3)
        : null;

    if (uniqueVerts && uniqueVerts.length === 3) {
      return {
        shapeKind: 'triangle',
        points: [uniqueVerts[0], uniqueVerts[1], uniqueVerts[2], uniqueVerts[0]],
      };
    }

    const top: StrokePoint = { x: cx, y: minY };
    const botLeft: StrokePoint = { x: minX, y: maxY };
    const botRight: StrokePoint = { x: maxX, y: maxY };
    return {
      shapeKind: 'triangle',
      points: [top, botRight, botLeft, top],
    };
  }

  // Rectangle
  return {
    shapeKind: 'rectangle',
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ],
  };
}

// ============================================================================
// CANVAS RENDERING HELPERS (USED BY INTERACTIVE VIEW & PDF EXPORTER)
// ============================================================================

export function drawPageBackgroundOnContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: CanvasBackgroundType,
  panX: number,
  panY: number,
  zoom: number
) {
  ctx.save();

  if (background === 'chalkboard_dark') {
    ctx.fillStyle = '#0F2922';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }

  const gridStep = 36 * zoom;
  const offsetX = ((panX % gridStep) + gridStep) % gridStep;
  const offsetY = ((panY % gridStep) + gridStep) % gridStep;

  if (background === 'square_grid' || background === 'chalkboard_dark') {
    ctx.strokeStyle =
      background === 'chalkboard_dark'
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < width; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (background === 'ruled_lines') {
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = offsetY; y < height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Red vertical margin line
    const marginX = 88 * zoom + panX;
    if (marginX >= 0 && marginX <= width) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(marginX, 0);
      ctx.lineTo(marginX, height);
      ctx.stroke();
    }
  } else if (background === 'cartesian_oxy') {
    // Subtle background grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < width; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Origin O in world coordinates is (640, 360)
    const originX = 640 * zoom + panX;
    const originY = 360 * zoom + panY;

    ctx.strokeStyle = '#0F172A';
    ctx.fillStyle = '#0F172A';
    ctx.lineWidth = 2;

    // Ox Axis
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();

    // Oy Axis
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Arrowheads
    // Ox arrow (right edge)
    ctx.beginPath();
    ctx.moveTo(width - 14, originY - 6);
    ctx.lineTo(width - 2, originY);
    ctx.lineTo(width - 14, originY + 6);
    ctx.stroke();

    // Oy arrow (top edge)
    ctx.beginPath();
    ctx.moveTo(originX - 6, 14);
    ctx.lineTo(originX, 2);
    ctx.lineTo(originX + 6, 14);
    ctx.stroke();

    // Ticks & Labels
    ctx.font = `600 ${Math.max(11, Math.round(12 * zoom))}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText('O', originX - 18 * zoom, originY + 18 * zoom);
    ctx.fillText('x', width - 18, originY - 10);
    ctx.fillText('y', originX + 12, 18);

    const unitPx = 36 * zoom;
    for (let u = -16; u <= 16; u++) {
      if (u === 0) continue;
      const tx = originX + u * unitPx;
      if (tx > 24 && tx < width - 24) {
        ctx.beginPath();
        ctx.moveTo(tx, originY - 4);
        ctx.lineTo(tx, originY + 4);
        ctx.stroke();
        if (u % 2 === 0) {
          ctx.fillText(String(u), tx - 6, originY + 18);
        }
      }
      const ty = originY - u * unitPx;
      if (ty > 24 && ty < height - 24) {
        ctx.beginPath();
        ctx.moveTo(originX - 4, ty);
        ctx.lineTo(originX + 4, ty);
        ctx.stroke();
        if (u % 2 === 0) {
          ctx.fillText(String(u), originX + 8, ty + 4);
        }
      }
    }
  }

  ctx.restore();
}

export function drawStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  stroke: SmartboardStroke,
  panX: number,
  panY: number,
  zoom: number
) {
  if (stroke.points.length === 0 && !stroke.templateBox) return;

  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * zoom;
  ctx.lineCap = stroke.lineStyle && stroke.lineStyle !== 'solid' ? 'butt' : 'round';
  ctx.lineJoin = 'round';

  const toScreen = (pt: StrokePoint) => ({
    x: pt.x * zoom + panX,
    y: pt.y * zoom + panY,
  });

  // 1. Render 3D Solid or Conic Section Template Figure
  if (stroke.templateId && stroke.templateBox) {
    const baseCfg = stroke.templateConfig || createDefaultTemplateConfig(stroke.templateId);
    const cfg: SmartTemplateConfig = {
      ...baseCfg,
      rotationDeg: baseCfg.rotationDeg ?? stroke.rotationDeg ?? 0,
    };
    const fig = buildSmartFigureGeometry(stroke.templateId, stroke.templateBox, cfg);

    // Draw right-angle markers first
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1.2, stroke.width * 0.65) * zoom;
    for (const ra of fig.rightAngles) {
      const v = toScreen(ra.vertex);
      const a1 = toScreen(ra.along1);
      const a2 = toScreen(ra.along2);
      const d1 = Math.hypot(a1.x - v.x, a1.y - v.y);
      const d2 = Math.hypot(a2.x - v.x, a2.y - v.y);
      if (d1 > 4 && d2 > 4) {
        const sz = (ra.size || 10) * zoom;
        const u1x = ((a1.x - v.x) / d1) * sz;
        const u1y = ((a1.y - v.y) / d1) * sz;
        const u2x = ((a2.x - v.x) / d2) * sz;
        const u2y = ((a2.y - v.y) / d2) * sz;
        ctx.beginPath();
        ctx.moveTo(v.x + u1x, v.y + u1y);
        ctx.lineTo(v.x + u1x + u2x, v.y + u1y + u2y);
        ctx.lineTo(v.x + u2x, v.y + u2y);
        ctx.stroke();
      }
    }

    // Draw all segments with their respective line style (solid, dashed, dotted, dash_dot)
    const forceDashOverride = stroke.lineStyle && stroke.lineStyle !== 'solid' ? stroke.lineStyle : null;
    for (const segItem of fig.segments) {
      if (segItem.points.length < 2) continue;
      const effectiveSegStyle: StrokeLineStyle =
        forceDashOverride && segItem.lineStyle === 'solid'
          ? forceDashOverride
          : segItem.lineStyle;
      ctx.save();
      ctx.globalAlpha = stroke.opacity * (segItem.opacityScale ?? 1);
      ctx.lineWidth = stroke.width * (segItem.widthScale ?? 1) * zoom;
      ctx.lineCap = effectiveSegStyle === 'solid' ? 'round' : 'butt';
      ctx.setLineDash(getCanvasLineDash(effectiveSegStyle, zoom));

      ctx.beginPath();
      const firstPt = toScreen(segItem.points[0]);
      ctx.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < segItem.points.length; i++) {
        const p = toScreen(segItem.points[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      if (segItem.arrowEnd && segItem.points.length >= 2) {
        ctx.setLineDash([]);
        const p1 = toScreen(segItem.points[segItem.points.length - 2]);
        const p2 = toScreen(segItem.points[segItem.points.length - 1]);
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = Math.max(11, stroke.width * 3.1) * zoom;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headLen * Math.cos(angle - Math.PI / 6),
          p2.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headLen * Math.cos(angle + Math.PI / 6),
          p2.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw vertex dots and optional labels (S, A, B, C, D, O, F1, F2...)
    ctx.setLineDash([]);
    const fontSize = Math.max(12, Math.round(14.5 * zoom));
    ctx.font = `700 italic ${fontSize}px "Be Vietnam Pro", sans-serif`;

    for (const lb of fig.labels) {
      const p = toScreen({ x: lb.x, y: lb.y });
      if (lb.showDot) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2.6, stroke.width * 0.85) * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      if (cfg.showLabels && lb.text) {
        const tx = p.x + (lb.offsetX ?? 6) * zoom;
        const ty = p.y + (lb.offsetY ?? -6) * zoom;
        ctx.save();
        ctx.lineWidth = 3 * zoom;
        ctx.strokeStyle =
          stroke.color.toUpperCase() === '#FFFFFF' ? 'rgba(15, 41, 34, 0.88)' : 'rgba(255, 255, 255, 0.9)';
        ctx.strokeText(lb.text, tx, ty);
        ctx.fillStyle = stroke.color;
        ctx.fillText(lb.text, tx, ty);
        ctx.restore();
      }
    }

    ctx.restore();
    return;
  }

  // Apply optional 360-degree rotation around the stroke's local center for regular strokes & 2D shapes
  if (Math.abs(stroke.rotationDeg || 0) > 0.01 && stroke.points.length >= 2) {
    const rb = getStrokeRawBounds(stroke);
    const scx = rb.cx * zoom + panX;
    const scy = rb.cy * zoom + panY;
    ctx.translate(scx, scy);
    ctx.rotate(((stroke.rotationDeg || 0) * Math.PI) / 180);
    ctx.translate(-scx, -scy);
  }

  // Apply chosen line dash style for regular strokes & 2D shapes
  ctx.setLineDash(getCanvasLineDash(stroke.lineStyle, zoom));

  if (stroke.points.length === 1) {
    ctx.setLineDash([]);
    const p = toScreen(stroke.points[0]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (stroke.width * zoom) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'shape' && stroke.shapeKind) {
    ctx.beginPath();
    const first = toScreen(stroke.points[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = toScreen(stroke.points[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Draw arrowhead if arrow
    if (stroke.shapeKind === 'arrow' && stroke.points.length >= 2) {
      ctx.setLineDash([]);
      const p1 = toScreen(stroke.points[0]);
      const p2 = toScreen(stroke.points[stroke.points.length - 1]);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(14, stroke.width * 3.8) * zoom;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle - Math.PI / 6),
        p2.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle + Math.PI / 6),
        p2.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Smooth quadratic Bezier curve for freehand Pen & Highlighter
  const isSolidPen =
    stroke.tool === 'pen' && (!stroke.lineStyle || stroke.lineStyle === 'solid');
  const hasVariableWidth =
    isSolidPen && stroke.points.length >= 3 && stroke.points.some((p) => p.wFactor !== undefined);

  if (hasVariableWidth) {
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseW = stroke.width * zoom;
    let prevMid = toScreen(stroke.points[0]);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const currPt = stroke.points[i];
      const nextPt = stroke.points[i + 1];
      const curr = toScreen(currPt);
      const next = toScreen(nextPt);
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      const wf = currPt.wFactor ?? 1;

      ctx.beginPath();
      ctx.lineWidth = Math.max(1.2, baseW * wf);
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      ctx.stroke();

      prevMid = { x: midX, y: midY };
    }

    const lastPt = stroke.points[stroke.points.length - 1];
    const last = toScreen(lastPt);
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.2, baseW * (lastPt.wFactor ?? 0.9));
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  const p0 = toScreen(stroke.points[0]);
  ctx.moveTo(p0.x, p0.y);

  for (let i = 1; i < stroke.points.length - 1; i++) {
    const curr = toScreen(stroke.points[i]);
    const next = toScreen(stroke.points[i + 1]);
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }

  const last = toScreen(stroke.points[stroke.points.length - 1]);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// INTERACTIVE 3D GEOMETRY MINI-CANVAS FOR EMBEDDED WIDGETS
// ============================================================================

const Embedded3DSolidWidget: React.FC<{
  solidKind: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane';
  onChangeKind: (
    k: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane'
  ) => void;
}> = ({ solidKind, onChangeKind }) => {
  const [rotY, setRotY] = useState(32);
  const [rotX, setRotX] = useState(18);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; rX: number; rY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    rX: 18,
    rY: 32,
  });

  // Simple 3D projection helper
  const project = (x: number, y: number, z: number) => {
    const radY = (rotY * Math.PI) / 180;
    const radX = (rotX * Math.PI) / 180;
    const x1 = x * Math.cos(radY) - z * Math.sin(radY);
    const z1 = x * Math.sin(radY) + z * Math.cos(radY);
    const y2 = y * Math.cos(radX) - z1 * Math.sin(radX);
    const scale = 95;
    return {
      px: 190 + x1 * scale,
      py: 135 - y2 * scale,
    };
  };

  const renderWireframe = () => {
    if (solidKind === 'pyramid_sabcd') {
      const A = project(-0.8, -0.6, -0.7);
      const B = project(0.9, -0.6, -0.7);
      const C = project(0.9, -0.6, 0.8);
      const D = project(-0.8, -0.6, 0.8);
      const S = project(-0.8, 1.05, -0.7); // SA perpendicular to base

      return (
        <g>
          {/* Base ABCD */}
          <polygon
            points={`${A.px},${A.py} ${B.px},${B.py} ${C.px},${C.py} ${D.px},${D.py}`}
            fill="rgba(19, 111, 99, 0.12)"
            stroke="#136F63"
            strokeWidth={2}
          />
          {/* Hidden edges from A */}
          <line x1={S.px} y1={S.py} x2={A.px} y2={A.py} stroke="#DC2626" strokeWidth={2.4} />
          <line
            x1={A.px}
            y1={A.py}
            x2={C.px}
            y2={C.py}
            stroke="#64748B"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
          <line
            x1={B.px}
            y1={B.py}
            x2={D.px}
            y2={D.py}
            stroke="#64748B"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
          {/* Lateral edges */}
          <line x1={S.px} y1={S.py} x2={B.px} y2={B.py} stroke="#0F172A" strokeWidth={2} />
          <line x1={S.px} y1={S.py} x2={C.px} y2={C.py} stroke="#0F172A" strokeWidth={2} />
          <line x1={S.px} y1={S.py} x2={D.px} y2={D.py} stroke="#0F172A" strokeWidth={2} />

          {[
            { pt: S, label: 'S', color: '#DC2626' },
            { pt: A, label: 'A (⊥)', color: '#DC2626' },
            { pt: B, label: 'B', color: '#0F172A' },
            { pt: C, label: 'C', color: '#0F172A' },
            { pt: D, label: 'D', color: '#0F172A' },
          ].map((v) => (
            <g key={v.label}>
              <circle cx={v.pt.px} cy={v.pt.py} r={4} fill={v.color} />
              <text
                x={v.pt.px + 7}
                y={v.pt.py - 6}
                fontSize={13}
                fontWeight="700"
                fill={v.color}
              >
                {v.label}
              </text>
            </g>
          ))}
        </g>
      );
    }

    if (solidKind === 'prism_abca1b1c1') {
      const A = project(-0.85, -0.75, -0.5);
      const B = project(0.85, -0.75, -0.5);
      const C = project(0, -0.75, 0.85);
      const A1 = project(-0.85, 0.85, -0.5);
      const B1 = project(0.85, 0.85, -0.5);
      const C1 = project(0, 0.85, 0.85);

      return (
        <g>
          <polygon
            points={`${A.px},${A.py} ${B.px},${B.py} ${C.px},${C.py}`}
            fill="rgba(2, 132, 199, 0.12)"
            stroke="#0284C7"
            strokeWidth={2}
          />
          <polygon
            points={`${A1.px},${A1.py} ${B1.px},${B1.py} ${C1.px},${C1.py}`}
            fill="rgba(19, 111, 99, 0.14)"
            stroke="#136F63"
            strokeWidth={2}
          />
          <line x1={A.px} y1={A.py} x2={A1.px} y2={A1.py} stroke="#0F172A" strokeWidth={2} />
          <line x1={B.px} y1={B.py} x2={B1.px} y2={B1.py} stroke="#0F172A" strokeWidth={2} />
          <line x1={C.px} y1={C.py} x2={C1.px} y2={C1.py} stroke="#0F172A" strokeWidth={2} />
          <line
            x1={A1.px}
            y1={A1.py}
            x2={B.px}
            y2={B.py}
            stroke="#DC2626"
            strokeDasharray="5 3"
            strokeWidth={1.8}
          />
          {[
            { pt: A, label: 'A' },
            { pt: B, label: 'B' },
            { pt: C, label: 'C' },
            { pt: A1, label: "A'" },
            { pt: B1, label: "B'" },
            { pt: C1, label: "C'" },
          ].map((v) => (
            <g key={v.label}>
              <circle cx={v.pt.px} cy={v.pt.py} r={4} fill="#136F63" />
              <text x={v.pt.px + 6} y={v.pt.py - 5} fontSize={12.5} fontWeight="700" fill="#0F172A">
                {v.label}
              </text>
            </g>
          ))}
        </g>
      );
    }

    // Oxyz coordinate system + plane
    const O = project(0, 0, 0);
    const X = project(1.25, 0, 0);
    const Y = project(0, 1.15, 0);
    const Z = project(0, 0, 1.25);
    const P1 = project(0.9, 0, 0);
    const P2 = project(0, 0.85, 0);
    const P3 = project(0, 0, 0.95);

    return (
      <g>
        <line x1={O.px} y1={O.py} x2={X.px} y2={X.py} stroke="#DC2626" strokeWidth={2.2} />
        <line x1={O.px} y1={O.py} x2={Y.px} y2={Y.py} stroke="#16A34A" strokeWidth={2.2} />
        <line x1={O.px} y1={O.py} x2={Z.px} y2={Z.py} stroke="#0284C7" strokeWidth={2.2} />
        <polygon
          points={`${P1.px},${P1.py} ${P2.px},${P2.py} ${P3.px},${P3.py}`}
          fill="rgba(234, 179, 8, 0.22)"
          stroke="#CA8A04"
          strokeWidth={2}
        />
        <text x={X.px + 5} y={X.py} fontSize={13} fontWeight="700" fill="#DC2626">
          Ox
        </text>
        <text x={Y.px + 5} y={Y.py} fontSize={13} fontWeight="700" fill="#16A34A">
          Oz
        </text>
        <text x={Z.px + 5} y={Z.py} fontSize={13} fontWeight="700" fill="#0284C7">
          Oy
        </text>
        <text x={O.px - 14} y={O.py + 14} fontSize={12.5} fontWeight="700" fill="#0F172A">
          O(0;0;0)
        </text>
      </g>
    );
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 select-none">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px]">
        <div className="flex items-center gap-1">
          {[
            { id: 'pyramid_sabcd', label: 'Chóp S.ABCD' },
            { id: 'prism_abca1b1c1', label: "Lăng trụ ABC.A'B'C'" },
            { id: 'oxyz_plane', label: 'Mặt phẳng Oxyz' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onChangeKind(
                  item.id as 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane'
                )
              }
              className={`rounded-[5px] px-2 py-1 font-medium transition-colors ${
                solidKind === item.id
                  ? 'bg-[#136F63] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">Chạm kéo để xoay 3D ({rotY}°)</span>
      </div>

      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            rX: rotX,
            rY: rotY,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          e.stopPropagation();
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          setRotY(Math.round(dragRef.current.rY + dx * 0.6));
          setRotX(Math.max(-65, Math.min(65, Math.round(dragRef.current.rX + dy * 0.4))));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          dragRef.current.active = false;
        }}
        className="relative flex-1 cursor-grab active:cursor-grabbing"
      >
        <svg viewBox="0 0 380 260" className="h-full w-full">
          {renderWireframe()}
        </svg>
      </div>
    </div>
  );
};

// ============================================================================
// STUDENT POP QUIZ QR RESPONDER MODAL (WHEN OPENING /?popQuizId=...)
// ============================================================================

export const StudentPopQuizResponderModal: React.FC<{
  quizId: string;
  defaultStudentName?: string;
  defaultStudentClass?: string;
  onClose: () => void;
}> = ({ quizId, defaultStudentName = '', defaultStudentClass = '12A1', onClose }) => {
  const [session, setSession] = useState<PopQuizSessionState | null>(null);
  const [studentName, setStudentName] = useState(defaultStudentName);
  const [studentClass, setStudentClass] = useState(defaultStudentClass);
  const [selectedChoice, setSelectedChoice] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pop-quiz/${encodeURIComponent(quizId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.session) setSession(d.session);
      })
      .catch(() => {});
  }, [quizId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMsg('Vui lòng nhập Họ và tên học sinh.');
      return;
    }
    if (!selectedChoice && !comment.trim()) {
      setErrorMsg('Vui lòng chọn đáp án A, B, C, D hoặc nhập ý kiến thảo luận.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pop-quiz/${encodeURIComponent(quizId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: studentName.trim(),
          studentClass: studentClass.trim() || '12A1',
          choice: selectedChoice || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Không thể gửi câu trả lời.');
      } else {
        setSubmittedSuccess(true);
        // Also broadcast locally for same-device multi-tab testing
        try {
          const bc = new BroadcastChannel('smas_smartboard_popquiz');
          bc.postMessage({ type: 'NEW_RESPONSE', quizId, session: data.session });
          bc.close();
        } catch {
          // ignore
        }
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi gửi đáp án.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#136F63] px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            <div>
              <div className="text-[14px] font-bold">Trả lời Câu hỏi Tương tác Smartboard</div>
              <div className="text-[11.5px] text-emerald-100">Mã phiên: #{quizId}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {session && (
            <div className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-[13px] font-semibold text-[#136F63]">
                {session.questionTitle}
              </div>
              {session.questionStem && (
                <div className="mt-1 text-[12.5px] text-slate-700">
                  <MathText text={session.questionStem} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-slate-700">
                Họ và tên học sinh *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="VD: Nguyễn Minh Anh"
                className="w-full rounded-[6px] border border-[#CBD5E1] px-3 py-2 text-[13px] focus:border-[#136F63] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-slate-700">Lớp</label>
              <input
                type="text"
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                placeholder="11B05"
                className="w-full rounded-[6px] border border-[#CBD5E1] px-3 py-2 text-[13px] focus:border-[#136F63] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-800">
              Chọn nhanh đáp án trắc nghiệm:
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setSelectedChoice(opt);
                    setSubmittedSuccess(false);
                  }}
                  className={`flex h-14 flex-col items-center justify-center rounded-[8px] border-2 text-[18px] font-bold transition-all ${
                    selectedChoice === opt
                      ? 'border-[#136F63] bg-[#136F63] text-white shadow-md'
                      : 'border-[#CBD5E1] bg-white text-slate-800 hover:border-[#136F63] hover:bg-emerald-50/40'
                  }`}
                >
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-slate-700">
              Ý kiến thảo luận / Đáp số ngắn (tùy chọn):
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Nhập kết quả hoặc câu hỏi thảo luận gửi lên bảng tương tác..."
              className="w-full rounded-[6px] border border-[#CBD5E1] px-3 py-2 text-[13px] focus:border-[#136F63] focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {errorMsg}
            </div>
          )}

          {submittedSuccess && (
            <div className="flex items-center gap-2 rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-medium text-emerald-800">
              <Check className="h-4 w-4 shrink-0 text-[#136F63]" />
              <span>
                Đã gửi đáp án <strong>{selectedChoice || ''}</strong> lên Bảng tương tác của giáo
                viên!
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'Đang gửi...' : 'Gửi lên Bảng tương tác'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN SMARTBOARD CANVAS STUDIO COMPONENT
// ============================================================================

export const SmartboardCanvasStudio: React.FC<SmartboardCanvasStudioProps> = ({
  bankItems,
  schoolName = 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
  teacherName = 'Thầy giáo Lê Trọng Toàn',
  onOpenJsonBankLoader,
  onPublishToStudentNotebook,
  availableClasses = [
    { id: 'cls-12a1', name: '12A1', grade: '12' },
    { id: 'cls-11b05', name: '11B05', grade: '11' },
    { id: 'cls-10c01', name: '10C01', grade: '10' },
  ],
  activeClassName = '12A1',
  pendingIncomingWidget,
  onClearPendingIncomingWidget,
  isOwnerAdmin = false,
}) => {
  // --------------------------------------------------------------------------
  // 1. MULTI-PAGE STATE
  // --------------------------------------------------------------------------
  const [pages, setPages] = useState<SmartboardPage[]>(() => [
    {
      id: 'page-1',
      title: 'Trang bảng 1 — Giảng bài & Ví dụ',
      background: 'square_grid',
      strokes: [],
      undoStack: [],
      redoStack: [],
      widgets: [],
    },
    {
      id: 'page-2',
      title: 'Trang bảng 2 — Đồ thị & Hệ trục Oxy',
      background: 'cartesian_oxy',
      strokes: [],
      undoStack: [],
      redoStack: [],
      widgets: [],
    },
    {
      id: 'page-3',
      title: 'Trang bảng 3 — Bảng đen chống lóa',
      background: 'chalkboard_dark',
      strokes: [],
      undoStack: [],
      redoStack: [],
      widgets: [],
    },
  ]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [showPageThumbnails, setShowPageThumbnails] = useState(false);

  const currentPage = pages[currentPageIdx] || pages[0];

  // --------------------------------------------------------------------------
  // 2. INFINITE CANVAS VIEWPORT (ZOOM & PAN) & FULLSCREEN
  // --------------------------------------------------------------------------
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --------------------------------------------------------------------------
  // 2B. SPLIT-SCREEN DUAL INTERACTIVE CANVAS (BẢNG TRÁI & BẢNG PHẢI ĐỘC LẬP)
  // --------------------------------------------------------------------------
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitRatio, setSplitRatio] = useState(45); // % width for Left Board (default 45% Đề bài / 55% Lời giải)
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [activeBoardSide, setActiveBoardSide] = useState<'left' | 'right'>('left');
  const [splitExitModalOpen, setSplitExitModalOpen] = useState(false);
  const [rightBoard, setRightBoard] = useState<SplitBoardData>({
    background: 'ruled_lines',
    strokes: [],
    widgets: [],
    undoStack: [],
    redoStack: [],
  });
  const rightBoardControllerRef = useRef<SplitRightBoardController | null>(null);
  const splitWorkspaceRef = useRef<HTMLDivElement | null>(null);

  // --------------------------------------------------------------------------
  // 3. DOCKABLE TOOLBAR & DRAWING TOOLS (48px touch targets)
  // --------------------------------------------------------------------------
  const [dockPos, setDockPos] = useState<ToolbarDockPosition>('bottom');
  const [activeTool, setActiveTool] = useState<SmartboardTool>('pen');
  const [penColor, setPenColor] = useState('#0F172A');
  const [penWidth, setPenWidth] = useState(4);
  const [penLineStyle, setPenLineStyle] = useState<StrokeLineStyle>('solid');
  const [highlighterColor, setHighlighterColor] = useState('#FACC15');
  const [eraserMode, setEraserMode] = useState<EraserSubMode>('stroke');
  const [smartShapeMode, setSmartShapeMode] = useState<SmartShapeSubMode>('auto');

  // 3D Solid & Conic Template Library state inside Smart Shape
  const [shapeCategoryTab, setShapeCategoryTab] = useState<SmartShapeCategoryTab>('2d');
  const [activeSmartTemplate, setActiveSmartTemplate] = useState<SmartTemplateId | null>(null);
  const [activeTemplateVariant, setActiveTemplateVariant] = useState<string>('standard');
  const [defaultTemplateShowLabels, setDefaultTemplateShowLabels] = useState<boolean>(true);

  // Selected stroke(s) / template figure(s) / floating widget(s) for Smart Lasso, 8-point resize & 360° rotation
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [aspectRatioLocked, setAspectRatioLocked] = useState<boolean>(false);
  const [activeTransformBadge, setActiveTransformBadge] = useState<{
    kind: 'rotate' | 'resize';
    angleDeg?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [activeGroupRotateFrame, setActiveGroupRotateFrame] = useState<{
    box: TransformBox;
    angleDeg: number;
  } | null>(null);

  // Smart Lasso freehand selection state (animated marching-ants dashed path + auto-close loop)
  const [freehandLasso, setFreehandLasso] = useState<{
    points: StrokePoint[];
    active: boolean;
    closing?: boolean;
  } | null>(null);
  const lassoCloseTimerRef = useRef<number | null>(null);

  // Internal clipboard for Copy (Ctrl+C) & Paste (Ctrl+V) across the whiteboard
  const [clipboardData, setClipboardData] = useState<{
    strokes: SmartboardStroke[];
    widgets: SmartboardWidget[];
    pasteCount: number;
  } | null>(null);

  // Sub-popovers on the dockable toolbar
  const [openPopover, setOpenPopover] = useState<
    'none' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'geometry_tools' | 'focus_tools' | 'background'
  >('none');

  // --------------------------------------------------------------------------
  // 4. VIRTUAL GEOMETRY INSTRUMENTS (RULER, PROTRACTOR, COMPASS)
  // --------------------------------------------------------------------------
  const [showRuler, setShowRuler] = useState(false);
  const [rulerState, setRulerState] = useState({ x: 240, y: 260, angle: 0, lengthCm: 16 });

  const [showProtractor, setShowProtractor] = useState(false);
  const [protractorState, setProtractorState] = useState({
    x: 450,
    y: 320,
    angle: 0,
    measureDeg: 60,
  });

  const [showCompass, setShowCompass] = useState(false);
  const [compassState, setCompassState] = useState({
    cx: 540,
    cy: 300,
    radius: 110,
    angle: 45,
  });

  // --------------------------------------------------------------------------
  // 5. ATTENTION FOCUS TOOLS (SPOTLIGHT & SCREEN SHADE)
  // --------------------------------------------------------------------------
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [spotlightShape, setSpotlightShape] = useState<'circle' | 'rect'>('circle');
  const [spotlightBox, setSpotlightBox] = useState({ x: 380, y: 180, w: 320, h: 240 });

  const [screenShadeActive, setScreenShadeActive] = useState(false);
  const [screenShadeDir, setScreenShadeDir] = useState<'top' | 'left'>('top');
  // Ratio covered: 0.65 means 65% of the screen is covered by the shade
  const [screenShadeCoverPos, setScreenShadeCoverPos] = useState(420);

  // --------------------------------------------------------------------------
  // 6. AI PEN & MATH OCR (LASSO SELECTION & GEMINI OCR/EXPLAIN)
  // --------------------------------------------------------------------------
  const [lassoRect, setLassoRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    active: boolean;
  } | null>(null);
  const [aiOcrLoading, setAiOcrLoading] = useState(false);
  const [aiOcrResult, setAiOcrResult] = useState<{
    katexText: string;
    recognizedProblem: string;
    steps: Array<{ title: string; leadIn: string; mathDetail: string }>;
    finalAnswer: string;
    croppedImageUrl?: string;
  } | null>(null);

  // --------------------------------------------------------------------------
  // 7. RESOURCE INSERTION MODALS (QUESTION BANK, YOUTUBE, GEOGEBRA/3D)
  // --------------------------------------------------------------------------
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [bankGradeFilter, setBankGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [bankPartFilter, setBankPartFilter] = useState<'all' | 'part1' | 'part2' | 'part3'>('all');

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');

  // --------------------------------------------------------------------------
  // 8. LIVE POP QUIZ QR & REAL-TIME BAR CHART
  // --------------------------------------------------------------------------
  const [popQuizOpen, setPopQuizOpen] = useState(false);
  const [popQuizSession, setPopQuizSession] = useState<PopQuizSessionState>(() => ({
    quizId: 'SB' + Math.floor(1000 + Math.random() * 9000),
    questionTitle: 'Câu hỏi tương tác nhanh trên Bảng thông minh',
    questionStem:
      'Quan sát bài toán trên Bảng tương tác Smartboard và chọn đáp án đúng (A, B, C, D) hoặc gửi ý kiến thảo luận.',
    options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
    correctOption: 'B',
    isOpen: true,
    createdAt: new Date().toISOString(),
    responses: [
      {
        id: 'init-1',
        studentName: 'Nguyễn Minh Anh',
        studentClass: '11B05',
        choice: 'B',
        comment: 'Đạo hàm đổi dấu từ âm sang dương tại x = 3 ạ!',
        submittedAt: new Date().toISOString(),
      },
      {
        id: 'init-2',
        studentName: 'Trần Quốc Bảo',
        studentClass: '11B05',
        choice: 'B',
        submittedAt: new Date().toISOString(),
      },
      {
        id: 'init-3',
        studentName: 'Lê Hoàng Châu',
        studentClass: '11B13',
        choice: 'C',
        submittedAt: new Date().toISOString(),
      },
    ],
  }));
  const [popQuizQrDataUrl, setPopQuizQrDataUrl] = useState('');
  const [showStudentPreviewModal, setShowStudentPreviewModal] = useState(false);

  // --------------------------------------------------------------------------
  // 9. SCREEN RECORDING (MediaRecorder) & PDF EXPORT
  // --------------------------------------------------------------------------
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishLessonTitle, setPublishLessonTitle] = useState(
    () => `Ghi chép Bảng tương tác ngày ${new Date().toLocaleDateString('vi-VN')}`
  );
  const [publishTargetClass, setPublishTargetClass] = useState(activeClassName || '12A1');
  const [isPublishingNotebook, setIsPublishingNotebook] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  // Dual-Canvas Layering:
  // 1) mainCanvasRef (Bottom / Main Layer): holds background + all finalized strokes. NEVER cleared on pointerMove.
  // 2) activeCanvasRef (Top / Active Layer): holds ONLY the single currently-drawn stroke & snap guides via rAF.
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active pointer tracking for 1-finger draw vs 2-finger pinch-to-zoom & pan
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    mode: 'none' | 'draw' | 'pan' | 'pinch' | 'lasso' | 'select_lasso';
    currentStroke: SmartboardStroke | null;
    startPanX: number;
    startPanY: number;
    startClientX: number;
    startClientY: number;
    pinchStartDist: number;
    pinchStartZoom: number;
    pinchMidWorldX: number;
    pinchMidWorldY: number;
    selectDownWorldPt: StrokePoint | null;
    selectDidDrag: boolean;
    selectLassoPoints: StrokePoint[];
  }>({
    mode: 'none',
    currentStroke: null,
    startPanX: 0,
    startPanY: 0,
    startClientX: 0,
    startClientY: 0,
    pinchStartDist: 1,
    pinchStartZoom: 1,
    pinchMidWorldX: 0,
    pinchMidWorldY: 0,
    selectDownWorldPt: null,
    selectDidDrag: false,
    selectLassoPoints: [],
  });

  // Widget drag/resize state
  const widgetDragRef = useRef<{
    widgetId: string | null;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    didMutate: boolean;
    preSnapshot: SmartboardHistorySnapshot | null;
  }>({
    widgetId: null,
    mode: 'move',
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 0,
    origH: 0,
    didMutate: false,
    preSnapshot: null,
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Automatically switch black pen to white pen when choosing chalkboard_dark
  const handleSelectBackground = (bg: CanvasBackgroundType) => {
    if (isSplitView && activeBoardSide === 'right') {
      setRightBoard((prev) => ({ ...prev, background: bg }));
      if (bg === 'chalkboard_dark' && penColor === '#0F172A') {
        setPenColor('#FFFFFF');
        showToast('Bảng Phải: Đã chuyển sang nền Bảng đen & tự động chọn phấn Trắng.');
      } else if (bg !== 'chalkboard_dark' && penColor === '#FFFFFF') {
        setPenColor('#0F172A');
      } else {
        const bgInfo = BACKGROUND_OPTIONS.find((b) => b.id === bg);
        showToast(`Bảng Phải: Đã chuyển nền sang "${bgInfo?.label || bg}".`);
      }
      setOpenPopover('none');
      return;
    }

    setPages((prev) =>
      prev.map((p, idx) => (idx === currentPageIdx ? { ...p, background: bg } : p))
    );
    if (bg === 'chalkboard_dark' && penColor === '#0F172A') {
      setPenColor('#FFFFFF');
      showToast('Đã chuyển sang nền Bảng đen chống lóa & tự động chọn phấn Trắng.');
    } else if (bg !== 'chalkboard_dark' && penColor === '#FFFFFF') {
      setPenColor('#0F172A');
    }
    setOpenPopover('none');
  };

  // Shared clipboard callbacks for SplitRightBoardPane (seamless Copy/Paste between Left & Right)
  const handleCopyFromRightBoard = useCallback(
    (strokes: SmartboardStroke[], widgets: SmartboardWidget[]) => {
      setClipboardData({
        strokes,
        widgets,
        pasteCount: 0,
      });
    },
    []
  );

  const handleIncrementClipboardPaste = useCallback(() => {
    setClipboardData((prev) => (prev ? { ...prev, pasteCount: prev.pasteCount + 1 } : null));
  }, []);

  // Split-Screen Toggle & Safe Merge Handlers
  const handleRequestToggleSplitView = useCallback(() => {
    setOpenPopover('none');
    if (!isSplitView) {
      setIsSplitView(true);
      setActiveBoardSide('right');
      showToast(
        'Đã bật Chế độ Chia đôi 2 Bảng Độc lập (Alt+S). Kéo thanh chia ở giữa để chỉnh tỷ lệ; 2 bên Pan/Zoom & viết đồng thời độc lập 100%.'
      );
      return;
    }
    const rightHasContent = rightBoard.strokes.length > 0 || rightBoard.widgets.length > 0;
    if (!rightHasContent) {
      setIsSplitView(false);
      setActiveBoardSide('left');
      showToast('Đã quay lại Chế độ 1 Bảng Đơn toàn màn hình.');
      return;
    }
    setSplitExitModalOpen(true);
  }, [isSplitView, rightBoard.strokes.length, rightBoard.widgets.length, showToast]);

  const handleExitSplitKeepLeft = () => {
    setSplitExitModalOpen(false);
    setIsSplitView(false);
    setActiveBoardSide('left');
    showToast(
      'Đã quay lại 1 Bảng Đơn (giữ nguyên Bảng Trái; nội dung Bảng Phải vẫn được lưu tạm khi mở lại Chia đôi).'
    );
  };

  const handleExitSplitKeepRight = () => {
    const clonedStrokes = rightBoard.strokes.map((st) => ({
      ...st,
      templateBox: st.templateBox ? { ...st.templateBox } : undefined,
      templateConfig: st.templateConfig ? { ...st.templateConfig } : undefined,
      points: st.points.map((p) => ({ ...p })),
    }));
    const clonedWidgets = rightBoard.widgets.map((w) => ({ ...w }));
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIdx
          ? {
              ...p,
              background: rightBoard.background,
              undoStack: [...p.undoStack.slice(-24), { strokes: p.strokes, widgets: p.widgets }],
              redoStack: [],
              strokes: clonedStrokes,
              widgets: clonedWidgets,
            }
          : p
      )
    );
    setRightBoard((prev) => ({
      ...prev,
      strokes: [],
      widgets: [],
      undoStack: [],
      redoStack: [],
    }));
    setSplitExitModalOpen(false);
    setIsSplitView(false);
    setActiveBoardSide('left');
    showToast('Đã chuyển toàn bộ nội dung Bảng Phải về làm 1 Bảng Đơn (có thể Ctrl+Z để hoàn tác).');
  };

  const handleExitSplitMergeBoth = () => {
    const leftStrokes = currentPage.strokes;
    const leftWidgets = currentPage.widgets;
    // Compute rightmost X of Left Board so Right Board content lands neatly side-by-side without overlapping
    let leftMaxX = 680;
    let leftMinY = 80;
    let hasLeftContent = false;
    for (const st of leftStrokes) {
      const b = getStrokeRawBounds(st);
      if (!hasLeftContent || b.maxX > leftMaxX) leftMaxX = b.maxX;
      if (!hasLeftContent || b.minY < leftMinY) leftMinY = b.minY;
      hasLeftContent = true;
    }
    for (const w of leftWidgets) {
      const r = w.x + w.width;
      if (!hasLeftContent || r > leftMaxX) leftMaxX = r;
      if (!hasLeftContent || w.y < leftMinY) leftMinY = w.y;
      hasLeftContent = true;
    }

    let rightMinX = Infinity;
    let rightMinY = Infinity;
    for (const st of rightBoard.strokes) {
      const b = getStrokeRawBounds(st);
      if (b.minX < rightMinX) rightMinX = b.minX;
      if (b.minY < rightMinY) rightMinY = b.minY;
    }
    for (const w of rightBoard.widgets) {
      if (w.x < rightMinX) rightMinX = w.x;
      if (w.y < rightMinY) rightMinY = w.y;
    }
    if (!Number.isFinite(rightMinX)) rightMinX = 0;
    if (!Number.isFinite(rightMinY)) rightMinY = 0;

    const dx = hasLeftContent ? Math.round(leftMaxX + 96 - rightMinX) : 0;
    const dy = hasLeftContent ? Math.round(leftMinY - rightMinY) : 0;

    const mergedRightStrokes = rightBoard.strokes.map((st, idx) => ({
      ...st,
      id: `st-mrg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      templateBox: st.templateBox
        ? {
            ...st.templateBox,
            x: Math.round(st.templateBox.x + dx),
            y: Math.round(st.templateBox.y + dy),
          }
        : undefined,
      templateConfig: st.templateConfig ? { ...st.templateConfig } : undefined,
      points: st.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    }));
    const mergedRightWidgets = rightBoard.widgets.map((w, idx) => ({
      ...w,
      id: `w-mrg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      x: Math.round(w.x + dx),
      y: Math.round(w.y + dy),
    }));

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIdx
          ? {
              ...p,
              undoStack: [...p.undoStack.slice(-24), { strokes: p.strokes, widgets: p.widgets }],
              redoStack: [],
              strokes: [...p.strokes, ...mergedRightStrokes],
              widgets: [...p.widgets, ...mergedRightWidgets],
            }
          : p
      )
    );
    setRightBoard((prev) => ({
      ...prev,
      strokes: [],
      widgets: [],
      undoStack: [],
      redoStack: [],
    }));
    setSplitExitModalOpen(false);
    setIsSplitView(false);
    setActiveBoardSide('left');
    showToast(
      `Đã ghép an toàn ${mergedRightStrokes.length + mergedRightWidgets.length} đối tượng từ Bảng Phải sang cạnh Bảng Trái.`
    );
  };

  // Resizable vertical divider pointer drag handler (supports touch & mouse)
  const handleStartDividerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setIsDraggingDivider(true);

    const onMove = (ev: PointerEvent) => {
      const ws = splitWorkspaceRef.current;
      if (!ws) return;
      const rect = ws.getBoundingClientRect();
      // Account for open thumbnails drawer on the left
      const leftOffset = showPageThumbnails ? 256 : 0;
      const availWidth = Math.max(320, rect.width - leftOffset);
      const relX = ev.clientX - (rect.left + leftOffset);
      const pct = Math.max(22, Math.min(78, Math.round((relX / availWidth) * 100)));
      setSplitRatio(pct);
    };

    const onUp = () => {
      setIsDraggingDivider(false);
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const activeRafIdRef = useRef<number | null>(null);
  const snapIndicatorRef = useRef<{
    hoverSnap: SnapTarget | null;
    startSnap: SnapTarget | null;
    endSnap: SnapTarget | null;
  }>({
    hoverSnap: null,
    startSnap: null,
    endSnap: null,
  });

  // Tracks exact snapshot currently painted on the Bottom (Main) Canvas to skip redundant redraws
  const mainLayerStateRef = useRef<{
    pageId: string;
    background: CanvasBackgroundType;
    panX: number;
    panY: number;
    zoom: number;
    width: number;
    height: number;
    strokes: SmartboardStroke[];
  } | null>(null);

  // Asynchronous Undo/Redo history commit queue (keeps pen-up handoff 0ms / non-blocking)
  interface PendingStrokeCommit {
    pageId: string;
    stroke: SmartboardStroke;
    selectAfterCommit?: boolean;
  }
  const pendingStrokeCommitsRef = useRef<PendingStrokeCommit[]>([]);
  const asyncCommitHandleRef = useRef<{ kind: 'idle' | 'timeout'; id: number } | null>(null);

  const isLineRubberBandTool =
    activeTool === 'smart_shape' &&
    !activeSmartTemplate &&
    (smartShapeMode === 'line' || smartShapeMode === 'arrow');

  // Precomputed snap anchors for all committed strokes on the current page
  const pageSnapTargets = useMemo(
    () => collectCanvasSnapTargets(currentPage.strokes),
    [currentPage.strokes]
  );

  const getPendingStrokesForPage = useCallback((pageId: string): SmartboardStroke[] => {
    const queue = pendingStrokeCommitsRef.current;
    if (queue.length === 0) return [];
    const result: SmartboardStroke[] = [];
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].pageId === pageId) {
        result.push(queue[i].stroke);
      }
    }
    return result;
  }, []);

  const getEffectivePageStrokes = useCallback(
    (page: SmartboardPage): SmartboardStroke[] => {
      const pending = getPendingStrokesForPage(page.id);
      return pending.length === 0 ? page.strokes : [...page.strokes, ...pending];
    },
    [getPendingStrokesForPage]
  );

  const getActiveSnapTargets = useCallback((): SnapTarget[] => {
    const pending = getPendingStrokesForPage(currentPage.id);
    if (pending.length === 0) return pageSnapTargets;
    return [...pageSnapTargets, ...collectCanvasSnapTargets(pending)];
  }, [currentPage.id, getPendingStrokesForPage, pageSnapTargets]);

  const cancelScheduledAsyncCommit = useCallback(() => {
    const handle = asyncCommitHandleRef.current;
    if (!handle) return;
    asyncCommitHandleRef.current = null;
    if (handle.kind === 'idle' && typeof globalThis.cancelIdleCallback === 'function') {
      globalThis.cancelIdleCallback(handle.id);
    } else {
      window.clearTimeout(handle.id);
    }
  }, []);

  const drainPendingStrokeCommits = useCallback((): PendingStrokeCommit[] => {
    cancelScheduledAsyncCommit();
    if (pendingStrokeCommitsRef.current.length === 0) return [];
    const batch = pendingStrokeCommitsRef.current;
    pendingStrokeCommitsRef.current = [];
    return batch;
  }, [cancelScheduledAsyncCommit]);

  const applyPendingCommitsToPages = useCallback(
    (prevPages: SmartboardPage[], batch: PendingStrokeCommit[]): SmartboardPage[] => {
      if (batch.length === 0) return prevPages;
      const byPage = new Map<string, SmartboardStroke[]>();
      for (const item of batch) {
        const list = byPage.get(item.pageId);
        if (list) {
          list.push(item.stroke);
        } else {
          byPage.set(item.pageId, [item.stroke]);
        }
      }
      return prevPages.map((page) => {
        const added = byPage.get(page.id);
        if (!added || added.length === 0) return page;
        let nextStrokes = page.strokes;
        let nextUndo = page.undoStack;
        for (const stroke of added) {
          nextUndo = [...nextUndo.slice(-29), { strokes: nextStrokes, widgets: page.widgets }];
          nextStrokes = [...nextStrokes, stroke];
        }
        return {
          ...page,
          strokes: nextStrokes,
          undoStack: nextUndo,
          redoStack: [],
        };
      });
    },
    []
  );

  const flushPendingStrokeCommits = useCallback(() => {
    const batch = drainPendingStrokeCommits();
    if (batch.length === 0) return;

    let lastSelectedId: string | null = null;
    for (let i = batch.length - 1; i >= 0; i--) {
      if (batch[i].selectAfterCommit) {
        lastSelectedId = batch[i].stroke.id;
        break;
      }
    }

    setPages((prev) => applyPendingCommitsToPages(prev, batch));
    if (lastSelectedId) {
      setSelectedStrokeIds([lastSelectedId]);
      setSelectedWidgetIds([]);
    }
  }, [applyPendingCommitsToPages, drainPendingStrokeCommits]);

  const enqueueAsyncStrokeCommit = useCallback(
    (pageId: string, stroke: SmartboardStroke, selectAfterCommit = false) => {
      pendingStrokeCommitsRef.current.push({ pageId, stroke, selectAfterCommit });
      if (asyncCommitHandleRef.current !== null) return;

      const runFlush = () => {
        asyncCommitHandleRef.current = null;
        flushPendingStrokeCommits();
      };

      if (typeof globalThis.requestIdleCallback === 'function') {
        const idleId = globalThis.requestIdleCallback(runFlush, { timeout: 60 });
        asyncCommitHandleRef.current = { kind: 'idle', id: idleId };
      } else {
        const timeoutId = window.setTimeout(runFlush, 0);
        asyncCommitHandleRef.current = { kind: 'timeout', id: timeoutId };
      }
    },
    [flushPendingStrokeCommits]
  );

  // --------------------------------------------------------------------------
  // DUAL-CANVAS RENDERING ENGINE
  //   Layer 1 (Bottom / mainCanvasRef): Background + finalized strokes (incremental)
  //   Layer 2 (Top / activeCanvasRef):  Single in-progress stroke + snap indicators (rAF 0ms)
  // --------------------------------------------------------------------------
  const syncCanvasBackingSize = useCallback(
    (canvas: HTMLCanvasElement | null, rect: DOMRect, dpr: number) => {
      if (!canvas) return { targetW: 0, targetH: 0, resized: false };
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        return { targetW, targetH, resized: true };
      }
      return { targetW, targetH, resized: false };
    },
    []
  );

  const cancelActiveCanvasRender = useCallback(() => {
    if (activeRafIdRef.current !== null) {
      window.cancelAnimationFrame(activeRafIdRef.current);
      activeRafIdRef.current = null;
    }
  }, []);

  const clearActiveCanvas = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    ctx.restore();
  }, []);

  const renderActiveCanvas = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    const container = canvasContainerRef.current;
    if (!activeCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    syncCanvasBackingSize(activeCanvas, rect, dpr);

    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Draw ONLY the active in-progress stroke (freehand Bezier, rubber-band line, or 3D preview)
    if (gestureRef.current.currentStroke) {
      drawStrokeOnContext(ctx, gestureRef.current.currentStroke, panX, panY, zoom);
    }

    // 2. Draw magnetic green snap indicators (start / end / hover)
    const { hoverSnap, startSnap, endSnap } = snapIndicatorRef.current;
    if (startSnap) {
      drawSnapIndicatorOnContext(ctx, startSnap, panX, panY, zoom, true);
    }
    if (endSnap) {
      drawSnapIndicatorOnContext(ctx, endSnap, panX, panY, zoom, true);
    } else if (hoverSnap && !gestureRef.current.currentStroke) {
      drawSnapIndicatorOnContext(ctx, hoverSnap, panX, panY, zoom, false);
    }

    ctx.restore();
  }, [panX, panY, syncCanvasBackingSize, zoom]);

  const scheduleActiveCanvasRender = useCallback(() => {
    if (activeRafIdRef.current !== null) return;
    activeRafIdRef.current = window.requestAnimationFrame(() => {
      activeRafIdRef.current = null;
      renderActiveCanvas();
    });
  }, [renderActiveCanvas]);

  const renderFullMainCanvas = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    const container = canvasContainerRef.current;
    if (!mainCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { targetW, targetH } = syncCanvasBackingSize(mainCanvas, rect, dpr);

    // Keep top Active Canvas pixel-locked to Main Canvas dimensions
    syncCanvasBackingSize(activeCanvasRef.current, rect, dpr);

    const ctx = mainCanvas.getContext('2d');
    if (!ctx) return;

    const effectiveStrokes = getEffectivePageStrokes(currentPage);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Draw Background Template
    drawPageBackgroundOnContext(
      ctx,
      rect.width,
      rect.height,
      currentPage.background,
      panX,
      panY,
      zoom
    );

    // 2. Draw all finalized strokes on the Bottom (Main) Layer
    for (let i = 0; i < effectiveStrokes.length; i++) {
      drawStrokeOnContext(ctx, effectiveStrokes[i], panX, panY, zoom);
    }

    ctx.restore();

    mainLayerStateRef.current = {
      pageId: currentPage.id,
      background: currentPage.background,
      panX,
      panY,
      zoom,
      width: targetW,
      height: targetH,
      strokes: [...effectiveStrokes],
    };
  }, [currentPage, getEffectivePageStrokes, panX, panY, syncCanvasBackingSize, zoom]);

  // Incrementally stamp a newly finalized Bezier stroke directly onto Main Canvas (0ms, no clearRect)
  const appendStrokeToMainCanvas = useCallback(
    (stroke: SmartboardStroke): boolean => {
      const mainCanvas = mainCanvasRef.current;
      const container = canvasContainerRef.current;
      if (!mainCanvas || !container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));

      const prev = mainLayerStateRef.current;
      const mainCanvasMatchesViewport =
        prev !== null &&
        prev.pageId === currentPage.id &&
        prev.background === currentPage.background &&
        prev.panX === panX &&
        prev.panY === panY &&
        prev.zoom === zoom &&
        prev.width === targetW &&
        prev.height === targetH &&
        mainCanvas.width === targetW &&
        mainCanvas.height === targetH;

      if (!mainCanvasMatchesViewport) {
        renderFullMainCanvas();
      }

      const ctx = mainCanvas.getContext('2d');
      if (!ctx) return false;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStrokeOnContext(ctx, stroke, panX, panY, zoom);
      ctx.restore();

      if (mainLayerStateRef.current) {
        mainLayerStateRef.current.strokes = [...mainLayerStateRef.current.strokes, stroke];
      }
      return true;
    },
    [currentPage.background, currentPage.id, panX, panY, renderFullMainCanvas, zoom]
  );

  // Synchronizes Main Canvas only when viewport/page/background changed, or strokes were modified/removed.
  // Skips full redraw completely when async history flush confirms strokes already drawn on Main Canvas!
  const syncMainCanvasIfNeeded = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    const container = canvasContainerRef.current;
    if (!mainCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));

    const prev = mainLayerStateRef.current;
    const effectiveStrokes = getEffectivePageStrokes(currentPage);

    const viewportMatches =
      prev !== null &&
      prev.pageId === currentPage.id &&
      prev.background === currentPage.background &&
      prev.panX === panX &&
      prev.panY === panY &&
      prev.zoom === zoom &&
      prev.width === targetW &&
      prev.height === targetH &&
      mainCanvas.width === targetW &&
      mainCanvas.height === targetH;

    if (viewportMatches && prev) {
      // Check if existing painted strokes match the prefix of effectiveStrokes by reference
      if (effectiveStrokes.length >= prev.strokes.length) {
        let prefixMatches = true;
        for (let i = 0; i < prev.strokes.length; i++) {
          if (prev.strokes[i] !== effectiveStrokes[i]) {
            prefixMatches = false;
            break;
          }
        }
        if (prefixMatches) {
          // Exact match -> Main Canvas is already 100% up-to-date, skip redraw completely!
          if (effectiveStrokes.length === prev.strokes.length) {
            return;
          }
          // Pure append (e.g., Ruler / Compass / Protractor / Quick template) -> draw only new tail strokes
          const ctx = mainCanvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            for (let i = prev.strokes.length; i < effectiveStrokes.length; i++) {
              drawStrokeOnContext(ctx, effectiveStrokes[i], panX, panY, zoom);
            }
            ctx.restore();
            prev.strokes = [...effectiveStrokes];
            return;
          }
        }
      }
    }

    // Fallback: full Main Canvas repaint (Undo/Redo/Erase/Clear/Pan/Zoom/Resize/PageSwitch/Edit)
    renderFullMainCanvas();
  }, [currentPage, getEffectivePageStrokes, panX, panY, renderFullMainCanvas, zoom]);

  useEffect(() => {
    syncMainCanvasIfNeeded();
    if (
      gestureRef.current.currentStroke ||
      snapIndicatorRef.current.hoverSnap ||
      snapIndicatorRef.current.startSnap ||
      snapIndicatorRef.current.endSnap
    ) {
      renderActiveCanvas();
    }
  }, [syncMainCanvasIfNeeded, renderActiveCanvas, isFullscreen]);

  useEffect(() => {
    if (!isLineRubberBandTool && snapIndicatorRef.current.hoverSnap) {
      snapIndicatorRef.current.hoverSnap = null;
      renderActiveCanvas();
    }
  }, [isLineRubberBandTool, renderActiveCanvas]);

  useEffect(() => {
    return () => {
      cancelActiveCanvasRender();
      cancelScheduledAsyncCommit();
    };
  }, [cancelActiveCanvasRender, cancelScheduledAsyncCommit]);

  useEffect(() => {
    const handleViewportResize = () => {
      renderFullMainCanvas();
      renderActiveCanvas();
    };
    window.addEventListener('resize', handleViewportResize);
    const container = canvasContainerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        handleViewportResize();
      });
      observer.observe(container);
    }
    return () => {
      window.removeEventListener('resize', handleViewportResize);
      observer?.disconnect();
    };
  }, [renderFullMainCanvas, renderActiveCanvas]);

  // --------------------------------------------------------------------------
  // COORDINATE CONVERSION & RULER SNAPPING
  // --------------------------------------------------------------------------
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): StrokePoint => {
      const container = canvasContainerRef.current;
      if (!container) return { x: clientX, y: clientY };
      const rect = container.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - panX) / zoom,
        y: (sy - panY) / zoom,
      };
    },
    [panX, panY, zoom]
  );

  const maybeSnapToVirtualRuler = useCallback(
    (worldPt: StrokePoint): StrokePoint => {
      if (!showRuler) return worldPt;
      // Ruler top edge in world coordinates
      const rad = (rulerState.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = worldPt.x - rulerState.x;
      const dy = worldPt.y - rulerState.y;
      // Local coordinates relative to ruler top-left
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const rulerPixelLen = rulerState.lengthCm * 28;
      if (localX >= -20 && localX <= rulerPixelLen + 20 && Math.abs(localY) <= 22) {
        // Snap right onto the ruler's top edge (localY = -2)
        const snappedLocalY = -2;
        return {
          x: rulerState.x + localX * cos - snappedLocalY * sin,
          y: rulerState.y + localX * sin + snappedLocalY * cos,
        };
      }
      return worldPt;
    },
    [showRuler, rulerState]
  );

  // --------------------------------------------------------------------------
  // STROKE & WIDGET COMMIT, UNDO, REDO, ERASER & SELECTION HELPERS
  // --------------------------------------------------------------------------
  const pushUndoSnapshot = useCallback(
    (snapshot: SmartboardHistorySnapshot) => {
      setPages((prev) =>
        prev.map((page, idx) => {
          if (idx !== currentPageIdx) return page;
          return {
            ...page,
            undoStack: [...page.undoStack.slice(-29), snapshot],
            redoStack: [],
          };
        })
      );
    },
    [currentPageIdx]
  );

  const commitPageStrokes = useCallback(
    (nextStrokes: SmartboardStroke[], recordUndo = true) => {
      const drained = drainPendingStrokeCommits();
      setPages((prev) => {
        const synced = drained.length > 0 ? applyPendingCommitsToPages(prev, drained) : prev;
        return synced.map((page, idx) => {
          if (idx !== currentPageIdx) return page;
          return {
            ...page,
            strokes: nextStrokes,
            undoStack: recordUndo
              ? [...page.undoStack.slice(-29), { strokes: page.strokes, widgets: page.widgets }]
              : page.undoStack,
            redoStack: recordUndo ? [] : page.redoStack,
          };
        });
      });
    },
    [applyPendingCommitsToPages, currentPageIdx, drainPendingStrokeCommits]
  );

  const commitPageWidgets = useCallback(
    (nextWidgets: SmartboardWidget[], recordUndo = true) => {
      const drained = drainPendingStrokeCommits();
      setPages((prev) => {
        const synced = drained.length > 0 ? applyPendingCommitsToPages(prev, drained) : prev;
        return synced.map((page, idx) => {
          if (idx !== currentPageIdx) return page;
          return {
            ...page,
            widgets: nextWidgets,
            undoStack: recordUndo
              ? [...page.undoStack.slice(-29), { strokes: page.strokes, widgets: page.widgets }]
              : page.undoStack,
            redoStack: recordUndo ? [] : page.redoStack,
          };
        });
      });
    },
    [applyPendingCommitsToPages, currentPageIdx, drainPendingStrokeCommits]
  );

  const commitPageState = useCallback(
    (
      nextStrokes: SmartboardStroke[],
      nextWidgets: SmartboardWidget[],
      recordUndo = true
    ) => {
      const drained = drainPendingStrokeCommits();
      setPages((prev) => {
        const synced = drained.length > 0 ? applyPendingCommitsToPages(prev, drained) : prev;
        return synced.map((page, idx) => {
          if (idx !== currentPageIdx) return page;
          return {
            ...page,
            strokes: nextStrokes,
            widgets: nextWidgets,
            undoStack: recordUndo
              ? [...page.undoStack.slice(-29), { strokes: page.strokes, widgets: page.widgets }]
              : page.undoStack,
            redoStack: recordUndo ? [] : page.redoStack,
          };
        });
      });
    },
    [applyPendingCommitsToPages, currentPageIdx, drainPendingStrokeCommits]
  );

  const selectedStrokeIdSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);
  const selectedWidgetIdSet = useMemo(() => new Set(selectedWidgetIds), [selectedWidgetIds]);

  const selectedStrokes = useMemo(
    () => currentPage.strokes.filter((s) => selectedStrokeIdSet.has(s.id)),
    [currentPage.strokes, selectedStrokeIdSet]
  );

  const selectedWidgets = useMemo(
    () => currentPage.widgets.filter((w) => selectedWidgetIdSet.has(w.id)),
    [currentPage.widgets, selectedWidgetIdSet]
  );

  const totalSelectedCount = selectedStrokes.length + selectedWidgets.length;
  const isMultiSelection = totalSelectedCount > 1;

  const selectedStroke = useMemo(
    () => (selectedStrokes.length === 1 && selectedWidgets.length === 0 ? selectedStrokes[0] : null),
    [selectedStrokes, selectedWidgets.length]
  );

  const selectedWidget = useMemo(
    () => (selectedWidgets.length === 1 && selectedStrokes.length === 0 ? selectedWidgets[0] : null),
    [selectedStrokes.length, selectedWidgets]
  );

  const clearSelection = useCallback(() => {
    setSelectedStrokeIds([]);
    setSelectedWidgetIds([]);
    setActiveGroupRotateFrame(null);
  }, []);

  useEffect(() => {
    clearSelection();
    setFreehandLasso(null);
  }, [clearSelection, currentPageIdx]);

  useEffect(() => {
    return () => {
      if (lassoCloseTimerRef.current !== null) {
        window.clearTimeout(lassoCloseTimerRef.current);
      }
    };
  }, []);

  const updateSelectedStroke = useCallback(
    (updater: (st: SmartboardStroke) => SmartboardStroke, recordUndo = true) => {
      if (selectedStrokeIds.length === 0) return;
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const idSet = new Set(selectedStrokeIds);
      const next = effectiveStrokes.map((st) => (idSet.has(st.id) ? updater(st) : st));
      commitPageStrokes(next, recordUndo);
    },
    [commitPageStrokes, currentPage, getEffectivePageStrokes, selectedStrokeIds]
  );

  const updateSelectedWidget = useCallback(
    (updater: (w: SmartboardWidget) => SmartboardWidget, recordUndo = true) => {
      if (selectedWidgetIds.length === 0) return;
      const idSet = new Set(selectedWidgetIds);
      const next = currentPage.widgets.map((w) => (idSet.has(w.id) ? updater(w) : w));
      commitPageWidgets(next, recordUndo);
    },
    [commitPageWidgets, currentPage.widgets, selectedWidgetIds]
  );

  const computeStrokeBoundingBox = useCallback(
    (st: SmartboardStroke): TransformBox => {
      if (st.templateBox) {
        return st.templateBox;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of st.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (!Number.isFinite(minX)) {
        return { x: 200, y: 200, width: 100, height: 60 };
      }
      const pad = 8;
      const boxW = Math.max(24, maxX - minX + pad * 2);
      const boxH = Math.max(24, maxY - minY + pad * 2);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return {
        x: cx - boxW / 2,
        y: cy - boxH / 2,
        width: boxW,
        height: boxH,
      };
    },
    []
  );

  const findStrokeAtWorldPoint = useCallback(
    (worldPt: StrokePoint): SmartboardStroke | null => {
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const hitTol = 22 / Math.max(zoom, 0.35);

      // Pass 1: Direct segment / template-box hit (un-rotating point into each object's local frame)
      for (let i = effectiveStrokes.length - 1; i >= 0; i--) {
        const st = effectiveStrokes[i];
        const rotDeg = getStrokeRotationDeg(st);
        const rb = getStrokeRawBounds(st);
        const localPt = rotatePointAround(worldPt.x, worldPt.y, rb.cx, rb.cy, -rotDeg);

        if (st.templateBox) {
          const b = st.templateBox;
          if (
            localPt.x >= b.x - hitTol &&
            localPt.x <= b.x + b.width + hitTol &&
            localPt.y >= b.y - hitTol &&
            localPt.y <= b.y + b.height + hitTol
          ) {
            return st;
          }
          continue;
        }

        // Check segment distance in local unrotated coordinates
        for (let j = 0; j < st.points.length; j++) {
          const p1 = st.points[j];
          if (distance(p1, localPt) <= hitTol) return st;
          if (j + 1 < st.points.length) {
            const p2 = st.points[j + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len2 = dx * dx + dy * dy;
            if (len2 > 0) {
              const t = Math.max(
                0,
                Math.min(1, ((localPt.x - p1.x) * dx + (localPt.y - p1.y) * dy) / len2)
              );
              const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
              if (distance(proj, localPt) <= hitTol) return st;
            }
          }
        }
      }

      // Pass 2: Fallback tap inside closed 2D shapes (circle, ellipse, rectangle, triangle)
      for (let i = effectiveStrokes.length - 1; i >= 0; i--) {
        const st = effectiveStrokes[i];
        if (
          st.tool === 'shape' &&
          (st.shapeKind === 'circle' ||
            st.shapeKind === 'rectangle' ||
            st.shapeKind === 'triangle')
        ) {
          const rotDeg = getStrokeRotationDeg(st);
          const rb = getStrokeRawBounds(st);
          const localPt = rotatePointAround(worldPt.x, worldPt.y, rb.cx, rb.cy, -rotDeg);
          if (
            localPt.x >= rb.minX &&
            localPt.x <= rb.maxX &&
            localPt.y >= rb.minY &&
            localPt.y <= rb.maxY
          ) {
            return st;
          }
        }
      }
      return null;
    },
    [currentPage, getEffectivePageStrokes, zoom]
  );

  const cloneStrokeWithOffset = (
    st: SmartboardStroke,
    dx: number,
    dy: number,
    prefix: string
  ): SmartboardStroke => ({
    ...st,
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    templateBox: st.templateBox
      ? {
          ...st.templateBox,
          x: Math.round(st.templateBox.x + dx),
          y: Math.round(st.templateBox.y + dy),
        }
      : undefined,
    templateConfig: st.templateConfig ? { ...st.templateConfig } : undefined,
    points: st.points.map((p) => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy,
    })),
  });

  const cloneWidgetWithOffset = (
    w: SmartboardWidget,
    dx: number,
    dy: number,
    prefix: string
  ): SmartboardWidget => ({
    ...w,
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: Math.round(w.x + dx),
    y: Math.round(w.y + dy),
  });

  const handleCopySelection = useCallback(() => {
    if (totalSelectedCount === 0) return;
    const clonedStrokes = selectedStrokes.map((st) => ({
      ...st,
      templateBox: st.templateBox ? { ...st.templateBox } : undefined,
      templateConfig: st.templateConfig ? { ...st.templateConfig } : undefined,
      points: st.points.map((p) => ({ ...p })),
    }));
    const clonedWidgets = selectedWidgets.map((w) => ({ ...w }));
    setClipboardData({
      strokes: clonedStrokes,
      widgets: clonedWidgets,
      pasteCount: 0,
    });
    showToast(
      `Đã sao chép ${totalSelectedCount} đối tượng vào bộ nhớ tạm (nhấn Ctrl+V hoặc nút Dán để dán lên bảng).`
    );
  }, [selectedStrokes, selectedWidgets, showToast, totalSelectedCount]);

  const handlePasteClipboard = useCallback(() => {
    if (!clipboardData) return;
    const step = (clipboardData.pasteCount + 1) * 24;
    const dx = step;
    const dy = Math.round(step * 0.5);
    const effectiveStrokes = getEffectivePageStrokes(currentPage);
    const pastedStrokes = clipboardData.strokes.map((st) =>
      cloneStrokeWithOffset(st, dx, dy, 'st-paste')
    );
    const pastedWidgets = clipboardData.widgets.map((w) =>
      cloneWidgetWithOffset(w, dx, dy, 'w-paste')
    );
    commitPageState(
      [...effectiveStrokes, ...pastedStrokes],
      [...currentPage.widgets, ...pastedWidgets],
      true
    );
    setSelectedStrokeIds(pastedStrokes.map((s) => s.id));
    setSelectedWidgetIds(pastedWidgets.map((w) => w.id));
    setClipboardData((prev) => (prev ? { ...prev, pasteCount: prev.pasteCount + 1 } : null));
    const count = pastedStrokes.length + pastedWidgets.length;
    showToast(`Đã dán ${count} đối tượng lên bảng.`);
  }, [clipboardData, commitPageState, currentPage, getEffectivePageStrokes, showToast]);

  const handleDuplicateSelection = useCallback(() => {
    if (totalSelectedCount === 0) return;
    const offsetX = 24;
    const offsetY = 12;
    const effectiveStrokes = getEffectivePageStrokes(currentPage);
    const clonedStrokes = selectedStrokes.map((st) =>
      cloneStrokeWithOffset(st, offsetX, offsetY, 'st-dup')
    );
    const clonedWidgets = selectedWidgets.map((w) =>
      cloneWidgetWithOffset(w, offsetX, offsetY, 'w-dup')
    );
    commitPageState(
      [...effectiveStrokes, ...clonedStrokes],
      [...currentPage.widgets, ...clonedWidgets],
      true
    );
    setSelectedStrokeIds(clonedStrokes.map((s) => s.id));
    setSelectedWidgetIds(clonedWidgets.map((w) => w.id));
    showToast(
      totalSelectedCount > 1
        ? `Đã nhân bản tại chỗ ${totalSelectedCount} đối tượng (lệch 24px).`
        : 'Đã nhân bản tại chỗ đối tượng (lệch 24px).'
    );
  }, [
    commitPageState,
    currentPage,
    getEffectivePageStrokes,
    selectedStrokes,
    selectedWidgets,
    showToast,
    totalSelectedCount,
  ]);

  const handleBatchChangeColor = useCallback(
    (newColor: string) => {
      if (totalSelectedCount === 0) return;
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const nextStrokes = effectiveStrokes.map((st) =>
        selectedStrokeIdSet.has(st.id) ? { ...st, color: newColor } : st
      );
      const nextWidgets = currentPage.widgets.map((w) =>
        selectedWidgetIdSet.has(w.id) ? { ...w, borderColor: newColor } : w
      );
      commitPageState(nextStrokes, nextWidgets, true);
    },
    [
      commitPageState,
      currentPage,
      getEffectivePageStrokes,
      selectedStrokeIdSet,
      selectedWidgetIdSet,
      totalSelectedCount,
    ]
  );

  const handleBatchChangeLineStyle = useCallback(
    (targetStyle: StrokeLineStyle) => {
      if (totalSelectedCount === 0) return;
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const nextStrokes = effectiveStrokes.map((st) =>
        selectedStrokeIdSet.has(st.id) ? { ...st, lineStyle: targetStyle } : st
      );
      const nextWidgets = currentPage.widgets.map((w) =>
        selectedWidgetIdSet.has(w.id) ? { ...w, borderStyle: targetStyle } : w
      );
      commitPageState(nextStrokes, nextWidgets, true);
    },
    [
      commitPageState,
      currentPage,
      getEffectivePageStrokes,
      selectedStrokeIdSet,
      selectedWidgetIdSet,
      totalSelectedCount,
    ]
  );

  const handleDeleteSelectedObject = useCallback(() => {
    if (totalSelectedCount === 0) return;
    const effectiveStrokes = getEffectivePageStrokes(currentPage);
    const nextStrokes = effectiveStrokes.filter((s) => !selectedStrokeIdSet.has(s.id));
    const nextWidgets = currentPage.widgets.filter((w) => !selectedWidgetIdSet.has(w.id));
    commitPageState(nextStrokes, nextWidgets, true);
    clearSelection();
    showToast(
      totalSelectedCount > 1
        ? `Đã xóa toàn bộ ${totalSelectedCount} đối tượng trong vùng chọn.`
        : 'Đã xóa đối tượng đang chọn.'
    );
  }, [
    clearSelection,
    commitPageState,
    currentPage,
    getEffectivePageStrokes,
    selectedStrokeIdSet,
    selectedWidgetIdSet,
    showToast,
    totalSelectedCount,
  ]);

  const handleQuickInsertTemplateFigure = (templateId: SmartTemplateId, variantOverride?: string) => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      rightBoardControllerRef.current.insertTemplateFigure(templateId, variantOverride);
      const defaultCfg = createDefaultTemplateConfig(templateId);
      setActiveSmartTemplate(templateId);
      setActiveTemplateVariant(variantOverride || defaultCfg.variant);
      setActiveTool('smart_shape');
      setOpenPopover('none');
      return;
    }

    const container = canvasContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const viewW = rect?.width || 1100;
    const viewH = rect?.height || 660;
    const figW = 340;
    const figH = 270;
    const effectiveStrokes = getEffectivePageStrokes(currentPage);
    const centerWorld = {
      x: (viewW / 2 - panX) / zoom - figW / 2 + ((effectiveStrokes.length % 3) - 1) * 28,
      y: (viewH / 2 - panY) / zoom - figH / 2,
    };
    const defaultCfg = createDefaultTemplateConfig(templateId);
    const box = {
      x: Math.round(centerWorld.x),
      y: Math.round(centerWorld.y),
      width: figW,
      height: figH,
    };
    const newStroke: SmartboardStroke = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'shape',
      shapeKind: 'template_figure',
      lineStyle: 'solid',
      rotationDeg: 0,
      templateId,
      templateBox: box,
      templateConfig: {
        ...defaultCfg,
        showLabels: defaultTemplateShowLabels,
        variant: variantOverride || defaultCfg.variant,
      },
      color: penColor,
      width: Math.max(2, Math.min(6, penWidth)),
      opacity: 1,
      points: [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ],
    };
    commitPageStrokes([...effectiveStrokes, newStroke], true);
    setSelectedStrokeIds([newStroke.id]);
    setSelectedWidgetIds([]);
    setActiveSmartTemplate(templateId);
    setActiveTemplateVariant(variantOverride || defaultCfg.variant);
    setActiveTool('smart_shape');
    setOpenPopover('none');
    const catalogItem = SMART_TEMPLATE_CATALOG.find((c) => c.id === templateId);
    showToast(
      `Đã vẽ "${catalogItem?.title || templateId}" lên bảng. Kéo 8 điểm neo để co giãn hoặc cầm tay nắm trên để xoay 360°.`
    );
  };

  const handleToggleQuickLineStyle = () => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      const handledSelection = rightBoardControllerRef.current.toggleLineStyle();
      if (handledSelection) return;
    }

    if (totalSelectedCount > 0) {
      const allDashed =
        selectedStrokes.every((st) => st.lineStyle === 'dashed') &&
        selectedWidgets.every((w) => w.borderStyle === 'dashed');
      const targetStyle: StrokeLineStyle = allDashed ? 'solid' : 'dashed';
      setPenLineStyle(targetStyle);
      handleBatchChangeLineStyle(targetStyle);
      showToast(
        totalSelectedCount > 1
          ? `Đã chuyển đồng loạt ${totalSelectedCount} đối tượng sang ${
              targetStyle === 'dashed' ? 'Nét đứt (- -)' : 'Nét liền (—)'
            }.`
          : `Đã chuyển đối tượng đang chọn sang ${
              targetStyle === 'dashed' ? 'Nét đứt (- -)' : 'Nét liền (—)'
            }.`
      );
      return;
    }

    const nextStyle: StrokeLineStyle = penLineStyle === 'solid' ? 'dashed' : 'solid';
    setPenLineStyle(nextStyle);
    showToast(
      `Đã chuyển nhanh bút vẽ sang ${
        nextStyle === 'dashed' ? 'Nét đứt chuẩn (- -) [10, 6]' : 'Nét liền (—) []'
      }.`
    );
  };

  const handleUndo = () => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      rightBoardControllerRef.current.undo();
      return;
    }
    const drained = drainPendingStrokeCommits();
    setPages((prev) => {
      const synced = drained.length > 0 ? applyPendingCommitsToPages(prev, drained) : prev;
      return synced.map((page, idx) => {
        if (idx !== currentPageIdx || page.undoStack.length === 0) return page;
        const previousSnapshot = page.undoStack[page.undoStack.length - 1];
        return {
          ...page,
          strokes: previousSnapshot.strokes,
          widgets: previousSnapshot.widgets,
          undoStack: page.undoStack.slice(0, -1),
          redoStack: [...page.redoStack, { strokes: page.strokes, widgets: page.widgets }],
        };
      });
    });
  };

  const handleRedo = () => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      rightBoardControllerRef.current.redo();
      return;
    }
    const drained = drainPendingStrokeCommits();
    setPages((prev) => {
      const synced = drained.length > 0 ? applyPendingCommitsToPages(prev, drained) : prev;
      return synced.map((page, idx) => {
        if (idx !== currentPageIdx || page.redoStack.length === 0) return page;
        const restoredSnapshot = page.redoStack[page.redoStack.length - 1];
        return {
          ...page,
          strokes: restoredSnapshot.strokes,
          widgets: restoredSnapshot.widgets,
          undoStack: [...page.undoStack, { strokes: page.strokes, widgets: page.widgets }],
          redoStack: page.redoStack.slice(0, -1),
        };
      });
    });
  };

  const handleClearCurrentPage = () => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      rightBoardControllerRef.current.clear();
      return;
    }
    const effectiveStrokes = getEffectivePageStrokes(currentPage);
    if (effectiveStrokes.length === 0 && currentPage.widgets.length === 0) return;
    commitPageStrokes([], true);
    clearSelection();
    showToast(`Đã xóa toàn bộ nét viết trên ${currentPage.title}.`);
  };

  const eraseAtWorldPoint = useCallback(
    (worldPt: StrokePoint) => {
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const eraseRadius = 24 / zoom;
      if (eraserMode === 'stroke') {
        // Remove any stroke or template figure that has a point/box within eraseRadius
        const filtered = effectiveStrokes.filter((st) => {
          if (st.templateBox) {
            const b = st.templateBox;
            const insideBox =
              worldPt.x >= b.x - eraseRadius &&
              worldPt.x <= b.x + b.width + eraseRadius &&
              worldPt.y >= b.y - eraseRadius &&
              worldPt.y <= b.y + b.height + eraseRadius;
            if (insideBox) return false;
          }
          return !st.points.some((p) => distance(p, worldPt) <= eraseRadius);
        });
        if (filtered.length !== effectiveStrokes.length) {
          commitPageStrokes(filtered, true);
        }
      } else {
        // Area eraser: split or trim points inside eraseRadius
        let changed = false;
        const nextStrokes: SmartboardStroke[] = [];
        for (const st of effectiveStrokes) {
          if (st.templateBox) {
            nextStrokes.push(st);
            continue;
          }
          const remaining = st.points.filter((p) => distance(p, worldPt) > eraseRadius);
          if (remaining.length !== st.points.length) {
            changed = true;
            if (remaining.length >= 2) {
              nextStrokes.push({ ...st, points: remaining });
            }
          } else {
            nextStrokes.push(st);
          }
        }
        if (changed) {
          commitPageStrokes(nextStrokes, false);
        }
      }
    },
    [commitPageStrokes, currentPage, eraserMode, getEffectivePageStrokes, zoom]
  );

  // --------------------------------------------------------------------------
  // WHITEBOARD KEYBOARD SHORTCUTS (P, E, L, D, Alt+S, Delete, Ctrl+C/V/D, Ctrl+Z/Y)
  // --------------------------------------------------------------------------
  const whiteboardShortcutsRef = useRef<{
    toggleLineStyle: () => void;
    toggleSplitView: () => void;
    undo: () => void;
    redo: () => void;
    copySelected: () => void;
    pasteClipboard: () => void;
    duplicateSelected: () => void;
    deleteSelected: () => void;
    clearSelected: () => void;
    hasSelection: () => boolean;
    hasClipboard: boolean;
  }>({
    toggleLineStyle: handleToggleQuickLineStyle,
    toggleSplitView: handleRequestToggleSplitView,
    undo: handleUndo,
    redo: handleRedo,
    copySelected: handleCopySelection,
    pasteClipboard: handlePasteClipboard,
    duplicateSelected: handleDuplicateSelection,
    deleteSelected: handleDeleteSelectedObject,
    clearSelected: clearSelection,
    hasSelection: () => false,
    hasClipboard: false,
  });
  const isRightFocused = isSplitView && activeBoardSide === 'right';
  whiteboardShortcutsRef.current = {
    toggleLineStyle: handleToggleQuickLineStyle,
    toggleSplitView: handleRequestToggleSplitView,
    undo: handleUndo,
    redo: handleRedo,
    copySelected: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.copySelected()
        : handleCopySelection(),
    pasteClipboard: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.pasteClipboard()
        : handlePasteClipboard(),
    duplicateSelected: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.duplicateSelected()
        : handleDuplicateSelection(),
    deleteSelected: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.deleteSelected()
        : handleDeleteSelectedObject(),
    clearSelected: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.clearSelection()
        : clearSelection(),
    hasSelection: () =>
      isRightFocused && rightBoardControllerRef.current
        ? rightBoardControllerRef.current.hasSelection()
        : totalSelectedCount > 0,
    hasClipboard: Boolean(clipboardData),
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      // Do not hijack when sub-modals are open
      if (
        bankModalOpen ||
        youtubeModalOpen ||
        publishModalOpen ||
        popQuizOpen ||
        splitExitModalOpen
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Alt+S -> Toggle Split-Screen Dual Interactive Canvas
      if (e.altKey && !e.ctrlKey && !e.metaKey && key === 's') {
        e.preventDefault();
        whiteboardShortcutsRef.current.toggleSplitView();
        return;
      }

      // Ctrl+Z / Cmd+Z -> Undo
      if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        whiteboardShortcutsRef.current.undo();
        showToast('Phím tắt [Ctrl+Z]: Đã hoàn tác thao tác.');
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z -> Redo
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (key === 'y' || (key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        whiteboardShortcutsRef.current.redo();
        showToast('Phím tắt [Ctrl+Y]: Đã làm lại thao tác.');
        return;
      }

      // Ctrl+C / Cmd+C -> Copy selected object(s)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'c' && whiteboardShortcutsRef.current.hasSelection()) {
        e.preventDefault();
        whiteboardShortcutsRef.current.copySelected();
        return;
      }

      // Ctrl+V / Cmd+V -> Paste copied object(s)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'v' && whiteboardShortcutsRef.current.hasClipboard) {
        e.preventDefault();
        whiteboardShortcutsRef.current.pasteClipboard();
        return;
      }

      // Ctrl+D / Cmd+D -> Duplicate selected object(s)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'd' && whiteboardShortcutsRef.current.hasSelection()) {
        e.preventDefault();
        whiteboardShortcutsRef.current.duplicateSelected();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if ((key === 'delete' || key === 'backspace') && whiteboardShortcutsRef.current.hasSelection()) {
        e.preventDefault();
        whiteboardShortcutsRef.current.deleteSelected();
        return;
      }

      if (key === 'escape' && whiteboardShortcutsRef.current.hasSelection()) {
        e.preventDefault();
        whiteboardShortcutsRef.current.clearSelected();
        return;
      }

      if (key === 'p') {
        e.preventDefault();
        setActiveTool('pen');
        setOpenPopover('none');
        showToast('Phím tắt [P]: Bút viết nét mượt (Low-Latency Smooth Ink).');
      } else if (key === 'e') {
        e.preventDefault();
        setActiveTool('eraser');
        setOpenPopover('none');
        showToast('Phím tắt [E]: Cục tẩy.');
      } else if (key === 'l') {
        e.preventDefault();
        setActiveSmartTemplate(null);
        setSmartShapeMode('line');
        setActiveTool('smart_shape');
        setOpenPopover('none');
        showToast('Phím tắt [L]: Vẽ Đoạn thẳng co giãn (tự động bắt dính 2 đầu).');
      } else if (key === 'd') {
        e.preventDefault();
        whiteboardShortcutsRef.current.toggleLineStyle();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bankModalOpen, youtubeModalOpen, publishModalOpen, popQuizOpen, splitExitModalOpen, showToast]);

  // Helper: compute natural pressure/velocity width multiplier (0.72 .. 1.24)
  const computeInkWidthFactor = useCallback(
    (
      prevPt: StrokePoint | undefined,
      currPt: StrokePoint,
      pointerType: string,
      pressure: number
    ): number => {
      // Stylus / Apple Pencil / Interactive Pen with real hardware pressure
      if (pointerType === 'pen' && pressure > 0 && Math.abs(pressure - 0.5) > 0.015) {
        const target = 0.68 + Math.min(1, Math.max(0, pressure)) * 0.62;
        const prevW = prevPt?.wFactor ?? 1;
        return Number((prevW * 0.6 + target * 0.4).toFixed(3));
      }
      // Touch / Mouse velocity-based organic modulation
      if (!prevPt) return 0.96;
      const dt = Math.max(4, (currPt.t ?? performance.now()) - (prevPt.t ?? performance.now() - 16));
      const distPx = distance(prevPt, currPt) * zoom;
      const speed = distPx / dt; // px per ms
      // Faster strokes become slightly sleeker (0.76), slower strokes slightly fuller (1.16)
      const rawFactor = Math.max(0.76, Math.min(1.16, 1.16 - speed * 0.22));
      const prevW = prevPt.wFactor ?? 1;
      return Number((prevW * 0.72 + rawFactor * 0.28).toFixed(3));
    },
    [zoom]
  );

  // --------------------------------------------------------------------------
  // MULTI-TOUCH POINTER HANDLERS (1-FINGER WRITE vs 2-FINGER PINCH/PAN)
  // --------------------------------------------------------------------------
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    setOpenPopover('none');

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointerCount = activePointersRef.current.size;

    // 2 fingers -> Pinch-to-Zoom & 2-Finger Pan
    if (pointerCount === 2) {
      // Cancel any in-progress single-finger stroke on Active Layer (leave Main Layer intact)
      cancelActiveCanvasRender();
      gestureRef.current.currentStroke = null;
      snapIndicatorRef.current = { hoverSnap: null, startSnap: null, endSnap: null };
      clearActiveCanvas();
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 10);
      const midClientX = (pts[0].x + pts[1].x) / 2;
      const midClientY = (pts[0].y + pts[1].y) / 2;
      const worldMid = screenToWorld(midClientX, midClientY);

      gestureRef.current.mode = 'pinch';
      gestureRef.current.pinchStartDist = dist;
      gestureRef.current.pinchStartZoom = zoom;
      gestureRef.current.pinchMidWorldX = worldMid.x;
      gestureRef.current.pinchMidWorldY = worldMid.y;
      return;
    }

    if (pointerCount > 2) return;

    // 1 finger / stylus / mouse
    if (activeTool === 'pan' || e.button === 1) {
      gestureRef.current.mode = 'pan';
      gestureRef.current.startClientX = e.clientX;
      gestureRef.current.startClientY = e.clientY;
      gestureRef.current.startPanX = panX;
      gestureRef.current.startPanY = panY;
      return;
    }

    const rawWorldPt = screenToWorld(e.clientX, e.clientY);

    if (activeTool === 'select') {
      if (pendingStrokeCommitsRef.current.length > 0) {
        flushPendingStrokeCommits();
      }
      if (lassoCloseTimerRef.current !== null) {
        window.clearTimeout(lassoCloseTimerRef.current);
        lassoCloseTimerRef.current = null;
      }
      setFreehandLasso(null);
      gestureRef.current.mode = 'select_lasso';
      gestureRef.current.startClientX = e.clientX;
      gestureRef.current.startClientY = e.clientY;
      gestureRef.current.selectDownWorldPt = rawWorldPt;
      gestureRef.current.selectDidDrag = false;
      gestureRef.current.selectLassoPoints = [rawWorldPt];
      return;
    }

    // Deselect previous stroke(s) / widget(s) when starting a new drawing action
    if (totalSelectedCount > 0) {
      clearSelection();
    }

    if (activeTool === 'ai_lasso') {
      gestureRef.current.mode = 'lasso';
      setLassoRect({
        startX: rawWorldPt.x,
        startY: rawWorldPt.y,
        endX: rawWorldPt.x,
        endY: rawWorldPt.y,
        active: true,
      });
      return;
    }

    if (activeTool === 'eraser') {
      gestureRef.current.mode = 'draw';
      eraseAtWorldPoint(rawWorldPt);
      return;
    }

    // If Smart Shape is in 3D Solid or Conic Template mode -> drag to draw preview on Active Layer
    if (activeTool === 'smart_shape' && activeSmartTemplate) {
      const defaultCfg = createDefaultTemplateConfig(activeSmartTemplate);
      const tplStroke: SmartboardStroke = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'shape',
        shapeKind: 'template_figure',
        lineStyle: 'solid',
        templateId: activeSmartTemplate,
        templateBox: {
          x: rawWorldPt.x,
          y: rawWorldPt.y,
          width: 16,
          height: 16,
        },
        templateConfig: {
          ...defaultCfg,
          showLabels: defaultTemplateShowLabels,
          variant: activeTemplateVariant || defaultCfg.variant,
        },
        color: penColor,
        width: Math.max(2, Math.min(6, penWidth)),
        opacity: 1,
        points: [rawWorldPt],
      };
      gestureRef.current.mode = 'draw';
      gestureRef.current.currentStroke = tplStroke;
      renderActiveCanvas();
      return;
    }

    // Live Rubber-band Line / Arrow with Bidirectional 16px Endpoint Snapping on Active Layer
    if (isLineRubberBandTool) {
      const snapTargets = getActiveSnapTargets();
      const startSnap = findNearestSnapTarget(rawWorldPt, snapTargets, zoom);
      const startPt: StrokePoint = startSnap
        ? { x: startSnap.x, y: startSnap.y }
        : maybeSnapToVirtualRuler(rawWorldPt);

      snapIndicatorRef.current = {
        hoverSnap: null,
        startSnap,
        endSnap: null,
      };

      const lineStroke: SmartboardStroke = {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'shape',
        shapeKind: smartShapeMode === 'arrow' ? 'arrow' : 'line',
        lineStyle: penLineStyle,
        color: penColor,
        width: penWidth,
        opacity: 1,
        points: [startPt, { ...startPt }],
      };
      gestureRef.current.mode = 'draw';
      gestureRef.current.currentStroke = lineStroke;
      renderActiveCanvas();
      return;
    }

    // Pen, Highlighter, or 2D Smart Shape (Zero-Latency Smooth Ink on Active Layer ONLY)
    const worldPtBase = maybeSnapToVirtualRuler(rawWorldPt);
    const nowT = e.timeStamp || performance.now();
    const startInkPt: StrokePoint = {
      x: worldPtBase.x,
      y: worldPtBase.y,
      pressure: e.pressure,
      t: nowT,
      wFactor: computeInkWidthFactor(undefined, worldPtBase, e.pointerType, e.pressure),
    };
    const isHighlighter = activeTool === 'highlighter';
    const newStroke: SmartboardStroke = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: isHighlighter ? 'highlighter' : activeTool === 'smart_shape' ? 'shape' : 'pen',
      lineStyle: isHighlighter ? 'solid' : penLineStyle,
      color: isHighlighter ? highlighterColor : penColor,
      width: isHighlighter ? 22 : penWidth,
      opacity: isHighlighter ? 0.38 : 1,
      points: [startInkPt],
    };
    gestureRef.current.mode = 'draw';
    gestureRef.current.currentStroke = newStroke;
    renderActiveCanvas();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Hover magnetic snap preview BEFORE pointer down when Line/Arrow tool is active (Active Layer ONLY)
    if (!activePointersRef.current.has(e.pointerId)) {
      if (isLineRubberBandTool && gestureRef.current.mode === 'none') {
        const hoverWorld = screenToWorld(e.clientX, e.clientY);
        const found = findNearestSnapTarget(hoverWorld, getActiveSnapTargets(), zoom);
        const prev = snapIndicatorRef.current.hoverSnap;
        const changed =
          (!prev && Boolean(found)) ||
          (Boolean(prev) && !found) ||
          (prev && found && (prev.x !== found.x || prev.y !== found.y));
        if (changed) {
          snapIndicatorRef.current.hoverSnap = found;
          scheduleActiveCanvasRender();
        }
      }
      return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointerCount = activePointersRef.current.size;

    // 2-Finger Pinch-to-Zoom & Pan
    if (pointerCount >= 2 && gestureRef.current.mode === 'pinch') {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 10);
      const ratio = dist / gestureRef.current.pinchStartDist;
      const nextZoom = Math.min(3.5, Math.max(0.4, Number((gestureRef.current.pinchStartZoom * ratio).toFixed(2))));

      const container = canvasContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const midScreenX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midScreenY = (pts[0].y + pts[1].y) / 2 - rect.top;
        const nextPanX = midScreenX - gestureRef.current.pinchMidWorldX * nextZoom;
        const nextPanY = midScreenY - gestureRef.current.pinchMidWorldY * nextZoom;
        setZoom(nextZoom);
        setPanX(nextPanX);
        setPanY(nextPanY);
      }
      return;
    }

    if (gestureRef.current.mode === 'pan') {
      const dx = e.clientX - gestureRef.current.startClientX;
      const dy = e.clientY - gestureRef.current.startClientY;
      setPanX(gestureRef.current.startPanX + dx);
      setPanY(gestureRef.current.startPanY + dy);
      return;
    }

    const rawWorldPt = screenToWorld(e.clientX, e.clientY);

    if (gestureRef.current.mode === 'select_lasso') {
      const screenDist = Math.hypot(
        e.clientX - gestureRef.current.startClientX,
        e.clientY - gestureRef.current.startClientY
      );
      if (!gestureRef.current.selectDidDrag && screenDist >= 8) {
        gestureRef.current.selectDidDrag = true;
        if (totalSelectedCount > 0) {
          clearSelection();
        }
      }
      if (gestureRef.current.selectDidDrag) {
        const pts = gestureRef.current.selectLassoPoints;
        const last = pts[pts.length - 1];
        const minWorldStep = 5 / Math.max(zoom, 0.35);
        if (!last || distance(last, rawWorldPt) >= minWorldStep) {
          pts.push(rawWorldPt);
          setFreehandLasso({
            points: [...pts],
            active: true,
            closing: false,
          });
        }
      }
      return;
    }

    if (gestureRef.current.mode === 'lasso') {
      setLassoRect((prev) =>
        prev
          ? {
              ...prev,
              endX: rawWorldPt.x,
              endY: rawWorldPt.y,
            }
          : null
      );
      return;
    }

    if (gestureRef.current.mode === 'draw') {
      if (activeTool === 'eraser') {
        eraseAtWorldPoint(rawWorldPt);
        return;
      }

      const activeStroke = gestureRef.current.currentStroke;
      if (!activeStroke) return;

      // 1. Real-time drag-to-size for 3D Solid & Conic Template on Active Layer ONLY
      if (activeStroke.templateId && activeStroke.points.length > 0) {
        const startPt = activeStroke.points[0];
        const minX = Math.min(startPt.x, rawWorldPt.x);
        const minY = Math.min(startPt.y, rawWorldPt.y);
        const boxW = Math.max(24, Math.abs(rawWorldPt.x - startPt.x));
        const boxH = Math.max(24, Math.abs(rawWorldPt.y - startPt.y));
        activeStroke.templateBox = {
          x: Math.round(minX),
          y: Math.round(minY),
          width: Math.round(boxW),
          height: Math.round(boxH),
        };
        scheduleActiveCanvasRender();
        return;
      }

      // 2. Live Rubber-band Line / Arrow with Endpoint/Midpoint Magnetic Snap (16px) on Active Layer ONLY
      if (
        isLineRubberBandTool &&
        activeStroke.tool === 'shape' &&
        (activeStroke.shapeKind === 'line' || activeStroke.shapeKind === 'arrow') &&
        activeStroke.points.length >= 1
      ) {
        const startPt = activeStroke.points[0];
        const endSnap = findNearestSnapTarget(rawWorldPt, getActiveSnapTargets(), zoom, startPt);
        let endPt: StrokePoint;

        if (endSnap) {
          endPt = { x: endSnap.x, y: endSnap.y };
        } else {
          endPt = maybeSnapToVirtualRuler(rawWorldPt);
          // Optional Shift key locks angle to crisp 15-degree increments
          if (e.shiftKey) {
            const dx = endPt.x - startPt.x;
            const dy = endPt.y - startPt.y;
            const len = Math.hypot(dx, dy);
            const snappedAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
            endPt = {
              x: startPt.x + len * Math.cos(snappedAngle),
              y: startPt.y + len * Math.sin(snappedAngle),
            };
          }
        }

        snapIndicatorRef.current.endSnap = endSnap;
        activeStroke.points = [startPt, endPt];
        scheduleActiveCanvasRender();
        return;
      }

      // 3. Low-Latency Smooth Ink: collect ALL micro-points via getCoalescedEvents() onto Active Layer ONLY
      const nativeEvt = e.nativeEvent as PointerEvent;
      const coalescedEvents: PointerEvent[] =
        typeof nativeEvt.getCoalescedEvents === 'function'
          ? nativeEvt.getCoalescedEvents()
          : [nativeEvt];
      const samples = coalescedEvents.length > 0 ? coalescedEvents : [nativeEvt];

      const minWorldStep = 1.4 / Math.max(zoom, 0.5);
      for (const sample of samples) {
        const sampleWorld = maybeSnapToVirtualRuler(
          screenToWorld(sample.clientX, sample.clientY)
        );
        const lastPt = activeStroke.points[activeStroke.points.length - 1];
        if (lastPt && distance(lastPt, sampleWorld) < minWorldStep) {
          continue;
        }
        const sampleT = sample.timeStamp || performance.now();
        const wFactor = computeInkWidthFactor(
          lastPt,
          { ...sampleWorld, t: sampleT },
          sample.pointerType || e.pointerType,
          sample.pressure ?? e.pressure
        );
        activeStroke.points.push({
          x: sampleWorld.x,
          y: sampleWorld.y,
          pressure: sample.pressure ?? e.pressure,
          t: sampleT,
          wFactor,
        });
      }
      scheduleActiveCanvasRender();
    }
  };

  const handleCanvasPointerLeave = () => {
    if (snapIndicatorRef.current.hoverSnap) {
      snapIndicatorRef.current.hoverSnap = null;
      scheduleActiveCanvasRender();
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    activePointersRef.current.delete(e.pointerId);

    if (gestureRef.current.mode === 'select_lasso') {
      gestureRef.current.mode = 'none';
      const didDrag = gestureRef.current.selectDidDrag;
      const downPt = gestureRef.current.selectDownWorldPt;
      const polyPts = [...gestureRef.current.selectLassoPoints];
      gestureRef.current.selectLassoPoints = [];
      gestureRef.current.selectDownWorldPt = null;
      gestureRef.current.selectDidDrag = false;

      if (!didDrag || polyPts.length < 3) {
        // Single-tap selection on individual object
        setFreehandLasso(null);
        if (downPt) {
          const hit = findStrokeAtWorldPoint(downPt);
          if (hit) {
            setSelectedStrokeIds([hit.id]);
            setSelectedWidgetIds([]);
          } else {
            clearSelection();
          }
        }
        return;
      }

      // Auto-Close Loop visual feedback: snap last point back to first point with animated dashed loop
      setFreehandLasso({
        points: polyPts,
        active: false,
        closing: true,
      });
      if (lassoCloseTimerRef.current !== null) {
        window.clearTimeout(lassoCloseTimerRef.current);
      }
      lassoCloseTimerRef.current = window.setTimeout(() => {
        setFreehandLasso(null);
        lassoCloseTimerRef.current = null;
      }, 320);

      // Recognize & group ALL strokes and widgets inside or intersecting the closed lasso polygon
      const polyAABB = computePointsAABB(polyPts);
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      const matchedStrokeIds: string[] = [];

      for (const st of effectiveStrokes) {
        const rotDeg = getStrokeRotationDeg(st);
        if (st.templateBox) {
          if (doesRotatedBoxIntersectPolygon(st.templateBox, rotDeg, polyPts, polyAABB)) {
            matchedStrokeIds.push(st.id);
          }
          continue;
        }
        const rb = getStrokeRawBounds(st);
        const worldPts =
          Math.abs(rotDeg) > 0.01
            ? st.points.map((p) => rotatePointAround(p.x, p.y, rb.cx, rb.cy, rotDeg))
            : st.points;
        const isClosedShape =
          st.tool === 'shape' &&
          (st.shapeKind === 'circle' ||
            st.shapeKind === 'rectangle' ||
            st.shapeKind === 'triangle');
        if (doesPolylineIntersectPolygon(worldPts, polyPts, polyAABB, isClosedShape)) {
          matchedStrokeIds.push(st.id);
        }
      }

      const matchedWidgetIds: string[] = [];
      for (const w of currentPage.widgets) {
        if (
          doesRotatedBoxIntersectPolygon(
            { x: w.x, y: w.y, width: w.width, height: w.height },
            w.rotationDeg || 0,
            polyPts,
            polyAABB
          )
        ) {
          matchedWidgetIds.push(w.id);
        }
      }

      setSelectedStrokeIds(matchedStrokeIds);
      setSelectedWidgetIds(matchedWidgetIds);

      const totalFound = matchedStrokeIds.length + matchedWidgetIds.length;
      if (totalFound > 1) {
        showToast(
          `Đã khoanh chọn & gom nhóm ${totalFound} đối tượng. Kéo để di chuyển, co giãn 8 phía hoặc xoay 360°.`
        );
      } else if (totalFound === 1) {
        showToast('Đã chọn 1 đối tượng trong vùng khoanh.');
      } else {
        showToast('Không có đối tượng nào nằm trong vùng nét đứt vừa khoanh.');
      }
      return;
    }

    if (gestureRef.current.mode === 'lasso' && lassoRect) {
      gestureRef.current.mode = 'none';
      const w = Math.abs(lassoRect.endX - lassoRect.startX);
      const h = Math.abs(lassoRect.endY - lassoRect.startY);
      if (w > 24 && h > 24) {
        setLassoRect((prev) => (prev ? { ...prev, active: false } : null));
      } else {
        setLassoRect(null);
      }
      return;
    }

    if (gestureRef.current.mode === 'draw' && gestureRef.current.currentStroke) {
      // Step 0: Cancel any pending Active Layer rAF frame before synchronized handoff
      cancelActiveCanvasRender();

      let finishedStroke: SmartboardStroke | null = gestureRef.current.currentStroke;
      let selectAfterCommit = false;

      // 1. Finalize 3D Solid or Conic Template Figure
      if (finishedStroke.templateId && finishedStroke.templateBox) {
        let box = finishedStroke.templateBox;
        // If user just tapped once without dragging, create a standard 320x260 figure at tap location
        if (box.width < 48 && box.height < 48) {
          const tapPt = finishedStroke.points[0] || { x: box.x, y: box.y };
          box = {
            x: Math.round(tapPt.x - 160),
            y: Math.round(tapPt.y - 130),
            width: 320,
            height: 260,
          };
        } else {
          box = {
            x: box.x,
            y: box.y,
            width: Math.max(90, box.width),
            height: Math.max(80, box.height),
          };
        }
        finishedStroke = {
          ...finishedStroke,
          templateBox: box,
          points: [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x + box.width, y: box.y + box.height },
            { x: box.x, y: box.y + box.height },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          ],
        };
        selectAfterCommit = true;
      } else if (
        isLineRubberBandTool &&
        finishedStroke.tool === 'shape' &&
        (finishedStroke.shapeKind === 'line' || finishedStroke.shapeKind === 'arrow') &&
        finishedStroke.points.length >= 2
      ) {
        // 2. Finalize Live Rubber-band Line / Arrow with exact snapped endpoints
        const segLen = distance(finishedStroke.points[0], finishedStroke.points[1]);
        if (segLen >= 3 / Math.max(zoom, 0.5)) {
          selectAfterCommit = true;
        } else {
          finishedStroke = null;
        }
      } else if (activeTool === 'smart_shape' && finishedStroke.points.length >= 2) {
        // 3. Convert 2D freehand path into crisp geometry!
        const recognized = buildSmartShapePoints(finishedStroke.points, smartShapeMode);
        finishedStroke = {
          ...finishedStroke,
          tool: 'shape',
          shapeKind: recognized.shapeKind,
          lineStyle: finishedStroke.lineStyle || penLineStyle,
          points: recognized.points,
        };
        selectAfterCommit = true;
      }

      if (finishedStroke) {
        // Step 1 (CRITICAL): Render finalized Bezier stroke directly onto Bottom (Main) Canvas FIRST
        const renderedOnMain = appendStrokeToMainCanvas(finishedStroke);

        // Step 2 (CRITICAL): ONLY clear Top (Active) Canvas AFTER Main Canvas confirms stroke is rendered
        gestureRef.current.currentStroke = null;
        snapIndicatorRef.current = { hoverSnap: null, startSnap: null, endSnap: null };
        if (renderedOnMain) {
          clearActiveCanvas();
        } else {
          // Fallback: wait until next frame after Main Canvas syncs before clearing preview layer
          window.requestAnimationFrame(() => {
            renderFullMainCanvas();
            clearActiveCanvas();
          });
        }

        // Step 3 (CRITICAL): Persist to Undo/Redo history & React state asynchronously off the drawing thread
        enqueueAsyncStrokeCommit(currentPage.id, finishedStroke, selectAfterCommit);
      } else {
        gestureRef.current.currentStroke = null;
        snapIndicatorRef.current = { hoverSnap: null, startSnap: null, endSnap: null };
        clearActiveCanvas();
      }
    }

    if (activePointersRef.current.size === 0) {
      gestureRef.current.mode = 'none';
    }
  };

  // --------------------------------------------------------------------------
  // VIRTUAL GEOMETRY INSTRUMENT ACTIONS (COMMIT RULER LINE / COMPASS CIRCLE / PROTRACTOR ANGLE)
  // --------------------------------------------------------------------------
  const handleDrawAlongRuler = () => {
    const rad = (rulerState.angle * Math.PI) / 180;
    const lenPx = rulerState.lengthCm * 28;
    const p1: StrokePoint = { x: rulerState.x, y: rulerState.y - 2 };
    const p2: StrokePoint = {
      x: rulerState.x + lenPx * Math.cos(rad),
      y: rulerState.y - 2 + lenPx * Math.sin(rad),
    };
    const rulerStroke: SmartboardStroke = {
      id: `ruler-line-${Date.now()}`,
      tool: 'shape',
      shapeKind: 'line',
      color: penColor,
      width: penWidth,
      opacity: 1,
      points: [p1, p2],
    };
    commitPageStrokes([...getEffectivePageStrokes(currentPage), rulerStroke], true);
    showToast(`Đã kẻ đoạn thẳng chuẩn ${rulerState.lengthCm} cm dọc theo mép Thước kẻ ảo.`);
  };

  const handleDrawCompassCircle = () => {
    const pts: StrokePoint[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push({
        x: compassState.cx + compassState.radius * Math.cos(theta),
        y: compassState.cy + compassState.radius * Math.sin(theta),
      });
    }
    const circleStroke: SmartboardStroke = {
      id: `compass-circle-${Date.now()}`,
      tool: 'shape',
      shapeKind: 'circle',
      color: penColor,
      width: penWidth,
      opacity: 1,
      points: pts,
    };
    const centerDot: SmartboardStroke = {
      id: `compass-center-${Date.now()}`,
      tool: 'pen',
      color: '#DC2626',
      width: 6,
      opacity: 1,
      points: [{ x: compassState.cx, y: compassState.cy }],
    };
    commitPageStrokes([...getEffectivePageStrokes(currentPage), circleStroke, centerDot], true);
    showToast(
      `Đã quay Compa vẽ đường tròn tâm O bán kính R = ${(compassState.radius / 28).toFixed(1)} cm.`
    );
  };

  const handleStampProtractorAngle = () => {
    const baseRad = (protractorState.angle * Math.PI) / 180;
    const rayRad = ((protractorState.angle - protractorState.measureDeg) * Math.PI) / 180;
    const armLen = 140;
    const vertex: StrokePoint = { x: protractorState.x, y: protractorState.y };
    const arm1: StrokePoint = {
      x: vertex.x + armLen * Math.cos(baseRad),
      y: vertex.y + armLen * Math.sin(baseRad),
    };
    const arm2: StrokePoint = {
      x: vertex.x + armLen * Math.cos(rayRad),
      y: vertex.y + armLen * Math.sin(rayRad),
    };
    const s1: SmartboardStroke = {
      id: `ang-1-${Date.now()}`,
      tool: 'shape',
      shapeKind: 'arrow',
      color: penColor,
      width: penWidth,
      opacity: 1,
      points: [vertex, arm1],
    };
    const s2: SmartboardStroke = {
      id: `ang-2-${Date.now()}`,
      tool: 'shape',
      shapeKind: 'arrow',
      color: '#DC2626',
      width: penWidth,
      opacity: 1,
      points: [vertex, arm2],
    };
    commitPageStrokes([...getEffectivePageStrokes(currentPage), s1, s2], true);
    showToast(`Đã dựng góc ${protractorState.measureDeg}° từ Thước đo độ ảo lên mặt bảng.`);
  };

  // --------------------------------------------------------------------------
  // AI PEN & MATH OCR HANDLER (/api/ai/smartboard-ocr)
  // --------------------------------------------------------------------------
  const runAiPenOcr = async (action: 'ocr_katex' | 'explain_steps' | 'both') => {
    if (!lassoRect) return;
    setAiOcrLoading(true);
    try {
      const effectiveStrokes = getEffectivePageStrokes(currentPage);
      flushPendingStrokeCommits();
      const minX = Math.min(lassoRect.startX, lassoRect.endX);
      const maxX = Math.max(lassoRect.startX, lassoRect.endX);
      const minY = Math.min(lassoRect.startY, lassoRect.endY);
      const maxY = Math.max(lassoRect.startY, lassoRect.endY);
      const cropW = Math.max(60, Math.round(maxX - minX));
      const cropH = Math.max(60, Math.round(maxY - minY));

      // Render cropped region onto an offscreen canvas
      const offCanvas = document.createElement('canvas');
      offCanvas.width = cropW;
      offCanvas.height = cropH;
      const octx = offCanvas.getContext('2d');
      if (octx) {
        octx.fillStyle = '#FFFFFF';
        octx.fillRect(0, 0, cropW, cropH);
        for (const st of effectiveStrokes) {
          drawStrokeOnContext(octx, st, -minX, -minY, 1);
        }
      }
      const croppedDataUrl = offCanvas.toDataURL('image/png');

      // Also gather text from any widgets overlapping the lasso rectangle
      const overlappingWidgets = currentPage.widgets.filter((w) => {
        const wx2 = w.x + w.width;
        const wy2 = w.y + w.height;
        return !(wx2 < minX || w.x > maxX || wy2 < minY || w.y > maxY);
      });
      const contextText = overlappingWidgets
        .map((w) => {
          if (w.question) {
            return `${w.question.tag} ${w.question.stem} ${
              w.question.options ? w.question.options.join(' | ') : ''
            }`;
          }
          if (w.katexContent) return w.katexContent;
          return w.title;
        })
        .join('\n');

      const res = await fetch('/api/ai/smartboard-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: croppedDataUrl,
          mimeType: 'image/png',
          contextText,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Không thể nhận diện vùng khoanh Bút AI.');
      } else if (data.result) {
        setAiOcrResult({
          katexText: data.result.katexText || '$$f(x) = ax^3 + bx^2 + cx + d$$',
          recognizedProblem:
            data.result.recognizedProblem || 'Biểu thức Toán học trong vùng khoanh chọn',
          steps: Array.isArray(data.result.steps) ? data.result.steps : [],
          finalAnswer: data.result.dap_so || data.result.finalAnswer || '',
          croppedImageUrl: croppedDataUrl,
        });
      }
    } catch {
      showToast('Lỗi kết nối dịch vụ Trợ lý Bút AI & Math OCR.');
    } finally {
      setAiOcrLoading(false);
    }
  };

  const handleInsertAiCardOntoBoard = (includeSteps: boolean) => {
    if (!aiOcrResult) return;
    const targetX = lassoRect ? Math.min(lassoRect.startX, lassoRect.endX) : 140;
    const targetY = lassoRect ? Math.max(lassoRect.startY, lassoRect.endY) + 16 : 140;
    const newWidget: SmartboardWidget = {
      id: `ai-card-${Date.now()}`,
      type: 'ai_katex_card',
      x: targetX,
      y: targetY,
      width: includeSteps ? 480 : 380,
      height: includeSteps ? 310 : 160,
      title: includeSteps
        ? 'Trợ lý Bút AI — Giải thích từng bước'
        : 'Trợ lý Bút AI — Công thức KaTeX chuẩn hóa',
      katexContent: aiOcrResult.katexText,
      stepsContent: includeSteps ? aiOcrResult.steps : undefined,
      finalAnswer: includeSteps ? aiOcrResult.finalAnswer : undefined,
    };
    addWidgetToCurrentPage(newWidget);
    setSelectedWidgetIds([newWidget.id]);
    setSelectedStrokeIds([]);
    setAiOcrResult(null);
    setLassoRect(null);
    setActiveTool('select');
    showToast('Đã chèn thẻ công thức KaTeX / lời giải Bút AI trực tiếp lên mặt bảng.');
  };

  // --------------------------------------------------------------------------
  // RESOURCE INSERTION HANDLERS (BANK QUESTION, IMAGE, YOUTUBE, GEOGEBRA 3D)
  // --------------------------------------------------------------------------
  const addWidgetToCurrentPage = (widget: SmartboardWidget) => {
    if (isSplitView && activeBoardSide === 'right' && rightBoardControllerRef.current) {
      rightBoardControllerRef.current.insertWidget(widget);
      return;
    }
    commitPageWidgets([...currentPage.widgets, widget], true);
  };

  const updateWidgetInCurrentPage = (
    widgetId: string,
    updater: (w: SmartboardWidget) => SmartboardWidget,
    recordUndo = false
  ) => {
    commitPageWidgets(
      currentPage.widgets.map((w) => (w.id === widgetId ? updater(w) : w)),
      recordUndo
    );
  };

  const removeWidgetFromCurrentPage = (widgetId: string) => {
    commitPageWidgets(
      currentPage.widgets.filter((w) => w.id !== widgetId),
      true
    );
    setSelectedWidgetIds((prev) => prev.filter((id) => id !== widgetId));
  };

  const handleInsertBankQuestion = (q: BankQuestion) => {
    const offset = (currentPage.widgets.length % 4) * 32;
    const newWidget: SmartboardWidget = {
      id: `wq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'bank_question',
      x: Math.round((80 - panX) / zoom) + offset,
      y: Math.round((64 - panY) / zoom) + offset,
      width: 490,
      height: q.diagram || q.image ? 380 : 275,
      title: `Câu hỏi Ngân hàng đề ${q.tag}`,
      question: q,
      showSolution: false,
    };
    addWidgetToCurrentPage(newWidget);
    // Also sync this question into Live Pop Quiz default prompt so teacher can send QR immediately!
    if (q.options && q.options.length === 4) {
      const letters = ['A', 'B', 'C', 'D'] as const;
      setPopQuizSession((prev) => ({
        ...prev,
        questionTitle: `Câu hỏi ${q.tag} — ${q.lesson}`,
        questionStem: q.stem,
        options: q.options!.map((o) => stripMcqOptionPrefix(o)) as [string, string, string, string],
        correctOption:
          typeof q.correctIndex === 'number' ? letters[q.correctIndex] : prev.correctOption,
      }));
    }
    setBankModalOpen(false);
    showToast(`Đã thả thẻ câu hỏi ${q.tag} lên mặt bảng trắng.`);
  };

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const newWidget: SmartboardWidget = {
          id: `wimg-${Date.now()}`,
          type: 'image',
          x: Math.round((120 - panX) / zoom),
          y: Math.round((90 - panY) / zoom),
          width: 400,
          height: 290,
          title: file.name,
          imageUrl: reader.result,
        };
        addWidgetToCurrentPage(newWidget);
        showToast(`Đã chèn ảnh "${file.name}" lên bảng tương tác.`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInsertYoutubeUrl = (rawUrl: string, customTitle?: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    let embedUrl = trimmed;
    const ytMatch =
      trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/) ||
      null;
    if (ytMatch) {
      embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    const newWidget: SmartboardWidget = {
      id: `wyt-${Date.now()}`,
      type: 'youtube',
      x: Math.round((140 - panX) / zoom),
      y: Math.round((100 - panY) / zoom),
      width: 460,
      height: 310,
      title: customTitle || 'Video Bài giảng YouTube',
      youtubeEmbedUrl: embedUrl,
    };
    addWidgetToCurrentPage(newWidget);
    setYoutubeModalOpen(false);
    setYoutubeUrlInput('');
    showToast('Đã nhúng khung phát Video YouTube trực tiếp lên mặt bảng.');
  };

  const handleInsert3DOrGeoGebraWidget = (
    mode: 'interactive_solid' | 'geogebra_3d' | 'desmos_2d' = 'interactive_solid'
  ) => {
    const newWidget: SmartboardWidget = {
      id: `w3d-${Date.now()}`,
      type: 'geogebra_3d',
      x: Math.round((420 - panX) / zoom),
      y: Math.round((85 - panY) / zoom),
      width: 480,
      height: 350,
      title:
        mode === 'geogebra_3d'
          ? 'Khung nhúng GeoGebra 3D Calculator'
          : mode === 'desmos_2d'
            ? 'Khung nhúng Đồ thị Desmos 2D'
            : 'Mô hình Không gian 3D & Hệ trục Oxyz (Xoay trực tiếp)',
      mathAppletMode: mode,
      solidKind: 'pyramid_sabcd',
    };
    addWidgetToCurrentPage(newWidget);
    showToast('Đã mở khung Hình học không gian 3D / GeoGebra ngay trên mặt bảng.');
  };

  // Automatically insert incoming 3D model, figure, or lesson example/exercise sent from tool #3 or #5 ("Đưa sang Bảng trắng Giảng dạy")
  useEffect(() => {
    if (!pendingIncomingWidget) return;
    const incoming = pendingIncomingWidget;
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        const addedWidgets: SmartboardWidget[] = [];
        if (incoming.question) {
          addedWidgets.push({
            id: `w-lesson-q-${incoming.id}`,
            type: 'bank_question',
            x: Math.round((140 - panX) / zoom),
            y: Math.round((75 - panY) / zoom),
            width: 540,
            height: 360,
            title: incoming.title,
            question: incoming.question,
            showSolution: false,
          });
        }
        if (incoming.imageDataUrl) {
          addedWidgets.push({
            id: `w3d-img-${incoming.id}`,
            type: 'image',
            x: Math.round((140 - panX) / zoom),
            y: Math.round((85 - panY) / zoom),
            width: 440,
            height: 310,
            title: incoming.title,
            imageUrl: incoming.imageDataUrl,
          });
        }
        if (incoming.solidKind) {
          addedWidgets.push({
            id: `w3d-solid-${incoming.id}`,
            type: 'geogebra_3d',
            x: Math.round(((incoming.imageDataUrl ? 600 : 200) - panX) / zoom),
            y: Math.round((85 - panY) / zoom),
            width: 460,
            height: 340,
            title: `${incoming.title} (Tương tác 3D)`,
            mathAppletMode: 'interactive_solid',
            solidKind: incoming.solidKind,
          });
        }
        return {
          ...p,
          widgets: [...p.widgets, ...addedWidgets],
        };
      })
    );
    showToast(`Đã đưa "${incoming.title}" sang Bảng trắng Giảng dạy!`);
    onClearPendingIncomingWidget?.();
  }, [pendingIncomingWidget, currentPageIdx, panX, panY, zoom, showToast, onClearPendingIncomingWidget]);

  // Listen for "Chèn lên Bảng" events sent directly from the Floating Scientific Calculator
  const calcInsertHandlerRef = useRef<(detail: {
    title: string;
    katexContent: string;
    stepsContent?: Array<{ title: string; leadIn: string; mathDetail: string }>;
    finalAnswer?: string;
    handled?: boolean;
  }) => void>(() => {});

  calcInsertHandlerRef.current = (detail) => {
    const hasSteps = Boolean(detail.stepsContent && detail.stepsContent.length > 0);
    const newWidget: SmartboardWidget = {
      id: `calc-card-${Date.now()}`,
      type: 'ai_katex_card',
      x: Math.round((160 - panX) / zoom),
      y: Math.round((110 - panY) / zoom),
      width: hasSteps ? 480 : 400,
      height: hasSteps ? 280 : 175,
      title: detail.title,
      katexContent: detail.katexContent,
      stepsContent: detail.stepsContent,
      finalAnswer: detail.finalAnswer,
    };
    addWidgetToCurrentPage(newWidget);
    setSelectedWidgetIds([newWidget.id]);
    setSelectedStrokeIds([]);
    detail.handled = true;
    showToast(`Đã chèn kết quả từ Máy tính Khoa học lên Bảng trắng!`);
  };

  useEffect(() => {
    const onInsertCalcCard = (event: Event) => {
      const customEvt = event as CustomEvent<{
        title: string;
        katexContent: string;
        stepsContent?: Array<{ title: string; leadIn: string; mathDetail: string }>;
        finalAnswer?: string;
        handled?: boolean;
      }>;
      if (!customEvt.detail) return;
      calcInsertHandlerRef.current(customEvt.detail);
    };

    window.addEventListener('teachlearn:insert-calc-card', onInsertCalcCard);

    // Consume any card queued while user was on another module before opening Smartboard
    const winObj = window as unknown as Record<string, unknown>;
    const queued = winObj.__teachlearnPendingCalcCard as
      | {
          title: string;
          katexContent: string;
          stepsContent?: Array<{ title: string; leadIn: string; mathDetail: string }>;
          finalAnswer?: string;
          handled?: boolean;
        }
      | undefined;
    if (queued) {
      delete winObj.__teachlearnPendingCalcCard;
      calcInsertHandlerRef.current(queued);
    }

    return () => {
      window.removeEventListener('teachlearn:insert-calc-card', onInsertCalcCard);
    };
  }, []);

  // --------------------------------------------------------------------------
  // PAGE MANAGEMENT (ADD, PREV, NEXT, DUPLICATE, DELETE)
  // --------------------------------------------------------------------------
  const handleAddPage = (bg: CanvasBackgroundType = currentPage.background) => {
    flushPendingStrokeCommits();
    const nextNum = pages.length + 1;
    const newPage: SmartboardPage = {
      id: `page-${Date.now()}`,
      title: `Trang bảng ${nextNum}`,
      background: bg,
      strokes: [],
      undoStack: [],
      redoStack: [],
      widgets: [],
    };
    setPages((prev) => [...prev, newPage]);
    setCurrentPageIdx(pages.length);
    showToast(`Đã thêm Trang bảng ${nextNum}.`);
  };

  const handleDeletePage = (idxToDelete: number) => {
    if (pages.length <= 1) {
      handleClearCurrentPage();
      return;
    }
    flushPendingStrokeCommits();
    setPages((prev) => prev.filter((_, idx) => idx !== idxToDelete));
    setCurrentPageIdx((prev) => Math.max(0, Math.min(prev, pages.length - 2)));
  };

  // --------------------------------------------------------------------------
  // LIVE POP QUIZ QR CODE GENERATION & REAL-TIME SYNC
  // --------------------------------------------------------------------------
  const popQuizJoinUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://teachlearn.edu.vn';
    return `${origin}/?popQuizId=${encodeURIComponent(popQuizSession.quizId)}`;
  }, [popQuizSession.quizId]);

  useEffect(() => {
    if (!popQuizOpen) return;
    QRCode.toDataURL(popQuizJoinUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setPopQuizQrDataUrl(url))
      .catch(() => {});

    // Publish session to backend
    fetch(`/api/pop-quiz/${encodeURIComponent(popQuizSession.quizId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(popQuizSession),
    }).catch(() => {});
  }, [popQuizOpen, popQuizJoinUrl, popQuizSession.quizId]);

  // Poll backend + listen to BroadcastChannel when Pop Quiz is open
  useEffect(() => {
    if (!popQuizOpen) return;

    const pollInterval = window.setInterval(() => {
      fetch(`/api/pop-quiz/${encodeURIComponent(popQuizSession.quizId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.session && Array.isArray(d.session.responses)) {
            setPopQuizSession((prev) =>
              d.session.responses.length >= prev.responses.length
                ? { ...prev, responses: d.session.responses }
                : prev
            );
          }
        })
        .catch(() => {});
    }, 2200);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('smas_smartboard_popquiz');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'NEW_RESPONSE' && ev.data?.quizId === popQuizSession.quizId) {
          if (ev.data.session) {
            setPopQuizSession(ev.data.session);
          }
        }
      };
    } catch {
      // ignore
    }

    return () => {
      window.clearInterval(pollInterval);
      if (bc) bc.close();
    };
  }, [popQuizOpen, popQuizSession.quizId]);

  const handleSimulateStudentPopQuizResponses = async () => {
    const sampleNames = [
      { name: 'Phạm Gia Huy', cls: '11B05', choice: 'B' as const, comment: 'Em chọn B vì f\'(x) đổi dấu tại x=3' },
      { name: 'Võ Ngọc Ánh', cls: '11B05', choice: 'B' as const, comment: 'Đáp án B chính xác ạ' },
      { name: 'Đặng Tuấn Kiệt', cls: '11B10', choice: 'A' as const },
      { name: 'Bùi Thảo Nguyên', cls: '11B13', choice: 'D' as const },
      { name: 'Hoàng Đức Trọng', cls: '11B05', choice: 'B' as const, comment: 'Cực tiểu tại x = 3, y_CT = 1' },
    ];
    const picked = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const uniqueName = `${picked.name} (${Math.floor(10 + Math.random() * 89)})`;
    try {
      const res = await fetch(
        `/api/pop-quiz/${encodeURIComponent(popQuizSession.quizId)}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: uniqueName,
            studentClass: picked.cls,
            choice: picked.choice,
            comment: picked.comment,
          }),
        }
      );
      const data = await res.json();
      if (data.session) {
        setPopQuizSession(data.session);
      }
    } catch {
      // Fallback local update
      setPopQuizSession((prev) => ({
        ...prev,
        responses: [
          {
            id: `sim-${Date.now()}`,
            studentName: uniqueName,
            studentClass: picked.cls,
            choice: picked.choice,
            comment: picked.comment,
            submittedAt: new Date().toISOString(),
          },
          ...prev.responses,
        ],
      }));
    }
  };

  const popQuizStats = useMemo(() => {
    const counts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    let totalChoices = 0;
    for (const r of popQuizSession.responses) {
      if (r.choice && counts[r.choice] !== undefined) {
        counts[r.choice] += 1;
        totalChoices += 1;
      }
    }
    return { counts, totalChoices };
  }, [popQuizSession.responses]);

  // --------------------------------------------------------------------------
  // SCREEN RECORDING (MediaRecorder)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isRecording || isRecordingPaused) return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording, isRecordingPaused]);

  const formatTimer = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStartOrStopRecording = async () => {
    if (isRecording) {
      // Stop recording and download file
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;
      }
      setIsRecording(false);
      setIsRecordingPaused(false);
      return;
    }

    // Start recording from Smartboard Canvas stream + optional Microphone audio
    const canvas = mainCanvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      showToast('Trình duyệt hiện tại không hỗ trợ MediaRecorder để ghi màn hình.');
      return;
    }

    try {
      const canvasStream = canvas.captureStream(30);
      let combinedStream = canvasStream;

      // Try attaching teacher microphone voice audio if available
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ]);
        } catch {
          // Microphone blocked or absent in preview iframe -> record canvas video cleanly
        }
      }

      recordingStreamRef.current = combinedStream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(combinedStream, { mimeType })
        : new MediaRecorder(combinedStream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: mimeType || 'video/webm',
        });
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        saveAs(blob, `BaiGiang_Smartboard_${timestamp}.webm`);
        showToast('Đã kết thúc ghi hình và tải video bài giảng (.webm) về máy!');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setRecordingSeconds(0);
      setIsRecording(true);
      setIsRecordingPaused(false);
      showToast('Đang ghi màn hình tiết dạy Smartboard (kèm thao tác bút viết)...');
    } catch {
      showToast('Không thể khởi tạo trình ghi màn hình MediaRecorder.');
    }
  };

  // --------------------------------------------------------------------------
  // MULTI-PAGE PDF EXPORT (.pdf)
  // --------------------------------------------------------------------------
  const handleExportAllPagesToPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    showToast(`Đang đóng gói ${pages.length} trang bảng trắng ra tệp PDF (.pdf)...`);

    try {
      const exportW = 1600;
      const exportH = 900;
      const pdfPages = [];

      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const off = document.createElement('canvas');
        off.width = exportW;
        off.height = exportH;
        const ctx = off.getContext('2d');
        if (!ctx) continue;

        // 1. Page Background
        drawPageBackgroundOnContext(ctx, exportW, exportH, pg.background, 0, 0, 1);

        // 2. Render inserted widgets (Question cards, AI KaTeX cards, Images) onto the PDF canvas
        for (const w of pg.widgets) {
          ctx.save();
          if (w.rotationDeg && Math.abs(w.rotationDeg) > 0.01) {
            const wcx = w.x + w.width / 2;
            const wcy = w.y + w.height / 2;
            ctx.translate(wcx, wcy);
            ctx.rotate((w.rotationDeg * Math.PI) / 180);
            ctx.translate(-wcx, -wcy);
          }
          const wColor = w.borderColor || '#136F63';
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = wColor;
          ctx.lineWidth = 2;
          if (w.borderStyle === 'dashed') {
            ctx.setLineDash([10, 6]);
          } else if (w.borderStyle === 'dotted') {
            ctx.setLineDash([2, 6]);
          } else if (w.borderStyle === 'dash_dot') {
            ctx.setLineDash([12, 5, 2, 5]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.fillRect(w.x, w.y, w.width, w.height);
          ctx.strokeRect(w.x, w.y, w.width, w.height);
          ctx.setLineDash([]);

          // Header bar of widget
          ctx.fillStyle = wColor;
          ctx.fillRect(w.x, w.y, w.width, 32);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 14px "Be Vietnam Pro", sans-serif';
          ctx.fillText(w.title.slice(0, 68), w.x + 12, w.y + 21);

          // Body text of widget
          ctx.fillStyle = '#0F172A';
          ctx.font = '14px "Be Vietnam Pro", sans-serif';
          const bodyText =
            w.type === 'bank_question' && w.question
              ? `${w.question.stem}\n${
                  w.question.options
                    ? w.question.options
                        .map((o, idx) => `${['A', 'B', 'C', 'D'][idx]}. ${o}`)
                        .join('   ')
                    : ''
                }`
              : w.type === 'ai_katex_card'
                ? `${w.katexContent || ''}\n${w.finalAnswer || ''}`
                : w.title;

          const words = bodyText.replace(/\$/g, '').split(/\s+/);
          let line = '';
          let cursorY = w.y + 56;
          const maxLineW = w.width - 24;

          for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            if (ctx.measureText(testLine).width > maxLineW) {
              ctx.fillText(line, w.x + 12, cursorY);
              line = word;
              cursorY += 22;
              if (cursorY > w.y + w.height - 16) break;
            } else {
              line = testLine;
            }
          }
          if (line && cursorY <= w.y + w.height - 12) {
            ctx.fillText(line, w.x + 12, cursorY);
          }
          ctx.restore();
        }

        // 3. Render all strokes (including any newly finished async-queued strokes)
        const exportStrokes = getEffectivePageStrokes(pg);
        for (const st of exportStrokes) {
          drawStrokeOnContext(ctx, st, 0, 0, 1);
        }

        // 4. Footer stamp
        ctx.save();
        ctx.fillStyle =
          pg.background === 'chalkboard_dark'
            ? 'rgba(15, 41, 34, 0.9)'
            : 'rgba(248, 250, 252, 0.92)';
        ctx.fillRect(0, exportH - 36, exportW, 36);
        ctx.fillStyle = pg.background === 'chalkboard_dark' ? '#A7F3D0' : '#136F63';
        ctx.font = 'bold 13px "Be Vietnam Pro", sans-serif';
        ctx.fillText(
          `${schoolName} · ${teacherName} · ${pg.title} (Trang ${i + 1}/${pages.length})`,
          20,
          exportH - 13
        );
        ctx.restore();

        pdfPages.push({
          jpegDataUrl: off.toDataURL('image/jpeg', 0.92),
          widthPx: exportW,
          heightPx: exportH,
        });
      }

      // Also include Bảng Phải (Split View) if it has content
      if (rightBoard.strokes.length > 0 || rightBoard.widgets.length > 0) {
        const offR = document.createElement('canvas');
        offR.width = exportW;
        offR.height = exportH;
        const ctxR = offR.getContext('2d');
        if (ctxR) {
          drawPageBackgroundOnContext(ctxR, exportW, exportH, rightBoard.background, 0, 0, 1);
          for (const w of rightBoard.widgets) {
            ctxR.save();
            const wColor = w.borderColor || '#136F63';
            ctxR.fillStyle = '#FFFFFF';
            ctxR.strokeStyle = wColor;
            ctxR.lineWidth = 2;
            ctxR.fillRect(w.x, w.y, w.width, w.height);
            ctxR.strokeRect(w.x, w.y, w.width, w.height);
            ctxR.fillStyle = wColor;
            ctxR.fillRect(w.x, w.y, w.width, 32);
            ctxR.fillStyle = '#FFFFFF';
            ctxR.font = 'bold 14px "Be Vietnam Pro", sans-serif';
            ctxR.fillText(w.title.slice(0, 68), w.x + 12, w.y + 21);
            ctxR.restore();
          }
          for (const st of rightBoard.strokes) {
            drawStrokeOnContext(ctxR, st, 0, 0, 1);
          }
          ctxR.save();
          ctxR.fillStyle =
            rightBoard.background === 'chalkboard_dark'
              ? 'rgba(15, 41, 34, 0.9)'
              : 'rgba(248, 250, 252, 0.92)';
          ctxR.fillRect(0, exportH - 36, exportW, 36);
          ctxR.fillStyle = rightBoard.background === 'chalkboard_dark' ? '#A7F3D0' : '#136F63';
          ctxR.font = 'bold 13px "Be Vietnam Pro", sans-serif';
          ctxR.fillText(
            `${schoolName} · ${teacherName} · Bảng Phải (Chế độ Chia đôi)`,
            20,
            exportH - 13
          );
          ctxR.restore();
          pdfPages.push({
            jpegDataUrl: offR.toDataURL('image/jpeg', 0.92),
            widthPx: exportW,
            heightPx: exportH,
          });
        }
      }

      const pdfBlob = buildMultiPageSmartboardPdf(pdfPages);
      const dateStr = new Date().toISOString().slice(0, 10);
      saveAs(pdfBlob, `BaiGiang_Smartboard_${dateStr}.pdf`);
      showToast(`Đã xuất thành công ${pdfPages.length} trang bảng viết ra tệp PDF (.pdf)!`);
    } catch {
      showToast('Đã xảy ra lỗi khi đóng gói tệp PDF bài giảng.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // --------------------------------------------------------------------------
  // PUBLISH SMARTBOARD PAGES TO STUDENT PORTAL NOTEBOOK (CLOUD FIRESTORE SYNC)
  // --------------------------------------------------------------------------
  const handlePublishBoardToStudentNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublishingNotebook) return;
    setIsPublishingNotebook(true);
    try {
      const snapW = 960;
      const snapH = 540;
      const pageImages: string[] = [];
      const summaryLines: string[] = [];

      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const off = document.createElement('canvas');
        off.width = snapW;
        off.height = snapH;
        const ctx = off.getContext('2d');
        if (!ctx) continue;

        const scaleRatio = snapW / 1600;
        drawPageBackgroundOnContext(ctx, snapW, snapH, pg.background, 0, 0, scaleRatio);

        for (const w of pg.widgets) {
          ctx.save();
          const wx = w.x * scaleRatio;
          const wy = w.y * scaleRatio;
          const ww = w.width * scaleRatio;
          const wh = w.height * scaleRatio;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#136F63';
          ctx.lineWidth = 1.5;
          ctx.fillRect(wx, wy, ww, wh);
          ctx.strokeRect(wx, wy, ww, wh);

          ctx.fillStyle = '#136F63';
          ctx.fillRect(wx, wy, ww, 22);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px "Be Vietnam Pro", sans-serif';
          ctx.fillText(w.title.slice(0, 60), wx + 8, wy + 15);
          ctx.restore();

          if (w.type === 'bank_question' && w.question) {
            summaryLines.push(`• [${w.question.tag}] ${w.question.stem}`);
          } else if (w.type === 'ai_katex_card' && w.katexContent) {
            summaryLines.push(`• [Bút AI] ${w.katexContent} ${w.finalAnswer ? `⇒ ${w.finalAnswer}` : ''}`);
          } else {
            summaryLines.push(`• [Tài nguyên bảng] ${w.title}`);
          }
        }

        const publishStrokes = getEffectivePageStrokes(pg);
        for (const st of publishStrokes) {
          drawStrokeOnContext(ctx, st, 0, 0, scaleRatio);
        }

        pageImages.push(off.toDataURL('image/jpeg', 0.62));
      }

      const matchedCls = availableClasses.find((c) => c.name === publishTargetClass);
      const grade: '10' | '11' | '12' =
        matchedCls?.grade ||
        (publishTargetClass.startsWith('10')
          ? '10'
          : publishTargetClass.startsWith('11')
            ? '11'
            : '12');

      const summaryText =
        summaryLines.length > 0
          ? summaryLines.join('\n')
          : `Bài giảng Bảng tương tác Smartboard (${pages.length} trang viết bảng) — Giáo viên: ${teacherName}.`;

      if (onPublishToStudentNotebook) {
        await onPublishToStudentNotebook({
          title: publishLessonTitle.trim() || `Bài giảng Smartboard lớp ${publishTargetClass}`,
          className: publishTargetClass,
          grade,
          pageImages,
          summaryText,
        });
      }

      setPublishModalOpen(false);
      showToast(
        `Đã đăng ${pages.length} trang Bảng trắng lên Sổ Ghi Chép Cổng Học sinh lớp ${publishTargetClass} (Đồng bộ Cloud Firestore)!`
      );
    } catch {
      showToast('Đã lưu bản ghi Sổ Ghi Chép Bảng trắng cục bộ.');
      setPublishModalOpen(false);
    } finally {
      setIsPublishingNotebook(false);
    }
  };

  // Filtered Bank Questions for quick insertion
  const filteredBankQuestions = useMemo(() => {
    const q = bankSearchQuery.trim().toLowerCase();
    return bankItems.filter((item) => {
      if (bankGradeFilter !== 'all' && item.grade !== bankGradeFilter) return false;
      if (bankPartFilter !== 'all' && item.partType !== bankPartFilter) return false;
      if (!q) return true;
      return (
        item.tag.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.stem.toLowerCase().includes(q) ||
        item.lesson.toLowerCase().includes(q) ||
        item.chapter.toLowerCase().includes(q)
      );
    });
  }, [bankItems, bankSearchQuery, bankGradeFilter, bankPartFilter]);

  // --------------------------------------------------------------------------
  // DOCKABLE TOOLBAR RENDERER (48PX TOUCH TARGETS)
  // --------------------------------------------------------------------------
  const isVerticalDock = dockPos === 'left' || dockPos === 'right';

  const renderDockableToolbar = () => {
    const dockContainerClasses =
      dockPos === 'bottom'
        ? 'bottom-3 left-1/2 -translate-x-1/2 flex-row flex-wrap justify-center max-w-[96vw]'
        : dockPos === 'left'
          ? 'left-3 top-1/2 -translate-y-1/2 flex-col max-h-[86vh]'
          : 'right-3 top-1/2 -translate-y-1/2 flex-col max-h-[86vh]';

    const btnBase =
      'relative inline-flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-[8px] border text-[12px] font-semibold transition-all select-none';
    const btnActive = 'border-[#136F63] bg-[#136F63] text-white shadow-md';
    const btnInactive =
      'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] hover:bg-[#F8FAFC] hover:text-[#136F63]';

    const activeUndoEmpty =
      isSplitView && activeBoardSide === 'right'
        ? rightBoard.undoStack.length === 0
        : currentPage.undoStack.length === 0;
    const activeRedoEmpty =
      isSplitView && activeBoardSide === 'right'
        ? rightBoard.redoStack.length === 0
        : currentPage.redoStack.length === 0;

    return (
      <div
        data-no-zoom="true"
        className={`no-print absolute z-40 flex items-center gap-1.5 rounded-[10px] border border-[#CBD5E1] bg-white/95 p-2 shadow-2xl backdrop-blur-xs ${dockContainerClasses}`}
      >
        {/* Active Split Board Focus Switcher Pill (Visible when Split View is ON) */}
        {isSplitView && (
          <button
            type="button"
            onClick={() => setActiveBoardSide((s) => (s === 'left' ? 'right' : 'left'))}
            title="Nhấn để chuyển nhanh khung bảng đang thao tác giữa Bảng Trái và Bảng Phải"
            className="inline-flex h-12 min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border border-[#136F63]/40 bg-emerald-50 px-2.5 text-[11.5px] font-bold text-[#136F63] hover:bg-emerald-100"
          >
            <span className="h-2 w-2 rounded-full bg-[#136F63]" />
            <span>{activeBoardSide === 'left' ? 'Bảng Trái' : 'Bảng Phải'}</span>
          </button>
        )}
        {/* 1. Hand / Pan */}
        <button
          type="button"
          onClick={() => {
            setActiveTool('pan');
            setOpenPopover('none');
          }}
          title="Kéo trượt mặt bảng vô hạn (Hoặc dùng 2 ngón tay Pinch-to-Zoom & Pan)"
          className={`${btnBase} ${activeTool === 'pan' ? btnActive : btnInactive}`}
        >
          <Hand className="h-5 w-5" />
        </button>

        {/* 1B. Select / Smart Lasso Tool (Chạm chọn 1 đối tượng hoặc kéo khoanh nét đứt gom nhóm nhiều đối tượng) */}
        <button
          type="button"
          onClick={() => {
            setActiveTool('select');
            setOpenPopover('none');
            showToast(
              'Công cụ Chọn & Khoanh vùng (Smart Lasso): Kéo khoanh tự do để gom nhóm nhiều đối tượng, hoặc chạm để chọn 1 đối tượng.'
            );
          }}
          title="Chọn & Khoanh vùng thông minh (Chạm để chọn 1 đối tượng, hoặc giữ kéo khoanh nét đứt để gom nhóm nhiều nét/hình cùng lúc)"
          className={`${btnBase} ${activeTool === 'select' ? btnActive : btnInactive}`}
        >
          <MousePointer className="h-5 w-5" />
        </button>

        {/* 2. Smooth Pen (Bút viết nét mượt + 4 kiểu nét vẽ kỹ thuật) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setActiveTool('pen');
              setOpenPopover((p) => (p === 'pen' ? 'none' : 'pen'));
            }}
            title="Bút viết nét mượt (Chọn màu mực, Cỡ nét & 4 Kiểu nét vẽ: Liền, Đứt chuẩn, Đứt mảnh, Chấm gạch)"
            className={`${btnBase} ${activeTool === 'pen' ? btnActive : btnInactive}`}
          >
            <PenTool className="h-5 w-5" />
            <span
              className="absolute right-1.5 bottom-1.5 h-3 w-3 rounded-full border border-white shadow-xs"
              style={{ backgroundColor: penColor }}
            />
            {penLineStyle !== 'solid' && (
              <span className="absolute top-1 right-1 rounded bg-amber-400 px-1 text-[8.5px] leading-tight font-extrabold text-slate-950">
                - -
              </span>
            )}
          </button>

          {openPopover === 'pen' && (
            <div
              className={`absolute z-50 w-72 rounded-[8px] border border-[#CBD5E1] bg-white p-3 shadow-xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 text-[12px] font-bold text-slate-700">
                Màu mực Bút viết (Chuẩn 65–86&quot;)
              </div>
              <div className="flex items-center gap-2">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => {
                      setPenColor(c.color);
                      setActiveTool('pen');
                    }}
                    title={c.label}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform ${
                      penColor === c.color
                        ? 'scale-110 border-[#136F63] ring-2 ring-[#136F63]/30'
                        : c.border || 'border-slate-200'
                    }`}
                    style={{ backgroundColor: c.color }}
                  >
                    {penColor === c.color && (
                      <Check
                        className={`h-4 w-4 ${
                          c.color === '#FFFFFF' || c.color === '#EAB308'
                            ? 'text-slate-900'
                            : 'text-white'
                        }`}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-3 mb-1.5 text-[12px] font-bold text-slate-700">
                Cỡ nét bút ({penWidth}px)
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {STROKE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPenWidth(w)}
                    className={`flex h-9 items-center justify-center rounded-[6px] border text-[12px] font-semibold ${
                      penWidth === w
                        ? 'border-[#136F63] bg-[#136F63] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>

              {/* 4 Technical Line Styles */}
              <div className="mt-3 mb-1.5 flex items-center justify-between text-[12px] font-bold text-[#136F63]">
                <span>Kiểu nét vẽ kỹ thuật (Chuẩn THPT)</span>
              </div>
              <div className="space-y-1.5">
                {LINE_STYLE_PRESETS.map((ls) => {
                  const isSel = penLineStyle === ls.id;
                  return (
                    <button
                      key={ls.id}
                      type="button"
                      onClick={() => {
                        setPenLineStyle(ls.id);
                        setActiveTool('pen');
                      }}
                      className={`flex w-full items-center justify-between rounded-[6px] border px-2.5 py-1.5 text-left transition-colors ${
                        isSel
                          ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <div className="text-[12px] font-bold">{ls.label}</div>
                        <div className="text-[10.5px] text-slate-500">{ls.usageHint}</div>
                      </div>
                      <svg width="46" height="10" className="shrink-0">
                        <line
                          x1="2"
                          y1="5"
                          x2="44"
                          y2="5"
                          stroke={isSel ? '#136F63' : '#0F172A'}
                          strokeWidth="2.5"
                          strokeDasharray={ls.dashArray.join(' ')}
                        />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2B. Quick 1-Tap Toggle Button Solid <-> Dashed (— / - -) right next to Pen */}
        <button
          type="button"
          onClick={handleToggleQuickLineStyle}
          title="Nút gạt nhanh Nét liền (—) ↔ Nét đứt (- -) [Phím tắt: D]"
          className={`inline-flex h-12 min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-bold transition-all select-none ${
            penLineStyle === 'dashed'
              ? 'border-[#136F63] bg-[#136F63] text-white shadow-md'
              : 'border-[#CBD5E1] bg-white text-slate-800 hover:border-[#136F63] hover:bg-emerald-50/50 hover:text-[#136F63]'
          }`}
        >
          <span className="font-mono text-[13px] tracking-tighter font-extrabold">
            {penLineStyle === 'dashed' ? '- -' : '—'}
          </span>
          {!isVerticalDock && (
            <span className="text-[11.5px]">
              {penLineStyle === 'dashed' ? 'Nét đứt' : 'Liền / Đứt'}
            </span>
          )}
        </button>

        {/* 2C. Quick 1-Tap Rubber-band Line Tool with Dual-Endpoint Snapping (Shortcut: L) */}
        <button
          type="button"
          onClick={() => {
            setActiveSmartTemplate(null);
            setSmartShapeMode('line');
            setActiveTool('smart_shape');
            setOpenPopover('none');
            showToast(
              'Công cụ Đoạn thẳng (L): Kéo co giãn trực tiếp & tự động hít chặt 2 đầu vào đỉnh/trung điểm có sẵn (bán kính 16px).'
            );
          }}
          title="Vẽ Đoạn thẳng co giãn & tự động bắt dính 2 đầu [Phím tắt: L]"
          className={`inline-flex h-12 min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-bold transition-all select-none ${
            activeTool === 'smart_shape' && !activeSmartTemplate && smartShapeMode === 'line'
              ? 'border-[#136F63] bg-[#136F63] text-white shadow-md'
              : 'border-[#CBD5E1] bg-white text-slate-800 hover:border-[#136F63] hover:bg-emerald-50/50 hover:text-[#136F63]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            className="shrink-0"
            aria-hidden="true"
          >
            <line
              x1="4"
              y1="16"
              x2="16"
              y2="4"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={penLineStyle === 'dashed' ? '4 3' : undefined}
            />
            <circle cx="4" cy="16" r="2.3" fill="currentColor" />
            <circle cx="16" cy="4" r="2.3" fill="currentColor" />
          </svg>
          {!isVerticalDock && <span className="text-[11.5px]">Đoạn thẳng</span>}
        </button>

        {/* 3. Highlighter (Bút dạ quang) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setActiveTool('highlighter');
              setOpenPopover((p) => (p === 'highlighter' ? 'none' : 'highlighter'));
            }}
            title="Bút dạ quang (Highlighter)"
            className={`${btnBase} ${activeTool === 'highlighter' ? btnActive : btnInactive}`}
          >
            <Highlighter className="h-5 w-5" />
            <span
              className="absolute right-1.5 bottom-1.5 h-3 w-3 rounded-full border border-slate-700"
              style={{ backgroundColor: highlighterColor }}
            />
          </button>

          {openPopover === 'highlighter' && (
            <div
              className={`absolute z-50 w-56 rounded-[8px] border border-[#CBD5E1] bg-white p-3 shadow-xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 text-[12px] font-bold text-slate-700">Màu Bút dạ quang</div>
              <div className="flex items-center gap-2">
                {HIGHLIGHTER_COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => {
                      setHighlighterColor(c.color);
                      setActiveTool('highlighter');
                      setOpenPopover('none');
                    }}
                    title={c.label}
                    className={`h-9 w-9 rounded-full border-2 ${
                      highlighterColor === c.color
                        ? 'scale-110 border-[#136F63]'
                        : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: c.color }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. Smart Shape Pen (Bút Hình học Thông minh: 2D + Hình không gian 3D + 3 Đường Conic) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setActiveTool('smart_shape');
              setOpenPopover((p) => (p === 'shape' ? 'none' : 'shape'));
            }}
            title="Bút Hình học Thông minh (Hình phẳng 2D, Hình không gian 3D tự động nét khuất & 3 Đường Conic chuẩn Toán THPT)"
            className={`${btnBase} ${activeTool === 'smart_shape' ? btnActive : btnInactive}`}
          >
            <Shapes className="h-5 w-5" />
            {activeSmartTemplate && (
              <span className="absolute top-1 right-1 rounded bg-emerald-400 px-1 text-[8.5px] leading-tight font-extrabold text-slate-950">
                3D
              </span>
            )}
          </button>

          {openPopover === 'shape' && (
            <div
              className={`absolute z-50 w-[380px] sm:w-[430px] rounded-[10px] border border-[#CBD5E1] bg-white p-3.5 shadow-2xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#136F63]">
                  Bút Hình học Thông minh (Smart Shape THPT)
                </span>
                <button
                  type="button"
                  onClick={() => setOpenPopover('none')}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 4 Line Styles Bar inside Smart Shape */}
              <div className="mb-2.5 rounded-[7px] border border-slate-200 bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Kiểu nét vẽ (Áp dụng cho hình 2D &amp; cạnh vẽ thêm):</span>
                  <span className="text-[#136F63]">
                    {LINE_STYLE_PRESETS.find((l) => l.id === penLineStyle)?.shortLabel}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {LINE_STYLE_PRESETS.map((ls) => (
                    <button
                      key={ls.id}
                      type="button"
                      onClick={() => setPenLineStyle(ls.id)}
                      title={`${ls.label} — ${ls.usageHint}`}
                      className={`flex flex-col items-center justify-center rounded-[5px] border px-1.5 py-1 text-[10.5px] font-bold transition-colors ${
                        penLineStyle === ls.id
                          ? 'border-[#136F63] bg-[#136F63] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{ls.shortLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3 Category Tabs: Hình phẳng 2D | Hình không gian 3D | 3 Đường Conic & Đồ thị */}
              <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-[7px] bg-slate-100 p-1 text-[11.5px] font-bold">
                <button
                  type="button"
                  onClick={() => setShapeCategoryTab('2d')}
                  className={`rounded-[5px] py-1.5 transition-colors ${
                    shapeCategoryTab === '2d'
                      ? 'bg-[#136F63] text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  Hình phẳng 2D
                </button>
                <button
                  type="button"
                  onClick={() => setShapeCategoryTab('3d')}
                  className={`rounded-[5px] py-1.5 transition-colors ${
                    shapeCategoryTab === '3d'
                      ? 'bg-[#136F63] text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  Không gian 3D
                </button>
                <button
                  type="button"
                  onClick={() => setShapeCategoryTab('conic')}
                  className={`rounded-[5px] py-1.5 transition-colors ${
                    shapeCategoryTab === 'conic'
                      ? 'bg-[#136F63] text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  3 Đường Conic
                </button>
              </div>

              {/* TAB 1: HÌNH PHẲNG 2D */}
              {shapeCategoryTab === '2d' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                    {[
                      { id: 'auto', label: 'Tự nhận diện nét vẽ', icon: Wand2 },
                      { id: 'line', label: 'Đoạn thẳng', icon: Ruler },
                      { id: 'arrow', label: 'Mũi tên / Vectơ', icon: ArrowUpRight },
                      { id: 'circle', label: 'Đường tròn', icon: CircleIcon },
                      { id: 'triangle', label: 'Tam giác', icon: Triangle },
                      { id: 'rectangle', label: 'Hình chữ nhật / Vuông', icon: Square },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSel = !activeSmartTemplate && smartShapeMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveSmartTemplate(null);
                            setSmartShapeMode(item.id as SmartShapeSubMode);
                            setActiveTool('smart_shape');
                            setOpenPopover('none');
                          }}
                          className={`flex items-center gap-1.5 rounded-[6px] border px-2.5 py-2 font-semibold ${
                            isSel
                              ? 'border-[#136F63] bg-[#136F63] text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-[6px] bg-emerald-50/70 px-2.5 py-1.5 text-[11px] text-slate-600">
                    Mẹo: Chọn kiểu nét (Liền / Đứt / Chấm gạch) phía trên rồi kéo vẽ đoạn thẳng, đường tròn, tam giác trên bảng.
                  </div>
                </div>
              )}

              {/* TAB 2 & TAB 3: HÌNH KHÔNG GIAN 3D & 3 ĐƯỜNG CONIC */}
              {(shapeCategoryTab === '3d' || shapeCategoryTab === 'conic') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-[6px] border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-semibold text-slate-700">
                      Tự động phân biệt cạnh thấy (liền) &amp; khuất (đứt)
                    </span>
                    <button
                      type="button"
                      onClick={() => setDefaultTemplateShowLabels((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-bold transition-colors ${
                        defaultTemplateShowLabels
                          ? 'bg-[#136F63] text-white'
                          : 'border border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                      <span>Nhãn đỉnh: {defaultTemplateShowLabels ? 'BẬT' : 'TẮT'}</span>
                    </button>
                  </div>

                  <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                    {SMART_TEMPLATE_CATALOG.filter((item) => item.tab === shapeCategoryTab).map(
                      (tpl) => {
                        const isActiveTpl = activeSmartTemplate === tpl.id;
                        return (
                          <div
                            key={tpl.id}
                            className={`rounded-[7px] border p-2 transition-all ${
                              isActiveTpl
                                ? 'border-[#136F63] bg-emerald-50/50 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-[#136F63]/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSmartTemplate(tpl.id);
                                  setActiveTemplateVariant(tpl.defaultVariant);
                                  setActiveTool('smart_shape');
                                  setOpenPopover('none');
                                  showToast(
                                    `Đã chọn mẫu "${tpl.title}". Kéo chuột/ngón tay trên bảng để vẽ theo cỡ tùy ý (hoặc chạm 1 lần để đặt hình)!`
                                  );
                                }}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#136F63] text-[10.5px] font-bold text-white">
                                    {tpl.numberBadge}
                                  </span>
                                  <span className="truncate text-[12.5px] font-bold text-slate-900">
                                    {tpl.title}
                                  </span>
                                </div>
                                <div className="mt-0.5 pl-6 text-[11px] text-slate-500">
                                  {tpl.subtitle}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleQuickInsertTemplateFigure(tpl.id)}
                                title="Vẽ 1 chạm ngay ra giữa bảng"
                                className="shrink-0 rounded-[6px] bg-[#136F63] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#0F594F]"
                              >
                                + Vẽ 1 chạm
                              </button>
                            </div>

                            {/* Optional Sub-variants (e.g. SA ⊥ đáy vs Chóp đều, HBH vs Hình thang, y^2=2px vs y=ax^2+bx+c) */}
                            {tpl.variants && tpl.variants.length > 1 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
                                {tpl.variants.map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() =>
                                      handleQuickInsertTemplateFigure(tpl.id, v.id)
                                    }
                                    className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#136F63] hover:bg-emerald-50"
                                  >
                                    {v.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. Eraser (Cục tẩy theo nét / tẩy vùng) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setActiveTool('eraser');
              setOpenPopover((p) => (p === 'eraser' ? 'none' : 'eraser'));
            }}
            title="Cục tẩy (Tẩy theo nét hoặc Tẩy vùng & Xóa trang)"
            className={`${btnBase} ${activeTool === 'eraser' ? btnActive : btnInactive}`}
          >
            <Eraser className="h-5 w-5" />
          </button>

          {openPopover === 'eraser' && (
            <div
              className={`absolute z-50 w-60 rounded-[8px] border border-[#CBD5E1] bg-white p-3 shadow-xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 text-[12px] font-bold text-slate-700">Chế độ Cục tẩy</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEraserMode('stroke');
                    setActiveTool('eraser');
                    setOpenPopover('none');
                  }}
                  className={`rounded-[6px] border px-2.5 py-2 text-[12px] font-semibold ${
                    eraserMode === 'stroke'
                      ? 'border-[#136F63] bg-[#136F63] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  Tẩy theo nét
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEraserMode('area');
                    setActiveTool('eraser');
                    setOpenPopover('none');
                  }}
                  className={`rounded-[6px] border px-2.5 py-2 text-[12px] font-semibold ${
                    eraserMode === 'area'
                      ? 'border-[#136F63] bg-[#136F63] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  Tẩy vùng
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleClearCurrentPage();
                  setOpenPopover('none');
                }}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa sạch trang hiện tại</span>
              </button>
            </div>
          )}
        </div>

        {/* 6. Virtual Geometry Instruments (Thước kẻ / Compa / Thước đo độ ảo) */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenPopover((p) => (p === 'geometry_tools' ? 'none' : 'geometry_tools'))
            }
            title="Thước kẻ / Compa / Thước đo độ ảo trên màn hình"
            className={`${btnBase} ${
              showRuler || showProtractor || showCompass ? btnActive : btnInactive
            }`}
          >
            <Compass className="h-5 w-5" />
          </button>

          {openPopover === 'geometry_tools' && (
            <div
              className={`absolute z-50 w-64 rounded-[8px] border border-[#CBD5E1] bg-white p-3 shadow-xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 text-[12px] font-bold text-[#136F63]">
                Bộ Dụng cụ Hình học Ảo
              </div>
              <div className="space-y-1.5 text-[12.5px]">
                <button
                  type="button"
                  onClick={() => {
                    setShowRuler((v) => !v);
                    setOpenPopover('none');
                  }}
                  className={`flex w-full items-center justify-between rounded-[6px] border px-3 py-2 font-medium ${
                    showRuler
                      ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    <span>Thước kẻ ảo (20 cm)</span>
                  </span>
                  <span className="text-[11px] font-bold">{showRuler ? 'ĐANG BẬT' : 'Bật'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCompass((v) => !v);
                    setOpenPopover('none');
                  }}
                  className={`flex w-full items-center justify-between rounded-[6px] border px-3 py-2 font-medium ${
                    showCompass
                      ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Compass className="h-4 w-4" />
                    <span>Compa quay đường tròn</span>
                  </span>
                  <span className="text-[11px] font-bold">{showCompass ? 'ĐANG BẬT' : 'Bật'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowProtractor((v) => !v);
                    setOpenPopover('none');
                  }}
                  className={`flex w-full items-center justify-between rounded-[6px] border px-3 py-2 font-medium ${
                    showProtractor
                      ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <CircleIcon className="h-4 w-4" />
                    <span>Thước đo độ ảo (180°)</span>
                  </span>
                  <span className="text-[11px] font-bold">
                    {showProtractor ? 'ĐANG BẬT' : 'Bật'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 7. Attention Focus Tools: Spotlight (Đèn rọi) & Screen Shade (Rèm che) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPopover((p) => (p === 'focus_tools' ? 'none' : 'focus_tools'))}
            title="Công cụ tập trung sự chú ý: Đèn rọi (Spotlight) & Rèm che (Screen Shade)"
            className={`${btnBase} ${
              spotlightActive || screenShadeActive ? btnActive : btnInactive
            }`}
          >
            <SunDim className="h-5 w-5" />
          </button>

          {openPopover === 'focus_tools' && (
            <div
              className={`absolute z-50 w-68 rounded-[8px] border border-[#CBD5E1] bg-white p-3 shadow-xl ${
                dockPos === 'bottom'
                  ? 'bottom-14 left-0'
                  : dockPos === 'left'
                    ? 'top-0 left-14'
                    : 'top-0 right-14'
              }`}
            >
              <div className="mb-2 text-[12px] font-bold text-[#136F63]">
                Tập trung sự chú ý (Spotlight &amp; Rèm che)
              </div>

              <div className="space-y-2 text-[12.5px]">
                <div className="rounded-[6px] border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Đèn rọi (Spotlight)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSpotlightActive((v) => !v);
                        setOpenPopover('none');
                      }}
                      className={`rounded-[5px] px-2.5 py-1 text-[11.5px] font-bold ${
                        spotlightActive
                          ? 'bg-[#136F63] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {spotlightActive ? 'Tắt Đèn rọi' : 'Bật Đèn rọi'}
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSpotlightShape('circle');
                        setSpotlightActive(true);
                      }}
                      className={`flex-1 rounded-[5px] border py-1 text-[11.5px] font-medium ${
                        spotlightShape === 'circle'
                          ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Vùng Tròn
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpotlightShape('rect');
                        setSpotlightActive(true);
                      }}
                      className={`flex-1 rounded-[5px] border py-1 text-[11.5px] font-medium ${
                        spotlightShape === 'rect'
                          ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Vùng Chữ nhật
                    </button>
                  </div>
                </div>

                <div className="rounded-[6px] border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Rèm che lời giải</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenShadeActive((v) => !v);
                        setOpenPopover('none');
                      }}
                      className={`rounded-[5px] px-2.5 py-1 text-[11.5px] font-bold ${
                        screenShadeActive
                          ? 'bg-[#136F63] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {screenShadeActive ? 'Tắt Rèm che' : 'Bật Rèm che'}
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScreenShadeDir('top');
                        setScreenShadeCoverPos(400);
                        setScreenShadeActive(true);
                      }}
                      className={`flex-1 rounded-[5px] border py-1 text-[11.5px] font-medium ${
                        screenShadeDir === 'top'
                          ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Kéo từ Trên xuống
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenShadeDir('left');
                        setScreenShadeCoverPos(520);
                        setScreenShadeActive(true);
                      }}
                      className={`flex-1 rounded-[5px] border py-1 text-[11.5px] font-medium ${
                        screenShadeDir === 'left'
                          ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Kéo từ Trái sang
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 8. AI Pen & Math OCR (Trợ lý Bút AI) */}
        <button
          type="button"
          onClick={() => {
            setActiveTool('ai_lasso');
            setOpenPopover('none');
            showToast(
              'Bút AI & Math OCR: Hãy khoanh vùng chữ viết tay hoặc bài toán trên bảng để chuyển sang KaTeX hoặc nhờ Gemini giải từng bước.'
            );
          }}
          title="Trợ lý Bút AI (Khoanh vùng viết tay chuyển thành KaTeX sắc nét hoặc nhờ Gemini AI giải thích từng bước)"
          className={`inline-flex h-12 min-h-[48px] items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-bold transition-all ${
            activeTool === 'ai_lasso'
              ? 'border-[#136F63] bg-[#136F63] text-white shadow-md ring-2 ring-emerald-300'
              : 'border-emerald-300 bg-emerald-50 text-[#136F63] hover:bg-emerald-100'
          }`}
        >
          <Sparkles className="h-5 w-5 shrink-0" />
          {!isVerticalDock && <span>Bút AI &amp; OCR</span>}
        </button>

        <div
          className={
            isVerticalDock ? 'my-0.5 h-px w-8 bg-slate-200' : 'mx-0.5 h-8 w-px bg-slate-200'
          }
        />

        {/* 9. Undo / Redo (automatically targets focused board in Split View) */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={activeUndoEmpty}
          title={
            isSplitView
              ? `Hoàn tác trên ${activeBoardSide === 'left' ? 'Bảng Trái' : 'Bảng Phải'} (Ctrl+Z)`
              : 'Hoàn tác nét vẽ (Undo)'
          }
          className={`${btnBase} ${btnInactive} disabled:opacity-35`}
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={activeRedoEmpty}
          title={
            isSplitView
              ? `Làm lại trên ${activeBoardSide === 'left' ? 'Bảng Trái' : 'Bảng Phải'} (Ctrl+Y)`
              : 'Làm lại nét vẽ (Redo)'
          }
          className={`${btnBase} ${btnInactive} disabled:opacity-35`}
        >
          <Redo2 className="h-5 w-5" />
        </button>

        {/* 9B. Split-Screen Dual Interactive Canvas Toggle (Alt+S) */}
        <button
          type="button"
          onClick={handleRequestToggleSplitView}
          title={
            isSplitView
              ? 'Đang ở Chế độ Chia đôi 2 Bảng Độc lập — Bấm để gộp về 1 Bảng Đơn (Alt+S)'
              : 'Chia đôi Bảng viết 2 bên Độc lập (Trái: Đề bài & Hình vẽ | Phải: Viết lời giải) — Phím tắt Alt+S'
          }
          className={`inline-flex h-12 min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-bold transition-all ${
            isSplitView
              ? 'border-[#136F63] bg-[#136F63] text-white shadow-md ring-2 ring-[#136F63]/30'
              : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] hover:bg-emerald-50 hover:text-[#136F63]'
          }`}
        >
          <Columns2 className="h-5 w-5 shrink-0" />
          {!isVerticalDock && <span>{isSplitView ? 'Đang chia đôi' : 'Chia đôi bảng'}</span>}
        </button>

        <div
          className={
            isVerticalDock ? 'my-0.5 h-px w-8 bg-slate-200' : 'mx-0.5 h-8 w-px bg-slate-200'
          }
        />

        {/* 10. Live Pop Quiz QR Button */}
        <button
          type="button"
          onClick={() => setPopQuizOpen((v) => !v)}
          title="Gửi câu hỏi tương tác cho học sinh dưới lớp qua Mã QR & Xem biểu đồ thống kê trực tiếp"
          className={`inline-flex h-12 min-h-[48px] items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-bold transition-all ${
            popQuizOpen
              ? 'border-[#0369A1] bg-[#0369A1] text-white shadow-md'
              : 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] hover:bg-[#BAE6FD]/60'
          }`}
        >
          <QrCode className="h-5 w-5 shrink-0" />
          {!isVerticalDock && <span>Câu hỏi QR</span>}
        </button>

        {/* 11. Dock Position Switcher (Left / Bottom / Right) */}
        <div className="flex items-center gap-0.5 rounded-[6px] border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setDockPos('left')}
            title="Neo thanh công cụ sang Cạnh trái"
            className={`flex h-9 w-8 items-center justify-center rounded-[5px] ${
              dockPos === 'left' ? 'bg-[#136F63] text-white' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDockPos('bottom')}
            title="Neo thanh công cụ xuống Cạnh dưới"
            className={`flex h-9 w-8 items-center justify-center rounded-[5px] ${
              dockPos === 'bottom' ? 'bg-[#136F63] text-white' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <PanelBottom className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDockPos('right')}
            title="Neo thanh công cụ sang Cạnh phải"
            className={`flex h-9 w-8 items-center justify-center rounded-[5px] ${
              dockPos === 'right' ? 'bg-[#136F63] text-white' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // RENDER COMPONENT
  // --------------------------------------------------------------------------
  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[95] flex flex-col bg-[#F1F5F9]'
          : 'flex h-[calc(100vh-58px)] min-h-[680px] flex-col overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-xs'
      }
    >
      {/* Hidden File Input for Image Insertion */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadImageFile}
        className="hidden"
      />

      {/* ====================================================================
          TOP RESOURCE INSERTION & LESSON RECORDING / PDF EXPORT BAR
         ==================================================================== */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
        {/* Left: Direct Resource Insertion Bar (Thanh chèn tài nguyên trực tiếp lên bảng) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 text-[12.5px] font-bold text-[#136F63] xl:inline-flex">
            <Layers className="h-4 w-4" />
            <span>Chèn lên bảng:</span>
          </span>

          <button
            type="button"
            onClick={() => setBankModalOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F]"
          >
            <FileQuestion className="h-4 w-4 shrink-0" />
            <span>+ Câu hỏi Ngân hàng đề</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
          >
            <ImageIcon className="h-4 w-4 text-[#136F63]" />
            <span>Chèn Ảnh</span>
          </button>

          <button
            type="button"
            onClick={() => setYoutubeModalOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
          >
            <Youtube className="h-4 w-4 text-red-600" />
            <span>Video YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => handleInsert3DOrGeoGebraWidget('interactive_solid')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
          >
            <Box className="h-4 w-4 text-[#0369A1]" />
            <span>GeoGebra 3D / Desmos</span>
          </button>

          {/* Background Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenPopover((p) => (p === 'background' ? 'none' : 'background'))
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-[#136F63]"
            >
              <Grid className="h-4 w-4 text-[#136F63]" />
              <span>
                Nền{isSplitView ? (activeBoardSide === 'right' ? ' (Phải)' : ' (Trái)') : ''}:{' '}
                <strong>
                  {
                    BACKGROUND_OPTIONS.find(
                      (b) =>
                        b.id ===
                        (isSplitView && activeBoardSide === 'right'
                          ? rightBoard.background
                          : currentPage.background)
                    )?.shortLabel
                  }
                </strong>
              </span>
            </button>

            {openPopover === 'background' && (
              <div className="absolute top-11 left-0 z-50 w-72 rounded-[8px] border border-[#CBD5E1] bg-white p-2 shadow-xl">
                <div className="px-2 py-1 text-[11.5px] font-bold text-slate-500 uppercase">
                  Chọn mẫu nền{' '}
                  {isSplitView
                    ? activeBoardSide === 'right'
                      ? 'Bảng Phải'
                      : 'Bảng Trái'
                    : 'bảng tương tác'}
                </div>
                {BACKGROUND_OPTIONS.map((bg) => {
                  const activeBg =
                    isSplitView && activeBoardSide === 'right'
                      ? rightBoard.background
                      : currentPage.background;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => handleSelectBackground(bg.id)}
                      className={`flex w-full flex-col rounded-[6px] px-2.5 py-2 text-left transition-colors ${
                        activeBg === bg.id
                          ? 'bg-[#136F63] text-white'
                          : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[12.5px] font-semibold">{bg.label}</span>
                      <span
                        className={`text-[11px] ${
                          activeBg === bg.id ? 'text-emerald-100' : 'text-slate-500'
                        }`}
                      >
                        {bg.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Multi-Page Controls + Screen Recording + PDF Export + Fullscreen */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Multi-page Switcher */}
          <div className="flex items-center rounded-[6px] border border-[#CBD5E1] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setCurrentPageIdx((idx) => Math.max(0, idx - 1))}
              disabled={currentPageIdx === 0}
              title="Trang bảng trước"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowPageThumbnails((v) => !v)}
              title="Xem danh sách trang bảng thu nhỏ"
              className={`flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-semibold ${
                showPageThumbnails
                  ? 'bg-[#136F63] text-white'
                  : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <LayoutPanelLeft className="h-3.5 w-3.5" />
              <span>
                Trang {currentPageIdx + 1}/{pages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPageIdx((idx) => Math.min(pages.length - 1, idx + 1))}
              disabled={currentPageIdx >= pages.length - 1}
              title="Trang bảng tiếp theo"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => handleAddPage()}
              title="Thêm trang bảng mới"
              className="ml-0.5 flex h-8 items-center gap-1 rounded-[5px] bg-emerald-50 px-2 text-[12px] font-bold text-[#136F63] hover:bg-emerald-100"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Thêm trang</span>
            </button>
          </div>

          {/* Split-Screen Dual Interactive Canvas Button (Alt+S) */}
          <button
            type="button"
            onClick={handleRequestToggleSplitView}
            title={
              isSplitView
                ? 'Đang bật Chia đôi 2 Bảng Độc lập — Bấm để quay về 1 Bảng Đơn (Alt+S)'
                : 'Chia đôi Bảng viết 2 bên Độc lập (Bảng Trái & Bảng Phải) — Phím tắt Alt+S'
            }
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              isSplitView
                ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs hover:bg-[#0F594F]'
                : 'border-[#136F63]/50 bg-emerald-50/70 text-[#136F63] hover:border-[#136F63] hover:bg-emerald-100/80'
            }`}
          >
            <Columns2 className="h-4 w-4 shrink-0" />
            <span>{isSplitView ? '1 Bảng đơn' : 'Chia đôi bảng'}</span>
            <span
              className={`hidden rounded px-1 py-0.5 text-[10px] font-semibold xl:inline ${
                isSplitView ? 'bg-white/20 text-white' : 'bg-white text-[#136F63]'
              }`}
            >
              Alt+S
            </span>
          </button>

          {/* Screen Recording Button (MediaRecorder) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleStartOrStopRecording}
              title="Ghi màn hình tiết dạy kèm giọng giảng thành file video (.webm)"
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                isRecording
                  ? 'animate-pulse border-red-600 bg-red-600 text-white hover:bg-red-700'
                  : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-red-500 hover:text-red-600'
              }`}
            >
              <Video className="h-4 w-4 shrink-0" />
              <span>
                {isRecording ? `Dừng ghi (${formatTimer(recordingSeconds)})` : 'Ghi màn hình'}
              </span>
            </button>

            {isRecording && (
              <button
                type="button"
                onClick={() => {
                  const rec = mediaRecorderRef.current;
                  if (!rec) return;
                  if (rec.state === 'recording') {
                    rec.pause();
                    setIsRecordingPaused(true);
                  } else if (rec.state === 'paused') {
                    rec.resume();
                    setIsRecordingPaused(false);
                  }
                }}
                title={isRecordingPaused ? 'Tiếp tục ghi' : 'Tạm dừng ghi'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                {isRecordingPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
            )}
          </div>

          {/* Export All Pages to PDF (.pdf) */}
          <button
            type="button"
            onClick={handleExportAllPagesToPdf}
            disabled={isExportingPdf}
            title="Đóng gói toàn bộ các trang bảng trắng đã viết thành tệp PDF (.pdf)"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[#136F63] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#136F63] hover:bg-emerald-50 disabled:opacity-50"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span>{isExportingPdf ? 'Đang xuất PDF...' : 'Xuất PDF (.pdf)'}</span>
          </button>

          {/* Publish Board Lesson to Student Portal Notebook (Cloud Firestore - Owner Admin Only) */}
          {isOwnerAdmin && onPublishToStudentNotebook ? (
            <button
              type="button"
              onClick={() => {
                setPublishTargetClass(activeClassName || availableClasses[0]?.name || '12A1');
                setPublishModalOpen(true);
              }}
              title="Đăng bài giảng và các trang viết bảng lên Sổ Ghi Chép Cổng Học sinh (Đồng bộ Cloud Firestore với TeachLearn Edu)"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F]"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span>Đăng lên Sổ Ghi Chép Cổng HS</span>
            </button>
          ) : (
            <span
              title="Chế độ Giảng dạy Cục bộ (Local Mode): Toàn bộ nét viết bảng và xuất PDF chạy trực tiếp trên máy. Đăng nhập Google ở thanh tiêu đề để đồng bộ Cloud."
              className="hidden items-center gap-1.5 rounded-[6px] border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 xl:inline-flex"
            >
              <span>Giảng dạy Cục bộ (Local Mode)</span>
            </span>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Thu nhỏ bảng' : 'Phóng toàn màn hình 65–86 inch'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-[#CBD5E1] bg-white text-[#136F63] hover:border-[#136F63] hover:bg-emerald-50"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ====================================================================
          MAIN INTERACTIVE CANVAS WORKSPACE
         ==================================================================== */}
      <div
        ref={splitWorkspaceRef}
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        {/* Global Toast Notification Banner (centered across full workspace) */}
        {toastMessage && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-[#136F63] bg-[#0F2922]/95 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
            {toastMessage}
          </div>
        )}
        {/* Collapsible Multi-Page Thumbnails Drawer */}
        {showPageThumbnails && (
          <div className="no-print z-30 flex w-64 shrink-0 flex-col border-r border-[#E2E8F0] bg-[#F8FAFC]">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2.5">
              <span className="text-[13px] font-bold text-slate-800">
                Danh sách trang bảng ({pages.length})
              </span>
              <button
                type="button"
                onClick={() => setShowPageThumbnails(false)}
                className="rounded-[5px] p-1 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {pages.map((pg, idx) => {
                const isCurr = idx === currentPageIdx;
                const bgInfo = BACKGROUND_OPTIONS.find((b) => b.id === pg.background);
                return (
                  <div
                    key={pg.id}
                    onClick={() => setCurrentPageIdx(idx)}
                    className={`group cursor-pointer rounded-[8px] border-2 p-2.5 transition-all ${
                      isCurr
                        ? 'border-[#136F63] bg-emerald-50/70 shadow-xs'
                        : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-bold text-slate-800">
                        Trang {idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
                          {bgInfo?.shortLabel}
                        </span>
                        {pages.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(idx);
                            }}
                            title="Xóa trang này"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Mini Preview Box */}
                    <div
                      className={`mt-1.5 flex h-20 flex-col items-center justify-center rounded-[5px] border text-[11px] ${
                        pg.background === 'chalkboard_dark'
                          ? 'border-emerald-900 bg-[#0F2922] text-emerald-200'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <div className="font-semibold">
                        {pg.strokes.length} nét vẽ · {pg.widgets.length} thẻ chèn
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[#E2E8F0] p-2.5">
              <button
                type="button"
                onClick={() => handleAddPage()}
                className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#136F63] py-2 text-[12.5px] font-semibold text-white hover:bg-[#0F594F]"
              >
                <Plus className="h-4 w-4" />
                <span>+ Thêm trang bảng mới</span>
              </button>
            </div>
          </div>
        )}

        {/* Infinite Canvas Surface (Left Board in Split View, Full Board in Single View) */}
        <div
          ref={canvasContainerRef}
          onPointerDown={() => {
            if (isSplitView && activeBoardSide !== 'left') {
              setActiveBoardSide('left');
            }
          }}
          style={isSplitView ? { width: `${splitRatio}%`, flex: 'none' } : undefined}
          className={`relative overflow-hidden select-none touch-none ${
            isSplitView ? 'h-full shrink-0' : 'flex-1'
          } ${
            isSplitView && activeBoardSide === 'left'
              ? 'ring-2 ring-inset ring-[#136F63] shadow-[inset_0_0_20px_rgba(19,111,99,0.16)]'
              : ''
          }`}
        >
          {/* Left Board Focus Badge & Split Ratio Indicator when Split View is active */}
          {isSplitView && (
            <div
              data-no-zoom="true"
              className="no-print pointer-events-auto absolute top-2.5 left-2.5 z-30 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setActiveBoardSide('left')}
                className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[11.5px] font-bold shadow-sm transition-all ${
                  activeBoardSide === 'left'
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-slate-300 bg-white/95 text-slate-600 hover:border-[#136F63]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    activeBoardSide === 'left' ? 'bg-emerald-300' : 'bg-slate-400'
                  }`}
                />
                <span>
                  Bảng Trái {activeBoardSide === 'left' ? '· Đang thao tác' : ''}
                </span>
              </button>
              <span className="hidden rounded-[6px] border border-slate-200 bg-white/90 px-2 py-1 text-[10.5px] font-semibold text-slate-500 shadow-2xs sm:inline">
                Đề bài &amp; Hình vẽ ({splitRatio}%)
              </span>
            </div>
          )}

          {/* Dual-Canvas Layering:
              1) Bottom Main Layer (z-0): Background + all finalized strokes (never cleared on pointerMove)
              2) Top Active Layer (z-10): Current stroke in progress + snap guides via rAF (0ms latency) */}
          <canvas
            ref={mainCanvasRef}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full touch-none"
          />
          <canvas
            ref={activeCanvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerLeave}
            className={`absolute inset-0 z-10 h-full w-full touch-none ${
              activeTool === 'pan'
                ? 'cursor-grab active:cursor-grabbing'
                : activeTool === 'ai_lasso'
                  ? 'cursor-crosshair'
                  : 'cursor-crosshair'
            }`}
          />

          {/* Quick Paste Floating Pill when clipboard has copied objects and nothing is currently selected */}
          {clipboardData && totalSelectedCount === 0 && (
            <button
              type="button"
              onClick={handlePasteClipboard}
              title="Dán cụm đối tượng vừa sao chép lên trang bảng hiện tại (Ctrl+V)"
              className="absolute top-3 right-3 z-40 inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#136F63] bg-white/95 px-3.5 py-2 text-[13px] font-bold text-[#136F63] shadow-lg hover:bg-emerald-50"
            >
              <ClipboardPaste className="h-4 w-4" />
              <span>
                Dán ({clipboardData.strokes.length + clipboardData.widgets.length} đối tượng)
              </span>
            </button>
          )}

          {/* ================================================================
              FLOATING INSERTED RESOURCE WIDGETS (QUESTIONS, IMAGES, YOUTUBE, 3D, AI KATEX)
             ================================================================ */}
          <div
            style={{
              transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            className="pointer-events-none absolute inset-0 z-20"
          >
            {currentPage.widgets.map((widget) => {
              const isWidgetSelected = selectedWidgetIdSet.has(widget.id);
              const widgetBorderColor = widget.borderColor || '#136F63';
              const widgetBorderCss =
                widget.borderStyle === 'dashed'
                  ? 'dashed'
                  : widget.borderStyle === 'dotted'
                    ? 'dotted'
                    : 'solid';

              return (
              <div
                key={widget.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedWidgetIds([widget.id]);
                  setSelectedStrokeIds([]);
                  setOpenPopover('none');
                }}
                style={{
                  left: `${widget.x}px`,
                  top: `${widget.y}px`,
                  width: `${widget.width}px`,
                  height: `${widget.height}px`,
                  transform: widget.rotationDeg ? `rotate(${widget.rotationDeg}deg)` : undefined,
                  transformOrigin: 'center center',
                  borderColor: widgetBorderColor,
                  borderStyle: widgetBorderCss,
                }}
                className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-[8px] border-2 bg-white shadow-xl ${
                  isWidgetSelected ? 'ring-2 ring-[#136F63]/30' : ''
                }`}
              >
                {/* Widget Drag Header */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedWidgetIds([widget.id]);
                    setSelectedStrokeIds([]);
                    setOpenPopover('none');
                    e.currentTarget.setPointerCapture(e.pointerId);
                    widgetDragRef.current = {
                      widgetId: widget.id,
                      mode: 'move',
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: widget.x,
                      origY: widget.y,
                      origW: widget.width,
                      origH: widget.height,
                      didMutate: false,
                      preSnapshot: {
                        strokes: getEffectivePageStrokes(currentPage),
                        widgets: currentPage.widgets,
                      },
                    };
                  }}
                  onPointerMove={(e) => {
                    if (
                      widgetDragRef.current.widgetId !== widget.id ||
                      widgetDragRef.current.mode !== 'move'
                    )
                      return;
                    e.stopPropagation();
                    const dx = (e.clientX - widgetDragRef.current.startX) / zoom;
                    const dy = (e.clientY - widgetDragRef.current.startY) / zoom;
                    if (Math.hypot(dx, dy) > 1.5) {
                      widgetDragRef.current.didMutate = true;
                    }
                    updateWidgetInCurrentPage(widget.id, (w) => ({
                      ...w,
                      x: Math.round(widgetDragRef.current.origX + dx),
                      y: Math.round(widgetDragRef.current.origY + dy),
                    }));
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (widgetDragRef.current.didMutate && widgetDragRef.current.preSnapshot) {
                      pushUndoSnapshot(widgetDragRef.current.preSnapshot);
                    }
                    widgetDragRef.current.widgetId = null;
                    widgetDragRef.current.didMutate = false;
                    widgetDragRef.current.preSnapshot = null;
                  }}
                  style={{ backgroundColor: widgetBorderColor }}
                  className="flex cursor-move items-center justify-between gap-2 px-3 py-1.5 text-white select-none"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Move className="h-3.5 w-3.5 shrink-0 text-white/80" />
                    <span className="truncate text-[12.5px] font-bold">
                      <MathText text={widget.title} />
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {widget.type === 'bank_question' && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          updateWidgetInCurrentPage(widget.id, (w) => ({
                            ...w,
                            showSolution: !w.showSolution,
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
                      >
                        {widget.showSolution ? (
                          <>
                            <EyeOff className="h-3 w-3" />
                            <span>Ẩn lời giải</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3" />
                            <span>Lời giải</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeWidgetFromCurrentPage(widget.id)}
                      title="Gỡ thẻ này khỏi bảng"
                      className="rounded p-0.5 text-white/80 hover:bg-red-500 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Widget Content Body */}
                <div className="flex-1 overflow-y-auto p-3 text-slate-900">
                  {widget.type === 'bank_question' && widget.question && (
                    <div className="space-y-2.5 text-[14px] leading-relaxed">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-[#136F63]">
                          {widget.question.tag}
                        </span>
                        <span className="text-[12px] font-medium text-slate-500">
                          Lớp {widget.question.grade} · {widget.question.lesson}
                        </span>
                      </div>

                      <div className="text-justify font-medium text-slate-900">
                        <MathText
                          text={stripDuplicateHeadingFromStem(widget.question.stem, widget.title)}
                        />
                      </div>

                      {widget.question.diagram && (
                        <div className="my-2 flex justify-center rounded-[6px] border border-slate-200 bg-slate-50 p-2">
                          <ExamDiagram kind={widget.question.diagram} layer="stem" />
                        </div>
                      )}

                      {widget.question.image && (
                        <div className="my-2 flex justify-center">
                          <img
                            src={widget.question.image}
                            alt="Hình minh họa câu hỏi"
                            className="max-h-44 rounded object-contain"
                          />
                        </div>
                      )}

                      {widget.question.options && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {widget.question.options.map((opt, idx) => {
                            const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, idx);
                            const isCorrect =
                              widget.showSolution && widget.question?.correctIndex === idx;
                            return (
                              <div
                                key={letter}
                                className={`rounded-[6px] border px-2.5 py-1.5 text-[13.5px] ${
                                  isCorrect
                                    ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-900'
                                    : 'border-slate-200 bg-slate-50/70'
                                }`}
                              >
                                <span className="mr-1.5 font-bold text-[#136F63]">{letter}.</span>
                                <MathText text={cleanOpt} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {widget.question.statements && (
                        <div className="space-y-1.5 pt-1">
                          {widget.question.statements.map((st) => (
                            <div
                              key={st.label}
                              className="flex items-start justify-between gap-2 rounded-[6px] border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[13px]"
                            >
                              <div>
                                <strong className="mr-1 text-[#136F63]">{st.label})</strong>
                                <MathText text={st.text} />
                              </div>
                              {widget.showSolution && (
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                    st.isTrue
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {st.isTrue ? 'Đúng' : 'Sai'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {widget.showSolution && (
                        <div className="mt-2.5 rounded-[6px] border border-emerald-200 bg-emerald-50/60 p-2.5 text-[13px]">
                          <div className="font-bold text-[#136F63]">LỜI GIẢI CHI TIẾT:</div>
                          {normalizeSolutionSteps(
                            widget.question.solutionSteps && widget.question.solutionSteps.length > 0
                              ? widget.question.solutionSteps
                              : widget.question.statements?.map((st) => ({
                                  stepTitle: st.stepTitle,
                                  leadIn: st.leadIn,
                                  content: `${st.explanation} (${st.label}) ${st.isTrue ? 'Đúng' : 'Sai'})`,
                                }))
                          ).map((step, sIdx) => (
                            <div key={sIdx} className="mt-1.5 text-justify leading-relaxed text-slate-800">
                              <span className="font-bold text-[#136F63]">{step.label}</span>{' '}
                              <MathText text={step.body} />
                            </div>
                          ))}
                          {widget.question.answer ? (
                            <div className="mt-2 rounded-[6px] border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 font-bold text-rose-800">
                              <span className="mr-1.5">Đáp số / Kết luận:</span>
                              <MathText text={stripAnswerPrefix(widget.question.answer)} />
                            </div>
                          ) : widget.question.options && typeof widget.question.correctIndex === 'number' ? (
                            <div className="mt-2 rounded-[6px] border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 font-bold text-rose-800">
                              <MathText
                                text={`Kết luận: Chọn ${['A', 'B', 'C', 'D'][widget.question.correctIndex] ?? 'A'}.`}
                              />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}

                  {widget.type === 'image' && widget.imageUrl && (
                    <div className="flex h-full w-full items-center justify-center">
                      <img
                        src={widget.imageUrl}
                        alt={widget.title}
                        className="max-h-full max-w-full rounded object-contain"
                      />
                    </div>
                  )}

                  {widget.type === 'youtube' && widget.youtubeEmbedUrl && (
                    <div className="h-full w-full overflow-hidden rounded bg-black">
                      <iframe
                        src={widget.youtubeEmbedUrl}
                        title={widget.title}
                        className="h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}

                  {widget.type === 'geogebra_3d' && (
                    <div className="flex h-full flex-col">
                      <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-slate-200 pb-1.5">
                        <div className="flex items-center gap-1 text-[11.5px]">
                          <button
                            type="button"
                            onClick={() =>
                              updateWidgetInCurrentPage(widget.id, (w) => ({
                                ...w,
                                mathAppletMode: 'interactive_solid',
                              }))
                            }
                            className={`rounded px-2 py-0.5 font-semibold ${
                              widget.mathAppletMode !== 'geogebra_3d' &&
                              widget.mathAppletMode !== 'desmos_2d'
                                ? 'bg-[#136F63] text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            Khối 3D Tương tác
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateWidgetInCurrentPage(widget.id, (w) => ({
                                ...w,
                                mathAppletMode: 'geogebra_3d',
                              }))
                            }
                            className={`rounded px-2 py-0.5 font-semibold ${
                              widget.mathAppletMode === 'geogebra_3d'
                                ? 'bg-[#136F63] text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            GeoGebra 3D Live
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateWidgetInCurrentPage(widget.id, (w) => ({
                                ...w,
                                mathAppletMode: 'desmos_2d',
                              }))
                            }
                            className={`rounded px-2 py-0.5 font-semibold ${
                              widget.mathAppletMode === 'desmos_2d'
                                ? 'bg-[#136F63] text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            Desmos 2D
                          </button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-hidden rounded border border-slate-200">
                        {widget.mathAppletMode === 'geogebra_3d' ? (
                          <iframe
                            src="https://www.geogebra.org/3d?embed"
                            title="GeoGebra 3D"
                            className="h-full w-full border-0"
                          />
                        ) : widget.mathAppletMode === 'desmos_2d' ? (
                          <iframe
                            src="https://www.desmos.com/calculator?embed"
                            title="Desmos Graphing Calculator"
                            className="h-full w-full border-0"
                          />
                        ) : (
                          <Embedded3DSolidWidget
                            solidKind={widget.solidKind || 'pyramid_sabcd'}
                            onChangeKind={(nextKind) =>
                              updateWidgetInCurrentPage(widget.id, (w) => ({
                                ...w,
                                solidKind: nextKind,
                              }))
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {widget.type === 'ai_katex_card' && (
                    <div className="space-y-2.5 text-[14px]">
                      {widget.katexContent && (
                        <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/50 p-3 font-medium text-slate-900">
                          <MathText text={widget.katexContent} />
                        </div>
                      )}
                      {widget.stepsContent && widget.stepsContent.length > 0 && (
                        <div className="space-y-1.5 text-[13px]">
                          {normalizeSolutionSteps(widget.stepsContent).map((st, idx) => (
                            <div
                              key={idx}
                              className="rounded-[6px] border border-slate-200 bg-slate-50 p-2 text-justify leading-relaxed text-slate-800"
                            >
                              <span className="font-bold text-[#136F63]">{st.label}</span>{' '}
                              <MathText text={st.body} />
                            </div>
                          ))}
                        </div>
                      )}
                      {widget.finalAnswer && (
                        <div className="rounded-[6px] border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 font-bold text-rose-800">
                          <span className="mr-1.5">Đáp số / Kết luận:</span>
                          <MathText text={stripAnswerPrefix(widget.finalAnswer)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick Bottom-Right Resize Handle (hidden when unified 8-point Selection Frame is active) */}
                {!isWidgetSelected && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedWidgetIds([widget.id]);
                      setSelectedStrokeIds([]);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      widgetDragRef.current = {
                        widgetId: widget.id,
                        mode: 'resize',
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: widget.x,
                        origY: widget.y,
                        origW: widget.width,
                        origH: widget.height,
                        didMutate: false,
                        preSnapshot: {
                          strokes: getEffectivePageStrokes(currentPage),
                          widgets: currentPage.widgets,
                        },
                      };
                    }}
                    onPointerMove={(e) => {
                      if (
                        widgetDragRef.current.widgetId !== widget.id ||
                        widgetDragRef.current.mode !== 'resize'
                      )
                        return;
                      e.stopPropagation();
                      const dx = (e.clientX - widgetDragRef.current.startX) / zoom;
                      const dy = (e.clientY - widgetDragRef.current.startY) / zoom;
                      if (Math.hypot(dx, dy) > 1.5) {
                        widgetDragRef.current.didMutate = true;
                      }
                      updateWidgetInCurrentPage(widget.id, (w) => ({
                        ...w,
                        width: Math.max(240, Math.round(widgetDragRef.current.origW + dx)),
                        height: Math.max(140, Math.round(widgetDragRef.current.origH + dy)),
                      }));
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      if (widgetDragRef.current.didMutate && widgetDragRef.current.preSnapshot) {
                        pushUndoSnapshot(widgetDragRef.current.preSnapshot);
                      }
                      widgetDragRef.current.widgetId = null;
                      widgetDragRef.current.didMutate = false;
                      widgetDragRef.current.preSnapshot = null;
                    }}
                    title="Kéo góc để phóng to / thu nhỏ khung thẻ"
                    className="absolute right-0 bottom-0 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-tl bg-[#136F63] text-white"
                  >
                    <span className="h-2.5 w-2.5 border-r-2 border-b-2 border-white" />
                  </div>
                )}
              </div>
              );
            })}

            {/* ==============================================================
                VIRTUAL RULER OVERLAY (THƯỚC KẺ ẢO 20CM)
               ============================================================== */}
            {showRuler && (
              <div
                style={{
                  left: `${rulerState.x}px`,
                  top: `${rulerState.y}px`,
                  width: `${rulerState.lengthCm * 28}px`,
                  transform: `rotate(${rulerState.angle}deg)`,
                  transformOrigin: '0 0',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origX = rulerState.x;
                  const origY = rulerState.y;
                  const onMove = (mv: PointerEvent) => {
                    setRulerState((prev) => ({
                      ...prev,
                      x: Math.round(origX + (mv.clientX - startX) / zoom),
                      y: Math.round(origY + (mv.clientY - startY) / zoom),
                    }));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className="pointer-events-auto absolute h-20 cursor-move rounded-b-[6px] border-2 border-[#136F63] bg-amber-100/90 shadow-lg backdrop-blur-xs select-none"
              >
                {/* Centimeter Ticks along top edge */}
                <div className="relative flex h-6 w-full border-b border-[#136F63]/40">
                  {Array.from({ length: rulerState.lengthCm + 1 }).map((_, cm) => (
                    <div
                      key={cm}
                      style={{ left: `${cm * 28}px` }}
                      className="absolute top-0 flex flex-col items-center"
                    >
                      <div className="h-3.5 w-0.5 bg-slate-800" />
                      <span className="text-[9.5px] font-bold text-slate-800">{cm}</span>
                    </div>
                  ))}
                </div>

                {/* Ruler Controls */}
                <div className="flex items-center justify-between px-2.5 pt-2 text-[11px]">
                  <span className="font-bold text-[#136F63]">
                    Thước kẻ ảo ({rulerState.angle}°) — Viết sát mép trên để bắt dính nét thẳng
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setRulerState((r) => ({ ...r, angle: (r.angle - 15) % 360 }))
                      }
                      className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 shadow-2xs hover:bg-slate-100"
                    >
                      -15°
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setRulerState((r) => ({ ...r, angle: (r.angle + 15) % 360 }))
                      }
                      className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 shadow-2xs hover:bg-slate-100"
                    >
                      +15°
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={handleDrawAlongRuler}
                      className="rounded bg-[#136F63] px-2 py-0.5 font-bold text-white shadow-2xs hover:bg-[#0F594F]"
                    >
                      Kẻ nét theo mép thước
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setShowRuler(false)}
                      className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==============================================================
                VIRTUAL COMPASS OVERLAY (COMPA ẢO QUAY ĐƯỜNG TRÒN)
               ============================================================== */}
            {showCompass && (
              <div
                style={{
                  left: `${compassState.cx - compassState.radius}px`,
                  top: `${compassState.cy - compassState.radius}px`,
                  width: `${compassState.radius * 2}px`,
                  height: `${compassState.radius * 2}px`,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origCx = compassState.cx;
                  const origCy = compassState.cy;
                  const onMove = (mv: PointerEvent) => {
                    setCompassState((prev) => ({
                      ...prev,
                      cx: Math.round(origCx + (mv.clientX - startX) / zoom),
                      cy: Math.round(origCy + (mv.clientY - startY) / zoom),
                    }));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className="pointer-events-auto absolute flex cursor-move items-center justify-center rounded-full border-2 border-dashed border-[#0284C7] bg-sky-100/25 select-none"
              >
                <div className="h-3 w-3 rounded-full bg-red-600 ring-4 ring-white" />
                <div className="absolute -bottom-11 flex items-center gap-1.5 rounded-[6px] border border-[#0284C7] bg-white px-2.5 py-1 text-[11px] whitespace-nowrap shadow-md">
                  <span className="font-bold text-[#0369A1]">
                    Compa R = {(compassState.radius / 28).toFixed(1)}cm
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setCompassState((c) => ({ ...c, radius: Math.max(42, c.radius - 14) }))
                    }
                    className="rounded border px-1.5 py-0.5 font-bold hover:bg-slate-100"
                  >
                    -R
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setCompassState((c) => ({ ...c, radius: Math.min(280, c.radius + 14) }))
                    }
                    className="rounded border px-1.5 py-0.5 font-bold hover:bg-slate-100"
                  >
                    +R
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleDrawCompassCircle}
                    className="rounded bg-[#136F63] px-2 py-0.5 font-bold text-white hover:bg-[#0F594F]"
                  >
                    Quay vẽ đường tròn
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setShowCompass(false)}
                    className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* ==============================================================
                VIRTUAL PROTRACTOR OVERLAY (THƯỚC ĐO ĐỘ ẢO 180°)
               ============================================================== */}
            {showProtractor && (
              <div
                style={{
                  left: `${protractorState.x - 150}px`,
                  top: `${protractorState.y - 150}px`,
                  width: '300px',
                  height: '175px',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origX = protractorState.x;
                  const origY = protractorState.y;
                  const onMove = (mv: PointerEvent) => {
                    setProtractorState((prev) => ({
                      ...prev,
                      x: Math.round(origX + (mv.clientX - startX) / zoom),
                      y: Math.round(origY + (mv.clientY - startY) / zoom),
                    }));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className="pointer-events-auto absolute cursor-move select-none"
              >
                <svg viewBox="0 0 300 170" className="h-full w-full drop-shadow-md">
                  <path
                    d="M 10 150 A 140 140 0 0 1 290 150 Z"
                    fill="rgba(224, 242, 254, 0.82)"
                    stroke="#0369A1"
                    strokeWidth={2}
                  />
                  {[0, 30, 45, 60, 90, 120, 135, 150, 180].map((deg) => {
                    const rad = (deg * Math.PI) / 180;
                    const x1 = 150 + 115 * Math.cos(rad);
                    const y1 = 150 - 115 * Math.sin(rad);
                    const x2 = 150 + 138 * Math.cos(rad);
                    const y2 = 150 - 138 * Math.sin(rad);
                    const tx = 150 + 98 * Math.cos(rad);
                    const ty = 150 - 98 * Math.sin(rad);
                    return (
                      <g key={deg}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0369A1" strokeWidth={1.5} />
                        <text
                          x={tx}
                          y={ty}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={10}
                          fontWeight="700"
                          fill="#0F172A"
                        >
                          {deg}°
                        </text>
                      </g>
                    );
                  })}
                  {/* Red measurement ray */}
                  {(() => {
                    const rad = (protractorState.measureDeg * Math.PI) / 180;
                    const rx = 150 + 135 * Math.cos(rad);
                    const ry = 150 - 135 * Math.sin(rad);
                    return (
                      <line
                        x1={150}
                        y1={150}
                        x2={rx}
                        y2={ry}
                        stroke="#DC2626"
                        strokeWidth={2.5}
                      />
                    );
                  })()}
                  <circle cx={150} cy={150} r={5} fill="#DC2626" />
                </svg>
                <div className="mt-1 flex items-center justify-center gap-1.5 rounded-[6px] border border-[#0369A1] bg-white px-2.5 py-1 text-[11px] shadow-md">
                  <span className="font-bold text-[#0369A1]">
                    Góc: {protractorState.measureDeg}°
                  </span>
                  {[30, 45, 60, 90, 120].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setProtractorState((p) => ({ ...p, measureDeg: d }))}
                      className={`rounded px-1.5 py-0.5 font-bold ${
                        protractorState.measureDeg === d
                          ? 'bg-[#0369A1] text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {d}°
                    </button>
                  ))}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleStampProtractorAngle}
                    className="rounded bg-[#136F63] px-2 py-0.5 font-bold text-white"
                  >
                    Vẽ góc lên bảng
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setShowProtractor(false)}
                    className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* ==============================================================
                ANIMATED DASHED SMART LASSO PATH (MARCHING ANTS + AUTO-CLOSE)
               ============================================================== */}
            {freehandLasso && freehandLasso.points.length >= 2 && (() => {
              const pts = freehandLasso.points;
              const openPathD = pts
                .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(' ');
              const closedPathD = `${openPathD} Z`;
              const firstPt = pts[0];
              const lastPt = pts[pts.length - 1];
              const invZoom = 1 / Math.max(zoom, 0.35);
              const sw = Math.max(1.8, 2.6 * invZoom);
              const dashLen = 10 * invZoom;
              const gapLen = 6 * invZoom;

              return (
                <svg
                  className={`pointer-events-none absolute top-0 left-0 z-30 overflow-visible transition-opacity duration-200 ${
                    freehandLasso.closing ? 'opacity-80' : 'opacity-100'
                  }`}
                  width="1"
                  height="1"
                >
                  {/* Soft translucent teal fill inside the lasso region */}
                  <path
                    d={closedPathD}
                    fill={
                      freehandLasso.closing
                        ? 'rgba(19, 111, 99, 0.16)'
                        : 'rgba(19, 111, 99, 0.10)'
                    }
                    stroke="none"
                  />

                  {/* Subtle dashed auto-closing connector preview while actively drawing */}
                  {freehandLasso.active && pts.length >= 3 && (
                    <line
                      x1={lastPt.x}
                      y1={lastPt.y}
                      x2={firstPt.x}
                      y2={firstPt.y}
                      stroke="#136F63"
                      strokeOpacity="0.55"
                      strokeWidth={sw * 0.85}
                      strokeDasharray={`${dashLen * 0.7} ${gapLen}`}
                      strokeLinecap="round"
                    />
                  )}

                  {/* Animated Marching Ants Dashed Path in Deep Teal (#136F63) */}
                  <path
                    d={freehandLasso.active ? openPathD : closedPathD}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={sw + 1.4 * invZoom}
                    strokeOpacity="0.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={freehandLasso.active ? openPathD : closedPathD}
                    fill="none"
                    stroke="#136F63"
                    strokeWidth={sw}
                    strokeDasharray={`${dashLen} ${gapLen}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="smartboard-lasso-ants"
                  />

                  {/* Start-point anchor dot so teacher sees where loop closes */}
                  {freehandLasso.active && (
                    <circle
                      cx={firstPt.x}
                      cy={firstPt.y}
                      r={4.5 * invZoom}
                      fill="#FFFFFF"
                      stroke="#136F63"
                      strokeWidth={2 * invZoom}
                    />
                  )}
                </svg>
              );
            })()}

            {/* ==============================================================
                UNIFIED 9-POINT SELECT & TRANSFORM BOX + 44px FLOATING ACTION BAR
                Supports single stroke/shape/widget AND multi-object Smart Lasso groups
               ============================================================== */}
            {totalSelectedCount > 0 &&
              (() => {
                const isSingleWidgetTarget = Boolean(
                  selectedWidget && !selectedStroke && !isMultiSelection
                );

                // Compute selection frame box & rotation (single object vs multi-object group)
                let computedBox: TransformBox;
                let frameRotationDeg = 0;

                if (isMultiSelection) {
                  if (activeGroupRotateFrame) {
                    computedBox = activeGroupRotateFrame.box;
                    frameRotationDeg = activeGroupRotateFrame.angleDeg;
                  } else {
                    const memberBoxes: TransformBox[] = [];
                    for (const st of selectedStrokes) {
                      const sb = computeStrokeBoundingBox(st);
                      const a = computeRotatedBoxAABB(sb, getStrokeRotationDeg(st));
                      memberBoxes.push({
                        x: a.minX,
                        y: a.minY,
                        width: Math.max(24, a.maxX - a.minX),
                        height: Math.max(24, a.maxY - a.minY),
                      });
                    }
                    for (const w of selectedWidgets) {
                      const a = computeRotatedBoxAABB(
                        { x: w.x, y: w.y, width: w.width, height: w.height },
                        w.rotationDeg || 0
                      );
                      memberBoxes.push({
                        x: a.minX,
                        y: a.minY,
                        width: Math.max(24, a.maxX - a.minX),
                        height: Math.max(24, a.maxY - a.minY),
                      });
                    }
                    computedBox = computeUnionTransformBox(memberBoxes) || {
                      x: 100,
                      y: 100,
                      width: 120,
                      height: 80,
                    };
                    frameRotationDeg = 0;
                  }
                } else if (selectedStroke) {
                  computedBox = computeStrokeBoundingBox(selectedStroke);
                  frameRotationDeg = getStrokeRotationDeg(selectedStroke);
                } else {
                  computedBox = {
                    x: selectedWidget!.x,
                    y: selectedWidget!.y,
                    width: selectedWidget!.width,
                    height: selectedWidget!.height,
                  };
                  frameRotationDeg = selectedWidget?.rotationDeg || 0;
                }

                const targetBox = computedBox;
                const isTemplate = Boolean(
                  !isMultiSelection && selectedStroke?.templateId && selectedStroke?.templateBox
                );
                const tplCatalog =
                  !isMultiSelection && selectedStroke?.templateId
                    ? SMART_TEMPLATE_CATALOG.find((c) => c.id === selectedStroke.templateId)
                    : null;
                const tplCfg =
                  !isMultiSelection && selectedStroke
                    ? selectedStroke.templateConfig ||
                      (selectedStroke.templateId
                        ? createDefaultTemplateConfig(selectedStroke.templateId)
                        : null)
                    : null;

                const handleInvScale = Math.max(0.72, Math.min(1.8, 1 / Math.max(zoom, 0.35)));
                const toolbarScale = Math.max(0.76, Math.min(1.22, 1 / Math.max(zoom, 0.48)));
                const aabb = computeRotatedBoxAABB(targetBox, frameRotationDeg);

                const allSelectedDashed =
                  selectedStrokes.every((st) => st.lineStyle === 'dashed') &&
                  selectedWidgets.every((w) => w.borderStyle === 'dashed');
                const activeLineStyle: StrokeLineStyle = isMultiSelection
                  ? allSelectedDashed
                    ? 'dashed'
                    : 'solid'
                  : selectedStroke
                    ? selectedStroke.lineStyle || 'solid'
                    : selectedWidget?.borderStyle || 'solid';

                const activeColor: string = isMultiSelection
                  ? selectedStrokes[0]?.color || selectedWidgets[0]?.borderColor || '#136F63'
                  : selectedStroke
                    ? selectedStroke.color
                    : selectedWidget?.borderColor || '#136F63';

                const minW = isMultiSelection
                  ? 48
                  : isSingleWidgetTarget
                    ? 220
                    : isTemplate
                      ? 90
                      : 28;
                const minH = isMultiSelection
                  ? 48
                  : isSingleWidgetTarget
                    ? 120
                    : isTemplate
                      ? 80
                      : 28;

                const QUICK_PALETTE: Array<{ color: string; label: string }> = [
                  { color: '#0F172A', label: 'Đen' },
                  { color: '#0284C7', label: 'Xanh dương' },
                  { color: '#DC2626', label: 'Đỏ' },
                  { color: '#136F63', label: 'Xanh cổ vịt' },
                  { color: '#EAB308', label: 'Vàng' },
                  { color: '#FFFFFF', label: 'Trắng' },
                ];

                const syncPointsForBox = (b: TransformBox): StrokePoint[] => [
                  { x: b.x, y: b.y },
                  { x: b.x + b.width, y: b.y },
                  { x: b.x + b.width, y: b.y + b.height },
                  { x: b.x, y: b.y + b.height },
                  { x: b.x + b.width / 2, y: b.y + b.height / 2 },
                ];

                // Group / Single Move handler
                const startBoxMoveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const effectiveStrokes = getEffectivePageStrokes(currentPage);
                  const origWidgets = currentPage.widgets;
                  const preSnapshot: SmartboardHistorySnapshot = {
                    strokes: effectiveStrokes,
                    widgets: origWidgets,
                  };
                  const moveStrokeIds = new Set(selectedStrokeIds);
                  const moveWidgetIds = new Set(selectedWidgetIds);
                  let didMutate = false;

                  const onMove = (mv: PointerEvent) => {
                    const dx = (mv.clientX - startX) / zoom;
                    const dy = (mv.clientY - startY) / zoom;
                    if (Math.hypot(dx, dy) > 1.2) {
                      didMutate = true;
                    }
                    const nextStrokes = effectiveStrokes.map((st) => {
                      if (!moveStrokeIds.has(st.id)) return st;
                      if (st.templateBox) {
                        const nextBox: TransformBox = {
                          x: Math.round(st.templateBox.x + dx),
                          y: Math.round(st.templateBox.y + dy),
                          width: st.templateBox.width,
                          height: st.templateBox.height,
                        };
                        return {
                          ...st,
                          templateBox: nextBox,
                          points: syncPointsForBox(nextBox),
                        };
                      }
                      return {
                        ...st,
                        points: st.points.map((p) => ({
                          ...p,
                          x: p.x + dx,
                          y: p.y + dy,
                        })),
                      };
                    });
                    const nextWidgets = origWidgets.map((w) => {
                      if (!moveWidgetIds.has(w.id)) return w;
                      return {
                        ...w,
                        x: Math.round(w.x + dx),
                        y: Math.round(w.y + dy),
                      };
                    });
                    commitPageState(nextStrokes, nextWidgets, false);
                  };

                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    if (didMutate) {
                      pushUndoSnapshot(preSnapshot);
                    }
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                };

                // Group / Single 8-Point Resize handler
                const startResizeHandleDrag = (
                  e: React.PointerEvent<HTMLDivElement>,
                  dir: ResizeHandleDir
                ) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origBox = { ...targetBox };
                  const effectiveStrokes = getEffectivePageStrokes(currentPage);
                  const origWidgets = currentPage.widgets;
                  const preSnapshot: SmartboardHistorySnapshot = {
                    strokes: effectiveStrokes,
                    widgets: origWidgets,
                  };
                  const origStroke = selectedStroke;
                  const origRawBounds = origStroke ? getStrokeRawBounds(origStroke) : null;
                  const resizeStrokeIds = new Set(selectedStrokeIds);
                  const resizeWidgetIds = new Set(selectedWidgetIds);

                  // For multi-selection, precompute world-space points of any rotated strokes so non-uniform scaling is exact
                  const groupWorldPointsById = new Map<string, StrokePoint[]>();
                  if (isMultiSelection) {
                    for (const st of effectiveStrokes) {
                      if (!resizeStrokeIds.has(st.id) || st.templateBox) continue;
                      const rot = getStrokeRotationDeg(st);
                      if (Math.abs(rot) > 0.01) {
                        const rb = getStrokeRawBounds(st);
                        groupWorldPointsById.set(
                          st.id,
                          st.points.map((p) => {
                            const rp = rotatePointAround(p.x, p.y, rb.cx, rb.cy, rot);
                            return { ...p, x: rp.x, y: rp.y };
                          })
                        );
                      } else {
                        groupWorldPointsById.set(st.id, st.points);
                      }
                    }
                  }

                  let didMutate = false;

                  const onMove = (mv: PointerEvent) => {
                    const worldDx = (mv.clientX - startX) / zoom;
                    const worldDy = (mv.clientY - startY) / zoom;
                    if (Math.hypot(worldDx, worldDy) > 1.2) {
                      didMutate = true;
                    }
                    const nextBox = computeResizedBox({
                      origBox,
                      dir,
                      worldDx,
                      worldDy,
                      rotationDeg: isMultiSelection ? 0 : frameRotationDeg,
                      lockAspectRatio: mv.shiftKey || aspectRatioLocked,
                      minWidth: minW,
                      minHeight: minH,
                    });

                    setActiveTransformBadge({
                      kind: 'resize',
                      width: Math.round(nextBox.width),
                      height: Math.round(nextBox.height),
                    });

                    if (isMultiSelection) {
                      const sx = nextBox.width / Math.max(1, origBox.width);
                      const sy = nextBox.height / Math.max(1, origBox.height);

                      const nextStrokes = effectiveStrokes.map((st) => {
                        if (!resizeStrokeIds.has(st.id)) return st;
                        if (st.templateBox) {
                          const tb = st.templateBox;
                          const newTb: TransformBox = {
                            x: Math.round(nextBox.x + (tb.x - origBox.x) * sx),
                            y: Math.round(nextBox.y + (tb.y - origBox.y) * sy),
                            width: Math.max(48, Math.round(tb.width * sx)),
                            height: Math.max(40, Math.round(tb.height * sy)),
                          };
                          return {
                            ...st,
                            templateBox: newTb,
                            points: syncPointsForBox(newTb),
                          };
                        }
                        const srcPts = groupWorldPointsById.get(st.id) || st.points;
                        return {
                          ...st,
                          rotationDeg: 0,
                          points: srcPts.map((p) => ({
                            ...p,
                            x: nextBox.x + (p.x - origBox.x) * sx,
                            y: nextBox.y + (p.y - origBox.y) * sy,
                          })),
                        };
                      });

                      const nextWidgets = origWidgets.map((w) => {
                        if (!resizeWidgetIds.has(w.id)) return w;
                        return {
                          ...w,
                          x: Math.round(nextBox.x + (w.x - origBox.x) * sx),
                          y: Math.round(nextBox.y + (w.y - origBox.y) * sy),
                          width: Math.max(180, Math.round(w.width * sx)),
                          height: Math.max(100, Math.round(w.height * sy)),
                        };
                      });

                      commitPageState(nextStrokes, nextWidgets, false);
                    } else if (origStroke) {
                      if (origStroke.templateBox) {
                        const roundedBox: TransformBox = {
                          x: Math.round(nextBox.x),
                          y: Math.round(nextBox.y),
                          width: Math.round(nextBox.width),
                          height: Math.round(nextBox.height),
                        };
                        updateSelectedStroke(
                          (st) => ({
                            ...st,
                            templateBox: roundedBox,
                            points: syncPointsForBox(roundedBox),
                          }),
                          false
                        );
                      } else if (origRawBounds) {
                        const mappedPts = mapPointsToResizedBox(
                          origStroke.points,
                          origRawBounds,
                          nextBox,
                          8
                        );
                        updateSelectedStroke(
                          (st) => ({
                            ...st,
                            points: mappedPts,
                          }),
                          false
                        );
                      }
                    } else if (selectedWidget) {
                      updateSelectedWidget(
                        (w) => ({
                          ...w,
                          x: Math.round(nextBox.x),
                          y: Math.round(nextBox.y),
                          width: Math.round(nextBox.width),
                          height: Math.round(nextBox.height),
                        }),
                        false
                      );
                    }
                  };

                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    setActiveTransformBadge(null);
                    if (didMutate) {
                      pushUndoSnapshot(preSnapshot);
                    }
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                };

                // Group / Single 360° Rotation handler
                const startRotationDrag = (e: React.PointerEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const origBox = { ...targetBox };
                  const cx = origBox.x + origBox.width / 2;
                  const cy = origBox.y + origBox.height / 2;
                  const effectiveStrokes = getEffectivePageStrokes(currentPage);
                  const origWidgets = currentPage.widgets;
                  const preSnapshot: SmartboardHistorySnapshot = {
                    strokes: effectiveStrokes,
                    widgets: origWidgets,
                  };
                  const rotStrokeIds = new Set(selectedStrokeIds);
                  const rotWidgetIds = new Set(selectedWidgetIds);
                  let didMutate = false;

                  setActiveTransformBadge({
                    kind: 'rotate',
                    angleDeg: Math.round(normalizeAngleDeg(frameRotationDeg)),
                  });

                  const onMove = (mv: PointerEvent) => {
                    const worldPtr = screenToWorld(mv.clientX, mv.clientY);
                    const rawDeg =
                      (Math.atan2(worldPtr.y - cy, worldPtr.x - cx) * 180) / Math.PI + 90;
                    const nextDeg = snapRotationDeg(rawDeg, mv.shiftKey);
                    didMutate = true;

                    setActiveTransformBadge({
                      kind: 'rotate',
                      angleDeg: nextDeg,
                    });

                    if (isMultiSelection) {
                      setActiveGroupRotateFrame({ box: origBox, angleDeg: nextDeg });
                      const nextStrokes = effectiveStrokes.map((st) => {
                        if (!rotStrokeIds.has(st.id)) return st;
                        const origRot = getStrokeRotationDeg(st);
                        const newRot = normalizeAngleDeg(origRot + nextDeg);
                        if (st.templateBox) {
                          const tb = st.templateBox;
                          const scx = tb.x + tb.width / 2;
                          const scy = tb.y + tb.height / 2;
                          const rotCenter = rotatePointAround(scx, scy, cx, cy, nextDeg);
                          const newTb: TransformBox = {
                            x: Math.round(rotCenter.x - tb.width / 2),
                            y: Math.round(rotCenter.y - tb.height / 2),
                            width: tb.width,
                            height: tb.height,
                          };
                          return {
                            ...st,
                            rotationDeg: newRot,
                            templateBox: newTb,
                            templateConfig: st.templateConfig
                              ? { ...st.templateConfig, rotationDeg: newRot }
                              : st.templateConfig,
                            points: syncPointsForBox(newTb),
                          };
                        }
                        const rb = getStrokeRawBounds(st);
                        const rotCenter = rotatePointAround(rb.cx, rb.cy, cx, cy, nextDeg);
                        const dx = rotCenter.x - rb.cx;
                        const dy = rotCenter.y - rb.cy;
                        return {
                          ...st,
                          rotationDeg: newRot,
                          points: st.points.map((p) => ({
                            ...p,
                            x: p.x + dx,
                            y: p.y + dy,
                          })),
                        };
                      });

                      const nextWidgets = origWidgets.map((w) => {
                        if (!rotWidgetIds.has(w.id)) return w;
                        const wcx = w.x + w.width / 2;
                        const wcy = w.y + w.height / 2;
                        const rotCenter = rotatePointAround(wcx, wcy, cx, cy, nextDeg);
                        return {
                          ...w,
                          x: Math.round(rotCenter.x - w.width / 2),
                          y: Math.round(rotCenter.y - w.height / 2),
                          rotationDeg: normalizeAngleDeg((w.rotationDeg || 0) + nextDeg),
                        };
                      });

                      commitPageState(nextStrokes, nextWidgets, false);
                    } else if (selectedStroke) {
                      updateSelectedStroke(
                        (st) => ({
                          ...st,
                          rotationDeg: nextDeg,
                          templateConfig: st.templateConfig
                            ? { ...st.templateConfig, rotationDeg: nextDeg }
                            : st.templateConfig,
                        }),
                        false
                      );
                    } else if (selectedWidget) {
                      updateSelectedWidget(
                        (w) => ({
                          ...w,
                          rotationDeg: nextDeg,
                        }),
                        false
                      );
                    }
                  };

                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    setActiveTransformBadge(null);
                    setActiveGroupRotateFrame(null);
                    if (didMutate) {
                      pushUndoSnapshot(preSnapshot);
                    }
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                };

                const handleResetRotation = () => {
                  const effectiveStrokes = getEffectivePageStrokes(currentPage);
                  const nextStrokes = effectiveStrokes.map((st) =>
                    selectedStrokeIdSet.has(st.id)
                      ? {
                          ...st,
                          rotationDeg: 0,
                          templateConfig: st.templateConfig
                            ? { ...st.templateConfig, rotationDeg: 0 }
                            : st.templateConfig,
                        }
                      : st
                  );
                  const nextWidgets = currentPage.widgets.map((w) =>
                    selectedWidgetIdSet.has(w.id) ? { ...w, rotationDeg: 0 } : w
                  );
                  commitPageState(nextStrokes, nextWidgets, true);
                  showToast('Đã đưa góc xoay về 0°.');
                };

                return (
                  <>
                    {/* 1. Rotated Dashed Teal (#136F63) Selection Frame + 9 Touch Controls */}
                    <div
                      style={{
                        left: `${targetBox.x}px`,
                        top: `${targetBox.y}px`,
                        width: `${targetBox.width}px`,
                        height: `${targetBox.height}px`,
                        transform: frameRotationDeg
                          ? `rotate(${frameRotationDeg}deg)`
                          : undefined,
                        transformOrigin: 'center center',
                      }}
                      onPointerDown={!isSingleWidgetTarget ? startBoxMoveDrag : undefined}
                      className={`absolute z-40 rounded-[6px] border-2 border-dashed border-[#136F63] select-none ${
                        isSingleWidgetTarget
                          ? 'pointer-events-none bg-transparent'
                          : 'pointer-events-auto cursor-move bg-emerald-500/[0.06]'
                      }`}
                    >
                      {/* Group count badge on top-left corner when multiple objects are grouped */}
                      {isMultiSelection && (
                        <div
                          style={{
                            transform: `rotate(${-frameRotationDeg}deg) scale(${Math.min(1.2, handleInvScale)})`,
                            transformOrigin: 'bottom left',
                          }}
                          className="pointer-events-none absolute -top-7 left-0 rounded-md bg-[#136F63] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap shadow-md"
                        >
                          Nhóm {totalSelectedCount} đối tượng
                        </div>
                      )}

                      {/* Top-Center Rotation Stem & 360° Touch Rotation Handle (40×40px hit-area) */}
                      <div
                        style={{
                          left: '50%',
                          top: `${-34 * handleInvScale}px`,
                          height: `${34 * handleInvScale}px`,
                          transform: 'translateX(-50%)',
                        }}
                        className="pointer-events-none absolute w-[2px] bg-[#136F63]"
                      />
                      <div
                        onPointerDown={startRotationDrag}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleResetRotation();
                        }}
                        style={{
                          left: '50%',
                          top: `${-38 * handleInvScale}px`,
                          transform: `translate(-50%, -50%) scale(${handleInvScale})`,
                        }}
                        title="Kéo để xoay 360° (Giữ Shift bắt bước 15°, nhấp đúp để đặt lại 0°)"
                        className="pointer-events-auto absolute flex h-10 w-10 touch-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#136F63] text-white shadow-md transition-transform hover:scale-110">
                          <RotateCw className="h-3.5 w-3.5" />
                        </div>

                        {/* Upright Angle Readout Badge (e.g. 30°, 45°) */}
                        {(activeTransformBadge?.kind === 'rotate' ||
                          Math.round(normalizeAngleDeg(frameRotationDeg)) !== 0) && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetRotation();
                            }}
                            style={{
                              transform: `rotate(${-frameRotationDeg}deg)`,
                            }}
                            title="Bấm để đưa góc xoay về 0°"
                            className={`absolute -top-7 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap shadow-md transition-colors ${
                              activeTransformBadge?.kind === 'rotate'
                                ? 'bg-[#0F172A] text-white ring-2 ring-[#136F63]'
                                : 'border border-[#136F63] bg-white text-[#136F63] hover:bg-emerald-50'
                            }`}
                          >
                            {activeTransformBadge?.kind === 'rotate'
                              ? `${activeTransformBadge.angleDeg}°`
                              : `${Math.round(normalizeAngleDeg(frameRotationDeg))}°`}
                          </button>
                        )}
                      </div>

                      {/* Live Resize Dimensions Readout Badge */}
                      {activeTransformBadge?.kind === 'resize' && (
                        <div
                          style={{
                            transform: `translate(-50%, -50%) rotate(${-frameRotationDeg}deg) scale(${handleInvScale})`,
                          }}
                          className="pointer-events-none absolute top-1/2 left-1/2 z-50 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11.5px] font-bold text-white whitespace-nowrap shadow-lg"
                        >
                          {activeTransformBadge.width} × {activeTransformBadge.height} px
                        </div>
                      )}

                      {/* 8-Point Resize Handles (4 Corners + 4 Edge Midpoints, 36×36px Touch Hit-Area) */}
                      {RESIZE_HANDLE_CONFIGS.map((h) => {
                        const dynamicCursor = getRotatedResizeCursor(h.dir, frameRotationDeg);
                        const isHorizontalEdge = h.dir === 'n' || h.dir === 's';
                        return (
                          <div
                            key={h.dir}
                            onPointerDown={(e) => startResizeHandleDrag(e, h.dir)}
                            style={{
                              left: `${h.leftPct}%`,
                              top: `${h.topPct}%`,
                              transform: `translate(-50%, -50%) scale(${handleInvScale})`,
                              cursor: dynamicCursor,
                            }}
                            title={h.label}
                            className="pointer-events-auto absolute z-40 flex h-9 w-9 touch-none items-center justify-center"
                          >
                            {h.isCorner ? (
                              <span className="h-3.5 w-3.5 rounded-[4px] border-[2.5px] border-[#136F63] bg-white shadow-md transition-transform hover:scale-125" />
                            ) : isHorizontalEdge ? (
                              <span className="h-2.5 w-5 rounded-full border-2 border-[#136F63] bg-white shadow-md transition-transform hover:scale-110" />
                            ) : (
                              <span className="h-5 w-2.5 rounded-full border-2 border-[#136F63] bg-white shadow-md transition-transform hover:scale-110" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 2. Upright 44px Touch Floating Action Bar DIRECTLY BELOW Selection Box */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        left: `${aabb.centerX}px`,
                        top: `${aabb.maxY + 24 / Math.max(zoom, 0.45)}px`,
                        transform: `translateX(-50%) scale(${toolbarScale})`,
                        transformOrigin: 'top center',
                      }}
                      className="pointer-events-auto absolute z-50 flex flex-col items-center gap-1.5 rounded-[12px] border-2 border-[#136F63] bg-white/98 p-2 text-[12px] whitespace-nowrap shadow-2xl backdrop-blur-xs select-none"
                    >
                      {/* Primary 44px Touch Action Row */}
                      <div className="flex items-center gap-1.5">
                        {/* 1. Sao chép (Copy - Ctrl+C) */}
                        <button
                          type="button"
                          onClick={handleCopySelection}
                          title="Sao chép vùng chọn vào bộ nhớ tạm (Ctrl+C)"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-700 transition-colors hover:border-[#136F63] hover:bg-emerald-50 hover:text-[#136F63]"
                        >
                          <ClipboardCopy className="h-4 w-4" />
                          <span>Sao chép</span>
                        </button>

                        {/* 1B. Dán (Paste - Ctrl+V) when clipboard is populated */}
                        {clipboardData && (
                          <button
                            type="button"
                            onClick={handlePasteClipboard}
                            title="Dán cụm đối tượng từ bộ nhớ tạm (Ctrl+V)"
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#136F63]/40 bg-emerald-50/70 px-3 py-2 font-bold text-[#136F63] transition-colors hover:bg-emerald-100"
                          >
                            <ClipboardPaste className="h-4 w-4" />
                            <span>Dán</span>
                          </button>
                        )}

                        {/* 2. Nhân bản tại chỗ (Duplicate - Ctrl+D, lệch 24px) */}
                        <button
                          type="button"
                          onClick={handleDuplicateSelection}
                          title="Nhân bản tại chỗ lệch sang bên 24px (Ctrl+D)"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-700 transition-colors hover:border-[#136F63] hover:bg-emerald-50 hover:text-[#136F63]"
                        >
                          <Copy className="h-4 w-4" />
                          <span>Nhân bản</span>
                        </button>

                        {/* 3. Chuyển nét Liền / Đứt (— / - -) đồng loạt */}
                        <button
                          type="button"
                          onClick={handleToggleQuickLineStyle}
                          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] px-3 py-2 font-bold transition-colors ${
                            activeLineStyle === 'dashed'
                              ? 'bg-[#136F63] text-white hover:bg-[#0F594F]'
                              : 'border border-[#136F63] bg-emerald-50 text-[#136F63] hover:bg-emerald-100'
                          }`}
                          title="Chuyển đồng loạt toàn bộ nét trong vùng chọn giữa Nét liền (—) và Nét đứt (- -) (Phím tắt: D)"
                        >
                          <span className="font-mono text-[13px] tracking-tighter">
                            {activeLineStyle === 'dashed' ? '- -' : '———'}
                          </span>
                          <span>
                            {activeLineStyle === 'dashed' ? 'Nét đứt' : 'Nét liền'}
                          </span>
                        </button>

                        {/* 4. Khóa tỷ lệ (Shift alternative for touchscreens) */}
                        <button
                          type="button"
                          onClick={() => setAspectRatioLocked((v) => !v)}
                          className={`inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border px-2.5 py-2 font-bold transition-colors ${
                            aspectRatioLocked
                              ? 'border-[#136F63] bg-[#136F63] text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                          title={
                            aspectRatioLocked
                              ? 'Đang khóa tỷ lệ khi kéo góc'
                              : 'Tự do co giãn tỷ lệ (giữ Shift để khóa tạm thời)'
                          }
                        >
                          {aspectRatioLocked ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                          <span>Tỷ lệ</span>
                        </button>

                        <span className="h-7 w-px bg-slate-200" />

                        {/* 5. Đổi màu mực hàng loạt */}
                        <div className="flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-slate-200 bg-slate-50/70 px-2">
                          {QUICK_PALETTE.map((c) => (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() => handleBatchChangeColor(c.color)}
                              title={`Đổi màu mực hàng loạt sang ${c.label}`}
                              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                                activeColor.toLowerCase() === c.color.toLowerCase()
                                  ? 'scale-110 border-[#136F63] ring-2 ring-[#136F63]/40'
                                  : 'border-slate-300'
                              }`}
                              style={{ backgroundColor: c.color }}
                            />
                          ))}
                        </div>

                        <span className="h-7 w-px bg-slate-200" />

                        {/* 6. Xóa vùng chọn (Delete) */}
                        <button
                          type="button"
                          onClick={handleDeleteSelectedObject}
                          title="Xóa toàn bộ vùng chọn (Delete)"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] bg-red-50 px-3 py-2 font-bold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Xóa</span>
                        </button>

                        {/* 7. Bỏ chọn (Esc) */}
                        <button
                          type="button"
                          onClick={clearSelection}
                          title="Bỏ chọn vùng (Esc)"
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Secondary Row: 3D Solid & Conic Template Controls OR Technical Line Presets */}
                      {isTemplate && tplCfg ? (
                        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedStroke((st) => ({
                                ...st,
                                templateConfig: {
                                  ...(st.templateConfig || tplCfg),
                                  showLabels: !tplCfg.showLabels,
                                },
                              }))
                            }
                            className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-bold transition-colors ${
                              tplCfg.showLabels
                                ? 'bg-[#136F63] text-white'
                                : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Bật / Tắt tên các đỉnh (S, A, B, C, D, O, F₁, F₂...)"
                          >
                            <Tag className="h-3 w-3" />
                            <span>{tplCfg.showLabels ? 'Tên đỉnh: BẬT' : '+ Tên đỉnh'}</span>
                          </button>

                          {tplCatalog?.variants && tplCatalog.variants.length > 1 && (
                            <select
                              value={tplCfg.variant}
                              onChange={(e) =>
                                updateSelectedStroke((st) => ({
                                  ...st,
                                  templateConfig: {
                                    ...(st.templateConfig || tplCfg),
                                    variant: e.target.value,
                                  },
                                }))
                              }
                              className="rounded-[5px] border border-emerald-300 bg-emerald-50/70 px-1.5 py-1 text-[11px] font-bold text-[#136F63] focus:outline-none"
                            >
                              {tplCatalog.variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          )}

                          <div className="flex items-center gap-0.5 rounded-[5px] border border-slate-200 bg-slate-50 px-1 py-0.5 text-[11px]">
                            <span className="px-1 font-semibold text-slate-600">Góc nhìn:</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedStroke((st) => ({
                                  ...st,
                                  templateConfig: {
                                    ...(st.templateConfig || tplCfg),
                                    viewSkewX: Math.max(
                                      -0.45,
                                      Number(((tplCfg.viewSkewX || 0) - 0.08).toFixed(2))
                                    ),
                                  },
                                }))
                              }
                              title="Nghiêng góc nhìn sang trái"
                              className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 shadow-2xs hover:bg-emerald-50"
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedStroke((st) => ({
                                  ...st,
                                  templateConfig: {
                                    ...(st.templateConfig || tplCfg),
                                    viewSkewX: Math.min(
                                      0.45,
                                      Number(((tplCfg.viewSkewX || 0) + 0.08).toFixed(2))
                                    ),
                                  },
                                }))
                              }
                              title="Nghiêng góc nhìn sang phải"
                              className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 shadow-2xs hover:bg-emerald-50"
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedStroke((st) => ({
                                  ...st,
                                  templateConfig: {
                                    ...(st.templateConfig || tplCfg),
                                    viewTiltY:
                                      (tplCfg.viewTiltY || 0) >= 0.14
                                        ? -0.08
                                        : Number(((tplCfg.viewTiltY || 0) + 0.07).toFixed(2)),
                                  },
                                }))
                              }
                              title="Đổi độ mở mặt đáy 3D"
                              className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 shadow-2xs hover:bg-emerald-50"
                            >
                              Đáy ⇅
                            </button>
                          </div>
                        </div>
                      ) : selectedStrokes.length > 0 ? (
                        <div className="flex items-center gap-1 border-t border-slate-100 pt-1.5 text-[11px]">
                          <span className="pr-1 font-semibold text-slate-500">Kiểu nét:</span>
                          {LINE_STYLE_PRESETS.map((ls) => (
                            <button
                              key={ls.id}
                              type="button"
                              onClick={() => handleBatchChangeLineStyle(ls.id)}
                              className={`rounded-[5px] border px-2.5 py-1 font-bold ${
                                activeLineStyle === ls.id
                                  ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {ls.shortLabel}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </>
                );
              })()}

            {/* ==============================================================
                AI PEN LASSO SELECTION BOX & ACTION POPUP
               ============================================================== */}
            {lassoRect && (
              <div
                style={{
                  left: `${Math.min(lassoRect.startX, lassoRect.endX)}px`,
                  top: `${Math.min(lassoRect.startY, lassoRect.endY)}px`,
                  width: `${Math.abs(lassoRect.endX - lassoRect.startX)}px`,
                  height: `${Math.abs(lassoRect.endY - lassoRect.startY)}px`,
                }}
                className="pointer-events-auto absolute rounded-[8px] border-2 border-dashed border-[#136F63] bg-emerald-400/10"
              >
                {!lassoRect.active && (
                  <div className="absolute -bottom-14 left-0 z-50 flex items-center gap-1.5 rounded-[8px] border border-[#136F63] bg-white p-1.5 whitespace-nowrap shadow-xl">
                    <button
                      type="button"
                      disabled={aiOcrLoading}
                      onClick={() => runAiPenOcr('ocr_katex')}
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#0F594F] disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>
                        {aiOcrLoading ? 'Đang xử lý AI...' : 'Chuyển viết tay → KaTeX sắc nét'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={aiOcrLoading}
                      onClick={() => runAiPenOcr('explain_steps')}
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#0369A1] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-sky-800 disabled:opacity-50"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Giải thích nhanh từng bước</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLassoRect(null);
                        setAiOcrResult(null);
                      }}
                      className="rounded-[6px] p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================================================================
              SPOTLIGHT OVERLAY (ĐÈN RỌI TẬP TRUNG SỰ CHÚ Ý)
             ================================================================ */}
          {spotlightActive && (
            <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
              <div
                style={{
                  left: `${spotlightBox.x}px`,
                  top: `${spotlightBox.y}px`,
                  width: `${spotlightBox.w}px`,
                  height: `${spotlightBox.h}px`,
                  boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.80)',
                  borderRadius: spotlightShape === 'circle' ? '9999px' : '12px',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origX = spotlightBox.x;
                  const origY = spotlightBox.y;
                  const onMove = (mv: PointerEvent) => {
                    setSpotlightBox((prev) => ({
                      ...prev,
                      x: origX + (mv.clientX - startX),
                      y: origY + (mv.clientY - startY),
                    }));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className="pointer-events-auto absolute cursor-move border-2 border-amber-400"
              >
                <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-[11.5px] font-bold whitespace-nowrap text-slate-950 shadow-md">
                  <span>Đèn rọi (Kéo để di chuyển)</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setSpotlightBox((b) => ({ ...b, w: b.w + 40, h: b.h + 40 }))
                    }
                    className="rounded bg-white/80 px-1.5"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setSpotlightBox((b) => ({
                        ...b,
                        w: Math.max(140, b.w - 40),
                        h: Math.max(120, b.h - 40),
                      }))
                    }
                    className="rounded bg-white/80 px-1.5"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSpotlightActive(false)}
                    className="rounded bg-red-600 px-1.5 text-white"
                  >
                    Tắt
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN SHADE OVERLAY (RÈM CHE KÉO TRƯỢT TỪNG DÒNG)
             ================================================================ */}
          {screenShadeActive && (
            <div
              style={
                screenShadeDir === 'top'
                  ? {
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: `${screenShadeCoverPos}px`,
                    }
                  : {
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: `${screenShadeCoverPos}px`,
                    }
              }
              className="pointer-events-auto absolute z-30 flex flex-col items-center justify-center bg-[#0F2922]/96 text-white shadow-2xl select-none"
            >
              {/* Drag Handle */}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origPos = screenShadeCoverPos;
                  const onMove = (mv: PointerEvent) => {
                    if (screenShadeDir === 'top') {
                      const dy = mv.clientY - startY;
                      setScreenShadeCoverPos(Math.max(70, Math.min(760, origPos - dy)));
                    } else {
                      const dx = mv.clientX - startX;
                      setScreenShadeCoverPos(Math.max(90, Math.min(1200, origPos - dx)));
                    }
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className={
                  screenShadeDir === 'top'
                    ? 'absolute top-0 inset-x-0 flex h-10 cursor-ns-resize items-center justify-center gap-3 bg-[#136F63] text-[12.5px] font-bold shadow-md'
                    : 'absolute left-0 inset-y-0 flex w-10 cursor-ew-resize flex-col items-center justify-center gap-3 bg-[#136F63] text-[12.5px] font-bold shadow-md'
                }
              >
                <span className="rounded-full bg-white/30 px-3 py-0.5 text-[11px]">
                  {screenShadeDir === 'top'
                    ? '⇅ Kéo thanh này xuống để mở dần từng dòng lời giải'
                    : '⇆ Kéoצא'}
                </span>
              </div>

              <div className="text-center">
                <div className="text-[15px] font-bold text-emerald-200">
                  RÈM CHE BẢNG TƯƠNG TÁC (SCREEN SHADE)
                </div>
                <p className="mt-1 text-[12.5px] text-emerald-100/80">
                  Kéo tay nắm màu xanh cổ vịt để hé mở từng bước lời giải khi giảng bài.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setScreenShadeDir((d) => (d === 'top' ? 'left' : 'top'))
                    }
                    className="rounded-[6px] border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-semibold hover:bg-white/20"
                  >
                    Đổi hướng kéo ({screenShadeDir === 'top' ? 'Trái → Phải' : 'Trên → Dưới'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenShadeActive(false)}
                    className="rounded-[6px] bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-red-700"
                  >
                    Mở toàn bộ rèm che
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              AI PEN & MATH OCR RESULT PANEL
             ================================================================ */}
          {aiOcrResult && (
            <div
              data-no-zoom="true"
              className="no-print absolute top-4 right-4 z-50 w-full max-w-md overflow-hidden rounded-[10px] border-2 border-[#136F63] bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between bg-[#136F63] px-4 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-200" />
                  <span className="text-[13.5px] font-bold">
                    Trợ lý Bút AI &amp; Math OCR (Gemini AI)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiOcrResult(null)}
                  className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4 text-[13.5px]">
                <div>
                  <div className="text-[11.5px] font-bold text-slate-500 uppercase">
                    1. Văn bản &amp; Công thức KaTeX nhận diện sắc nét:
                  </div>
                  <div className="mt-1 rounded-[6px] border border-emerald-200 bg-emerald-50/60 p-3 font-medium text-slate-900">
                    <MathText text={aiOcrResult.katexText} />
                  </div>
                </div>

                {aiOcrResult.steps.length > 0 && (
                  <div>
                    <div className="text-[11.5px] font-bold text-slate-500 uppercase">
                      2. Giải thích nhanh từng bước trên màn hình lớn:
                    </div>
                    <div className="mt-1.5 space-y-2">
                      {normalizeSolutionSteps(aiOcrResult.steps).map((step, idx) => (
                        <div
                          key={idx}
                          className="rounded-[6px] border border-slate-200 bg-slate-50 p-2.5 text-justify leading-relaxed text-slate-800"
                        >
                          <span className="font-bold text-[#136F63]">{step.label}</span>{' '}
                          <MathText text={step.body} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiOcrResult.finalAnswer && (
                  <div className="rounded-[6px] border border-rose-200 bg-rose-50/80 px-3 py-2 font-bold text-rose-800">
                    <span className="mr-1.5">Đáp số / Kết luận:</span>
                    <MathText text={stripAnswerPrefix(aiOcrResult.finalAnswer)} />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleInsertAiCardOntoBoard(false)}
                    className="flex-1 rounded-[6px] border border-[#136F63] bg-white px-3 py-2 text-[12.5px] font-bold text-[#136F63] hover:bg-emerald-50"
                  >
                    + Thả thẻ Công thức KaTeX
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertAiCardOntoBoard(true)}
                    className="flex-1 rounded-[6px] bg-[#136F63] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#0F594F]"
                  >
                    + Thả cả Lời giải lên bảng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              LIVE POP QUIZ QR & REAL-TIME BAR CHART PANEL
             ================================================================ */}
          {popQuizOpen && (
            <div
              data-no-zoom="true"
              className="no-print absolute top-3 right-3 z-40 w-full max-w-[390px] overflow-hidden rounded-[10px] border-2 border-[#0369A1] bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between bg-[#0369A1] px-3.5 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  <div>
                    <div className="text-[13px] font-bold">
                      Tương tác Học sinh qua Mã QR #{popQuizSession.quizId}
                    </div>
                    <div className="text-[11px] text-sky-100">
                      Quét QR trên điện thoại để chọn A/B/C/D trực tiếp
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPopQuizOpen(false)}
                  className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3.5">
                {/* QR Code + Direct Actions */}
                <div className="flex items-center gap-3 rounded-[8px] border border-slate-200 bg-slate-50 p-2.5">
                  {popQuizQrDataUrl ? (
                    <img
                      src={popQuizQrDataUrl}
                      alt="Mã QR Câu hỏi tương tác"
                      className="h-28 w-28 shrink-0 rounded-[6px] border border-slate-200 bg-white p-1"
                    />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded border bg-white text-[11px] text-slate-400">
                      Đang tạo QR...
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="truncate text-[12px] font-bold text-slate-800">
                      {popQuizSession.questionTitle}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(popQuizJoinUrl);
                          showToast('Đã sao chép đường dẫn Câu hỏi tương tác QR!');
                        }}
                        className="inline-flex items-center gap-1 rounded-[5px] border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Link</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowStudentPreviewModal(true)}
                        className="inline-flex items-center gap-1 rounded-[5px] bg-[#136F63] px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-[#0F594F]"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Mở màn hình HS trả lời</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSimulateStudentPopQuizResponses}
                      className="w-full rounded-[5px] border border-sky-200 bg-sky-50 px-2 py-1 text-[11.5px] font-bold text-[#0369A1] hover:bg-sky-100"
                    >
                      + Giả lập HS gửi đáp án trực tiếp
                    </button>
                  </div>
                </div>

                {/* Real-time Bar Chart (Biểu đồ cột thống kê kết quả trực tiếp A/B/C/D) */}
                <div className="rounded-[8px] border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-800">
                      <BarChart3 className="h-4 w-4 text-[#136F63]" />
                      <span>Biểu đồ thống kê trực tiếp ({popQuizStats.totalChoices} lượt)</span>
                    </span>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500">Đáp án đúng:</span>
                      {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            setPopQuizSession((prev) => ({ ...prev, correctOption: letter }))
                          }
                          className={`h-5 w-5 rounded font-bold ${
                            popQuizSession.correctOption === letter
                              ? 'bg-[#136F63] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2.5 pt-2">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                      const count = popQuizStats.counts[opt];
                      const pct =
                        popQuizStats.totalChoices > 0
                          ? Math.round((count / popQuizStats.totalChoices) * 100)
                          : 0;
                      const isCorrect = popQuizSession.correctOption === opt;
                      return (
                        <div key={opt} className="flex flex-col items-center">
                          <div className="text-[11.5px] font-bold text-slate-700">
                            {count} ({pct}%)
                          </div>
                          <div className="mt-1 flex h-24 w-11 items-end overflow-hidden rounded-t-[6px] bg-slate-100 p-0.5">
                            <div
                              style={{ height: `${Math.max(8, pct)}%` }}
                              className={`w-full rounded-t-[4px] transition-all duration-300 ${
                                isCorrect ? 'bg-[#136F63]' : 'bg-[#0284C7]'
                              }`}
                            />
                          </div>
                          <div
                            className={`mt-1 flex h-7 w-full items-center justify-center rounded-[5px] text-[13px] font-bold ${
                              isCorrect
                                ? 'bg-[#136F63] text-white'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {opt}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Student Responses & Discussion Feed */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px] font-bold text-slate-700">
                    <span>Ý kiến &amp; Đáp án học sinh gửi lên ({popQuizSession.responses.length})</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPopQuizSession((prev) => ({ ...prev, responses: [] }))
                      }
                      className="text-[11px] font-medium text-red-600 hover:underline"
                    >
                      Làm mới
                    </button>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {popQuizSession.responses.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-2 rounded-[6px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px]"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">
                            {r.studentName}{' '}
                            <span className="text-[11px] font-normal text-slate-500">
                              ({r.studentClass || '12A1'})
                            </span>
                          </div>
                          {r.comment && (
                            <div className="mt-0.5 text-[11.5px] text-slate-600">{r.comment}</div>
                          )}
                        </div>
                        {r.choice && (
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold text-white ${
                              r.choice === popQuizSession.correctOption
                                ? 'bg-[#136F63]'
                                : 'bg-[#0284C7]'
                            }`}
                          >
                            {r.choice}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              FLOATING ZOOM & PAN INDICATOR (BOTTOM-LEFT OR TOP-LEFT)
             ================================================================ */}
          <div
            data-no-zoom="true"
            className="no-print absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white/95 p-1 shadow-md backdrop-blur-xs"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))))}
              title="Thu nhỏ mặt bảng"
              className="flex h-9 w-9 items-center justify-center rounded-[6px] text-slate-700 hover:bg-slate-100"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[50px] text-center text-[12.5px] font-bold tabular-nums text-slate-800">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(2))))}
              title="Phóng to mặt bảng"
              className="flex h-9 w-9 items-center justify-center rounded-[6px] text-slate-700 hover:bg-slate-100"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPanX(0);
                setPanY(0);
              }}
              title="Đặt lại góc nhìn 100%"
              className="flex h-9 items-center gap-1 rounded-[6px] border border-slate-200 bg-slate-50 px-2 text-[11.5px] font-semibold text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>100%</span>
            </button>
          </div>

          {/* End of Left / Single Infinite Canvas Pane */}
        </div>

        {/* ================================================================
            RESIZABLE VERTICAL DIVIDER + INDEPENDENT RIGHT BOARD (SPLIT VIEW)
           ================================================================ */}
        {isSplitView && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để thay đổi tỷ lệ Bảng Trái và Bảng Phải"
              onPointerDown={handleStartDividerDrag}
              onDoubleClick={() => {
                setSplitRatio(50);
                showToast('Đã đặt lại tỷ lệ chia đôi chuẩn 50% | 50%.');
              }}
              title="Kéo sang trái/phải để chỉnh tỷ lệ (VD: 40% Đề bài / 60% Lời giải). Nhấp đúp để đặt lại 50/50."
              className={`no-print group relative z-30 flex w-3.5 shrink-0 cursor-col-resize touch-none flex-col items-center justify-center border-x transition-colors select-none ${
                isDraggingDivider
                  ? 'border-[#136F63] bg-[#136F63]/20'
                  : 'border-slate-300 bg-slate-100 hover:border-[#136F63] hover:bg-emerald-50'
              }`}
            >
              {/* Tactile 65-86 inch Drag Grip Pill */}
              <div
                className={`flex h-16 w-3 items-center justify-center rounded-full border shadow-sm transition-all ${
                  isDraggingDivider
                    ? 'scale-110 border-[#0F594F] bg-[#136F63] text-white'
                    : 'border-[#136F63]/50 bg-white text-[#136F63] group-hover:bg-[#136F63] group-hover:text-white'
                }`}
              >
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Quick Ratio Presets (40/60 | 50/50) on top of divider */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute top-3 z-40 hidden flex-col gap-1 rounded-[7px] border border-slate-200 bg-white/95 p-1 shadow-md group-hover:flex"
              >
                <button
                  type="button"
                  onClick={() => setSplitRatio(40)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    splitRatio === 40 ? 'bg-[#136F63] text-white' : 'text-slate-600 hover:bg-emerald-50'
                  }`}
                >
                  40/60
                </button>
                <button
                  type="button"
                  onClick={() => setSplitRatio(50)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    splitRatio === 50 ? 'bg-[#136F63] text-white' : 'text-slate-600 hover:bg-emerald-50'
                  }`}
                >
                  50/50
                </button>
                <button
                  type="button"
                  onClick={() => setSplitRatio(60)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    splitRatio === 60 ? 'bg-[#136F63] text-white' : 'text-slate-600 hover:bg-emerald-50'
                  }`}
                >
                  60/40
                </button>
              </div>

              {/* Live Ratio Tooltip while dragging */}
              {isDraggingDivider && (
                <div className="pointer-events-none absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-16 whitespace-nowrap rounded-[7px] bg-[#0F2922] px-2.5 py-1 text-[12px] font-bold text-white shadow-xl">
                  {splitRatio}% | {100 - splitRatio}%
                </div>
              )}
            </div>

            <SplitRightBoardPane
              board={rightBoard}
              onUpdateBoard={setRightBoard}
              isActive={activeBoardSide === 'right'}
              onFocus={() => setActiveBoardSide('right')}
              activeTool={activeTool}
              penColor={penColor}
              penWidth={penWidth}
              penLineStyle={penLineStyle}
              highlighterColor={highlighterColor}
              eraserMode={eraserMode}
              smartShapeMode={smartShapeMode}
              activeSmartTemplate={activeSmartTemplate}
              activeTemplateVariant={activeTemplateVariant}
              defaultTemplateShowLabels={defaultTemplateShowLabels}
              clipboardData={clipboardData}
              onCopyToClipboard={handleCopyFromRightBoard}
              onIncrementClipboardPaste={handleIncrementClipboardPaste}
              showToast={showToast}
              controllerRef={rightBoardControllerRef}
            />
          </>
        )}

        {/* ================================================================
            DOCKABLE WRITING & TEACHING ASSISTANT TOOLBAR (48PX BUTTONS)
            Floats across the entire workspace to control both Left & Right boards
           ================================================================ */}
        {renderDockableToolbar()}
      </div>

      {/* ====================================================================
          MODAL 1: INSERT QUESTION FROM QUESTION BANK
         ==================================================================== */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#136F63] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <div>
                  <div className="text-[14.5px] font-bold">
                    Chèn Câu hỏi từ Ngân hàng đề Cloud / Dự phòng ({bankItems.length} câu)
                  </div>
                  <div className="text-[11.5px] text-emerald-100">
                    Đồng bộ trực tiếp Cloud Firestore hệ thống mẹ hoặc nạp tệp dự phòng (.json) khi mạng yếu
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onOpenJsonBankLoader && (
                  <button
                    type="button"
                    onClick={() => {
                      setBankModalOpen(false);
                      onOpenJsonBankLoader();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/30 bg-white/15 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Nạp kho đề (.json)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBankModalOpen(false)}
                  className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={bankSearchQuery}
                  onChange={(e) => setBankSearchQuery(e.target.value)}
                  placeholder="Tìm theo Mã ID (VD: 12-C1-B1), nội dung câu hỏi, bài học..."
                  className="w-full rounded-[6px] border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-[13px] focus:border-[#136F63] focus:outline-none"
                />
              </div>

              <select
                value={bankGradeFilter}
                onChange={(e) =>
                  setBankGradeFilter(e.target.value as 'all' | '10' | '11' | '12')
                }
                className="rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] font-medium"
              >
                <option value="all">Tất cả Khối (10, 11, 12)</option>
                <option value="12">Khối 12</option>
                <option value="11">Khối 11</option>
                <option value="10">Khối 10</option>
              </select>

              <select
                value={bankPartFilter}
                onChange={(e) =>
                  setBankPartFilter(e.target.value as 'all' | 'part1' | 'part2' | 'part3')
                }
                className="rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] font-medium"
              >
                <option value="all">Tất cả Dạng câu (-TN, -DS, -TLN)</option>
                <option value="part1">Phần I — Trắc nghiệm 4 lựa chọn (-TN)</option>
                <option value="part2">Phần II — Đúng / Sai (-DS)</option>
                <option value="part3">Phần III — Trả lời ngắn (-TLN)</option>
              </select>
            </div>

            {/* Question List */}
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {filteredBankQuestions.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-col justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 shadow-2xs transition-colors hover:border-[#136F63] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-[#136F63]">
                        {q.tag}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {q.partType === 'part1'
                          ? 'Trắc nghiệm (-TN)'
                          : q.partType === 'part2'
                            ? 'Đúng/Sai (-DS)'
                            : 'Trả lời ngắn (-TLN)'}
                      </span>
                      <span className="text-[12px] text-slate-500">
                        Lớp {q.grade} · {q.lesson}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-[13.5px] text-slate-800">
                      <MathText text={q.stem} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInsertBankQuestion(q)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0F594F]"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Thả lên bảng</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: EMBED YOUTUBE VIDEO
         ==================================================================== */}
      {youtubeModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#136F63] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Youtube className="h-5 w-5" />
                <span className="text-[14px] font-bold">
                  Nhúng Video YouTube trực tiếp lên Bảng Tương tác
                </span>
              </div>
              <button
                type="button"
                onClick={() => setYoutubeModalOpen(false)}
                className="rounded p-1 text-white/80 hover:bg-white/15"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-slate-700">
                  Dán đường dẫn Video YouTube (watch?v=... hoặc youtu.be/...):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={youtubeUrlInput}
                    onChange={(e) => setYoutubeUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 rounded-[6px] border border-[#CBD5E1] px-3 py-2 text-[13px] focus:border-[#136F63] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleInsertYoutubeUrl(youtubeUrlInput)}
                    className="rounded-[6px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F]"
                  >
                    Nhúng lên bảng
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-bold text-slate-500 uppercase">
                  Hoặc chọn nhanh Video học liệu mẫu:
                </div>
                <div className="space-y-2">
                  {CURATED_MATH_VIDEOS.map((vid, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-[6px] border border-slate-200 bg-slate-50 p-2.5"
                    >
                      <div>
                        <div className="text-[13px] font-semibold text-slate-800">
                          {vid.title}
                        </div>
                        <div className="text-[11.5px] text-slate-500">{vid.topic}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertYoutubeUrl(vid.embedUrl, vid.title)}
                        className="shrink-0 rounded-[6px] border border-[#136F63] bg-white px-3 py-1.5 text-[12px] font-bold text-[#136F63] hover:bg-emerald-50"
                      >
                        Chèn vào bảng
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 3: STUDENT POP QUIZ QR RESPONDER PREVIEW
         ==================================================================== */}
      {showStudentPreviewModal && (
        <StudentPopQuizResponderModal
          quizId={popQuizSession.quizId}
          onClose={() => setShowStudentPreviewModal(false)}
        />
      )}

      {/* ====================================================================
          MODAL 4: PUBLISH BOARD LESSON TO STUDENT PORTAL NOTEBOOK
         ==================================================================== */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#136F63] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                <div>
                  <div className="text-[14px] font-bold">
                    Đăng lên Sổ Ghi Chép Cổng Học sinh
                  </div>
                  <div className="text-[11.5px] text-emerald-100">
                    Đồng bộ trực tiếp lên Cloud Firestore hệ thống chính TeachLearn Edu
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePublishBoardToStudentNotebook} className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-slate-700">
                  Tiêu đề bài giảng / Ghi chép bảng trắng *
                </label>
                <input
                  type="text"
                  required
                  value={publishLessonTitle}
                  onChange={(e) => setPublishLessonTitle(e.target.value)}
                  placeholder="VD: Tiết 24 — Khảo sát hàm số & Cực trị trên Bảng tương tác"
                  className="w-full rounded-[6px] border border-[#CBD5E1] px-3 py-2 text-[13px] focus:border-[#136F63] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-slate-700">
                  Chọn Lớp học nhận Sổ Ghi Chép *
                </label>
                <select
                  value={publishTargetClass}
                  onChange={(e) => setPublishTargetClass(e.target.value)}
                  className="w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 focus:border-[#136F63] focus:outline-none"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls.id} value={cls.name}>
                      Lớp {cls.name} (Khối {cls.grade})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/70 p-3 text-[12px] text-emerald-950">
                Hệ thống sẽ tự động chụp nén <strong>{pages.length} trang bảng viết</strong> cùng các
                câu hỏi/lời giải đã chèn trên bảng để đẩy thẳng về{' '}
                <strong>Sổ Ghi Chép &amp; Học liệu Cổng Học sinh</strong> lớp{' '}
                <strong>{publishTargetClass}</strong> trên Cloud Firestore.
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPublishModalOpen(false)}
                  className="rounded-[6px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isPublishingNotebook}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>
                    {isPublishingNotebook ? 'Đang đồng bộ Cloud...' : 'Đăng ngay lên Cổng HS'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 5: SAFE MERGE / EXIT SPLIT-SCREEN DUAL BOARD
         ==================================================================== */}
      {splitExitModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#136F63] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Columns2 className="h-5 w-5" />
                <div>
                  <div className="text-[14.5px] font-bold">
                    Gộp lại 1 Bảng Đơn an toàn
                  </div>
                  <div className="text-[11.5px] text-emerald-100">
                    Bảng Phải đang có {rightBoard.strokes.length} nét vẽ &amp;{' '}
                    {rightBoard.widgets.length} khung tài liệu
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSplitExitModalOpen(false)}
                className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <p className="text-[13px] text-slate-600">
                Chọn cách xử lý nội dung khi chuyển từ <strong>Chế độ Chia đôi 2 Bảng</strong> về{' '}
                <strong>1 Bảng Đơn toàn màn hình</strong> để không làm mất bài giảng đang viết:
              </p>

              <button
                type="button"
                onClick={handleExitSplitMergeBoth}
                className="flex w-full items-start gap-3 rounded-[8px] border-2 border-[#136F63] bg-emerald-50/70 p-3 text-left transition-colors hover:bg-emerald-100/70"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#136F63] text-white">
                  <Columns2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[13.5px] font-bold text-[#0F2922]">
                    Ghép cả 2 bên cạnh nhau (Khuyên dùng)
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-600">
                    Tự động đặt toàn bộ bài giải ở Bảng Phải ngay bên cạnh đề bài ở Bảng Trái trên
                    cùng một mặt bảng vô tận (không đè lên nhau, hỗ trợ Ctrl+Z).
                  </div>
                </div>
              </button>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleExitSplitKeepLeft}
                  className="flex flex-col rounded-[8px] border border-slate-300 bg-white p-3 text-left transition-colors hover:border-[#136F63] hover:bg-slate-50"
                >
                  <span className="text-[13px] font-bold text-slate-800">Giữ lại Bảng Trái</span>
                  <span className="mt-0.5 text-[11.5px] text-slate-500">
                    Quay về Bảng Trái (Bảng Phải vẫn được giữ tạm khi mở lại Chia đôi).
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleExitSplitKeepRight}
                  className="flex flex-col rounded-[8px] border border-slate-300 bg-white p-3 text-left transition-colors hover:border-[#136F63] hover:bg-slate-50"
                >
                  <span className="text-[13px] font-bold text-slate-800">Giữ lại Bảng Phải</span>
                  <span className="mt-0.5 text-[11.5px] text-slate-500">
                    Đưa nội dung Bảng Phải làm trang bảng hiện tại (có thể Ctrl+Z hoàn tác).
                  </span>
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSplitExitModalOpen(false)}
                  className="rounded-[6px] border border-slate-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Tiếp tục Chia đôi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
