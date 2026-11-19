import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Move,
  RotateCw,
  Tag,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MathText } from './MathText';
import { ExamDiagram } from './ExamDiagrams';
import {
  formatMcqOptionDisplay,
  normalizeSolutionSteps,
  stripAnswerPrefix,
  stripDuplicateHeadingFromStem,
} from '../utils/solutionFormat';
import {
  createDefaultTemplateConfig,
  LINE_STYLE_PRESETS,
  SMART_TEMPLATE_CATALOG,
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
  buildSmartShapePoints,
  CanvasBackgroundType,
  collectCanvasSnapTargets,
  distance,
  drawPageBackgroundOnContext,
  drawSnapIndicatorOnContext,
  drawStrokeOnContext,
  EraserSubMode,
  findNearestSnapTarget,
  getStrokeRawBounds,
  getStrokeRotationDeg,
  SmartboardHistorySnapshot,
  SmartboardStroke,
  SmartboardTool,
  SmartboardWidget,
  SmartShapeSubMode,
  SnapTarget,
  StrokePoint,
} from './SmartboardCanvasStudio';

export interface SplitBoardData {
  background: CanvasBackgroundType;
  strokes: SmartboardStroke[];
  widgets: SmartboardWidget[];
  undoStack: SmartboardHistorySnapshot[];
  redoStack: SmartboardHistorySnapshot[];
}

export interface SplitRightBoardController {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  toggleLineStyle: () => boolean;
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  clearSelection: () => void;
  insertTemplateFigure: (templateId: SmartTemplateId, variantOverride?: string) => void;
  insertWidget: (widget: SmartboardWidget) => void;
  hasSelection: () => boolean;
  resetViewport: () => void;
}

interface SplitRightBoardPaneProps {
  board: SplitBoardData;
  onUpdateBoard: (updater: (prev: SplitBoardData) => SplitBoardData) => void;
  isActive: boolean;
  onFocus: () => void;
  activeTool: SmartboardTool;
  penColor: string;
  penWidth: number;
  penLineStyle: StrokeLineStyle;
  highlighterColor: string;
  eraserMode: EraserSubMode;
  smartShapeMode: SmartShapeSubMode;
  activeSmartTemplate: SmartTemplateId | null;
  activeTemplateVariant: string;
  defaultTemplateShowLabels: boolean;
  clipboardData: {
    strokes: SmartboardStroke[];
    widgets: SmartboardWidget[];
    pasteCount: number;
  } | null;
  onCopyToClipboard: (strokes: SmartboardStroke[], widgets: SmartboardWidget[]) => void;
  onIncrementClipboardPaste: () => void;
  showToast: (msg: string) => void;
  controllerRef: React.MutableRefObject<SplitRightBoardController | null>;
}

const QUICK_INK_PALETTE: Array<{ color: string; label: string }> = [
  { color: '#0F172A', label: 'Đen' },
  { color: '#0284C7', label: 'Xanh dương' },
  { color: '#DC2626', label: 'Đỏ' },
  { color: '#136F63', label: 'Xanh cổ vịt' },
  { color: '#EAB308', label: 'Vàng' },
  { color: '#FFFFFF', label: 'Trắng' },
];

