import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Maximize2,
  Minimize2,
  NotebookPen,
  PenLine,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface SmartboardViewportProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Shows pen toolbar immediately when true (e.g. student live exam mode) */
  showPenToolbarByDefault?: boolean;
  /** Automatically enter fullscreen on mount */
  defaultFullscreen?: boolean;
  /** Notify parent on fullscreen change */
  onFullscreenChange?: (fs: boolean) => void;
  /** Optional close button for modal mode */
  isModal?: boolean;
  onCloseModal?: () => void;
  maxWidthClass?: string;
  bodyClassName?: string;
  className?: string;
  /** Set true to disable inner scroll container when child uses full-height flex/canvas */
  disableInnerScroll?: boolean;
  children: React.ReactNode;
}

type PenColor = '#DC2626' | '#0369A1' | '#0F172A' | '#EAB308';
type PenTool = 'off' | 'pen' | 'eraser';

const PEN_COLORS: { color: PenColor; label: string; ring: string }[] = [
  { color: '#DC2626', label: 'Đỏ', ring: 'ring-[#DC2626]' },
  { color: '#0369A1', label: 'Xanh dương', ring: 'ring-[#0369A1]' },
  { color: '#0F172A', label: 'Đen', ring: 'ring-[#0F172A]' },
  { color: '#EAB308', label: 'Vàng', ring: 'ring-[#EAB308]' },
];

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, label, [role="button"], [data-no-zoom="true"], canvas[data-interactive-canvas="true"]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export const SmartboardViewport: React.FC<SmartboardViewportProps> = ({
  title,
  subtitle,
  headerActions,
  showPenToolbarByDefault = false,
  defaultFullscreen = false,
  onFullscreenChange,
  isModal = false,
  onCloseModal,
  maxWidthClass = 'max-w-5xl',
  bodyClassName = '',
  className = '',
  disableInnerScroll = false,
  children,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(defaultFullscreen);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Pen & Scratchpad states
  const [penVisible, setPenVisible] = useState(showPenToolbarByDefault);
  const [penTool, setPenTool] = useState<PenTool>('off');
  const [penColor, setPenColor] = useState<PenColor>('#DC2626');
  const [showScratchpad, setShowScratchpad] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable refs for lag-free touch/pinch/pan
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  useEffect(() => {
    transformRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  const touchStateRef = useRef<{
    mode: 'none' | 'pan' | 'scroll' | 'pinch';
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    startScrollTop: number;
    startScrollLeft: number;
    pinchDist: number;
    pinchMidX: number;
    pinchMidY: number;
    pinchStartScale: number;
    pinchStartTx: number;
    pinchStartTy: number;
    lastTapTime: number;
    lastTapX: number;
    lastTapY: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    startScrollTop: 0,
    startScrollLeft: 0,
    pinchDist: 0,
    pinchMidX: 0,
    pinchMidY: 0,
    pinchStartScale: 1,
    pinchStartTx: 0,
    pinchStartTy: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    moved: false,
  });

  const drawingRef = useRef<{
    activeCanvas: 'overlay' | 'scratch' | null;
    lastX: number;
    lastY: number;
    lastMidX: number;
    lastMidY: number;
    lastT: number;
    lastWidth: number;
    pendingSamples: Array<{ x: number; y: number; pressure: number; t: number; pointerType: string }>;
    rafId: number | null;
  }>({
    activeCanvas: null,
    lastX: 0,
    lastY: 0,
    lastMidX: 0,
    lastMidY: 0,
    lastT: 0,
    lastWidth: 3.5,
    pendingSamples: [],
    rafId: null,
  });

  const toggleFullscreen = useCallback(
    (next?: boolean) => {
      setIsFullscreen((prev) => {
        const val = typeof next === 'boolean' ? next : !prev;
        if (val) {
          setPenVisible(true);
        }
        onFullscreenChange?.(val);
        return val;
      });
    },
    [onFullscreenChange]
  );

  // ESC closes fullscreen (or modal if not fullscreen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          e.stopPropagation();
          toggleFullscreen(false);
        } else if (isModal && onCloseModal) {
          onCloseModal();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, isModal, onCloseModal, toggleFullscreen]);

  // Clamp pan translation neatly within bounds
  const clampTransform = useCallback((nextScale: number, nextTx: number, nextTy: number) => {
    const clampedScale = Math.min(3, Math.max(1, nextScale));
    if (clampedScale <= 1.001) {
      return { scale: 1, tx: 0, ty: 0 };
    }
    const vp = viewportRef.current;
    const cw = contentWrapperRef.current;
    if (!vp || !cw) {
      return { scale: clampedScale, tx: nextTx, ty: nextTy };
    }
    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    const contentW = cw.offsetWidth * clampedScale;
    const contentH = Math.max(cw.offsetHeight, vpH) * clampedScale;

    const minTx = Math.min(0, vpW - contentW - 24);
    const minTy = Math.min(0, vpH - contentH - 24);

    return {
      scale: clampedScale,
      tx: Math.max(minTx, Math.min(24, nextTx)),
      ty: Math.max(minTy, Math.min(24, nextTy)),
    };
  }, []);

  const applyZoom = useCallback(
    (targetScale: number, anchorClientX?: number, anchorClientY?: number) => {
      const vp = viewportRef.current;
      const cur = transformRef.current;
      const nextScale = Math.min(3, Math.max(1, Number(targetScale.toFixed(2))));

      if (!vp) {
        setScale(nextScale);
        if (nextScale === 1) {
          setTx(0);
          setTy(0);
        }
        return;
      }

      const rect = vp.getBoundingClientRect();
      const cx = anchorClientX !== undefined ? anchorClientX - rect.left : rect.width / 2;
      const cy = anchorClientY !== undefined ? anchorClientY - rect.top : rect.height / 2;

      const contentX = (cx - cur.tx) / cur.scale;
      const contentY = (cy - cur.ty) / cur.scale;

      const rawTx = cx - contentX * nextScale;
      const rawTy = cy - contentY * nextScale;

      const clamped = clampTransform(nextScale, rawTx, rawTy);
      setScale(clamped.scale);
      setTx(clamped.tx);
      setTy(clamped.ty);
    },
    [clampTransform]
  );

  const resetZoom = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  // Touch handlers for Pinch-to-Zoom, 1-finger Pan/Scroll, Double-tap
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (penTool !== 'off') return;
    const vp = viewportRef.current;
    if (!vp) return;
    const ts = touchStateRef.current;

    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = vp.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

      ts.mode = 'pinch';
      ts.pinchDist = Math.max(dist, 1);
      ts.pinchMidX = midX;
      ts.pinchMidY = midY;
      ts.pinchStartScale = transformRef.current.scale;
      ts.pinchStartTx = transformRef.current.tx;
      ts.pinchStartTy = transformRef.current.ty;
      ts.moved = true;
      return;
    }

    if (e.touches.length === 1) {
      if (isInteractiveTarget(e.target)) {
        ts.mode = 'none';
        return;
      }
      const t = e.touches[0];
      ts.startX = t.clientX;
      ts.startY = t.clientY;
      ts.startTx = transformRef.current.tx;
      ts.startTy = transformRef.current.ty;
      ts.startScrollTop = vp.scrollTop;
      ts.startScrollLeft = vp.scrollLeft;
      ts.moved = false;
      ts.mode = transformRef.current.scale > 1.01 ? 'pan' : 'scroll';
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (penTool !== 'off') return;
    const vp = viewportRef.current;
    if (!vp) return;
    const ts = touchStateRef.current;

    if (e.touches.length === 2 && ts.mode === 'pinch') {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = vp.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

      const ratio = dist / ts.pinchDist;
      const nextScale = Math.min(3, Math.max(1, ts.pinchStartScale * ratio));

      const contentX = (ts.pinchMidX - ts.pinchStartTx) / ts.pinchStartScale;
      const contentY = (ts.pinchMidY - ts.pinchStartTy) / ts.pinchStartScale;

      const rawTx = midX - contentX * nextScale;
      const rawTy = midY - contentY * nextScale;

      const clamped = clampTransform(nextScale, rawTx, rawTy);
      setScale(clamped.scale);
      setTx(clamped.tx);
      setTy(clamped.ty);
      ts.moved = true;
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - ts.startX;
      const dy = t.clientY - ts.startY;
      if (Math.hypot(dx, dy) > 6) {
        ts.moved = true;
      }

      if (ts.mode === 'pan') {
        const clamped = clampTransform(transformRef.current.scale, ts.startTx + dx, ts.startTy + dy);
        setTx(clamped.tx);
        setTy(clamped.ty);
      } else if (ts.mode === 'scroll' && !disableInnerScroll) {
        vp.scrollTop = ts.startScrollTop - dy;
        vp.scrollLeft = ts.startScrollLeft - dx;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (penTool !== 'off') return;
    const ts = touchStateRef.current;

    if (e.touches.length === 0 && !ts.moved && ts.mode !== 'none' && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const now = Date.now();
      const dt = now - ts.lastTapTime;
      const dist = Math.hypot(t.clientX - ts.lastTapX, t.clientY - ts.lastTapY);

      if (dt > 40 && dt < 320 && dist < 36 && !isInteractiveTarget(e.target)) {
        // Double tap toggles 100% <-> 150%
        if (transformRef.current.scale > 1.15) {
          resetZoom();
        } else {
          applyZoom(1.5, t.clientX, t.clientY);
        }
        ts.lastTapTime = 0;
      } else {
        ts.lastTapTime = now;
        ts.lastTapX = t.clientX;
        ts.lastTapY = t.clientY;
      }
    }

    if (e.touches.length === 0) {
      ts.mode = 'none';
    }
  };

  // Resize canvases cleanly to container size without losing existing ink if resized softly
  const syncCanvasSize = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      const temp = document.createElement('canvas');
      temp.width = canvas.width;
      temp.height = canvas.height;
      const tctx = temp.getContext('2d');
      if (tctx && canvas.width > 0 && canvas.height > 0) {
        tctx.drawImage(canvas, 0, 0);
      }
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        if (temp.width > 0 && temp.height > 0) {
          ctx.drawImage(temp, 0, 0, w, h);
        }
      }
    }
  }, []);

  useEffect(() => {
    syncCanvasSize(overlayCanvasRef.current);
    if (showScratchpad) {
      syncCanvasSize(scratchCanvasRef.current);
    }
    const handleResize = () => {
      syncCanvasSize(overlayCanvasRef.current);
      if (showScratchpad) {
        syncCanvasSize(scratchCanvasRef.current);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen, showScratchpad, penVisible, syncCanvasSize]);

  // Drawing handlers for both Overlay Canvas & Scratchpad Canvas
  const getCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const flushViewportInkSamples = (canvas: HTMLCanvasElement) => {
    const state = drawingRef.current;
    if (state.pendingSamples.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      state.pendingSamples = [];
      return;
    }

    const isEraser = penTool === 'eraser';
    ctx.save();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : penColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const sample of state.pendingSamples) {
      const midX = (state.lastX + sample.x) / 2;
      const midY = (state.lastY + sample.y) / 2;

      let targetW = isEraser ? 28 : 3.5;
      if (!isEraser) {
        if (sample.pointerType === 'pen' && sample.pressure > 0 && Math.abs(sample.pressure - 0.5) > 0.015) {
          targetW = 2.2 + Math.min(1, Math.max(0, sample.pressure)) * 2.8;
        } else {
          const dt = Math.max(4, sample.t - state.lastT);
          const dist = Math.hypot(sample.x - state.lastX, sample.y - state.lastY);
          const speed = dist / dt;
          targetW = Math.max(2.6, Math.min(4.2, 4.1 - speed * 0.75));
        }
        targetW = state.lastWidth * 0.68 + targetW * 0.32;
      }

      ctx.beginPath();
      ctx.lineWidth = targetW;
      ctx.moveTo(state.lastMidX, state.lastMidY);
      ctx.quadraticCurveTo(state.lastX, state.lastY, midX, midY);
      ctx.stroke();

      state.lastX = sample.x;
      state.lastY = sample.y;
      state.lastMidX = midX;
      state.lastMidY = midY;
      state.lastT = sample.t;
      state.lastWidth = targetW;
    }

    ctx.restore();
    state.pendingSamples = [];
  };

  const handleCanvasPointerDown = (
    target: 'overlay' | 'scratch',
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (target === 'overlay' && penTool === 'off') return;
    const canvas = e.currentTarget;
    syncCanvasSize(canvas);
    canvas.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(canvas, e.clientX, e.clientY);
    const nowT = e.timeStamp || performance.now();
    drawingRef.current = {
      activeCanvas: target,
      lastX: pt.x,
      lastY: pt.y,
      lastMidX: pt.x,
      lastMidY: pt.y,
      lastT: nowT,
      lastWidth: penTool === 'eraser' ? 28 : 3.5,
      pendingSamples: [],
      rafId: null,
    };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const isEraser = penTool === 'eraser';
    ctx.save();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : penColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isEraser ? 14 : 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handleCanvasPointerMove = (
    target: 'overlay' | 'scratch',
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (drawingRef.current.activeCanvas !== target) return;
    const canvas = e.currentTarget;
    const nativeEvt = e.nativeEvent as PointerEvent;
    const coalesced =
      typeof nativeEvt.getCoalescedEvents === 'function'
        ? nativeEvt.getCoalescedEvents()
        : [nativeEvt];
    const events = coalesced.length > 0 ? coalesced : [nativeEvt];

    for (const evt of events) {
      const pt = getCanvasPoint(canvas, evt.clientX, evt.clientY);
      drawingRef.current.pendingSamples.push({
        x: pt.x,
        y: pt.y,
        pressure: evt.pressure ?? e.pressure,
        t: evt.timeStamp || performance.now(),
        pointerType: evt.pointerType || e.pointerType,
      });
    }

    if (drawingRef.current.rafId === null) {
      drawingRef.current.rafId = window.requestAnimationFrame(() => {
        drawingRef.current.rafId = null;
        flushViewportInkSamples(canvas);
      });
    }
  };

  const handleCanvasPointerUp = (
    target: 'overlay' | 'scratch',
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (drawingRef.current.activeCanvas !== target) return;
    if (drawingRef.current.rafId !== null) {
      window.cancelAnimationFrame(drawingRef.current.rafId);
      drawingRef.current.rafId = null;
    }
    flushViewportInkSamples(e.currentTarget);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    drawingRef.current.activeCanvas = null;
  };

  const clearAllInk = () => {
    [overlayCanvasRef.current, scratchCanvasRef.current].forEach((canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
  };

  const activatePenColor = (color: PenColor) => {
    setPenColor(color);
    setPenTool('pen');
    setPenVisible(true);
  };

  const showFloatingPenBar = isFullscreen || penVisible || showPenToolbarByDefault;

  const containerInner = (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950'
          : isModal
            ? `flex max-h-[90vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${className}`
            : `flex flex-col overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`
      }
    >
      {/* Title Bar */}
      <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0 flex-1">
          {title && (
            <div className="truncate text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="truncate text-[12px] text-[#64748B] dark:text-slate-400">{subtitle}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {headerActions}

          <button
            type="button"
            onClick={() => {
              setPenVisible((v) => !v);
              if (!penVisible && penTool === 'off') {
                setPenTool('pen');
              } else if (penVisible) {
                setPenTool('off');
              }
            }}
            title="Bật / tắt thanh bút viết cảm ứng Smartboard"
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition-colors ${
              penTool !== 'off' || penVisible
                ? 'border-[#136F63] bg-[#136F63] text-white hover:bg-[#0F594F]'
                : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <PenLine className="h-4 w-4" />
            <span className="hidden sm:inline">Bút viết</span>
          </button>

          <button
            type="button"
            onClick={() => toggleFullscreen()}
            title={isFullscreen ? 'Thu nhỏ (ESC)' : 'Phóng toàn màn hình Smartboard'}
            aria-label={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Phóng toàn màn hình'}
            className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#136F63] transition-colors hover:border-[#136F63] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>

          {isModal && onCloseModal && (
            <button
              type="button"
              onClick={() => {
                if (isFullscreen) toggleFullscreen(false);
                onCloseModal();
              }}
              aria-label="Đóng hộp thoại"
              className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Split Workspace (Content Viewport + Optional Scratchpad) */}
      <div
        className={`relative flex min-h-0 flex-1 flex-col ${
          showScratchpad ? 'lg:flex-row' : ''
        }`}
      >
        {/* Left/Main Pinch-Zoom-Pan + Pen Overlay Viewport */}
        <div
          ref={viewportRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`relative flex-1 touch-none ${
            disableInnerScroll ? 'overflow-hidden' : 'overflow-auto'
          } ${isFullscreen ? 'smartboard-fs-content bg-white p-4 sm:p-6 dark:bg-slate-950' : bodyClassName}`}
        >
          {/* Zoomable/Pannable Content */}
          <div
            ref={contentWrapperRef}
            style={{
              transform:
                scale === 1 && tx === 0 && ty === 0
                  ? undefined
                  : `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
              transformOrigin: '0 0',
            }}
            className="min-h-full w-full transition-transform duration-75 ease-out"
          >
            {children}
          </div>

          {/* Smartboard Transparent Annotation Canvas */}
          <canvas
            ref={overlayCanvasRef}
            onPointerDown={(e) => handleCanvasPointerDown('overlay', e)}
            onPointerMove={(e) => handleCanvasPointerMove('overlay', e)}
            onPointerUp={(e) => handleCanvasPointerUp('overlay', e)}
            onPointerCancel={(e) => handleCanvasPointerUp('overlay', e)}
            className={`no-print absolute inset-0 z-30 h-full w-full ${
              penTool !== 'off'
                ? 'pointer-events-auto cursor-crosshair touch-none'
                : 'pointer-events-none'
            }`}
          />

          {/* Floating Zoom Bar (Bottom-Right) */}
          <div className="no-print sticky bottom-3 z-40 ml-auto mt-3 flex w-fit items-center gap-1 rounded-[8px] border border-[#E2E8F0] bg-white/95 p-1 shadow-lg backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/95">
            <button
              type="button"
              onClick={() => applyZoom(scale - 0.25)}
              disabled={scale <= 1}
              title="Thu nhỏ"
              className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[54px] text-center text-[13px] font-semibold tabular-nums text-[#0F172A] dark:text-slate-100">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => applyZoom(scale + 0.25)}
              disabled={scale >= 3}
              title="Phóng to"
              className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              disabled={scale === 1 && tx === 0 && ty === 0}
              title="Đặt lại 100%"
              className="inline-flex h-11 min-h-[44px] items-center gap-1 rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 text-[12.5px] font-medium text-[#334155] hover:border-[#136F63] hover:text-[#136F63] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>100%</span>
            </button>
          </div>
        </div>

        {/* Optional Split-Screen Whiteboard Scratchpad */}
        {showScratchpad && (
          <div className="no-print relative flex min-h-[300px] flex-1 flex-col border-t border-[#E2E8F0] bg-white lg:border-t-0 lg:border-l dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 dark:border-slate-800 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#136F63] dark:text-emerald-400">
                <NotebookPen className="h-4 w-4" />
                <span>Giấy nháp Smartboard (Viết tay trực tiếp)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const c = scratchCanvasRef.current;
                    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-medium text-[#334155] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa nháp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowScratchpad(false)}
                  className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div
              className="relative flex-1 bg-white"
              style={{
                backgroundImage:
                  'radial-gradient(#CBD5E1 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            >
              <canvas
                ref={scratchCanvasRef}
                data-interactive-canvas="true"
                onPointerDown={(e) => {
                  if (penTool === 'off') setPenTool('pen');
                  handleCanvasPointerDown('scratch', e);
                }}
                onPointerMove={(e) => handleCanvasPointerMove('scratch', e)}
                onPointerUp={(e) => handleCanvasPointerUp('scratch', e)}
                onPointerCancel={(e) => handleCanvasPointerUp('scratch', e)}
                className="h-full w-full cursor-crosshair touch-none"
              />
            </div>
          </div>
        )}

        {/* Floating Smartboard Pen Toolbar */}
        {showFloatingPenBar && (
          <div className="no-print absolute top-3 right-3 z-40 flex flex-col items-center gap-1.5 rounded-[8px] border border-[#E2E8F0] bg-white/95 p-1.5 shadow-lg backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/95">
            <button
              type="button"
              onClick={() => setPenTool((t) => (t === 'pen' ? 'off' : 'pen'))}
              title={penTool === 'pen' ? 'Tắt bút để chạm lướt/chọn đáp án' : 'Bật bút viết cảm ứng'}
              className={`inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border transition-colors ${
                penTool === 'pen'
                  ? 'border-[#136F63] bg-[#136F63] text-white'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]'
              }`}
            >
              <PenLine className="h-5 w-5" />
            </button>

            <div className="my-0.5 h-px w-7 bg-[#E2E8F0]" />

            {PEN_COLORS.map((item) => (
              <button
                key={item.color}
                type="button"
                onClick={() => activatePenColor(item.color)}
                title={`Mực ${item.label}`}
                aria-label={`Chọn bút màu ${item.label}`}
                className={`inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-[6px] transition-transform ${
                  penTool === 'pen' && penColor === item.color
                    ? `ring-2 ${item.ring} bg-[#F8FAFC] scale-105`
                    : 'hover:bg-[#F1F5F9]'
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full border border-slate-300"
                  style={{ backgroundColor: item.color }}
                />
              </button>
            ))}

            <div className="my-0.5 h-px w-7 bg-[#E2E8F0]" />

            <button
              type="button"
              onClick={() => setPenTool((t) => (t === 'eraser' ? 'off' : 'eraser'))}
              title="Cục tẩy nét viết"
              className={`inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border transition-colors ${
                penTool === 'eraser'
                  ? 'border-[#136F63] bg-[#E0F2FE] text-[#0369A1]'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]'
              }`}
            >
              <Eraser className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={clearAllInk}
              title="Xóa toàn bộ nét viết"
              className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border border-[#CBD5E1] bg-white text-[#B91C1C] hover:bg-[#FEE2E2]"
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowScratchpad((s) => {
                  const next = !s;
                  if (next && penTool === 'off') setPenTool('pen');
                  return next;
                });
              }}
              title="Mở vùng giấy nháp trắng bên cạnh đề bài"
              className={`inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border transition-colors ${
                showScratchpad
                  ? 'border-[#136F63] bg-[#136F63] text-white'
                  : 'border-[#CBD5E1] bg-white text-[#136F63] hover:bg-[#F1F5F9]'
              }`}
            >
              <NotebookPen className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (isModal && !isFullscreen) {
    return (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs">
        {containerInner}
      </div>
    );
  }

  return containerInner;
};
