import React, { useMemo, useRef, useState } from 'react';
import {
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  analyzeFunction,
  BbtInterval,
  BbtNode,
  formatViNumber,
  FunctionAnalysis,
} from '../utils/functionAnalyzer';
import { tactile3dClass } from '../utils/uiStyles';
import { SmartboardViewport } from './SmartboardViewport';

interface PresetFn {
  id: string;
  label: string;
  expr: string;
  xRange: [number, number];
  yRange: [number, number];
}

const PRESET_FUNCTIONS: PresetFn[] = [
  {
    id: 'cubic',
    label: 'Bậc 3',
    expr: 'x^3 - 3x^2 + 2',
    xRange: [-3, 4.5],
    yRange: [-4, 4.5],
  },
  {
    id: 'rational_11',
    label: 'Phân thức 1/1',
    expr: '(2x - 1)/(x + 1)',
    xRange: [-6, 5],
    yRange: [-4, 8],
  },
  {
    id: 'rational_21',
    label: 'Phân thức 2/1',
    expr: '(-x^2 + x - 1)/(x + 1)',
    xRange: [-7, 5],
    yRange: [-5, 11],
  },
  {
    id: 'trig',
    label: 'Lượng giác',
    expr: 'sin(2x)',
    xRange: [-4, 4],
    yRange: [-2.5, 2.5],
  },
  {
    id: 'exp_log',
    label: 'Mũ - Logarit',
    expr: '(x - 1)*e^x',
    xRange: [-4.5, 3.5],
    yRange: [-2.5, 5],
  },
];

interface SymbolSnippet {
  label: string;
  insert: string;
  cursorBack: number;
  title: string;
}

const QUICK_SYMBOLS: SymbolSnippet[] = [
  { label: 'a/b', insert: '()/()', cursorBack: 4, title: 'Chèn phân thức (tử)/(mẫu)' },
  { label: '√', insert: 'sqrt()', cursorBack: 1, title: 'Chèn căn bậc hai √(...)' },
  { label: 'xⁿ', insert: '^()', cursorBack: 1, title: 'Chèn lũy thừa ^(...)' },
  { label: 'sin', insert: 'sin()', cursorBack: 1, title: 'Chèn hàm sin(...)' },
  { label: 'cos', insert: 'cos()', cursorBack: 1, title: 'Chèn hàm cos(...)' },
  { label: 'ln', insert: 'ln()', cursorBack: 1, title: 'Chèn lôgarit tự nhiên ln(...)' },
  { label: 'eˣ', insert: 'e^()', cursorBack: 1, title: 'Chèn hàm mũ cơ số e' },
  { label: 'π', insert: 'pi', cursorBack: 0, title: 'Chèn hằng số π' },
  { label: '|x|', insert: 'abs()', cursorBack: 1, title: 'Chèn giá trị tuyệt đối' },
];

function computeNiceViewBounds(analysis: FunctionAnalysis): {
  xRange: [number, number];
  yRange: [number, number];
} {
  if (!analysis.valid) return { xRange: [-5, 5], yRange: [-5, 5] };

  const keyXs = [
    ...analysis.extrema.map((e) => e.x),
    ...analysis.asymptotes.vertical.map((v) => v.x),
  ];
  const minX = keyXs.length ? Math.min(-4, Math.floor(Math.min(...keyXs)) - 2) : -5;
  const maxX = keyXs.length ? Math.max(4, Math.ceil(Math.max(...keyXs)) + 2) : 5;
  const clampedMinX = Math.max(-10, minX);
  const clampedMaxX = Math.min(10, maxX);

  const keyYs = [
    ...analysis.extrema.map((e) => e.y),
    ...analysis.asymptotes.horizontal.map((h) => h.y),
  ];
  const minY = keyYs.length ? Math.min(-3, Math.floor(Math.min(...keyYs)) - 2) : -5;
  const maxY = keyYs.length ? Math.max(3, Math.ceil(Math.max(...keyYs)) + 2) : 5;
  const clampedMinY = Math.max(-12, minY);
  const clampedMaxY = Math.min(12, maxY);

  return {
    xRange: [clampedMinX, clampedMaxX],
    yRange: [clampedMinY, clampedMaxY],
  };
}