export const SplitRightBoardPane: React.FC<SplitRightBoardPaneProps> = ({
  board,
  onUpdateBoard,
  isActive,
  onFocus,
  activeTool,
  penColor,
  penWidth,
  penLineStyle,
  highlighterColor,
  eraserMode,
  smartShapeMode,
  activeSmartTemplate,
  activeTemplateVariant,
  defaultTemplateShowLabels,
  clipboardData,
  onCopyToClipboard,
  onIncrementClipboardPaste,
  showToast,
  controllerRef,
}) => {
  // 100% Independent Infinite Viewport for Right Board
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Independent Selection & Transform State for Right Board
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [aspectRatioLocked, setAspectRatioLocked] = useState(false);
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
  const [freehandLasso, setFreehandLasso] = useState<{
    points: StrokePoint[];
    active: boolean;
    closing?: boolean;
  } | null>(null);
  const lassoCloseTimerRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRafRef = useRef<number | null>(null);
  const snapIndicatorRef = useRef<{
    hoverSnap: SnapTarget | null;
    startSnap: SnapTarget | null;
    endSnap: SnapTarget | null;
  }>({ hoverSnap: null, startSnap: null, endSnap: null });

  // Completely isolated pointer tracking map for Dual-Touch Simultaneous Writing
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    mode: 'none' | 'draw' | 'pan' | 'pinch' | 'select_lasso';
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

  const isLineRubberBandTool =
    activeTool === 'smart_shape' &&
    !activeSmartTemplate &&
    (smartShapeMode === 'line' || smartShapeMode === 'arrow');

  const selectedStrokeIdSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);
  const selectedWidgetIdSet = useMemo(() => new Set(selectedWidgetIds), [selectedWidgetIds]);

  const selectedStrokes = useMemo(
    () => board.strokes.filter((s) => selectedStrokeIdSet.has(s.id)),
    [board.strokes, selectedStrokeIdSet]
  );
  const selectedWidgets = useMemo(
    () => board.widgets.filter((w) => selectedWidgetIdSet.has(w.id)),
    [board.widgets, selectedWidgetIdSet]
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
    return () => {
      if (lassoCloseTimerRef.current !== null) {
        window.clearTimeout(lassoCloseTimerRef.current);
      }
      if (activeCanvasRafRef.current !== null) {
        window.cancelAnimationFrame(activeCanvasRafRef.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // INDEPENDENT BOARD STATE & UNDO / REDO COMMITS
  // --------------------------------------------------------------------------
  const pushUndoSnapshot = useCallback(
    (snapshot: SmartboardHistorySnapshot) => {
      onUpdateBoard((prev) => ({
        ...prev,
        undoStack: [...prev.undoStack.slice(-29), snapshot],
        redoStack: [],
      }));
    },
    [onUpdateBoard]
  );

  const commitState = useCallback(
    (nextStrokes: SmartboardStroke[], nextWidgets: SmartboardWidget[], recordUndo = true) => {
      onUpdateBoard((prev) => ({
        ...prev,
        strokes: nextStrokes,
        widgets: nextWidgets,
        undoStack: recordUndo
          ? [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }]
          : prev.undoStack,
        redoStack: recordUndo ? [] : prev.redoStack,
      }));
    },
    [onUpdateBoard]
  );

  const commitStrokes = useCallback(
    (nextStrokes: SmartboardStroke[], recordUndo = true) => {
      onUpdateBoard((prev) => ({
        ...prev,
        strokes: nextStrokes,
        undoStack: recordUndo
          ? [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }]
          : prev.undoStack,
        redoStack: recordUndo ? [] : prev.redoStack,
      }));
    },
    [onUpdateBoard]
  );

  const commitWidgets = useCallback(
    (nextWidgets: SmartboardWidget[], recordUndo = true) => {
      onUpdateBoard((prev) => ({
        ...prev,
        widgets: nextWidgets,
        undoStack: recordUndo
          ? [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }]
          : prev.undoStack,
        redoStack: recordUndo ? [] : prev.redoStack,
      }));
    },
    [onUpdateBoard]
  );

  const updateSelectedStroke = useCallback(
    (updater: (st: SmartboardStroke) => SmartboardStroke, recordUndo = true) => {
      if (selectedStrokeIds.length === 0) return;
      const idSet = new Set(selectedStrokeIds);
      onUpdateBoard((prev) => ({
        ...prev,
        strokes: prev.strokes.map((st) => (idSet.has(st.id) ? updater(st) : st)),
        undoStack: recordUndo
          ? [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }]
          : prev.undoStack,
        redoStack: recordUndo ? [] : prev.redoStack,
      }));
    },
    [onUpdateBoard, selectedStrokeIds]
  );

  const updateSelectedWidget = useCallback(
    (updater: (w: SmartboardWidget) => SmartboardWidget, recordUndo = true) => {
      if (selectedWidgetIds.length === 0) return;
      const idSet = new Set(selectedWidgetIds);
      onUpdateBoard((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) => (idSet.has(w.id) ? updater(w) : w)),
        undoStack: recordUndo
          ? [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }]
          : prev.undoStack,
        redoStack: recordUndo ? [] : prev.redoStack,
      }));
    },
    [onUpdateBoard, selectedWidgetIds]
  );

  const handleUndo = useCallback(() => {
    onUpdateBoard((prev) => {
      if (prev.undoStack.length === 0) return prev;
      const snapshot = prev.undoStack[prev.undoStack.length - 1];
      return {
        ...prev,
        strokes: snapshot.strokes,
        widgets: snapshot.widgets,
        undoStack: prev.undoStack.slice(0, -1),
        redoStack: [...prev.redoStack, { strokes: prev.strokes, widgets: prev.widgets }],
      };
    });
  }, [onUpdateBoard]);

  const handleRedo = useCallback(() => {
    onUpdateBoard((prev) => {
      if (prev.redoStack.length === 0) return prev;
      const snapshot = prev.redoStack[prev.redoStack.length - 1];
      return {
        ...prev,
        strokes: snapshot.strokes,
        widgets: snapshot.widgets,
        undoStack: [...prev.undoStack, { strokes: prev.strokes, widgets: prev.widgets }],
        redoStack: prev.redoStack.slice(0, -1),
      };
    });
  }, [onUpdateBoard]);

  const handleClear = useCallback(() => {
    if (board.strokes.length === 0 && board.widgets.length === 0) return;
    commitState([], [], true);
    clearSelection();
    showToast('Đã xóa toàn bộ nội dung trên Bảng Phải.');
  }, [board.strokes.length, board.widgets.length, clearSelection, commitState, showToast]);

  // --------------------------------------------------------------------------
  // DUAL-CANVAS RENDERING (MAIN + ACTIVE LAYERS) WITH RESIZE OBSERVER
  // --------------------------------------------------------------------------
  const renderMainCanvas = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    const container = containerRef.current;
    if (!mainCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));

    if (mainCanvas.width !== targetW || mainCanvas.height !== targetH) {
      mainCanvas.width = targetW;
      mainCanvas.height = targetH;
    }

    const ctx = mainCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPageBackgroundOnContext(ctx, rect.width, rect.height, board.background, panX, panY, zoom);
    for (const st of board.strokes) {
      drawStrokeOnContext(ctx, st, panX, panY, zoom);
    }
    ctx.restore();
  }, [board.background, board.strokes, panX, panY, zoom]);

  const renderActiveCanvas = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    const container = containerRef.current;
    if (!activeCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));

    if (activeCanvas.width !== targetW || activeCanvas.height !== targetH) {
      activeCanvas.width = targetW;
      activeCanvas.height = targetH;
    }

    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (gestureRef.current.currentStroke) {
      drawStrokeOnContext(ctx, gestureRef.current.currentStroke, panX, panY, zoom);
    }
    const { hoverSnap, startSnap, endSnap } = snapIndicatorRef.current;
    if (hoverSnap) drawSnapIndicatorOnContext(ctx, hoverSnap, panX, panY, zoom, false);
    if (startSnap) drawSnapIndicatorOnContext(ctx, startSnap, panX, panY, zoom, true);
    if (endSnap) drawSnapIndicatorOnContext(ctx, endSnap, panX, panY, zoom, true);

    ctx.restore();
  }, [panX, panY, zoom]);

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

  const scheduleActiveCanvasRender = useCallback(() => {
    if (activeCanvasRafRef.current !== null) return;
    activeCanvasRafRef.current = window.requestAnimationFrame(() => {
      activeCanvasRafRef.current = null;
      renderActiveCanvas();
    });
  }, [renderActiveCanvas]);

  useEffect(() => {
    renderMainCanvas();
  }, [renderMainCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      renderMainCanvas();
      renderActiveCanvas();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [renderActiveCanvas, renderMainCanvas]);

  // --------------------------------------------------------------------------
  // COORDINATE & HIT-TESTING HELPERS
  // --------------------------------------------------------------------------
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): StrokePoint => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom,
      };
    },
    [panX, panY, zoom]
  );

  const computeStrokeBoundingBox = useCallback((st: SmartboardStroke): TransformBox => {
    if (st.templateBox) return st.templateBox;
    const rb = getStrokeRawBounds(st);
    const pad = 8;
    const boxW = Math.max(24, rb.maxX - rb.minX + pad * 2);
    const boxH = Math.max(24, rb.maxY - rb.minY + pad * 2);
    return {
      x: rb.cx - boxW / 2,
      y: rb.cy - boxH / 2,
      width: boxW,
      height: boxH,
    };
  }, []);

  const findStrokeAtWorldPoint = useCallback(
    (worldPt: StrokePoint): SmartboardStroke | null => {
      const hitTol = 22 / Math.max(zoom, 0.35);
      for (let i = board.strokes.length - 1; i >= 0; i--) {
        const st = board.strokes[i];
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
              if (distance({ x: p1.x + t * dx, y: p1.y + t * dy }, localPt) <= hitTol) {
                return st;
              }
            }
          }
        }
      }
      for (let i = board.strokes.length - 1; i >= 0; i--) {
        const st = board.strokes[i];
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
    [board.strokes, zoom]
  );

  // --------------------------------------------------------------------------
  // BATCH ACTIONS (COPY / PASTE / DUPLICATE / COLOR / DASH / DELETE)
  // --------------------------------------------------------------------------
  const cloneStrokeOffset = (
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
    points: st.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  });

  const cloneWidgetOffset = (
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
    onCopyToClipboard(selectedStrokes, selectedWidgets);
  }, [onCopyToClipboard, selectedStrokes, selectedWidgets, totalSelectedCount]);

  const handlePasteClipboard = useCallback(() => {
    if (!clipboardData) return;
    const step = (clipboardData.pasteCount + 1) * 24;
    const dx = step;
    const dy = Math.round(step * 0.5);
    const pastedStrokes = clipboardData.strokes.map((st) =>
      cloneStrokeOffset(st, dx, dy, 'rst-paste')
    );
    const pastedWidgets = clipboardData.widgets.map((w) =>
      cloneWidgetOffset(w, dx, dy, 'rw-paste')
    );
    commitState(
      [...board.strokes, ...pastedStrokes],
      [...board.widgets, ...pastedWidgets],
      true
    );
    setSelectedStrokeIds(pastedStrokes.map((s) => s.id));
    setSelectedWidgetIds(pastedWidgets.map((w) => w.id));
    onIncrementClipboardPaste();
    showToast(`Đã dán ${pastedStrokes.length + pastedWidgets.length} đối tượng lên Bảng Phải.`);
  }, [
    board.strokes,
    board.widgets,
    clipboardData,
    commitState,
    onIncrementClipboardPaste,
    showToast,
  ]);

  const handleDuplicateSelection = useCallback(() => {
    if (totalSelectedCount === 0) return;
    const clonedStrokes = selectedStrokes.map((st) =>
      cloneStrokeOffset(st, 24, 12, 'rst-dup')
    );
    const clonedWidgets = selectedWidgets.map((w) =>
      cloneWidgetOffset(w, 24, 12, 'rw-dup')
    );
    commitState(
      [...board.strokes, ...clonedStrokes],
      [...board.widgets, ...clonedWidgets],
      true
    );
    setSelectedStrokeIds(clonedStrokes.map((s) => s.id));
    setSelectedWidgetIds(clonedWidgets.map((w) => w.id));
    showToast(`Đã nhân bản tại chỗ ${totalSelectedCount} đối tượng trên Bảng Phải (lệch 24px).`);
  }, [board.strokes, board.widgets, commitState, selectedStrokes, selectedWidgets, showToast, totalSelectedCount]);

  const handleBatchChangeColor = useCallback(
    (newColor: string) => {
      if (totalSelectedCount === 0) return;
      commitState(
        board.strokes.map((st) => (selectedStrokeIdSet.has(st.id) ? { ...st, color: newColor } : st)),
        board.widgets.map((w) =>
          selectedWidgetIdSet.has(w.id) ? { ...w, borderColor: newColor } : w
        ),
        true
      );
    },
    [board.strokes, board.widgets, commitState, selectedStrokeIdSet, selectedWidgetIdSet, totalSelectedCount]
  );

  const handleBatchChangeLineStyle = useCallback(
    (targetStyle: StrokeLineStyle) => {
      if (totalSelectedCount === 0) return;
      commitState(
        board.strokes.map((st) =>
          selectedStrokeIdSet.has(st.id) ? { ...st, lineStyle: targetStyle } : st
        ),
        board.widgets.map((w) =>
          selectedWidgetIdSet.has(w.id) ? { ...w, borderStyle: targetStyle } : w
        ),
        true
      );
    },
    [board.strokes, board.widgets, commitState, selectedStrokeIdSet, selectedWidgetIdSet, totalSelectedCount]
  );

  const handleToggleSelectedLineStyle = useCallback((): boolean => {
    if (totalSelectedCount === 0) return false;
    const allDashed =
      selectedStrokes.every((st) => st.lineStyle === 'dashed') &&
      selectedWidgets.every((w) => w.borderStyle === 'dashed');
    const targetStyle: StrokeLineStyle = allDashed ? 'solid' : 'dashed';
    handleBatchChangeLineStyle(targetStyle);
    showToast(
      `Bảng Phải: Đã chuyển ${totalSelectedCount} đối tượng sang ${
        targetStyle === 'dashed' ? 'Nét đứt (- -)' : 'Nét liền (—)'
      }.`
    );
    return true;
  }, [handleBatchChangeLineStyle, selectedStrokes, selectedWidgets, showToast, totalSelectedCount]);

  const handleDeleteSelected = useCallback(() => {
    if (totalSelectedCount === 0) return;
    commitState(
      board.strokes.filter((s) => !selectedStrokeIdSet.has(s.id)),
      board.widgets.filter((w) => !selectedWidgetIdSet.has(w.id)),
      true
    );
    clearSelection();
    showToast(`Đã xóa ${totalSelectedCount} đối tượng trên Bảng Phải.`);
  }, [
    board.strokes,
    board.widgets,
    clearSelection,
    commitState,
    selectedStrokeIdSet,
    selectedWidgetIdSet,
    showToast,
    totalSelectedCount,
  ]);

  const handleInsertTemplateFigure = useCallback(
    (templateId: SmartTemplateId, variantOverride?: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const viewW = rect?.width || 620;
      const viewH = rect?.height || 620;
      const figW = 300;
      const figH = 240;
      const box = {
        x: Math.round((viewW / 2 - panX) / zoom - figW / 2),
        y: Math.round((viewH / 2 - panY) / zoom - figH / 2),
        width: figW,
        height: figH,
      };
      const defaultCfg = createDefaultTemplateConfig(templateId);
      const newStroke: SmartboardStroke = {
        id: `rtpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      commitStrokes([...board.strokes, newStroke], true);
      setSelectedStrokeIds([newStroke.id]);
      setSelectedWidgetIds([]);
      showToast('Đã chèn hình mẫu 3D / Conic vào Bảng Phải.');
    },
    [board.strokes, commitStrokes, defaultTemplateShowLabels, panX, panY, penColor, penWidth, showToast, zoom]
  );

  const handleInsertWidget = useCallback(
    (widget: SmartboardWidget) => {
      const adjustedWidget: SmartboardWidget = {
        ...widget,
        id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: Math.round((48 - panX) / zoom),
        y: Math.round((56 - panY) / zoom),
      };
      commitWidgets([...board.widgets, adjustedWidget], true);
      setSelectedWidgetIds([adjustedWidget.id]);
      setSelectedStrokeIds([]);
    },
    [board.widgets, commitWidgets, panX, panY, zoom]
  );

  // Wire imperative controller ref for parent floating toolbar & keyboard shortcuts
  controllerRef.current = {
    undo: handleUndo,
    redo: handleRedo,
    clear: handleClear,
    toggleLineStyle: handleToggleSelectedLineStyle,
    copySelected: handleCopySelection,
    pasteClipboard: handlePasteClipboard,
    duplicateSelected: handleDuplicateSelection,
    deleteSelected: handleDeleteSelected,
    clearSelection,
    insertTemplateFigure: handleInsertTemplateFigure,
    insertWidget: handleInsertWidget,
    hasSelection: () => totalSelectedCount > 0,
    resetViewport: () => {
      setZoom(1);
      setPanX(0);
      setPanY(0);
    },
  };

  // --------------------------------------------------------------------------
  // POINTER HANDLERS (DUAL-TOUCH SIMULTANEOUS WRITING + INDEPENDENT PAN/ZOOM)
  // --------------------------------------------------------------------------
  const eraseAtWorldPoint = useCallback(
    (worldPt: StrokePoint) => {
      const eraseRadius = 24 / zoom;
      if (eraserMode === 'stroke') {
        const filtered = board.strokes.filter((st) => {
          if (st.templateBox) {
            const b = st.templateBox;
            if (
              worldPt.x >= b.x - eraseRadius &&
              worldPt.x <= b.x + b.width + eraseRadius &&
              worldPt.y >= b.y - eraseRadius &&
              worldPt.y <= b.y + b.height + eraseRadius
            ) {
              return false;
            }
          }
          return !st.points.some((p) => distance(p, worldPt) <= eraseRadius);
        });
        if (filtered.length !== board.strokes.length) {
          commitStrokes(filtered, true);
        }
      } else {
        let changed = false;
        const nextStrokes: SmartboardStroke[] = [];
        for (const st of board.strokes) {
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
          commitStrokes(nextStrokes, false);
        }
      }
    },
    [board.strokes, commitStrokes, eraserMode, zoom]
  );

  const computeInkWidthFactor = (
    prevPt: StrokePoint | undefined,
    currPt: StrokePoint,
    pointerType: string,
    pressure: number
  ): number => {
    if (pointerType === 'pen' && pressure > 0 && pressure !== 0.5) {
      const target = Math.max(0.68, Math.min(1.3, 0.68 + pressure * 0.62));
      return prevPt?.wFactor !== undefined ? prevPt.wFactor * 0.55 + target * 0.45 : target;
    }
    if (!prevPt) return 1;
    const dt = Math.max(4, (currPt.t || performance.now()) - (prevPt.t || performance.now()));
    const vel = distance(prevPt, currPt) / dt;
    const target = Math.max(0.76, Math.min(1.16, 1.14 - vel * 0.22));
    return prevPt.wFactor !== undefined ? prevPt.wFactor * 0.65 + target * 0.35 : target;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onFocus();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pointerCount = activePointersRef.current.size;

    // 2-Finger Independent Pinch-to-Zoom & Pan on Right Board ONLY
    if (pointerCount === 2) {
      gestureRef.current.currentStroke = null;
      clearActiveCanvas();
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 10);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const worldMid = screenToWorld(midX, midY);

      gestureRef.current.mode = 'pinch';
      gestureRef.current.pinchStartDist = dist;
      gestureRef.current.pinchStartZoom = zoom;
      gestureRef.current.pinchMidWorldX = worldMid.x;
      gestureRef.current.pinchMidWorldY = worldMid.y;
      return;
    }

    if (pointerCount > 2) return;

    if (activeTool === 'pan' || e.button === 1) {
      gestureRef.current.mode = 'pan';
      gestureRef.current.startClientX = e.clientX;
      gestureRef.current.startClientY = e.clientY;
      gestureRef.current.startPanX = panX;
      gestureRef.current.startPanY = panY;
      return;
    }

    const rawWorldPt = screenToWorld(e.clientX, e.clientY);

    if (activeTool === 'select' || activeTool === 'ai_lasso') {
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

    if (totalSelectedCount > 0) {
      clearSelection();
    }

    if (activeTool === 'eraser') {
      gestureRef.current.mode = 'draw';
      eraseAtWorldPoint(rawWorldPt);
      return;
    }

    if (activeTool === 'smart_shape' && activeSmartTemplate) {
      const defaultCfg = createDefaultTemplateConfig(activeSmartTemplate);
      gestureRef.current.mode = 'draw';
      gestureRef.current.currentStroke = {
        id: `rtpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'shape',
        shapeKind: 'template_figure',
        lineStyle: 'solid',
        templateId: activeSmartTemplate,
        templateBox: { x: rawWorldPt.x, y: rawWorldPt.y, width: 16, height: 16 },
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
      renderActiveCanvas();
      return;
    }

    if (isLineRubberBandTool) {
      const snapTargets = collectCanvasSnapTargets(board.strokes);
      const startSnap = findNearestSnapTarget(rawWorldPt, snapTargets, zoom);
      const startPt: StrokePoint = startSnap ? { x: startSnap.x, y: startSnap.y } : rawWorldPt;
      snapIndicatorRef.current = { hoverSnap: null, startSnap, endSnap: null };
      gestureRef.current.mode = 'draw';
      gestureRef.current.currentStroke = {
        id: `rline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'shape',
        shapeKind: smartShapeMode === 'arrow' ? 'arrow' : 'line',
        lineStyle: penLineStyle,
        color: penColor,
        width: penWidth,
        opacity: 1,
        points: [startPt, { ...startPt }],
      };
      renderActiveCanvas();
      return;
    }

    const nowT = e.timeStamp || performance.now();
    const isHighlighter = activeTool === 'highlighter';
    gestureRef.current.mode = 'draw';
    gestureRef.current.currentStroke = {
      id: `rst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: isHighlighter ? 'highlighter' : activeTool === 'smart_shape' ? 'shape' : 'pen',
      lineStyle: isHighlighter ? 'solid' : penLineStyle,
      color: isHighlighter ? highlighterColor : penColor,
      width: isHighlighter ? 22 : penWidth,
      opacity: isHighlighter ? 0.38 : 1,
      points: [
        {
          x: rawWorldPt.x,
          y: rawWorldPt.y,
          pressure: e.pressure,
          t: nowT,
          wFactor: computeInkWidthFactor(undefined, rawWorldPt, e.pointerType, e.pressure),
        },
      ],
    };
    renderActiveCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) {
      if (isLineRubberBandTool && gestureRef.current.mode === 'none') {
        const hoverWorld = screenToWorld(e.clientX, e.clientY);
        const found = findNearestSnapTarget(
          hoverWorld,
          collectCanvasSnapTargets(board.strokes),
          zoom
        );
        const prev = snapIndicatorRef.current.hoverSnap;
        if (
          (!prev && Boolean(found)) ||
          (Boolean(prev) && !found) ||
          (prev && found && (prev.x !== found.x || prev.y !== found.y))
        ) {
          snapIndicatorRef.current.hoverSnap = found;
          scheduleActiveCanvasRender();
        }
      }
      return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointerCount = activePointersRef.current.size;

    if (pointerCount >= 2 && gestureRef.current.mode === 'pinch') {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 10);
      const ratio = dist / gestureRef.current.pinchStartDist;
      const nextZoom = Math.min(
        3.5,
        Math.max(0.4, Number((gestureRef.current.pinchStartZoom * ratio).toFixed(2)))
      );
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const midScreenX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midScreenY = (pts[0].y + pts[1].y) / 2 - rect.top;
        setZoom(nextZoom);
        setPanX(midScreenX - gestureRef.current.pinchMidWorldX * nextZoom);
        setPanY(midScreenY - gestureRef.current.pinchMidWorldY * nextZoom);
      }
      return;
    }

    if (gestureRef.current.mode === 'pan') {
      setPanX(gestureRef.current.startPanX + (e.clientX - gestureRef.current.startClientX));
      setPanY(gestureRef.current.startPanY + (e.clientY - gestureRef.current.startClientY));
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
        if (totalSelectedCount > 0) clearSelection();
      }
      if (gestureRef.current.selectDidDrag) {
        const pts = gestureRef.current.selectLassoPoints;
        const last = pts[pts.length - 1];
        if (!last || distance(last, rawWorldPt) >= 5 / Math.max(zoom, 0.35)) {
          pts.push(rawWorldPt);
          setFreehandLasso({ points: [...pts], active: true, closing: false });
        }
      }
      return;
    }

    if (gestureRef.current.mode === 'draw') {
      if (activeTool === 'eraser') {
        eraseAtWorldPoint(rawWorldPt);
        return;
      }

      const activeStroke = gestureRef.current.currentStroke;
      if (!activeStroke) return;

      if (activeStroke.templateId && activeStroke.points.length > 0) {
        const startPt = activeStroke.points[0];
        activeStroke.templateBox = {
          x: Math.round(Math.min(startPt.x, rawWorldPt.x)),
          y: Math.round(Math.min(startPt.y, rawWorldPt.y)),
          width: Math.round(Math.max(24, Math.abs(rawWorldPt.x - startPt.x))),
          height: Math.round(Math.max(24, Math.abs(rawWorldPt.y - startPt.y))),
        };
        scheduleActiveCanvasRender();
        return;
      }

      if (
        isLineRubberBandTool &&
        activeStroke.tool === 'shape' &&
        (activeStroke.shapeKind === 'line' || activeStroke.shapeKind === 'arrow') &&
        activeStroke.points.length >= 2
      ) {
        const startPt = activeStroke.points[0];
        const endSnap = findNearestSnapTarget(
          rawWorldPt,
          collectCanvasSnapTargets(board.strokes),
          zoom
        );
        let endPt: StrokePoint = endSnap ? { x: endSnap.x, y: endSnap.y } : rawWorldPt;
        if (!endSnap && e.shiftKey) {
          const dx = endPt.x - startPt.x;
          const dy = endPt.y - startPt.y;
          const len = Math.hypot(dx, dy);
          if (len > 4) {
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

      const lastPt = activeStroke.points[activeStroke.points.length - 1];
      if (!lastPt || distance(lastPt, rawWorldPt) >= 1.5 / Math.max(zoom, 0.5)) {
        const nowT = e.timeStamp || performance.now();
        activeStroke.points.push({
          x: rawWorldPt.x,
          y: rawWorldPt.y,
          pressure: e.pressure,
          t: nowT,
          wFactor: computeInkWidthFactor(lastPt, { ...rawWorldPt, t: nowT }, e.pointerType, e.pressure),
        });
        scheduleActiveCanvasRender();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
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

      setFreehandLasso({ points: polyPts, active: false, closing: true });
      if (lassoCloseTimerRef.current !== null) {
        window.clearTimeout(lassoCloseTimerRef.current);
      }
      lassoCloseTimerRef.current = window.setTimeout(() => {
        setFreehandLasso(null);
        lassoCloseTimerRef.current = null;
      }, 320);

      const polyAABB = computePointsAABB(polyPts);
      const matchedStrokeIds: string[] = [];
      for (const st of board.strokes) {
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
      for (const w of board.widgets) {
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
      const found = matchedStrokeIds.length + matchedWidgetIds.length;
      if (found > 1) {
        showToast(`Bảng Phải: Đã khoanh chọn & gom nhóm ${found} đối tượng.`);
      } else if (found === 1) {
        showToast('Bảng Phải: Đã chọn 1 đối tượng.');
      }
      return;
    }

    if (gestureRef.current.mode === 'draw' && gestureRef.current.currentStroke) {
      let finishedStroke: SmartboardStroke | null = gestureRef.current.currentStroke;
      let selectAfter = false;

      if (finishedStroke.templateId && finishedStroke.templateBox) {
        let box = finishedStroke.templateBox;
        if (box.width < 48 && box.height < 48) {
          const tapPt = finishedStroke.points[0] || { x: box.x, y: box.y };
          box = {
            x: Math.round(tapPt.x - 140),
            y: Math.round(tapPt.y - 115),
            width: 280,
            height: 230,
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
        selectAfter = true;
      } else if (
        isLineRubberBandTool &&
        finishedStroke.tool === 'shape' &&
        (finishedStroke.shapeKind === 'line' || finishedStroke.shapeKind === 'arrow') &&
        finishedStroke.points.length >= 2
      ) {
        const segLen = distance(finishedStroke.points[0], finishedStroke.points[1]);
        if (segLen >= 3 / Math.max(zoom, 0.5)) {
          selectAfter = true;
        } else {
          finishedStroke = null;
        }
      } else if (activeTool === 'smart_shape' && finishedStroke.points.length >= 2) {
        const recognized = buildSmartShapePoints(finishedStroke.points, smartShapeMode);
        finishedStroke = {
          ...finishedStroke,
          tool: 'shape',
          shapeKind: recognized.shapeKind,
          lineStyle: finishedStroke.lineStyle || penLineStyle,
          points: recognized.points,
        };
        selectAfter = true;
      }

      gestureRef.current.currentStroke = null;
      snapIndicatorRef.current = { hoverSnap: null, startSnap: null, endSnap: null };
      clearActiveCanvas();

      if (finishedStroke) {
        const finalStroke = finishedStroke;
        onUpdateBoard((prev) => ({
          ...prev,
          strokes: [...prev.strokes, finalStroke],
          undoStack: [...prev.undoStack.slice(-29), { strokes: prev.strokes, widgets: prev.widgets }],
          redoStack: [],
        }));
        if (selectAfter) {
          setSelectedStrokeIds([finalStroke.id]);
          setSelectedWidgetIds([]);
        }
      }
    }

    if (activePointersRef.current.size === 0) {
      gestureRef.current.mode = 'none';
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - panX) / zoom;
      const worldY = (mouseY - panY) / zoom;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const nextZoom = Math.min(3.5, Math.max(0.4, Number((zoom * factor).toFixed(2))));
      setZoom(nextZoom);
      setPanX(mouseX - worldX * nextZoom);
      setPanY(mouseY - worldY * nextZoom);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onFocus}
      onWheel={handleWheel}
      className={`relative flex-1 overflow-hidden select-none touch-none transition-shadow ${
        isActive
          ? 'ring-2 ring-inset ring-[#136F63] shadow-[inset_0_0_20px_rgba(19,111,99,0.16)]'
          : 'ring-1 ring-inset ring-slate-200'
      }`}
    >
      {/* Active Focus Header Pill for Right Board */}
      <div className="pointer-events-auto absolute top-2.5 left-3 z-30 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onFocus}
          className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px] font-bold shadow-sm transition-all ${
            isActive
              ? 'bg-[#136F63] text-white ring-2 ring-emerald-300/60'
              : 'border border-slate-300 bg-white/90 text-slate-600 hover:border-[#136F63] hover:text-[#136F63]'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isActive ? 'bg-emerald-300' : 'bg-slate-400'
            }`}
          />
          <span>{isActive ? 'Bảng Phải · Đang thao tác' : 'Bảng Phải'}</span>
        </button>

        {/* Independent Right-Board Zoom & Reset Controls */}
        <div className="flex items-center gap-0.5 rounded-[7px] border border-slate-200 bg-white/92 px-1 py-0.5 text-[11px] font-bold text-slate-700 shadow-xs">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
            }}
            title="Thu nhỏ riêng Bảng Phải"
            className="rounded p-1 hover:bg-slate-100"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              setZoom(1);
              setPanX(0);
              setPanY(0);
            }}
            title="Đặt lại góc nhìn 100% cho Bảng Phải"
            className="min-w-[40px] rounded px-1 py-0.5 text-center tabular-nums hover:bg-emerald-50 hover:text-[#136F63]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              setZoom((z) => Math.min(3.5, Number((z + 0.15).toFixed(2))));
            }}
            title="Phóng to riêng Bảng Phải"
            className="rounded p-1 hover:bg-slate-100"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Paste Button on Right Board when clipboard has copied objects */}
      {clipboardData && totalSelectedCount === 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
            handlePasteClipboard();
          }}
          title="Dán đối tượng vừa sao chép vào Bảng Phải"
          className="absolute top-2.5 right-3 z-30 inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-[#136F63] bg-white/95 px-3 py-1 text-[12px] font-bold text-[#136F63] shadow-md hover:bg-emerald-50"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          <span>Dán ({clipboardData.strokes.length + clipboardData.widgets.length})</span>
        </button>
      )}

      {/* Dual-Canvas Layers for Right Board */}
      <canvas
        ref={mainCanvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full touch-none"
      />
      <canvas
        ref={activeCanvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (snapIndicatorRef.current.hoverSnap) {
            snapIndicatorRef.current.hoverSnap = null;
            scheduleActiveCanvasRender();
          }
        }}
        className={`absolute inset-0 z-10 h-full w-full touch-none ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        }`}
      />

      {/* World-Transformed Overlay Layer (Widgets + Smart Lasso + 9-Point Transform Box) */}
      <div
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="pointer-events-none absolute inset-0 z-20"
      >
        {/* Right Board Floating Widgets */}
        {board.widgets.map((widget) => {
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
                onFocus();
                setSelectedWidgetIds([widget.id]);
                setSelectedStrokeIds([]);
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
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onFocus();
                  setSelectedWidgetIds([widget.id]);
                  setSelectedStrokeIds([]);
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
                    preSnapshot: { strokes: board.strokes, widgets: board.widgets },
                  };
                }}
                onPointerMove={(e) => {
                  if (
                    widgetDragRef.current.widgetId !== widget.id ||
                    widgetDragRef.current.mode !== 'move'
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  const dx = (e.clientX - widgetDragRef.current.startX) / zoom;
                  const dy = (e.clientY - widgetDragRef.current.startY) / zoom;
                  if (Math.hypot(dx, dy) > 1.5) widgetDragRef.current.didMutate = true;
                  commitWidgets(
                    board.widgets.map((w) =>
                      w.id === widget.id
                        ? {
                            ...w,
                            x: Math.round(widgetDragRef.current.origX + dx),
                            y: Math.round(widgetDragRef.current.origY + dy),
                          }
                        : w
                    ),
                    false
                  );
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
                  <span className="truncate text-[12px] font-bold">
                    <MathText text={widget.title} />
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {widget.type === 'bank_question' && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        commitWidgets(
                          board.widgets.map((w) =>
                            w.id === widget.id ? { ...w, showSolution: !w.showSolution } : w
                          ),
                          false
                        )
                      }
                      className="inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
                    >
                      {widget.showSolution ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                      <span>{widget.showSolution ? 'Ẩn' : 'Giải'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      commitWidgets(
                        board.widgets.filter((w) => w.id !== widget.id),
                        true
                      );
                      setSelectedWidgetIds((prev) => prev.filter((id) => id !== widget.id));
                    }}
                    className="rounded bg-white/15 p-1 text-white hover:bg-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3 text-[13.5px] text-slate-800">
                {widget.type === 'bank_question' && widget.question && (
                  <div className="space-y-2">
                    <div className="leading-relaxed font-medium text-slate-900">
                      <MathText
                        text={stripDuplicateHeadingFromStem(widget.question.stem, widget.title)}
                      />
                    </div>
                    {widget.question.diagram && (
                      <div className="my-1 flex justify-center">
                        <ExamDiagram kind={widget.question.diagram} layer="stem" />
                      </div>
                    )}
                    {widget.question.image && (
                      <div className="my-1 flex justify-center">
                        <img
                          src={widget.question.image}
                          alt="Hình minh họa câu hỏi"
                          className="max-h-40 rounded object-contain"
                          draggable={false}
                        />
                      </div>
                    )}
                    {widget.question.options && (
                      <div className="grid grid-cols-2 gap-1.5 text-[13px]">
                        {widget.question.options.map((opt, idx) => {
                          const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, idx);
                          return (
                            <div key={idx} className="rounded bg-slate-50 px-2 py-1">
                              <strong className="text-[#136F63]">{letter}.</strong>{' '}
                              <MathText text={cleanOpt} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {widget.question.statements && (
                      <div className="space-y-1 text-[12.5px]">
                        {widget.question.statements.map((st) => (
                          <div key={st.label} className="rounded bg-slate-50 px-2 py-1">
                            <strong className="text-[#136F63]">{st.label})</strong>{' '}
                            <MathText text={st.text} />
                          </div>
                        ))}
                      </div>
                    )}
                    {widget.showSolution &&
                      (widget.question.solutionSteps?.length ||
                        widget.question.statements?.length ||
                        widget.question.answer) && (
                        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/70 p-2 text-[12.5px]">
                          {normalizeSolutionSteps(
                            widget.question.solutionSteps &&
                              widget.question.solutionSteps.length > 0
                              ? widget.question.solutionSteps
                              : widget.question.statements?.map((st) => ({
                                  stepTitle: st.stepTitle,
                                  leadIn: st.leadIn,
                                  content: `${st.explanation} (${st.label}) ${st.isTrue ? 'Đúng' : 'Sai'})`,
                                }))
                          ).map((st, idx) => (
                            <div
                              key={idx}
                              className="mb-1 text-justify leading-relaxed text-slate-800 last:mb-0"
                            >
                              <strong className="text-[#136F63]">{st.label}</strong>{' '}
                              <MathText text={st.body} />
                            </div>
                          ))}
                          {widget.question.answer ? (
                            <div className="mt-1.5 rounded border border-rose-200 bg-rose-50/80 px-2 py-1 font-bold text-rose-800">
                              <span className="mr-1">Đáp số / Kết luận:</span>
                              <MathText text={stripAnswerPrefix(widget.question.answer)} />
                            </div>
                          ) : widget.question.options && typeof widget.question.correctIndex === 'number' ? (
                            <div className="mt-1.5 rounded border border-rose-200 bg-rose-50/80 px-2 py-1 font-bold text-rose-800">
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
                  <img
                    src={widget.imageUrl}
                    alt={widget.title}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                )}

                {widget.type === 'youtube' && widget.youtubeEmbedUrl && (
                  <iframe
                    src={widget.youtubeEmbedUrl}
                    title={widget.title}
                    className="h-full w-full rounded border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}

                {widget.type === 'ai_katex_card' && (
                  <div className="space-y-2">
                    {widget.katexContent && (
                      <div className="rounded border border-emerald-200 bg-emerald-50/60 p-2">
                        <MathText text={widget.katexContent} />
                      </div>
                    )}
                    {widget.stepsContent && widget.stepsContent.length > 0 && (
                      <div className="space-y-1 text-[12.5px]">
                        {normalizeSolutionSteps(widget.stepsContent).map((st, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-slate-200 bg-slate-50 p-1.5 text-justify leading-relaxed text-slate-800"
                          >
                            <strong className="text-[#136F63]">{st.label}</strong>{' '}
                            <MathText text={st.body} />
                          </div>
                        ))}
                      </div>
                    )}
                    {widget.finalAnswer && (
                      <div className="rounded border border-rose-200 bg-rose-50/80 px-2 py-1 font-bold text-rose-800">
                        <span className="mr-1">Đáp số / Kết luận:</span>
                        <MathText text={stripAnswerPrefix(widget.finalAnswer)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Animated Marching-Ants Smart Lasso Path on Right Board */}
        {freehandLasso && freehandLasso.points.length >= 2 && (() => {
          const pts = freehandLasso.points;
          const openD = pts
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(' ');
          const closedD = `${openD} Z`;
          const firstPt = pts[0];
          const lastPt = pts[pts.length - 1];
          const invZoom = 1 / Math.max(zoom, 0.35);
          const sw = Math.max(1.8, 2.6 * invZoom);
          const dashLen = 10 * invZoom;
          const gapLen = 6 * invZoom;

          return (
            <svg
              className="pointer-events-none absolute top-0 left-0 z-30 overflow-visible"
              width="1"
              height="1"
            >
              <path
                d={closedD}
                fill={freehandLasso.closing ? 'rgba(19,111,99,0.16)' : 'rgba(19,111,99,0.10)'}
                stroke="none"
              />
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
              <path
                d={freehandLasso.active ? openD : closedD}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={sw + 1.4 * invZoom}
                strokeOpacity="0.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={freehandLasso.active ? openD : closedD}
                fill="none"
                stroke="#136F63"
                strokeWidth={sw}
                strokeDasharray={`${dashLen} ${gapLen}`}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="smartboard-lasso-ants"
              />
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

        {/* Unified 9-Point Transform Box & 44px Floating Action Bar on Right Board */}
        {totalSelectedCount > 0 && (() => {
          const isSingleWidgetTarget = Boolean(
            selectedWidget && !selectedStroke && !isMultiSelection
          );
          let computedBox: TransformBox;
          let frameRotationDeg = 0;

          if (isMultiSelection) {
            if (activeGroupRotateFrame) {
              computedBox = activeGroupRotateFrame.box;
              frameRotationDeg = activeGroupRotateFrame.angleDeg;
            } else {
              const boxes: TransformBox[] = [];
              for (const st of selectedStrokes) {
                const a = computeRotatedBoxAABB(
                  computeStrokeBoundingBox(st),
                  getStrokeRotationDeg(st)
                );
                boxes.push({
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
                boxes.push({
                  x: a.minX,
                  y: a.minY,
                  width: Math.max(24, a.maxX - a.minX),
                  height: Math.max(24, a.maxY - a.minY),
                });
              }
              computedBox = computeUnionTransformBox(boxes) || {
                x: 80,
                y: 80,
                width: 120,
                height: 80,
              };
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
          const toolbarScale = Math.max(0.72, Math.min(1.12, 1 / Math.max(zoom, 0.5)));
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
          const minW = isMultiSelection ? 48 : isSingleWidgetTarget ? 220 : isTemplate ? 90 : 28;
          const minH = isMultiSelection ? 48 : isSingleWidgetTarget ? 120 : isTemplate ? 80 : 28;

          const syncPointsForBox = (b: TransformBox): StrokePoint[] => [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x + b.width, y: b.y + b.height },
            { x: b.x, y: b.y + b.height },
            { x: b.x + b.width / 2, y: b.y + b.height / 2 },
          ];

          const startMoveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
            e.stopPropagation();
            onFocus();
            const startX = e.clientX;
            const startY = e.clientY;
            const origStrokes = board.strokes;
            const origWidgets = board.widgets;
            const preSnapshot: SmartboardHistorySnapshot = {
              strokes: origStrokes,
              widgets: origWidgets,
            };
            const moveS = new Set(selectedStrokeIds);
            const moveW = new Set(selectedWidgetIds);
            let didMutate = false;

            const onMove = (mv: PointerEvent) => {
              const dx = (mv.clientX - startX) / zoom;
              const dy = (mv.clientY - startY) / zoom;
              if (Math.hypot(dx, dy) > 1.2) didMutate = true;
              commitState(
                origStrokes.map((st) => {
                  if (!moveS.has(st.id)) return st;
                  if (st.templateBox) {
                    const nb: TransformBox = {
                      ...st.templateBox,
                      x: Math.round(st.templateBox.x + dx),
                      y: Math.round(st.templateBox.y + dy),
                    };
                    return { ...st, templateBox: nb, points: syncPointsForBox(nb) };
                  }
                  return {
                    ...st,
                    points: st.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
                  };
                }),
                origWidgets.map((w) =>
                  moveW.has(w.id)
                    ? { ...w, x: Math.round(w.x + dx), y: Math.round(w.y + dy) }
                    : w
                ),
                false
              );
            };
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              window.removeEventListener('pointercancel', onUp);
              if (didMutate) pushUndoSnapshot(preSnapshot);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
          };

          const startResizeDrag = (
            e: React.PointerEvent<HTMLDivElement>,
            dir: ResizeHandleDir
          ) => {
            e.stopPropagation();
            e.preventDefault();
            onFocus();
            const startX = e.clientX;
            const startY = e.clientY;
            const origBox = { ...targetBox };
            const origStrokes = board.strokes;
            const origWidgets = board.widgets;
            const preSnapshot: SmartboardHistorySnapshot = {
              strokes: origStrokes,
              widgets: origWidgets,
            };
            const origStroke = selectedStroke;
            const origRawBounds = origStroke ? getStrokeRawBounds(origStroke) : null;
            const rS = new Set(selectedStrokeIds);
            const rW = new Set(selectedWidgetIds);
            const groupWorldPts = new Map<string, StrokePoint[]>();
            if (isMultiSelection) {
              for (const st of origStrokes) {
                if (!rS.has(st.id) || st.templateBox) continue;
                const rot = getStrokeRotationDeg(st);
                if (Math.abs(rot) > 0.01) {
                  const rb = getStrokeRawBounds(st);
                  groupWorldPts.set(
                    st.id,
                    st.points.map((p) => {
                      const rp = rotatePointAround(p.x, p.y, rb.cx, rb.cy, rot);
                      return { ...p, x: rp.x, y: rp.y };
                    })
                  );
                } else {
                  groupWorldPts.set(st.id, st.points);
                }
              }
            }
            let didMutate = false;

            const onMove = (mv: PointerEvent) => {
              const worldDx = (mv.clientX - startX) / zoom;
              const worldDy = (mv.clientY - startY) / zoom;
              if (Math.hypot(worldDx, worldDy) > 1.2) didMutate = true;
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
                commitState(
                  origStrokes.map((st) => {
                    if (!rS.has(st.id)) return st;
                    if (st.templateBox) {
                      const tb = st.templateBox;
                      const ntb: TransformBox = {
                        x: Math.round(nextBox.x + (tb.x - origBox.x) * sx),
                        y: Math.round(nextBox.y + (tb.y - origBox.y) * sy),
                        width: Math.max(48, Math.round(tb.width * sx)),
                        height: Math.max(40, Math.round(tb.height * sy)),
                      };
                      return { ...st, templateBox: ntb, points: syncPointsForBox(ntb) };
                    }
                    const srcPts = groupWorldPts.get(st.id) || st.points;
                    return {
                      ...st,
                      rotationDeg: 0,
                      points: srcPts.map((p) => ({
                        ...p,
                        x: nextBox.x + (p.x - origBox.x) * sx,
                        y: nextBox.y + (p.y - origBox.y) * sy,
                      })),
                    };
                  }),
                  origWidgets.map((w) =>
                    rW.has(w.id)
                      ? {
                          ...w,
                          x: Math.round(nextBox.x + (w.x - origBox.x) * sx),
                          y: Math.round(nextBox.y + (w.y - origBox.y) * sy),
                          width: Math.max(180, Math.round(w.width * sx)),
                          height: Math.max(100, Math.round(w.height * sy)),
                        }
                      : w
                  ),
                  false
                );
              } else if (origStroke) {
                if (origStroke.templateBox) {
                  const rb: TransformBox = {
                    x: Math.round(nextBox.x),
                    y: Math.round(nextBox.y),
                    width: Math.round(nextBox.width),
                    height: Math.round(nextBox.height),
                  };
                  updateSelectedStroke(
                    (st) => ({ ...st, templateBox: rb, points: syncPointsForBox(rb) }),
                    false
                  );
                } else if (origRawBounds) {
                  const mapped = mapPointsToResizedBox(
                    origStroke.points,
                    origRawBounds,
                    nextBox,
                    8
                  );
                  updateSelectedStroke((st) => ({ ...st, points: mapped }), false);
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
              if (didMutate) pushUndoSnapshot(preSnapshot);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
          };

          const startRotateDrag = (e: React.PointerEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            onFocus();
            const origBox = { ...targetBox };
            const cx = origBox.x + origBox.width / 2;
            const cy = origBox.y + origBox.height / 2;
            const origStrokes = board.strokes;
            const origWidgets = board.widgets;
            const preSnapshot: SmartboardHistorySnapshot = {
              strokes: origStrokes,
              widgets: origWidgets,
            };
            const rotS = new Set(selectedStrokeIds);
            const rotW = new Set(selectedWidgetIds);
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
              setActiveTransformBadge({ kind: 'rotate', angleDeg: nextDeg });

              if (isMultiSelection) {
                setActiveGroupRotateFrame({ box: origBox, angleDeg: nextDeg });
                commitState(
                  origStrokes.map((st) => {
                    if (!rotS.has(st.id)) return st;
                    const newRot = normalizeAngleDeg(getStrokeRotationDeg(st) + nextDeg);
                    if (st.templateBox) {
                      const tb = st.templateBox;
                      const rc = rotatePointAround(
                        tb.x + tb.width / 2,
                        tb.y + tb.height / 2,
                        cx,
                        cy,
                        nextDeg
                      );
                      const ntb: TransformBox = {
                        ...tb,
                        x: Math.round(rc.x - tb.width / 2),
                        y: Math.round(rc.y - tb.height / 2),
                      };
                      return {
                        ...st,
                        rotationDeg: newRot,
                        templateBox: ntb,
                        templateConfig: st.templateConfig
                          ? { ...st.templateConfig, rotationDeg: newRot }
                          : st.templateConfig,
                        points: syncPointsForBox(ntb),
                      };
                    }
                    const rb = getStrokeRawBounds(st);
                    const rc = rotatePointAround(rb.cx, rb.cy, cx, cy, nextDeg);
                    const dx = rc.x - rb.cx;
                    const dy = rc.y - rb.cy;
                    return {
                      ...st,
                      rotationDeg: newRot,
                      points: st.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
                    };
                  }),
                  origWidgets.map((w) => {
                    if (!rotW.has(w.id)) return w;
                    const rc = rotatePointAround(
                      w.x + w.width / 2,
                      w.y + w.height / 2,
                      cx,
                      cy,
                      nextDeg
                    );
                    return {
                      ...w,
                      x: Math.round(rc.x - w.width / 2),
                      y: Math.round(rc.y - w.height / 2),
                      rotationDeg: normalizeAngleDeg((w.rotationDeg || 0) + nextDeg),
                    };
                  }),
                  false
                );
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
                updateSelectedWidget((w) => ({ ...w, rotationDeg: nextDeg }), false);
              }
            };
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              window.removeEventListener('pointercancel', onUp);
              setActiveTransformBadge(null);
              setActiveGroupRotateFrame(null);
              if (didMutate) pushUndoSnapshot(preSnapshot);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
          };

          const handleResetRot = () => {
            commitState(
              board.strokes.map((st) =>
                selectedStrokeIdSet.has(st.id)
                  ? {
                      ...st,
                      rotationDeg: 0,
                      templateConfig: st.templateConfig
                        ? { ...st.templateConfig, rotationDeg: 0 }
                        : st.templateConfig,
                    }
                  : st
              ),
              board.widgets.map((w) =>
                selectedWidgetIdSet.has(w.id) ? { ...w, rotationDeg: 0 } : w
              ),
              true
            );
          };

          return (
            <>
              <div
                style={{
                  left: `${targetBox.x}px`,
                  top: `${targetBox.y}px`,
                  width: `${targetBox.width}px`,
                  height: `${targetBox.height}px`,
                  transform: frameRotationDeg ? `rotate(${frameRotationDeg}deg)` : undefined,
                  transformOrigin: 'center center',
                }}
                onPointerDown={!isSingleWidgetTarget ? startMoveDrag : undefined}
                className={`absolute z-40 rounded-[6px] border-2 border-dashed border-[#136F63] select-none ${
                  isSingleWidgetTarget
                    ? 'pointer-events-none bg-transparent'
                    : 'pointer-events-auto cursor-move bg-emerald-500/[0.06]'
                }`}
              >
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
                  onPointerDown={startRotateDrag}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleResetRot();
                  }}
                  style={{
                    left: '50%',
                    top: `${-38 * handleInvScale}px`,
                    transform: `translate(-50%, -50%) scale(${handleInvScale})`,
                  }}
                  className="pointer-events-auto absolute flex h-10 w-10 touch-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#136F63] text-white shadow-md">
                    <RotateCw className="h-3.5 w-3.5" />
                  </div>
                  {(activeTransformBadge?.kind === 'rotate' ||
                    Math.round(normalizeAngleDeg(frameRotationDeg)) !== 0) && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetRot();
                      }}
                      style={{ transform: `rotate(${-frameRotationDeg}deg)` }}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-[#0F172A] px-2 py-0.5 text-[11px] font-extrabold text-white whitespace-nowrap shadow-md"
                    >
                      {activeTransformBadge?.kind === 'rotate'
                        ? `${activeTransformBadge.angleDeg}°`
                        : `${Math.round(normalizeAngleDeg(frameRotationDeg))}°`}
                    </button>
                  )}
                </div>

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

                {RESIZE_HANDLE_CONFIGS.map((h) => {
                  const isHorizontalEdge = h.dir === 'n' || h.dir === 's';
                  return (
                    <div
                      key={h.dir}
                      onPointerDown={(e) => startResizeDrag(e, h.dir)}
                      style={{
                        left: `${h.leftPct}%`,
                        top: `${h.topPct}%`,
                        transform: `translate(-50%, -50%) scale(${handleInvScale})`,
                        cursor: getRotatedResizeCursor(h.dir, frameRotationDeg),
                      }}
                      title={h.label}
                      className="pointer-events-auto absolute z-40 flex h-9 w-9 touch-none items-center justify-center"
                    >
                      {h.isCorner ? (
                        <span className="h-3.5 w-3.5 rounded-[4px] border-[2.5px] border-[#136F63] bg-white shadow-md" />
                      ) : isHorizontalEdge ? (
                        <span className="h-2.5 w-5 rounded-full border-2 border-[#136F63] bg-white shadow-md" />
                      ) : (
                        <span className="h-5 w-2.5 rounded-full border-2 border-[#136F63] bg-white shadow-md" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 44px Floating Action Bar directly below selection on Right Board */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  left: `${aabb.centerX}px`,
                  top: `${aabb.maxY + 22 / Math.max(zoom, 0.45)}px`,
                  transform: `translateX(-50%) scale(${toolbarScale})`,
                  transformOrigin: 'top center',
                }}
                className="pointer-events-auto absolute z-50 flex flex-col items-center gap-1.5 rounded-[12px] border-2 border-[#136F63] bg-white/98 p-1.5 text-[11.5px] whitespace-nowrap shadow-2xl select-none"
              >
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopySelection}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    <span>Sao chép</span>
                  </button>
                  {clipboardData && (
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border border-[#136F63]/40 bg-emerald-50 px-2.5 py-1.5 font-bold text-[#136F63]"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                      <span>Dán</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDuplicateSelection}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-700 hover:border-[#136F63] hover:text-[#136F63]"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Nhân bản</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSelectedLineStyle}
                    className={`inline-flex min-h-[44px] items-center gap-1 rounded-[8px] px-2.5 py-1.5 font-bold ${
                      activeLineStyle === 'dashed'
                        ? 'bg-[#136F63] text-white'
                        : 'border border-[#136F63] bg-emerald-50 text-[#136F63]'
                    }`}
                  >
                    <span className="font-mono">{activeLineStyle === 'dashed' ? '- -' : '—'}</span>
                    <span>{activeLineStyle === 'dashed' ? 'Đứt' : 'Liền'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatioLocked((v) => !v)}
                    className={`inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border px-2 py-1.5 font-bold ${
                      aspectRatioLocked
                        ? 'border-[#136F63] bg-[#136F63] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {aspectRatioLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex min-h-[44px] items-center gap-1 rounded-[8px] border border-slate-200 bg-slate-50 px-1.5">
                    {QUICK_INK_PALETTE.map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => handleBatchChangeColor(c.color)}
                        title={`Đổi màu ${c.label}`}
                        className={`h-6 w-6 rounded-full border-2 ${
                          activeColor.toLowerCase() === c.color.toLowerCase()
                            ? 'scale-110 border-[#136F63]'
                            : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] bg-red-50 px-2.5 py-1.5 font-bold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Xóa</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-[8px] text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {isTemplate && tplCfg ? (
                  <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1">
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
                      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-bold ${
                        tplCfg.showLabels
                          ? 'bg-[#136F63] text-white'
                          : 'border border-slate-300 bg-slate-50 text-slate-700'
                      }`}
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
                        className="rounded-[5px] border border-emerald-300 bg-emerald-50 px-1.5 py-1 text-[11px] font-bold text-[#136F63]"
                      >
                        {tplCatalog.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : selectedStrokes.length > 0 ? (
                  <div className="flex items-center gap-1 border-t border-slate-100 pt-1 text-[11px]">
                    {LINE_STYLE_PRESETS.map((ls) => (
                      <button
                        key={ls.id}
                        type="button"
                        onClick={() => handleBatchChangeLineStyle(ls.id)}
                        className={`rounded-[5px] border px-2 py-0.5 font-bold ${
                          activeLineStyle === ls.id
                            ? 'border-[#136F63] bg-emerald-50 text-[#136F63]'
                            : 'border-slate-200 bg-white text-slate-700'
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
      </div>
    </div>
  );
};