function buildCurveSegments(
  evaluate: (x: number) => number | null,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number
): string[] {
  const segments: string[] = [];
  const samples = 520;
  const dx = (xMax - xMin) / samples;
  const ySpan = yMax - yMin;
  let currentPts: string[] = [];
  let prevY: number | null = null;

  const flush = () => {
    if (currentPts.length >= 2) {
      segments.push(`M ${currentPts.join(' L ')}`);
    }
    currentPts = [];
  };

  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * dx;
    const y = evaluate(x);
    if (y === null || !Number.isFinite(y)) {
      flush();
      prevY = null;
      continue;
    }

    // Break across vertical asymptote jumps
    if (prevY !== null && Math.abs(y - prevY) > ySpan * 1.15 && (y * prevY < 0 || Math.abs(y - prevY) > ySpan * 1.8)) {
      flush();
      prevY = null;
    }

    // Clamp slightly outside viewbox so steep lines still hit frame edges cleanly
    if (y < yMin - ySpan * 0.6 || y > yMax + ySpan * 0.6) {
      flush();
      prevY = y;
      continue;
    }

    const sx = toSvgX(x);
    const sy = toSvgY(y);
    currentPts.push(`${sx.toFixed(2)} ${sy.toFixed(2)}`);
    prevY = y;
  }
  flush();
  return segments;
}

export const FunctionInvestigationPanel: React.FC = () => {
  const [inputExpr, setInputExpr] = useState<string>(PRESET_FUNCTIONS[0].expr);
  const [activePresetId, setActivePresetId] = useState<string>(PRESET_FUNCTIONS[0].id);
  const [submittedExpr, setSubmittedExpr] = useState<string>(PRESET_FUNCTIONS[0].expr);
  const [xRange, setXRange] = useState<[number, number]>(PRESET_FUNCTIONS[0].xRange);
  const [yRange, setYRange] = useState<[number, number]>(PRESET_FUNCTIONS[0].yRange);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bbtSvgRef = useRef<SVGSVGElement | null>(null);
  const graphSvgRef = useRef<SVGSVGElement | null>(null);

  const analysis = useMemo(() => analyzeFunction(submittedExpr), [submittedExpr]);

  const handleInvestigate = (exprOverride?: string, customBounds?: { xRange: [number, number]; yRange: [number, number] }) => {
    const targetExpr = (exprOverride ?? inputExpr).trim();
    setSubmittedExpr(targetExpr);
    if (customBounds) {
      setXRange(customBounds.xRange);
      setYRange(customBounds.yRange);
    } else {
      const nextAnalysis = analyzeFunction(targetExpr);
      const nice = computeNiceViewBounds(nextAnalysis);
      setXRange(nice.xRange);
      setYRange(nice.yRange);
    }
  };

  const handleSelectPreset = (preset: PresetFn) => {
    setActivePresetId(preset.id);
    setInputExpr(preset.expr);
    handleInvestigate(preset.expr, { xRange: preset.xRange, yRange: preset.yRange });
  };

  const handleInsertSymbol = (sym: SymbolSnippet) => {
    const el = inputRef.current;
    setActivePresetId('custom');
    if (!el) {
      setInputExpr((prev) => prev + sym.insert);
      return;
    }
    const start = el.selectionStart ?? inputExpr.length;
    const end = el.selectionEnd ?? inputExpr.length;
    const nextVal = inputExpr.slice(0, start) + sym.insert + inputExpr.slice(end);
    setInputExpr(nextVal);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + sym.insert.length - sym.cursorBack;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleZoom = (factor: number) => {
    const cx = 0.5 * (xRange[0] + xRange[1]);
    const cy = 0.5 * (yRange[0] + yRange[1]);
    const halfW = Math.max(1.5, Math.min(20, 0.5 * (xRange[1] - xRange[0]) * factor));
    const halfH = Math.max(1.5, Math.min(20, 0.5 * (yRange[1] - yRange[0]) * factor));
    setXRange([Number((cx - halfW).toFixed(2)), Number((cx + halfW).toFixed(2))]);
    setYRange([Number((cy - halfH).toFixed(2)), Number((cy + halfH).toFixed(2))]);
  };

  // --- SVG Geometry for Bảng Biến Thiên (SGK Standard) ---
  const bbtGeom = useMemo(() => {
    const nodes: BbtNode[] = analysis.bbtNodes;
    const intervals: BbtInterval[] = analysis.bbtIntervals;
    const leftColW = 68;
    const padEdge = 46;
    const intervalW = nodes.length <= 3 ? 160 : nodes.length <= 4 ? 132 : 108;
    const innerSpan = Math.max(1, nodes.length - 1) * intervalW;
    const totalW = Math.max(540, leftColW + padEdge * 2 + innerSpan);
    const totalH = 216;
    const row1H = 40; // x
    const row2H = 42; // y'
    const row2Bottom = row1H + row2H; // 82
    const yRowTop = row2Bottom + 24; // 106
    const yRowBottom = totalH - 24; // 192

    const xCoords = nodes.map((_, i) => {
      if (nodes.length === 1) return leftColW + padEdge;
      return leftColW + padEdge + (i / (nodes.length - 1)) * (totalW - leftColW - padEdge * 2);
    });

    return {
      nodes,
      intervals,
      leftColW,
      totalW,
      totalH,
      row1H,
      row2Bottom,
      yRowTop,
      yRowBottom,
      xCoords,
    };
  }, [analysis]);

  // --- SVG Geometry for Coordinate Graph ---
  const graphW = 640;
  const graphH = 420;
  const padL = 42;
  const padR = 24;
  const padT = 22;
  const padB = 30;
  const plotW = graphW - padL - padR;
  const plotH = graphH - padT - padB;

  const toSvgX = (x: number) => padL + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
  const toSvgY = (y: number) => padT + ((yRange[1] - y) / (yRange[1] - yRange[0])) * plotH;

  const curveSegments = useMemo(() => {
    if (!analysis.valid) return [];
    return buildCurveSegments(
      analysis.evaluate,
      xRange[0],
      xRange[1],
      yRange[0],
      yRange[1],
      toSvgX,
      toSvgY
    );
  }, [analysis, xRange, yRange]);

  // Major grid ticks
  const xStep = xRange[1] - xRange[0] > 14 ? 2 : 1;
  const yStep = yRange[1] - yRange[0] > 14 ? 2 : 1;
  const xTicks: number[] = [];
  for (let t = Math.ceil(xRange[0] / xStep) * xStep; t <= Math.floor(xRange[1] / xStep) * xStep; t += xStep) {
    xTicks.push(Number(t.toFixed(2)));
  }
  const yTicks: number[] = [];
  for (let t = Math.ceil(yRange[0] / yStep) * yStep; t <= Math.floor(yRange[1] / yStep) * yStep; t += yStep) {
    yTicks.push(Number(t.toFixed(2)));
  }

  const axisOriginX = Math.max(padL, Math.min(padL + plotW, toSvgX(0)));
  const axisOriginY = Math.max(padT, Math.min(padT + plotH, toSvgY(0)));
  const showXAxis = yRange[0] <= 0 && yRange[1] >= 0;
  const showYAxis = xRange[0] <= 0 && xRange[1] >= 0;

  const handleGraphMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!analysis.valid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = graphW / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    if (svgX < padL || svgX > padL + plotW) {
      setHoverCoord(null);
      return;
    }
    const mathX = xRange[0] + ((svgX - padL) / plotW) * (xRange[1] - xRange[0]);
    const mathY = analysis.evaluate(mathX);
    if (mathY !== null && Number.isFinite(mathY)) {
      setHoverCoord({ x: mathX, y: mathY });
    } else {
      setHoverCoord(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Bộ nhập hàm số thông minh */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
            Nhập biểu thức hàm số &amp; Khảo sát tự động trên Bảng tương tác
          </h3>
          <span className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-[#136F63] dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Chuẩn SGK Kết nối tri thức · Chạm 2 ngón thu phóng &amp; Bút viết trực tiếp
          </span>
        </div>

        {/* Preset Quick Functions */}
        <div className="mt-3">
          <div className="mb-1.5 text-[13px] font-medium text-[#334155] dark:text-slate-200">
            Chọn nhanh hàm mẫu thường gặp:
          </div>
          <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {PRESET_FUNCTIONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`shrink-0 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13px] transition-all duration-150 ${tactile3dClass(
                  activePresetId === preset.id
                )}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expression Input + Primary Action */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center overflow-hidden rounded-[8px] border border-[#CBD5E1] bg-white focus-within:border-[#136F63] focus-within:ring-2 focus-within:ring-[#136F63]/20 dark:border-slate-700 dark:bg-slate-800">
            <span className="border-r border-[#E2E8F0] bg-[#F1F5F9] px-3.5 py-2.5 text-[14px] font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              y =
            </span>
            <input
              ref={inputRef}
              value={inputExpr}
              onChange={(e) => {
                setInputExpr(e.target.value);
                setActivePresetId('custom');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInvestigate();
              }}
              placeholder="Ví dụ: x^3 - 3x^2 + 2 hoặc (-x^2 + x - 1)/(x + 1)"
              className="min-h-[42px] w-full bg-transparent px-3 py-2 text-[14px] font-medium text-[#0F172A] focus:outline-none dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={() => handleInvestigate()}
            className="btn-glossy-3d-active inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-5 py-2 text-[14px] font-medium transition-all duration-150"
          >
            <Play className="h-4 w-4 fill-current" />
            Vẽ &amp; Khảo sát
          </button>
        </div>

        {/* Quick Math Symbols Bar */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13px] font-medium text-[#64748B] dark:text-slate-300">
            Chèn ký hiệu:
          </span>
          {QUICK_SYMBOLS.map((sym) => (
            <button
              key={sym.label}
              type="button"
              title={sym.title}
              onClick={() => handleInsertSymbol(sym)}
              className="btn-glossy-3d-inactive rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium transition-all duration-150"
            >
              {sym.label}
            </button>
          ))}
        </div>

        {/* Error Notice */}
        {!analysis.valid && analysis.error && (
          <div className="mt-3 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-3.5 py-2.5 text-[13.5px] font-medium text-[#B91C1C] dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
            {analysis.error}
          </div>
        )}

        {/* Calculus Summary Strip */}
        {analysis.valid && (
          <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-[#E2E8F0] pt-3.5 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                Tập xác định
              </div>
              <div className="mt-0.5 text-[14px] font-semibold text-[#0F172A] dark:text-white">
                D = {analysis.domainText}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                Đạo hàm cấp 1
              </div>
              <div className="mt-0.5 truncate text-[14px] font-semibold text-[#136F63] dark:text-teal-300" title={analysis.derivativeText}>
                {analysis.derivativeText}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                Điểm cực trị
              </div>
              <div className="mt-0.5 text-[14px] font-semibold text-[#334155] tabular-nums dark:text-slate-100">
                {analysis.extrema.length === 0
                  ? 'Không có cực trị'
                  : analysis.extrema
                      .slice(0, 3)
                      .map((e) => `${e.kind === 'max' ? 'CĐ' : 'CT'}(${e.xLabel}; ${e.yLabel})`)
                      .join(' · ')}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                Đường tiệm cận
              </div>
              <div className="mt-0.5 text-[14px] font-semibold text-[#334155] tabular-nums dark:text-slate-100">
                {analysis.asymptotes.vertical.length === 0 &&
                analysis.asymptotes.horizontal.length === 0 &&
                analysis.asymptotes.oblique.length === 0
                  ? 'Không có tiệm cận'
                  : [
                      ...analysis.asymptotes.vertical.map((v) => `TCĐ: ${v.label}`),
                      ...analysis.asymptotes.horizontal.map((h) => `TCN: ${h.label}`),
                      ...analysis.asymptotes.oblique.map((o) => `TCX: ${o.label}`),
                    ].join(' · ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Đồng thời Bảng biến thiên SVG & Đồ thị hàm số SVG */}
      {analysis.valid && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Left / Top: Bảng biến thiên chuẩn SGK Việt Nam */}
          <SmartboardViewport
            className="xl:col-span-6"
            title="Bảng biến thiên chuẩn SGK (SVG)"
            subtitle={analysis.isPeriodicNote || `y = ${submittedExpr}`}
            bodyClassName="p-3 sm:p-4"
          >
            <div className="flex flex-1 items-center justify-center overflow-x-auto rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <svg
                ref={bbtSvgRef}
                viewBox={`0 0 ${bbtGeom.totalW} ${bbtGeom.totalH}`}
                className="w-full min-w-[440px] max-w-full"
                fontFamily="Be Vietnam Pro, Arial, sans-serif"
              >
                <defs>
                  <marker
                    id="bbtArrowBlue"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 1 L 7 4 L 0 7 z" fill="#136F63" />
                  </marker>
                </defs>

                <rect
                  data-export-bg="true"
                  x="0"
                  y="0"
                  width={bbtGeom.totalW}
                  height={bbtGeom.totalH}
                  fill="#ffffff"
                />

                {/* Outer Border */}
                <rect
                  x="1"
                  y="1"
                  width={bbtGeom.totalW - 2}
                  height={bbtGeom.totalH - 2}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />

                {/* Horizontal Row Dividers */}
                <line x1="1" y1={bbtGeom.row1H} x2={bbtGeom.totalW - 1} y2={bbtGeom.row1H} stroke="#0f172a" strokeWidth="1.2" />
                <line x1="1" y1={bbtGeom.row2Bottom} x2={bbtGeom.totalW - 1} y2={bbtGeom.row2Bottom} stroke="#0f172a" strokeWidth="1.2" />

                {/* Left Header Vertical Divider */}
                <line x1={bbtGeom.leftColW} y1="1" x2={bbtGeom.leftColW} y2={bbtGeom.totalH - 1} stroke="#0f172a" strokeWidth="1.2" />

                {/* Left Column Labels */}
                <text x={bbtGeom.leftColW / 2} y={25} textAnchor="middle" fontSize="15" fontWeight="700" fontStyle="italic" fill="#0f172a">
                  x
                </text>
                <text x={bbtGeom.leftColW / 2} y={66} textAnchor="middle" fontSize="15" fontWeight="700" fontStyle="italic" fill="#0f172a">
                  y&apos;
                </text>
                <text x={bbtGeom.leftColW / 2} y={154} textAnchor="middle" fontSize="15" fontWeight="700" fontStyle="italic" fill="#0f172a">
                  y
                </text>

                {/* Nodes: x values, y' markers (0 or ||), y extrema/limits */}
                {bbtGeom.nodes.map((node, idx) => {
                  const cx = bbtGeom.xCoords[idx];
                  const isEdge = idx === 0 || idx === bbtGeom.nodes.length - 1;
                  return (
                    <g key={idx}>
                      {/* x row label */}
                      <text
                        x={cx}
                        y={25}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="600"
                        fill="#0f172a"
                      >
                        {node.xLabel}
                      </text>

                      {/* y' row marker */}
                      {node.derivAtPoint === '0' && (
                        <text x={cx} y={66} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
                          0
                        </text>
                      )}
                      {node.derivAtPoint === '||' && (
                        <g>
                          <line x1={cx - 2.5} y1={bbtGeom.row1H} x2={cx - 2.5} y2={bbtGeom.totalH - 1} stroke="#0f172a" strokeWidth="1.2" />
                          <line x1={cx + 2.5} y1={bbtGeom.row1H} x2={cx + 2.5} y2={bbtGeom.totalH - 1} stroke="#0f172a" strokeWidth="1.2" />
                        </g>
                      )}

                      {/* y row values */}
                      {node.kind === 'asymptote' ? (
                        <g>
                          <text
                            x={cx - 16}
                            y={bbtGeom.intervals[idx - 1]?.endPos === 'top' ? bbtGeom.yRowTop : bbtGeom.yRowBottom}
                            textAnchor="middle"
                            fontSize="13.5"
                            fontWeight="600"
                            fill="#0f172a"
                          >
                            {node.yLeft}
                          </text>
                          <text
                            x={cx + 16}
                            y={bbtGeom.intervals[idx]?.startPos === 'top' ? bbtGeom.yRowTop : bbtGeom.yRowBottom}
                            textAnchor="middle"
                            fontSize="13.5"
                            fontWeight="600"
                            fill="#0f172a"
                          >
                            {node.yRight}
                          </text>
                        </g>
                      ) : (
                        <g>
                          {node.yTop && (
                            <text
                              x={cx}
                              y={bbtGeom.yRowTop}
                              textAnchor="middle"
                              fontSize="13.5"
                              fontWeight={isEdge ? '600' : '700'}
                              fill={isEdge ? '#0f172a' : '#DC2626'}
                            >
                              {node.yTop}
                            </text>
                          )}
                          {node.yBottom && (
                            <text
                              x={cx}
                              y={bbtGeom.yRowBottom}
                              textAnchor="middle"
                              fontSize="13.5"
                              fontWeight={isEdge ? '600' : '700'}
                              fill={isEdge ? '#0f172a' : '#059669'}
                            >
                              {node.yBottom}
                            </text>
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Intervals: y' sign + arrows */}
                {bbtGeom.intervals.map((iv, idx) => {
                  const x1 = bbtGeom.xCoords[idx];
                  const x2 = bbtGeom.xCoords[idx + 1];
                  const midX = 0.5 * (x1 + x2);
                  const leftNode = bbtGeom.nodes[idx];
                  const rightNode = bbtGeom.nodes[idx + 1];

                  const leftOffset = leftNode.kind === 'asymptote' ? 28 : 16;
                  const rightOffset = rightNode.kind === 'asymptote' ? 28 : 16;
                  const ax1 = x1 + leftOffset;
                  const ax2 = x2 - rightOffset;
                  const ay1 = iv.startPos === 'top' ? bbtGeom.yRowTop + 4 : bbtGeom.yRowBottom - 6;
                  const ay2 = iv.endPos === 'top' ? bbtGeom.yRowTop + 4 : bbtGeom.yRowBottom - 6;

                  return (
                    <g key={idx}>
                      {iv.sign !== 'undef' && (
                        <text
                          x={midX}
                          y={66}
                          textAnchor="middle"
                          fontSize="16"
                          fontWeight="700"
                          fill="#0f172a"
                        >
                          {iv.sign}
                        </text>
                      )}
                      {iv.trend !== 'undef' && ax2 > ax1 + 10 && (
                        <line
                          x1={ax1}
                          y1={ay1}
                          x2={ax2}
                          y2={ay2}
                          stroke="#136F63"
                          strokeWidth="2"
                          markerEnd="url(#bbtArrowBlue)"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </SmartboardViewport>

          {/* Right / Bottom: Đồ thị hàm số SVG sắc nét */}
          <SmartboardViewport
            className="xl:col-span-6"
            title="Đồ thị hàm số (Oxy)"
            subtitle={`y = ${submittedExpr}`}
            headerActions={
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  title="Phóng to đồ thị"
                  onClick={() => handleZoom(0.75)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  <ZoomIn className="h-4 w-4 text-[#136F63]" />
                </button>
                <button
                  type="button"
                  title="Thu nhỏ đồ thị"
                  onClick={() => handleZoom(1.33)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  <ZoomOut className="h-4 w-4 text-[#136F63]" />
                </button>
                <button
                  type="button"
                  title="Đặt lại khung nhìn chuẩn"
                  onClick={() => {
                    const nice = computeNiceViewBounds(analysis);
                    setXRange(nice.xRange);
                    setYRange(nice.yRange);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  <RotateCcw className="h-4 w-4 text-[#136F63]" />
                </button>
              </div>
            }
            bodyClassName="p-3 sm:p-4"
          >
            <div className="relative overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] dark:border-slate-800 dark:bg-slate-900/40">
              <svg
                ref={graphSvgRef}
                viewBox={`0 0 ${graphW} ${graphH}`}
                onMouseMove={handleGraphMouseMove}
                onMouseLeave={() => setHoverCoord(null)}
                className="w-full cursor-crosshair select-none"
                fontFamily="Be Vietnam Pro, Arial, sans-serif"
              >
                <defs>
                  <clipPath id="plotClipArea">
                    <rect x={padL} y={padT} width={plotW} height={plotH} />
                  </clipPath>
                  <marker id="axisArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 z" fill="#0f172a" />
                  </marker>
                </defs>

                <rect
                  data-export-bg="true"
                  x="0"
                  y="0"
                  width={graphW}
                  height={graphH}
                  fill="#ffffff"
                />

                {/* Plot Frame */}
                <rect
                  x={padL}
                  y={padT}
                  width={plotW}
                  height={plotH}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />

                {/* Grid lines */}
                {xTicks.map((tx) => {
                  const sx = toSvgX(tx);
                  return (
                    <g key={`gx-${tx}`}>
                      <line x1={sx} y1={padT} x2={sx} y2={padT + plotH} stroke="#e2e8f0" strokeWidth="1" />
                      {tx !== 0 && (
                        <text
                          x={sx}
                          y={showXAxis ? Math.min(padT + plotH - 4, axisOriginY + 15) : padT + plotH + 15}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="500"
                          fill="#475569"
                        >
                          {formatViNumber(tx)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {yTicks.map((ty) => {
                  const sy = toSvgY(ty);
                  return (
                    <g key={`gy-${ty}`}>
                      <line x1={padL} y1={sy} x2={padL + plotW} y2={sy} stroke="#e2e8f0" strokeWidth="1" />
                      {ty !== 0 && (
                        <text
                          x={showYAxis ? Math.max(padL + 16, axisOriginX - 8) : padL - 6}
                          y={sy + 4}
                          textAnchor="end"
                          fontSize="11"
                          fontWeight="500"
                          fill="#475569"
                        >
                          {formatViNumber(ty)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Coordinate Axes */}
                {showXAxis && (
                  <g>
                    <line
                      x1={padL}
                      y1={axisOriginY}
                      x2={padL + plotW + 6}
                      y2={axisOriginY}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                      markerEnd="url(#axisArrow)"
                    />
                    <text x={padL + plotW + 10} y={axisOriginY + 4} fontSize="13" fontWeight="700" fontStyle="italic" fill="#0f172a">
                      x
                    </text>
                  </g>
                )}
                {showYAxis && (
                  <g>
                    <line
                      x1={axisOriginX}
                      y1={padT + plotH}
                      x2={axisOriginX}
                      y2={padT - 6}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                      markerEnd="url(#axisArrow)"
                    />
                    <text x={axisOriginX - 12} y={padT - 6} fontSize="13" fontWeight="700" fontStyle="italic" fill="#0f172a">
                      y
                    </text>
                  </g>
                )}
                {showXAxis && showYAxis && (
                  <text x={axisOriginX - 10} y={axisOriginY + 14} fontSize="12" fontWeight="700" fontStyle="italic" fill="#0f172a">
                    O
                  </text>
                )}

                {/* Clipped Curves, Asymptotes & Extrema */}
                <g clipPath="url(#plotClipArea)">
                  {/* Vertical Asymptotes */}
                  {analysis.asymptotes.vertical.map((va, idx) => {
                    const sx = toSvgX(va.x);
                    return (
                      <g key={`va-${idx}`}>
                        <line
                          x1={sx}
                          y1={padT}
                          x2={sx}
                          y2={padT + plotH}
                          stroke="#DC2626"
                          strokeWidth="1.4"
                          strokeDasharray="6,4"
                        />
                        <text
                          x={sx + 5}
                          y={padT + 16}
                          fontSize="11.5"
                          fontWeight="700"
                          fill="#DC2626"
                        >
                          {va.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Horizontal Asymptotes */}
                  {analysis.asymptotes.horizontal.map((ha, idx) => {
                    const sy = toSvgY(ha.y);
                    return (
                      <g key={`ha-${idx}`}>
                        <line
                          x1={padL}
                          y1={sy}
                          x2={padL + plotW}
                          y2={sy}
                          stroke="#EA580C"
                          strokeWidth="1.4"
                          strokeDasharray="6,4"
                        />
                        <text
                          x={padL + plotW - 6}
                          y={sy - 6}
                          textAnchor="end"
                          fontSize="11.5"
                          fontWeight="700"
                          fill="#EA580C"
                        >
                          {ha.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Oblique Asymptotes */}
                  {analysis.asymptotes.oblique.map((oa, idx) => {
                    const yAtLeft = oa.m * xRange[0] + oa.b;
                    const yAtRight = oa.m * xRange[1] + oa.b;
                    return (
                      <g key={`oa-${idx}`}>
                        <line
                          x1={toSvgX(xRange[0])}
                          y1={toSvgY(yAtLeft)}
                          x2={toSvgX(xRange[1])}
                          y2={toSvgY(yAtRight)}
                          stroke="#EA580C"
                          strokeWidth="1.4"
                          strokeDasharray="6,4"
                        />
                        <text
                          x={padL + 10}
                          y={padT + 16 + idx * 16}
                          fontSize="11.5"
                          fontWeight="700"
                          fill="#EA580C"
                        >
                          TCX: {oa.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Function Curve */}
                  {curveSegments.map((dPath, idx) => (
                    <path
                      key={`seg-${idx}`}
                      d={dPath}
                      fill="none"
                      stroke="#136F63"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}

                  {/* Extrema Markers & Projection Dashed Lines */}
                  {analysis.extrema.map((ext, idx) => {
                    if (ext.x < xRange[0] || ext.x > xRange[1] || ext.y < yRange[0] || ext.y > yRange[1]) {
                      return null;
                    }
                    const sx = toSvgX(ext.x);
                    const sy = toSvgY(ext.y);
                    const dotColor = ext.kind === 'max' ? '#DC2626' : '#059669';
                    const lblOffsetY = ext.kind === 'max' ? -10 : 18;
                    return (
                      <g key={`ext-${idx}`}>
                        {showXAxis && Math.abs(ext.x) > 1e-4 && (
                          <line
                            x1={sx}
                            y1={sy}
                            x2={sx}
                            y2={axisOriginY}
                            stroke={dotColor}
                            strokeWidth="1"
                            strokeDasharray="3,3"
                            opacity="0.7"
                          />
                        )}
                        {showYAxis && Math.abs(ext.y) > 1e-4 && (
                          <line
                            x1={sx}
                            y1={sy}
                            x2={axisOriginX}
                            y2={sy}
                            stroke={dotColor}
                            strokeWidth="1"
                            strokeDasharray="3,3"
                            opacity="0.7"
                          />
                        )}
                        <circle cx={sx} cy={sy} r="4.5" fill={dotColor} stroke="#ffffff" strokeWidth="1.5" />
                        <text
                          x={sx}
                          y={sy + lblOffsetY}
                          textAnchor="middle"
                          fontSize="11.5"
                          fontWeight="700"
                          fill={dotColor}
                        >
                          {ext.kind === 'max' ? 'CĐ' : 'CT'}({ext.xLabel}; {ext.yLabel})
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Bottom Coordinate Readout Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-white px-3 py-2 text-[12px] text-[#64748B] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
                    <span className="h-2.5 w-4 rounded-[2px] bg-[#136F63]" />
                    Đồ thị y = f(x)
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" />
                    Cực đại
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
                    Cực tiểu
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
                    <span className="w-4 border-t-2 border-dashed border-[#EA580C]" />
                    Tiệm cận
                  </span>
                </div>
                <div className="font-semibold text-[#136F63] tabular-nums">
                  {hoverCoord
                    ? `x = ${formatViNumber(hoverCoord.x)} · y = ${formatViNumber(hoverCoord.y)}`
                    : `Khung [${formatViNumber(xRange[0])}; ${formatViNumber(xRange[1])}] × [${formatViNumber(yRange[0])}; ${formatViNumber(yRange[1])}]`}
                </div>
              </div>
            </div>
          </SmartboardViewport>
        </div>
      )}
    </div>
  );
};
