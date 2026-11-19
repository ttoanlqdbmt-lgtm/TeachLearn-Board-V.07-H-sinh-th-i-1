import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  GripHorizontal,
  Send,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { MathText } from './MathText';
import {
  AngleUnit,
  CalcMode,
  Complex,
  DEFAULT_MEMORY_VARS,
  EditorState,
  GroupedStatClass,
  IneqOp,
  MemoryVarName,
  MemoryVars,
  StatItem,
  TableRow,
  Vec3,
  analyzeLinePlane3D,
  analyzeTwoLines3D,
  analyzeVectors,
  computeGroupedStatistics,
  computeStatistics,
  createEmptyEditor,
  deleteAtCursor,
  detectVariablesInNodes,
  evaluateString,
  formatComplexResult,
  formatDecimalLatex,
  formatExactRealLatex,
  generateFunctionTable,
  insertCharNode,
  insertTemplateNode,
  moveCursorLeft,
  moveCursorRight,
  moveCursorVertical,
  nodesToEvalString,
  nodesToLatex,
  solveEquationNumerical,
  solveEquilateralTriangle,
  solveHeronTriangle,
  solveLinearSystem,
  solvePolynomial,
  solvePolynomialInequality,
} from '../utils/scientificCalcEngine';

export interface CalcBoardCardPayload {
  title: string;
  katexContent: string;
  stepsContent?: Array<{ title: string; leadIn: string; mathDetail: string }>;
  finalAnswer?: string;
  handled?: boolean;
}

interface ScientificCalculatorModalProps {
  onClose: () => void;
}

interface HistoryEntry {
  editor: EditorState;
  exprLatex: string;
  result: Complex;
  mode: 'COMP' | 'CMPLX';
}

type OverlayPanel = 'none' | 'menu' | 'optn' | 'calc' | 'solve' | 'vars';
type GeomToolId = 1 | 2 | 3 | 4;

const MEM_KEYS: MemoryVarName[] = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];

// Authentic Vinacal 680EX PLUS III Sculpted Keycap Component (hoisted outside modal to prevent remounts)
const VinacalKey: React.FC<{
  label: React.ReactNode;
  shiftLabel?: string;
  alphaLabel?: string;
  onClick: () => void;
  variant?: 'sci' | 'num' | 'blue' | 'pill' | 'pillBlue';
  active?: boolean;
  title?: string;
  compactLegend?: boolean;
}> = ({
  label,
  shiftLabel,
  alphaLabel,
  onClick,
  variant = 'sci',
  active = false,
  title,
  compactLegend = false,
}) => {
  const keyStyles: Record<string, string> = {
    sci: 'h-[28px] rounded-[5px] border border-[#2C4766] bg-gradient-to-b from-[#F4F7FB] to-[#DAE3EE] text-[#172B4D] text-[11.5px] font-bold shadow-[0_2px_0_#466482] hover:from-white hover:to-[#E4ECF5] active:translate-y-[1px] active:shadow-[0_1px_0_#466482]',
    num: 'h-[33px] rounded-[6px] border border-[#2C4766] bg-gradient-to-b from-[#F7FAFD] to-[#DDE6F0] text-[#10243E] text-[15px] font-bold shadow-[0_2.5px_0_#466482] hover:from-white hover:to-[#E7EFF8] active:translate-y-[1px] active:shadow-[0_1px_0_#466482]',
    blue: 'h-[33px] rounded-[6px] border border-[#1E3A8A] bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] text-white text-[13px] font-extrabold tracking-wide shadow-[0_2.5px_0_#172554] hover:from-[#3B82F6] hover:to-[#2563EB] active:translate-y-[1px] active:shadow-[0_1px_0_#172554]',
    pill: active
      ? 'h-[24px] rounded-full border border-[#1E3A8A] bg-[#1D4ED8] text-white text-[10px] font-extrabold tracking-wide shadow-[0_2px_0_#172554]'
      : 'h-[24px] rounded-full border border-[#2C4766] bg-gradient-to-b from-[#F7FAFD] to-[#D8E2EE] text-[#172B4D] text-[10px] font-extrabold tracking-wide shadow-[0_2px_0_#466482] hover:from-white hover:to-[#E4ECF5] active:translate-y-[1px]',
    pillBlue:
      'h-[24px] rounded-full border border-[#1E3A8A] bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] text-white text-[10px] font-extrabold tracking-wide shadow-[0_2px_0_#172554] hover:from-[#3B82F6] hover:to-[#2563EB] active:translate-y-[1px]',
  };

  return (
    <div className="flex flex-col items-stretch">
      {!compactLegend && (
        <div className="mb-[2px] flex h-[12px] items-end justify-between px-[2px] text-[8.5px] leading-none font-bold tracking-tight select-none">
          <span className="truncate text-[#1E3A8A]">{shiftLabel ?? ''}</span>
          <span className="truncate text-[#BE123C]">{alphaLabel ?? ''}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`flex w-full items-center justify-center transition-all select-none ${keyStyles[variant]}`}
      >
        {label}
      </button>
    </div>
  );
};

export const ScientificCalculatorModal: React.FC<ScientificCalculatorModalProps> = ({ onClose }) => {
  // Draggable window position
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 40, y: 40 };
    const w = 398;
    const h = 685;
    return {
      x: Math.max(12, window.innerWidth - w - 84),
      y: Math.max(10, Math.min(window.innerHeight - h - 14, 36)),
    };
  });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Core Calculator State
  const [mode, setMode] = useState<CalcMode>('COMP');
  const [angleUnit, setAngleUnit] = useState<AngleUnit>('DEG');
  const [shiftActive, setShiftActive] = useState(false);
  const [alphaActive, setAlphaActive] = useState(false);
  const [stoPending, setStoPending] = useState(false);
  const [rclPending, setRclPending] = useState(false);

  // Editor & Result State (COMP & CMPLX)
  const [editor, setEditor] = useState<EditorState>(() => createEmptyEditor());
  const [lastResult, setLastResult] = useState<Complex>({ re: 0, im: 0 });
  const [preAns, setPreAns] = useState<Complex>({ re: 0, im: 0 });
  const [resultExactLatex, setResultExactLatex] = useState<string>('0');
  const [resultDecimalLatex, setResultDecimalLatex] = useState<string>('0');
  const [resultPolarLatex, setResultPolarLatex] = useState<string>('0\\angle 0^\\circ');
  const [showDecimal, setShowDecimal] = useState(false);
  const [showPolar, setShowPolar] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [memoryVars, setMemoryVars] = useState<MemoryVars>(DEFAULT_MEMORY_VARS);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [insertedBadge, setInsertedBadge] = useState<'idle' | 'inserted' | 'queued'>('idle');

  // Overlays inside LCD
  const [overlay, setOverlay] = useState<OverlayPanel>('none');

  // CALC & SOLVE states
  const [calcVarsList, setCalcVarsList] = useState<MemoryVarName[]>(['X']);
  const [calcDrafts, setCalcDrafts] = useState<Record<string, string>>({ X: '0' });
  const [solveGuess, setSolveGuess] = useState<string>('0');
  const [solveOutput, setSolveOutput] = useState<{ xLatex: string; decLatex: string; residual: string } | null>(null);

  // Mode 3: EQUA state
  const [equaKind, setEquaKind] = useState<'linear' | 'poly'>('poly');
  const [linearDim, setLinearDim] = useState<2 | 3 | 4>(2);
  const [linearCoeffs, setLinearCoeffs] = useState<string[][]>([
    ['2', '1', '0', '0', '5'],
    ['1', '-1', '0', '0', '1'],
    ['1', '1', '1', '0', '6'],
    ['1', '0', '1', '1', '4'],
  ]);
  const [polyDeg, setPolyDeg] = useState<2 | 3 | 4>(2);
  const [polyCoeffs, setPolyCoeffs] = useState<string[]>(['1', '-5', '6', '0', '0']);
  const [equaResultLines, setEquaResultLines] = useState<string[]>([]);
  const [equaExtremaLines, setEquaExtremaLines] = useState<string[]>([]);

  // Mode 4: INEQ state
  const [ineqDeg, setIneqDeg] = useState<2 | 3 | 4>(2);
  const [ineqOp, setIneqOp] = useState<IneqOp>('>');
  const [ineqCoeffs, setIneqCoeffs] = useState<string[]>(['1', '-3', '2', '0', '0']);
  const [ineqResultLatex, setIneqResultLatex] = useState<string>('');

  // Mode 5: TABLE state
  const [tableFx, setTableFx] = useState<string>('X^3 - 3*X^2 + 2');
  const [tableGx, setTableGx] = useState<string>('');
  const [tableStart, setTableStart] = useState<string>('-1');
  const [tableEnd, setTableEnd] = useState<string>('3');
  const [tableStep, setTableStep] = useState<string>('0.5');
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);

  // Mode 6: GROUPED STAT / 1-VAR STAT / VECTOR state
  const [statVecTab, setStatVecTab] = useState<'GROUPED' | 'STAT' | 'VECTOR'>('GROUPED');
  const [groupedClasses, setGroupedClasses] = useState<Array<{ lo: string; hi: string; freq: string }>>([
    { lo: '30', hi: '50', freq: '6' },
    { lo: '50', hi: '70', freq: '10' },
    { lo: '70', hi: '90', freq: '12' },
    { lo: '90', hi: '110', freq: '8' },
    { lo: '110', hi: '130', freq: '4' },
  ]);
  const [statItems, setStatItems] = useState<Array<{ x: string; freq: string }>>([
    { x: '6', freq: '3' },
    { x: '7', freq: '5' },
    { x: '8', freq: '8' },
    { x: '9', freq: '4' },
  ]);
  const [vecA, setVecA] = useState<[string, string, string]>(['1', '2', '-1']);
  const [vecB, setVecB] = useState<[string, string, string]>(['2', '-1', '3']);
  const [vecC, setVecC] = useState<[string, string, string]>(['0', '1', '2']);

  // Mode 7: VINACAL 680EX PLUS III GEOMETRY & FORMULAS
  const [geomTool, setGeomTool] = useState<GeomToolId | null>(null);
  const [eqTriSide, setEqTriSide] = useState<string>('6');
  const [heronSides, setHeronSides] = useState<[string, string, string]>(['5', '6', '7']);
  const [line1P, setLine1P] = useState<[string, string, string]>(['1', '0', '2']);
  const [line1U, setLine1U] = useState<[string, string, string]>(['1', '1', '-1']);
  const [line2P, setLine2P] = useState<[string, string, string]>(['0', '2', '1']);
  const [line2U, setLine2U] = useState<[string, string, string]>(['2', '-1', '1']);
  const [lpPoint, setLpPoint] = useState<[string, string, string]>(['1', '-2', '3']);
  const [lpDir, setLpDir] = useState<[string, string, string]>(['1', '2', '-1']);
  const [lpPlane, setLpPlane] = useState<[string, string, string, string]>(['2', '-1', '2', '-5']);

  const flashNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((curr) => (curr === msg ? null : curr));
    }, 2400);
  }, []);

  useEffect(() => {
    const fmt = formatComplexResult(lastResult, angleUnit, showPolar);
    setResultExactLatex(fmt.exactLatex);
    setResultDecimalLatex(fmt.decimalLatex);
    setResultPolarLatex(fmt.polarLatex);
  }, [angleUnit, lastResult, showPolar]);

  // Pointer drag handlers for title bar
  const handleTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const rect = shellRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 398;
      const height = rect?.height ?? 660;
      const nextX = Math.max(8, Math.min(window.innerWidth - Math.min(width, 280), dragRef.current.origX + dx));
      const nextY = Math.max(8, Math.min(window.innerHeight - Math.min(height, 120), dragRef.current.origY + dy));
      setPos({ x: nextX, y: nextY });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Evaluate current expression (COMP or CMPLX)
  const evaluateCurrentExpression = useCallback(
    (overrideVars?: MemoryVars, forceDecimal = false) => {
      const exprStr = nodesToEvalString(editor.nodes);
      if (!exprStr.trim()) {
        setLastResult({ re: 0, im: 0 });
        setResultExactLatex('0');
        setResultDecimalLatex('0');
        setErrorMsg(null);
        return;
      }
      try {
        const allowComplex = mode === 'CMPLX';
        const val = evaluateString(exprStr, {
          angleUnit,
          vars: overrideVars ?? memoryVars,
          ans: lastResult,
          allowComplex,
        });
        setPreAns(lastResult);
        setLastResult(val);
        const fmt = formatComplexResult(val, angleUnit, showPolar);
        setResultExactLatex(fmt.exactLatex);
        setResultDecimalLatex(fmt.decimalLatex);
        setResultPolarLatex(fmt.polarLatex);
        setShowDecimal(forceDecimal);
        setErrorMsg(null);
        setHasEvaluated(true);
        const exprLatex = nodesToLatex(editor.nodes, null, false);
        setHistory((prev) => [
          ...prev.slice(-19),
          { editor, exprLatex, result: val, mode: allowComplex ? 'CMPLX' : 'COMP' },
        ]);
        setHistoryIdx(-1);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Syntax ERROR';
        setErrorMsg(message);
      }
    },
    [editor, mode, angleUnit, memoryVars, lastResult, showPolar]
  );

  const handleVariableAction = useCallback(
    (vName: MemoryVarName) => {
      if (stoPending) {
        const valToStore = lastResult.re;
        setMemoryVars((prev) => ({ ...prev, [vName]: valToStore }));
        setStoPending(false);
        setShiftActive(false);
        setAlphaActive(false);
        flashNotice(`Đã lưu ${formatDecimalLatex(valToStore)} → ${vName}`);
        return true;
      }
      if (rclPending) {
        const val = memoryVars[vName];
        const fmt = formatExactRealLatex(val);
        setLastResult({ re: val, im: 0 });
        setResultExactLatex(fmt.exactLatex);
        setResultDecimalLatex(fmt.decimalLatex);
        setRclPending(false);
        setShiftActive(false);
        setAlphaActive(false);
        flashNotice(`${vName} = ${formatDecimalLatex(val)}`);
        return true;
      }
      return false;
    },
    [stoPending, rclPending, lastResult, memoryVars, flashNotice]
  );

  const pressChar = useCallback(
    (ch: string, isOperator = false) => {
      setErrorMsg(null);
      setOverlay('none');
      if (hasEvaluated) {
        setHasEvaluated(false);
        if (isOperator) {
          let next = createEmptyEditor();
          next = insertCharNode(next, 'Ans');
          next = insertCharNode(next, ch);
          setEditor(next);
          return;
        }
        setEditor(insertCharNode(createEmptyEditor(), ch));
        return;
      }
      setEditor((prev) => insertCharNode(prev, ch));
    },
    [hasEvaluated]
  );

  const pressTemplate = useCallback(
    (kind: Parameters<typeof insertTemplateNode>[1], presetSlots?: Parameters<typeof insertTemplateNode>[3]) => {
      setErrorMsg(null);
      setOverlay('none');
      if (hasEvaluated) {
        setHasEvaluated(false);
        if (kind === 'pow' || kind === 'frac') {
          let next = insertCharNode(createEmptyEditor(), 'Ans');
          next = insertTemplateNode(next, kind, 0, presetSlots);
          setEditor(next);
          return;
        }
        setEditor(insertTemplateNode(createEmptyEditor(), kind, 0, presetSlots));
        return;
      }
      setEditor((prev) => insertTemplateNode(prev, kind, 0, presetSlots));
    },
    [hasEvaluated]
  );

  const consumeModifiers = () => {
    setShiftActive(false);
    setAlphaActive(false);
  };

  // CALC & SOLVE
  const openCalcOverlay = () => {
    const found = detectVariablesInNodes(editor.nodes);
    const list: MemoryVarName[] = found.length > 0 ? found : ['X'];
    setCalcVarsList(list);
    const drafts: Record<string, string> = {};
    list.forEach((v) => {
      drafts[v] = String(memoryVars[v] ?? 0);
    });
    setCalcDrafts(drafts);
    setOverlay('calc');
    consumeModifiers();
  };

  const runCalcEvaluation = () => {
    const nextVars: MemoryVars = { ...memoryVars };
    for (const v of calcVarsList) {
      const parsed = Number((calcDrafts[v] ?? '0').replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        setErrorMsg(`Giá trị biến ${v} không hợp lệ`);
        return;
      }
      nextVars[v] = parsed;
    }
    setMemoryVars(nextVars);
    setOverlay('none');
    evaluateCurrentExpression(nextVars);
  };

  const openSolveOverlay = () => {
    setSolveGuess(String(memoryVars.X ?? 0));
    setSolveOutput(null);
    setOverlay('solve');
    consumeModifiers();
  };

  const runSolveEquation = () => {
    const exprStr = nodesToEvalString(editor.nodes);
    if (!exprStr.trim()) {
      setErrorMsg('Nhập phương trình chứa X trước khi SOLVE');
      return;
    }
    const guess = Number(solveGuess.replace(',', '.'));
    if (!Number.isFinite(guess)) {
      setErrorMsg('Giá trị khởi tạo X không hợp lệ');
      return;
    }
    try {
      const solved = solveEquationNumerical(exprStr, guess, {
        angleUnit,
        vars: memoryVars,
        ans: lastResult,
        allowComplex: false,
      });
      const fmt = formatExactRealLatex(solved.x);
      setMemoryVars((prev) => ({ ...prev, X: solved.x }));
      setLastResult({ re: solved.x, im: 0 });
      setResultExactLatex(`X = ${fmt.exactLatex}`);
      setResultDecimalLatex(`X = ${fmt.decimalLatex}`);
      setSolveOutput({
        xLatex: fmt.exactLatex,
        decLatex: fmt.decimalLatex,
        residual: Math.abs(solved.residual) < 1e-11 ? '0' : solved.residual.toExponential(2),
      });
      setErrorMsg(null);
      setHasEvaluated(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Can't Solve");
    }
  };

  // Mode 3: EQUA
  const runEquaSolver = useCallback(() => {
    if (equaKind === 'linear') {
      const mat: number[][] = [];
      const rhs: number[] = [];
      for (let r = 0; r < linearDim; r++) {
        const row: number[] = [];
        for (let c = 0; c < linearDim; c++) {
          row.push(Number((linearCoeffs[r]?.[c] ?? '0').replace(',', '.')) || 0);
        }
        mat.push(row);
        rhs.push(Number((linearCoeffs[r]?.[4] ?? '0').replace(',', '.')) || 0);
      }
      const res = solveLinearSystem(mat, rhs);
      setEquaResultLines(res.latexLines);
      setEquaExtremaLines([]);
    } else {
      const coeffs = polyCoeffs
        .slice(0, polyDeg + 1)
        .map((s) => Number((s || '0').replace(',', '.')) || 0);
      const res = solvePolynomial(coeffs);
      setEquaResultLines(res.latexLines);
      setEquaExtremaLines(res.extremaLines);
    }
  }, [equaKind, linearDim, linearCoeffs, polyDeg, polyCoeffs]);

  // Mode 4: INEQ
  const runIneqSolver = useCallback(() => {
    const coeffs = ineqCoeffs
      .slice(0, ineqDeg + 1)
      .map((s) => Number((s || '0').replace(',', '.')) || 0);
    const res = solvePolynomialInequality(coeffs, ineqOp);
    setIneqResultLatex(res.latex);
  }, [ineqCoeffs, ineqDeg, ineqOp]);

  // Mode 5: TABLE
  const runTableGenerator = useCallback(() => {
    try {
      const s = Number(tableStart.replace(',', '.'));
      const e = Number(tableEnd.replace(',', '.'));
      const st = Number(tableStep.replace(',', '.'));
      const rows = generateFunctionTable(tableFx, tableGx, s, e, st, {
        angleUnit,
        vars: memoryVars,
        ans: lastResult,
        allowComplex: false,
      });
      setTableRows(rows);
      setTableError(null);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : 'Lỗi tạo bảng giá trị');
    }
  }, [tableFx, tableGx, tableStart, tableEnd, tableStep, angleUnit, memoryVars, lastResult]);

  useEffect(() => {
    if (mode === 'EQUA') runEquaSolver();
  }, [mode, runEquaSolver]);

  useEffect(() => {
    if (mode === 'INEQ') runIneqSolver();
  }, [mode, runIneqSolver]);

  useEffect(() => {
    if (mode === 'TABLE') runTableGenerator();
  }, [mode, runTableGenerator]);

  // Live computations for Mode 6 (Grouped STAT, 1-Var STAT, VECTOR)
  let groupedSummary: ReturnType<typeof computeGroupedStatistics> | null = null;
  let groupedError: string | null = null;
  try {
    const parsedGroups: GroupedStatClass[] = groupedClasses.map((g) => ({
      lo: Number(g.lo.replace(',', '.')),
      hi: Number(g.hi.replace(',', '.')),
      freq: Number(g.freq.replace(',', '.')),
    }));
    groupedSummary = computeGroupedStatistics(parsedGroups);
  } catch (err) {
    groupedError = err instanceof Error ? err.message : 'Lỗi dữ liệu ghép nhóm';
  }

  let statSummary: ReturnType<typeof computeStatistics> | null = null;
  let statError: string | null = null;
  try {
    const parsedItems: StatItem[] = statItems.map((it) => ({
      x: Number(it.x.replace(',', '.')),
      freq: Number(it.freq.replace(',', '.')),
    }));
    statSummary = computeStatistics(parsedItems);
  } catch (err) {
    statError = err instanceof Error ? err.message : 'Lỗi thống kê';
  }

  const parseVec3 = (v: [string, string, string]): Vec3 => [
    Number(v[0].replace(',', '.')) || 0,
    Number(v[1].replace(',', '.')) || 0,
    Number(v[2].replace(',', '.')) || 0,
  ];
  const parsedVecA = parseVec3(vecA);
  const parsedVecB = parseVec3(vecB);
  const parsedVecC = parseVec3(vecC);
  const vecAnalysis = analyzeVectors(parsedVecA, parsedVecB, parsedVecC);

  // Live computations for Mode 7 (Vinacal 680EX PLUS III Geometry)
  let eqTriRes: ReturnType<typeof solveEquilateralTriangle> | null = null;
  let eqTriErr: string | null = null;
  try {
    eqTriRes = solveEquilateralTriangle(Number(eqTriSide.replace(',', '.')));
  } catch (err) {
    eqTriErr = err instanceof Error ? err.message : 'Lỗi';
  }

  let heronRes: ReturnType<typeof solveHeronTriangle> | null = null;
  let heronErr: string | null = null;
  try {
    heronRes = solveHeronTriangle(
      Number(heronSides[0].replace(',', '.')),
      Number(heronSides[1].replace(',', '.')),
      Number(heronSides[2].replace(',', '.'))
    );
  } catch (err) {
    heronErr = err instanceof Error ? err.message : 'Lỗi';
  }

  let twoLinesRes: ReturnType<typeof analyzeTwoLines3D> | null = null;
  let twoLinesErr: string | null = null;
  try {
    twoLinesRes = analyzeTwoLines3D(
      parseVec3(line1P),
      parseVec3(line1U),
      parseVec3(line2P),
      parseVec3(line2U)
    );
  } catch (err) {
    twoLinesErr = err instanceof Error ? err.message : 'Lỗi';
  }

  let linePlaneRes: ReturnType<typeof analyzeLinePlane3D> | null = null;
  let linePlaneErr: string | null = null;
  try {
    linePlaneRes = analyzeLinePlane3D(parseVec3(lpPoint), parseVec3(lpDir), [
      Number(lpPlane[0].replace(',', '.')) || 0,
      Number(lpPlane[1].replace(',', '.')) || 0,
      Number(lpPlane[2].replace(',', '.')) || 0,
      Number(lpPlane[3].replace(',', '.')) || 0,
    ]);
  } catch (err) {
    linePlaneErr = err instanceof Error ? err.message : 'Lỗi';
  }

  // Physical Keyboard Support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'COMP' && mode !== 'CMPLX') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        pressChar(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        pressChar('.');
      } else if (e.key === '+') {
        e.preventDefault();
        pressChar('+', true);
      } else if (e.key === '-') {
        e.preventDefault();
        pressChar('-', true);
      } else if (e.key === '*') {
        e.preventDefault();
        pressChar('×', true);
      } else if (e.key === '/') {
        e.preventDefault();
        pressTemplate('frac');
      } else if (e.key === '^') {
        e.preventDefault();
        pressTemplate('pow');
      } else if (e.key === '(' || e.key === ')') {
        e.preventDefault();
        pressChar(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        evaluateCurrentExpression();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setHasEvaluated(false);
        setEditor((prev) => deleteAtCursor(prev));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditor(createEmptyEditor());
        setErrorMsg(null);
        setOverlay('none');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setHasEvaluated(false);
        setEditor((prev) => moveCursorLeft(prev));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setHasEvaluated(false);
        setEditor((prev) => moveCursorRight(prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const res = moveCursorVertical(editor, 'up');
        if (res.handled) setEditor(res.state);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const res = moveCursorVertical(editor, 'down');
        if (res.handled) setEditor(res.state);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, editor, pressChar, pressTemplate, evaluateCurrentExpression]);

  // ============================================================================
  // DIRECT WHITEBOARD INTEGRATION ("Chèn lên Bảng")
  // ============================================================================
  const handleInsertOntoWhiteboard = () => {
    let payload: CalcBoardCardPayload;

    if (mode === 'COMP' || mode === 'CMPLX') {
      const exprTex = nodesToLatex(editor.nodes, null, false) || '0';
      const displayedResult = showPolar
        ? resultPolarLatex
        : showDecimal
        ? resultDecimalLatex
        : resultExactLatex;
      const modeLabel = mode === 'CMPLX' ? 'Số phức (CMPLX)' : 'Tính toán (COMP)';
      payload = {
        title: `VINACAL 680EX PLUS III — ${modeLabel} (${angleUnit})`,
        katexContent: `$$${exprTex} = ${displayedResult}$$`,
        finalAnswer: `$${displayedResult}$`,
      };
    } else if (mode === 'EQUA') {
      if (equaKind === 'linear') {
        const varNames = ['x', 'y', 'z', 't'];
        const eqRows = Array.from({ length: linearDim }, (_, r) => {
          const lhs = Array.from({ length: linearDim }, (_, c) => {
            const val = Number((linearCoeffs[r]?.[c] ?? '0').replace(',', '.')) || 0;
            const sign = c === 0 ? (val < 0 ? '-' : '') : val >= 0 ? ' + ' : ' - ';
            const absV = Math.abs(val);
            return `${sign}${absV === 1 ? '' : absV}${varNames[c]}`;
          }).join('');
          const rhsVal = Number((linearCoeffs[r]?.[4] ?? '0').replace(',', '.')) || 0;
          return `${lhs} = ${rhsVal}`;
        }).join(' \\\\ ');
        payload = {
          title: `VINACAL 680EX PLUS III — Hệ PT ${linearDim} ẩn`,
          katexContent: `$$\\begin{cases} ${eqRows} \\end{cases}$$`,
          finalAnswer: equaResultLines.map((l) => `$${l}$`).join(' ; '),
        };
      } else {
        const terms = polyCoeffs
          .slice(0, polyDeg + 1)
          .map((s, idx) => {
            const v = Number((s || '0').replace(',', '.')) || 0;
            const p = polyDeg - idx;
            const sign = idx === 0 ? (v < 0 ? '-' : '') : v >= 0 ? ' + ' : ' - ';
            const absV = Math.abs(v);
            const xPart = p === 0 ? '' : p === 1 ? 'x' : `x^{${p}}`;
            return `${sign}${absV === 1 && p > 0 ? '' : absV}${xPart}`;
          })
          .join('');
        payload = {
          title: `VINACAL 680EX PLUS III — Phương trình bậc ${polyDeg}`,
          katexContent: `$$${terms} = 0$$`,
          stepsContent:
            equaExtremaLines.length > 0
              ? equaExtremaLines.map((ex, i) => ({
                  title: `Cực trị ${i + 1}`,
                  leadIn: '',
                  mathDetail: `$${ex}$`,
                }))
              : undefined,
          finalAnswer: equaResultLines.map((l) => `$${l}$`).join(' ; '),
        };
      }
    } else if (mode === 'INEQ') {
      const opTex = ineqOp === '>=' ? '\\ge' : ineqOp === '<=' ? '\\le' : ineqOp;
      const terms = ineqCoeffs
        .slice(0, ineqDeg + 1)
        .map((s, idx) => {
          const v = Number((s || '0').replace(',', '.')) || 0;
          const p = ineqDeg - idx;
          const sign = idx === 0 ? (v < 0 ? '-' : '') : v >= 0 ? ' + ' : ' - ';
          const absV = Math.abs(v);
          const xPart = p === 0 ? '' : p === 1 ? 'x' : `x^{${p}}`;
          return `${sign}${absV === 1 && p > 0 ? '' : absV}${xPart}`;
        })
        .join('');
      payload = {
        title: `VINACAL 680EX PLUS III — Bất phương trình bậc ${ineqDeg}`,
        katexContent: `$$${terms} ${opTex} 0$$`,
        finalAnswer: `$${ineqResultLatex}$`,
      };
    } else if (mode === 'TABLE') {
      const sampleRows = tableRows.slice(0, 8);
      const maxRow = tableRows.find((r) => r.isMaxFx);
      const minRow = tableRows.find((r) => r.isMinFx);
      const headerCols = sampleRows.map((r) => formatDecimalLatex(r.x, 5)).join(' & ');
      const valCols = sampleRows.map((r) => (r.fx !== null ? formatDecimalLatex(r.fx, 5) : '\\text{Err}')).join(' & ');
      const colSpec = 'c|' + 'c'.repeat(sampleRows.length);
      payload = {
        title: `VINACAL 680EX PLUS III — Bảng giá trị f(x)`,
        katexContent: `$$f(x) = ${tableFx.replace(/\*/g, '\\cdot ')}$$`,
        stepsContent: [
          {
            title: 'Bảng mẫu',
            leadIn: `Đoạn $[${tableStart}; ${tableEnd}]$, bước $h = ${tableStep}$:`,
            mathDetail: `$$\\begin{array}{${colSpec}} x & ${headerCols} \\\\ \\hline f(x) & ${valCols} \\end{array}$$`,
          },
        ],
        finalAnswer:
          maxRow && minRow
            ? `$\\max f(x) \\approx ${formatDecimalLatex(maxRow.fx ?? 0, 6)}$ tại $x = ${maxRow.x}$ ; $\\min f(x) \\approx ${formatDecimalLatex(minRow.fx ?? 0, 6)}$ tại $x = ${minRow.x}$`
            : `$f(x) = ${tableFx}$`,
      };
    } else if (mode === 'GEOM') {
      if (geomTool === 1 && eqTriRes) {
        payload = {
          title: 'VINACAL 680EX PLUS III — Tam giác đều',
          katexContent: `$$\\text{Tam giác đều cạnh } a = ${eqTriSide}$$`,
          stepsContent: [
            {
              title: 'Diện tích & Đường cao',
              leadIn: '',
              mathDetail: `$S = ${formatExactRealLatex(eqTriRes.area).exactLatex} \\approx ${formatDecimalLatex(eqTriRes.area, 5)}$ ; $h = ${formatExactRealLatex(eqTriRes.height).exactLatex}$`,
            },
            {
              title: 'Bán kính ngoại/nội tiếp',
              leadIn: '',
              mathDetail: `$R = ${formatExactRealLatex(eqTriRes.circumR).exactLatex}$ ; $r = ${formatExactRealLatex(eqTriRes.inR).exactLatex}$`,
            },
          ],
          finalAnswer: `$S = ${formatExactRealLatex(eqTriRes.area).exactLatex}$`,
        };
      } else if (geomTool === 2 && heronRes) {
        payload = {
          title: 'VINACAL 680EX PLUS III — Công thức Hê-rông',
          katexContent: `$$\\triangle ABC:\\; a=${heronSides[0]},\\; b=${heronSides[1]},\\; c=${heronSides[2]},\\; p=${formatDecimalLatex(heronRes.p, 5)}$$`,
          stepsContent: [
            {
              title: 'Bán kính R, r',
              leadIn: '',
              mathDetail: `$R \\approx ${formatDecimalLatex(heronRes.circumR, 5)}$ ; $r \\approx ${formatDecimalLatex(heronRes.inR, 5)}$`,
            },
          ],
          finalAnswer: `$S = ${formatExactRealLatex(heronRes.area).exactLatex} \\approx ${formatDecimalLatex(heronRes.area, 5)}$`,
        };
      } else if (geomTool === 3 && twoLinesRes) {
        payload = {
          title: 'VINACAL 680EX PLUS III — Vị trí tương đối 2 đường thẳng Oxyz',
          katexContent: `$$d_1 \\text{ và } d_2: \\text{ ${twoLinesRes.relation}}$$`,
          finalAnswer: twoLinesRes.intersection
            ? `Giao điểm $I(${twoLinesRes.intersection.map((v) => formatDecimalLatex(v, 4)).join('; ')})$`
            : `$d(d_1, d_2) = ${formatExactRealLatex(twoLinesRes.distance).exactLatex} \\approx ${formatDecimalLatex(twoLinesRes.distance, 5)}$`,
        };
      } else if (geomTool === 4 && linePlaneRes) {
        payload = {
          title: 'VINACAL 680EX PLUS III — Khoảng cách đường thẳng & mặt phẳng',
          katexContent: `$$d(M, (P)) = ${formatExactRealLatex(linePlaneRes.pointDist).exactLatex} \\approx ${formatDecimalLatex(linePlaneRes.pointDist, 5)}$$`,
          stepsContent: [
            {
              title: 'Hình chiếu vuông góc H',
              leadIn: '',
              mathDetail: `$H(${linePlaneRes.footH.map((v) => formatDecimalLatex(v, 4)).join('; ')})$ ; Quan hệ: ${linePlaneRes.relation}`,
            },
          ],
          finalAnswer: `$d(M, (P)) = ${formatExactRealLatex(linePlaneRes.pointDist).exactLatex}$`,
        };
      } else {
        payload = {
          title: 'VINACAL 680EX PLUS III — Công thức Hình học',
          katexContent: 'Chọn 1 trong 4 mục hình học để chèn kết quả.',
        };
      }
    } else if (statVecTab === 'GROUPED' && groupedSummary) {
      const g = groupedSummary;
      payload = {
        title: 'VINACAL 680EX PLUS III — Thống kê ghép nhóm & Tứ phân vị',
        katexContent: `$$n = ${g.n},\\quad \\bar{x} \\approx ${formatDecimalLatex(g.mean, 5)},\\quad M_e = Q_2 \\approx ${formatDecimalLatex(g.q2, 5)}$$`,
        stepsContent: [
          {
            title: 'Tứ phân vị & Khoảng tứ phân vị',
            leadIn: '',
            mathDetail: `$Q_1 = ${formatExactRealLatex(g.q1).exactLatex} \\approx ${formatDecimalLatex(g.q1, 5)}$ ; $Q_3 = ${formatExactRealLatex(g.q3).exactLatex} \\approx ${formatDecimalLatex(g.q3, 5)}$ ; $\\Delta_Q = Q_3 - Q_1 \\approx ${formatDecimalLatex(g.iqr, 5)}$`,
          },
          {
            title: 'Mốt, Phương sai & Độ lệch chuẩn',
            leadIn: '',
            mathDetail: `$M_o \\approx ${formatDecimalLatex(g.mode, 5)}$ ; $s^2 \\approx ${formatDecimalLatex(g.popVar, 5)}$ ; $s \\approx ${formatDecimalLatex(g.popStd, 5)}$`,
          },
        ],
        finalAnswer: `$Q_1 \\approx ${formatDecimalLatex(g.q1, 5)}$ ; $Q_3 \\approx ${formatDecimalLatex(g.q3, 5)}$ ; $\\Delta_Q \\approx ${formatDecimalLatex(g.iqr, 5)}$`,
      };
    } else if (statVecTab === 'VECTOR') {
      const aStr = `(${parsedVecA.join('; ')})`;
      const bStr = `(${parsedVecB.join('; ')})`;
      const crossStr = `(${vecAnalysis.cross.map((v) => formatDecimalLatex(v, 6)).join('; ')})`;
      const angStr =
        vecAnalysis.angleDeg !== null
          ? angleUnit === 'DEG'
            ? `${formatDecimalLatex(vecAnalysis.angleDeg, 5)}^\\circ`
            : `${formatDecimalLatex(vecAnalysis.angleRad ?? 0, 5)}\\text{ rad}`
          : '\\text{Không xác định}';
      payload = {
        title: 'VINACAL 680EX PLUS III — Phép toán Vectơ Oxyz',
        katexContent: `$$\\vec{a} = ${aStr},\\quad \\vec{b} = ${bStr}$$`,
        stepsContent: [
          {
            title: 'Tích vô hướng & Độ dài',
            leadIn: '',
            mathDetail: `$\\vec{a}\\cdot\\vec{b} = ${formatExactRealLatex(vecAnalysis.dot).exactLatex}$ ; $|\\vec{a}| = ${formatExactRealLatex(vecAnalysis.magA).exactLatex}$ ; $|\\vec{b}| = ${formatExactRealLatex(vecAnalysis.magB).exactLatex}$`,
          },
          {
            title: 'Tích có hướng & Góc',
            leadIn: '',
            mathDetail: `$[\\vec{a},\\vec{b}] = ${crossStr}$ ; $\\widehat{(\\vec{a},\\vec{b})} \\approx ${angStr}$`,
          },
        ],
        finalAnswer: `$\\vec{a}\\cdot\\vec{b} = ${formatExactRealLatex(vecAnalysis.dot).exactLatex}$ ; $[\\vec{a},\\vec{b}] = ${crossStr}$`,
      };
    } else {
      const st = statSummary;
      payload = {
        title: 'VINACAL 680EX PLUS III — Thống kê 1 biến (STAT)',
        katexContent: st
          ? `$$n = ${st.n},\\quad \\bar{x} = ${formatExactRealLatex(st.mean).exactLatex} \\approx ${formatDecimalLatex(st.mean, 6)}$$`
          : 'Chưa có dữ liệu thống kê',
        stepsContent: st
          ? [
              {
                title: 'Phương sai & Độ lệch chuẩn',
                leadIn: '',
                mathDetail: `$\\sigma^2 \\approx ${formatDecimalLatex(st.popVar, 6)}$, $\\sigma \\approx ${formatDecimalLatex(st.popStd, 6)}$, $s^2 \\approx ${formatDecimalLatex(st.sampleVar, 6)}$, $s \\approx ${formatDecimalLatex(st.sampleStd, 6)}$`,
              },
              {
                title: 'Tứ phân vị',
                leadIn: '',
                mathDetail: `$\\min = ${st.min}$, $Q_1 = ${st.q1}$, $\\mathrm{Med} = ${st.median}$, $Q_3 = ${st.q3}$, $\\max = ${st.max}$`,
              },
            ]
          : undefined,
        finalAnswer: st ? `$\\bar{x} \\approx ${formatDecimalLatex(st.mean, 6)}$ ; $\\sigma \\approx ${formatDecimalLatex(st.popStd, 6)}$` : undefined,
      };
    }

    const evt = new CustomEvent<CalcBoardCardPayload>('teachlearn:insert-calc-card', {
      detail: payload,
    });
    window.dispatchEvent(evt);

    if (payload.handled) {
      setInsertedBadge('inserted');
      window.setTimeout(() => setInsertedBadge('idle'), 2200);
    } else {
      (window as unknown as Record<string, unknown>).__teachlearnPendingCalcCard = payload;
      setInsertedBadge('queued');
      flashNotice('Đã lưu hàng đợi — mở Bảng trắng để tự động chèn!');
      window.setTimeout(() => setInsertedBadge('idle'), 2800);
    }
  };

  // D-Pad Handlers
  const handleDpad = (dir: 'up' | 'down' | 'left' | 'right') => {
    setHasEvaluated(false);
    if (dir === 'left') {
      setEditor((prev) => moveCursorLeft(prev));
    } else if (dir === 'right') {
      setEditor((prev) => moveCursorRight(prev));
    } else if (dir === 'up') {
      const moved = moveCursorVertical(editor, 'up');
      if (moved.handled) {
        setEditor(moved.state);
      } else if (history.length > 0) {
        const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        const h = history[nextIdx];
        setEditor(h.editor);
        setLastResult(h.result);
      }
    } else if (dir === 'down') {
      const moved = moveCursorVertical(editor, 'down');
      if (moved.handled) {
        setEditor(moved.state);
      } else if (history.length > 0 && historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx >= history.length) {
          setHistoryIdx(-1);
          setEditor(createEmptyEditor());
        } else {
          setHistoryIdx(nextIdx);
          const h = history[nextIdx];
          setEditor(h.editor);
          setLastResult(h.result);
        }
      }
    }
  };

  let exprLatexWithCursor = '';
  try {
    exprLatexWithCursor = nodesToLatex(editor.nodes, editor.cursor, overlay === 'none');
  } catch {
    exprLatexWithCursor = '';
  }
  const displayedResultLatex = showPolar
    ? resultPolarLatex
    : showDecimal
    ? resultDecimalLatex
    : resultExactLatex;

  const isFormulaMode = mode === 'COMP' || mode === 'CMPLX';

  return (
    <div
      ref={shellRef}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      className="no-print fixed z-[75] flex w-[396px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[18px] border-2 border-[#5D95C8] bg-gradient-to-b from-[#A3CEF1] via-[#8EC0EB] to-[#79B0E1] text-[#10243E] shadow-[0_24px_60px_-10px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.65)]"
    >
      {/* SMAS 4.0 TEAL DRAGGABLE CONTROL STRIP */}
      <div
        onPointerDown={handleTitlePointerDown}
        className="flex cursor-grab items-center justify-between gap-1.5 bg-[#136F63] px-3 py-1.5 text-white select-none active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-4 w-4 shrink-0 text-teal-200/90" />
          <span className="truncate text-[11.5px] font-bold tracking-wide">
            Máy tính Khoa học THPT
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAngleUnit((u) => (u === 'DEG' ? 'RAD' : 'DEG'))}
            title="Chuyển nhanh đơn vị góc Độ (DEG) / Radian (RAD)"
            className="rounded-[5px] border border-white/25 bg-[#0F594F] px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-amber-200 transition-colors hover:bg-[#0B3B35]"
          >
            {angleUnit}
          </button>

          <button
            type="button"
            onClick={handleInsertOntoWhiteboard}
            title="Chèn biểu thức và kết quả hiện tại thành thẻ công thức KaTeX lên Bảng trắng"
            className={`flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
              insertedBadge === 'inserted'
                ? 'bg-emerald-500 text-white'
                : insertedBadge === 'queued'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white text-[#136F63] hover:bg-teal-50'
            }`}
          >
            {insertedBadge === 'inserted' ? (
              <>
                <Check className="h-3 w-3" />
                <span>Đã chèn</span>
              </>
            ) : (
              <>
                <Send className="h-3 w-3" />
                <span>Chèn lên Bảng</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng máy tính khoa học"
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-white/90 hover:bg-[#0F594F] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* AUTHENTIC VINACAL 680EX PLUS III BRANDING HEADER */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1 select-none">
        <div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[16px] leading-none font-black tracking-tight text-[#0F2440]">
              VINACAL
            </span>
            <span className="text-[8px] font-bold text-[#0F2440]">®</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-none font-extrabold tracking-wider text-[#1D4ED8]">
            680EX PLUS III
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Hologram-inspired authentic gold-teal micro seal */}
          <div className="flex flex-col items-end rounded-[4px] border border-[#1E3A8A]/25 bg-gradient-to-br from-[#FDE68A]/80 via-[#F8FAFC]/80 to-[#BAE6FD]/80 px-2 py-0.5 shadow-inner">
            <span className="text-[8px] leading-tight font-extrabold tracking-wider text-[#0F2440]">
              THPT · GHÉP NHÓM
            </span>
            <span className="text-[7.5px] leading-tight font-bold text-[#136F63]">
              Q₁ · Q₂ · Q₃ · ΔQ
            </span>
          </div>
        </div>
      </div>

      {/* RECESSED LCD SCREEN WITH DARK GRAPHITE BEZEL */}
      <div className="px-3.5 pb-1">
        <div className="rounded-[10px] border-2 border-[#3C5673] bg-[#243242] p-[5px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
          <div className="overflow-hidden rounded-[6px] border border-[#5B7065] bg-[#E5ECE6] text-[#111827] shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)]">
            {/* LCD Status Bar */}
            <div className="flex items-center justify-between border-b border-[#98AE9C]/60 bg-[#D7E2D8] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[#1E293B] select-none">
              <div className="flex items-center gap-1">
                <span
                  className={`rounded px-1 ${
                    shiftActive ? 'bg-[#1D4ED8] text-white' : 'text-slate-400'
                  }`}
                >
                  S
                </span>
                <span
                  className={`rounded px-1 ${
                    alphaActive ? 'bg-[#BE123C] text-white' : 'text-slate-400'
                  }`}
                >
                  A
                </span>
                {stoPending && <span className="rounded bg-[#136F63] px-1 text-white">STO</span>}
                {rclPending && <span className="rounded bg-[#1D4ED8] px-1 text-white">RCL</span>}
                {Math.abs(memoryVars.M) > 1e-12 && (
                  <span className="rounded bg-slate-800 px-1 text-white">M</span>
                )}
                <span className="rounded bg-[#1E293B] px-1 text-white">{angleUnit}</span>
                <span className="text-slate-600">Math▲</span>
              </div>
              <div className="flex items-center gap-1.5">
                {statusNotice && (
                  <span className="max-w-[140px] truncate text-[9px] font-bold text-[#136F63]">
                    {statusNotice}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOverlay(overlay === 'menu' ? 'none' : 'menu')}
                  className="rounded bg-[#1D4ED8] px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-[#1E40AF]"
                >
                  {mode === 'VECTOR' || mode === 'STAT'
                    ? statVecTab === 'GROUPED'
                      ? 'GHÉP NHÓM'
                      : statVecTab
                    : mode === 'GEOM'
                    ? 'HÌNH HỌC'
                    : mode}
                </button>
              </div>
            </div>

            {/* LCD BODY: OVERLAYS OR ACTIVE MODE */}
            {overlay === 'menu' ? (
              <div className="p-2">
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-extrabold text-[#0F2440]">
                  <span>MENU — CHỌN CHẾ ĐỘ (1–7)</span>
                  <button
                    type="button"
                    onClick={() => setOverlay('none')}
                    className="text-[10px] font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Đóng
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'COMP' as CalcMode, label: '1: COMP (Tính thường)' },
                    { id: 'CMPLX' as CalcMode, label: '2: CMPLX (Số phức)' },
                    { id: 'EQUA' as CalcMode, label: '3: EQUA (PT & Hệ PT)' },
                    { id: 'INEQ' as CalcMode, label: '4: INEQ (Bất PT 2–4)' },
                    { id: 'TABLE' as CalcMode, label: '5: TABLE (Bảng f(x))' },
                    { id: 'STAT' as CalcMode, label: '6: STAT·VCT (Ghép nhóm)' },
                    { id: 'GEOM' as CalcMode, label: '7: HÌNH HỌC (680EX III)' },
                  ].map((m) => {
                    const isActive =
                      mode === m.id || (m.id === 'STAT' && (mode === 'VECTOR' || mode === 'STAT'));
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMode(m.id);
                          if (m.id === 'GEOM') setGeomTool(null);
                          setOverlay('none');
                          setErrorMsg(null);
                        }}
                        className={`rounded-[5px] border px-2 py-1 text-left font-mono text-[10px] font-bold transition-colors ${
                          m.id === 'GEOM' ? 'col-span-2' : ''
                        } ${
                          isActive
                            ? 'border-[#136F63] bg-[#136F63] text-white'
                            : 'border-[#98AE9C] bg-white/80 text-[#0F2440] hover:bg-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : overlay === 'optn' ? (
              <div className="space-y-1.5 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-extrabold text-[#0F2440]">
                    OPTN — TÙY CHỌN NHANH
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverlay('none')}
                    className="text-[10px] font-semibold text-slate-600"
                  >
                    Đóng
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10.5px] font-bold">
                  {[
                    { label: 'Arg(', action: () => pressChar('arg(') },
                    { label: 'Conjg(', action: () => pressChar('Conjg(') },
                    {
                      label: 'r∠θ',
                      action: () => {
                        setShowPolar(true);
                        setShowDecimal(false);
                        setOverlay('none');
                      },
                    },
                    {
                      label: 'a+bi',
                      action: () => {
                        setShowPolar(false);
                        setOverlay('none');
                      },
                    },
                    { label: 'sinh(', action: () => pressChar('sinh(') },
                    { label: 'cosh(', action: () => pressChar('cosh(') },
                    { label: 'tanh(', action: () => pressChar('tanh(') },
                    {
                      label: 'i (Ảo)',
                      action: () => {
                        setMode('CMPLX');
                        pressChar('i');
                      },
                    },
                    { label: '∑(x)', action: () => pressTemplate('sigma') },
                    { label: 'd/dx', action: () => pressTemplate('deriv') },
                    { label: '∫ dx', action: () => pressTemplate('integral') },
                    { label: 'Dấu =', action: () => pressChar('=') },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={opt.action}
                      className="rounded border border-[#98AE9C] bg-white px-1 py-1 text-[#0F2440] hover:bg-[#136F63] hover:text-white"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : overlay === 'vars' ? (
              <div className="space-y-1.5 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-extrabold text-[#0F2440]">
                    {stoPending
                      ? 'STO — CHỌN BIẾN LƯU'
                      : rclPending
                      ? 'RCL — CHỌN BIẾN GỌI'
                      : 'BỘ NHỚ BIẾN (A–F, X, Y, M)'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMemoryVars(DEFAULT_MEMORY_VARS);
                        flashNotice('Đã xóa bộ nhớ A–M');
                      }}
                      className="text-[10px] font-bold text-rose-700 hover:underline"
                    >
                      Xóa hết
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStoPending(false);
                        setRclPending(false);
                        setOverlay('none');
                      }}
                      className="text-[10px] font-semibold text-slate-600"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {MEM_KEYS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        if (!handleVariableAction(v)) pressChar(v);
                        setOverlay('none');
                      }}
                      className="flex items-center justify-between rounded border border-[#98AE9C] bg-white px-2 py-0.5 text-[10.5px] hover:border-[#136F63] hover:bg-teal-50"
                    >
                      <span className="font-bold text-[#BE123C]">{v}</span>
                      <span className="truncate font-mono text-[10px] text-slate-800 tabular-nums">
                        {formatDecimalLatex(memoryVars[v], 6)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : overlay === 'calc' ? (
              <div className="space-y-1.5 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-extrabold text-[#0F2440]">
                    CALC — NHẬP GIÁ TRỊ BIẾN
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverlay('none')}
                    className="text-[10px] font-semibold text-slate-600"
                  >
                    Đóng
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {calcVarsList.map((v) => (
                    <label
                      key={v}
                      className="flex items-center gap-1.5 rounded border border-[#98AE9C] bg-white px-2 py-0.5"
                    >
                      <span className="text-[11px] font-bold text-[#BE123C]">{v}=</span>
                      <input
                        value={calcDrafts[v] ?? '0'}
                        onChange={(e) => setCalcDrafts((prev) => ({ ...prev, [v]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && runCalcEvaluation()}
                        className="w-full bg-transparent font-mono text-[11.5px] text-slate-900 focus:outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={runCalcEvaluation}
                  className="w-full rounded bg-[#136F63] py-1 text-[11px] font-bold text-white hover:bg-[#0F594F]"
                >
                  Tính giá trị (=)
                </button>
              </div>
            ) : overlay === 'solve' ? (
              <div className="space-y-1.5 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-extrabold text-[#0F2440]">
                    SOLVE — TÌM NGHIỆM f(X) = 0
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverlay('none')}
                    className="text-[10px] font-semibold text-slate-600"
                  >
                    Đóng
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="flex flex-1 items-center gap-1 rounded border border-[#98AE9C] bg-white px-2 py-0.5">
                    <span className="text-[10.5px] font-bold text-slate-700">Solve for X₀ =</span>
                    <input
                      value={solveGuess}
                      onChange={(e) => setSolveGuess(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runSolveEquation()}
                      className="w-16 bg-transparent font-mono text-[11.5px] font-bold text-slate-900 focus:outline-none tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={runSolveEquation}
                    className="rounded bg-[#136F63] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#0F594F]"
                  >
                    Giải X
                  </button>
                </div>
                {errorMsg && <div className="text-[10.5px] font-bold text-rose-700">{errorMsg}</div>}
                {solveOutput && (
                  <div className="rounded border border-[#136F63]/35 bg-white px-2 py-1 text-[11.5px]">
                    <div className="font-bold text-[#0F594F]">
                      <MathText text={`$X = ${solveOutput.xLatex}$`} />
                      {solveOutput.xLatex !== solveOutput.decLatex && (
                        <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                          (≈ {solveOutput.decLatex})
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[9.5px] text-slate-500">
                      L − R = {solveOutput.residual} (đã lưu vào X)
                    </div>
                  </div>
                )}
              </div>
            ) : isFormulaMode ? (
              /* NATURAL 2-LINE TEXTBOOK DISPLAY (COMP & CMPLX) */
              <div className="flex min-h-[96px] flex-col justify-between px-2.5 py-1.5">
                <div className="min-h-[38px] overflow-x-auto overflow-y-hidden text-[15.5px] leading-snug text-[#0F172A]">
                  <MathText
                    text={`$${exprLatexWithCursor || '\\textcolor{#136F63}{\\rule[-0.18em]{1.6pt}{1.15em}}'}$`}
                  />
                </div>
                <div className="mt-1 flex items-end justify-between border-t border-[#98AE9C]/50 pt-1">
                  <span className="font-mono text-[9.5px] font-bold text-slate-600">
                    {showPolar ? 'r∠θ' : showDecimal ? 'DEC' : 'EXACT'}
                  </span>
                  {errorMsg ? (
                    <div className="text-right text-[11px] font-bold text-rose-700">{errorMsg}</div>
                  ) : (
                    <div className="max-w-[295px] overflow-x-auto text-right text-[17.5px] font-bold text-[#0F172A] tabular-nums">
                      <MathText text={`$${displayedResultLatex}$`} />
                    </div>
                  )}
                </div>
              </div>
            ) : mode === 'EQUA' ? (
              /* MODE 3: EQUA */
              <div className="max-h-[330px] space-y-2 overflow-y-auto p-2 text-[11px]">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEquaKind('poly')}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        equaKind === 'poly' ? 'bg-[#136F63] text-white' : 'bg-white text-slate-700'
                      }`}
                    >
                      PT Đa thức
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquaKind('linear')}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        equaKind === 'linear' ? 'bg-[#136F63] text-white' : 'bg-white text-slate-700'
                      }`}
                    >
                      Hệ PT Bậc 1
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {([2, 3, 4] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => (equaKind === 'poly' ? setPolyDeg(n) : setLinearDim(n))}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          (equaKind === 'poly' ? polyDeg : linearDim) === n
                            ? 'bg-[#1D4ED8] text-white'
                            : 'bg-white text-slate-700'
                        }`}
                      >
                        {equaKind === 'poly' ? `Bậc ${n}` : `${n} ẩn`}
                      </button>
                    ))}
                  </div>
                </div>

                {equaKind === 'poly' ? (
                  <div className="space-y-1">
                    <div className="text-[10.5px] text-slate-700">
                      <MathText
                        text={
                          polyDeg === 2
                            ? '$ax^2 + bx + c = 0$'
                            : polyDeg === 3
                            ? '$ax^3 + bx^2 + cx + d = 0$'
                            : '$ax^4 + bx^3 + cx^2 + dx + e = 0$'
                        }
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {['a', 'b', 'c', 'd', 'e'].slice(0, polyDeg + 1).map((lbl, idx) => (
                        <label key={lbl} className="flex flex-col rounded border border-[#98AE9C] bg-white px-1 py-0.5">
                          <span className="text-[9px] font-bold text-[#136F63]">{lbl}</span>
                          <input
                            value={polyCoeffs[idx] ?? '0'}
                            onChange={(e) => {
                              const next = [...polyCoeffs];
                              next[idx] = e.target.value;
                              setPolyCoeffs(next);
                            }}
                            className="w-full font-mono text-[11.5px] font-bold text-slate-900 focus:outline-none tabular-nums"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Array.from({ length: linearDim }, (_, r) => (
                      <div key={r} className="flex items-center gap-0.5">
                        {Array.from({ length: linearDim }, (_, c) => (
                          <React.Fragment key={c}>
                            <input
                              value={linearCoeffs[r]?.[c] ?? '0'}
                              onChange={(e) => {
                                const next = linearCoeffs.map((row) => [...row]);
                                next[r][c] = e.target.value;
                                setLinearCoeffs(next);
                              }}
                              className="w-11 rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                            />
                            <span className="text-[10px] font-bold text-slate-700">
                              {['x', 'y', 'z', 't'][c]}
                              {c < linearDim - 1 ? '+' : '='}
                            </span>
                          </React.Fragment>
                        ))}
                        <input
                          value={linearCoeffs[r]?.[4] ?? '0'}
                          onChange={(e) => {
                            const next = linearCoeffs.map((row) => [...row]);
                            next[r][4] = e.target.value;
                            setLinearCoeffs(next);
                          }}
                          className="w-11 rounded border border-[#136F63]/50 bg-teal-50 px-1 py-0.5 text-center font-mono text-[11px] font-bold text-[#0F594F] tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1 rounded border border-[#98AE9C] bg-white p-2">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#136F63]">
                    Nghiệm tìm được
                  </div>
                  {equaResultLines.map((line, i) => (
                    <div key={i} className="text-[12.5px] font-semibold text-slate-900">
                      <MathText text={`$${line}$`} />
                    </div>
                  ))}
                  {equaExtremaLines.length > 0 && (
                    <div className="border-t border-slate-200 pt-1 text-[11px] text-[#0F594F]">
                      {equaExtremaLines.map((ex, i) => (
                        <div key={i}>
                          <MathText text={`$${ex}$`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : mode === 'INEQ' ? (
              /* MODE 4: INEQ */
              <div className="max-h-[330px] space-y-2 overflow-y-auto p-2 text-[11px]">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    {([2, 3, 4] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setIneqDeg(n)}
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                          ineqDeg === n ? 'bg-[#136F63] text-white' : 'bg-white text-slate-700'
                        }`}
                      >
                        Bậc {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(['>', '<', '>=', '<='] as IneqOp[]).map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setIneqOp(op)}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${
                          ineqOp === op ? 'bg-[#1D4ED8] text-white' : 'bg-white text-slate-700'
                        }`}
                      >
                        {op === '>=' ? '≥0' : op === '<=' ? '≤0' : `${op}0`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {['a', 'b', 'c', 'd', 'e'].slice(0, ineqDeg + 1).map((lbl, idx) => (
                    <label key={lbl} className="flex flex-col rounded border border-[#98AE9C] bg-white px-1 py-0.5">
                      <span className="text-[9px] font-bold text-[#136F63]">{lbl}</span>
                      <input
                        value={ineqCoeffs[idx] ?? '0'}
                        onChange={(e) => {
                          const next = [...ineqCoeffs];
                          next[idx] = e.target.value;
                          setIneqCoeffs(next);
                        }}
                        className="w-full font-mono text-[11.5px] font-bold text-slate-900 focus:outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                <div className="rounded border border-[#98AE9C] bg-white p-2">
                  <div className="mb-1 text-[9.5px] font-extrabold uppercase tracking-wider text-[#136F63]">
                    Tập nghiệm bất phương trình
                  </div>
                  <div className="overflow-x-auto text-[13.5px] font-semibold text-slate-900">
                    <MathText text={`$${ineqResultLatex || '\\dots'}$`} />
                  </div>
                </div>
              </div>
            ) : mode === 'TABLE' ? (
              /* MODE 5: TABLE */
              <div className="max-h-[360px] space-y-1.5 overflow-y-auto p-2 text-[10.5px]">
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col rounded border border-[#98AE9C] bg-white px-2 py-0.5">
                    <span className="text-[9px] font-bold text-[#136F63]">f(X) =</span>
                    <input
                      value={tableFx}
                      onChange={(e) => setTableFx(e.target.value)}
                      className="font-mono text-[11px] font-bold text-slate-900 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col rounded border border-[#98AE9C] bg-white px-2 py-0.5">
                    <span className="text-[9px] font-bold text-slate-500">g(X) = (tùy chọn)</span>
                    <input
                      value={tableGx}
                      onChange={(e) => setTableGx(e.target.value)}
                      placeholder="Trống"
                      className="font-mono text-[11px] text-slate-800 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { lbl: 'Start', val: tableStart, set: setTableStart },
                    { lbl: 'End', val: tableEnd, set: setTableEnd },
                    { lbl: 'Step', val: tableStep, set: setTableStep },
                  ].map((f) => (
                    <label
                      key={f.lbl}
                      className="flex items-center justify-between rounded border border-[#98AE9C] bg-white px-1.5 py-0.5"
                    >
                      <span className="text-[9.5px] font-bold text-slate-500">{f.lbl}</span>
                      <input
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        className="w-12 text-right font-mono text-[11px] font-bold text-slate-900 focus:outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                {tableError ? (
                  <div className="rounded bg-rose-50 px-2 py-1 font-bold text-rose-700">{tableError}</div>
                ) : (
                  <div className="max-h-[180px] overflow-y-auto rounded border border-[#98AE9C] bg-white">
                    <table className="w-full border-collapse text-right font-mono text-[10.5px] tabular-nums">
                      <thead className="sticky top-0 bg-[#136F63] text-white">
                        <tr>
                          <th className="px-2 py-0.5 text-left">X</th>
                          <th className="px-2 py-0.5">f(X)</th>
                          {tableGx.trim() && <th className="px-2 py-0.5">g(X)</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={`border-t border-slate-100 ${
                              row.isMaxFx
                                ? 'bg-emerald-50 font-bold text-emerald-900'
                                : row.isMinFx
                                ? 'bg-amber-50 font-bold text-amber-900'
                                : ''
                            }`}
                          >
                            <td className="px-2 py-0.5 text-left font-bold text-slate-700">{row.x}</td>
                            <td className="px-2 py-0.5">
                              {row.fx !== null ? formatDecimalLatex(row.fx, 6) : 'ERROR'}
                              {row.isMaxFx && (
                                <span className="ml-1 rounded bg-emerald-600 px-1 text-[8px] text-white">
                                  MAX
                                </span>
                              )}
                              {row.isMinFx && (
                                <span className="ml-1 rounded bg-amber-600 px-1 text-[8px] text-white">
                                  MIN
                                </span>
                              )}
                            </td>
                            {tableGx.trim() && (
                              <td className="px-2 py-0.5 text-slate-700">
                                {row.gx !== null ? formatDecimalLatex(row.gx, 6) : 'ERROR'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : mode === 'GEOM' ? (
              /* MODE 7: VINACAL 680EX PLUS III SIGNATURE GEOMETRY MENU (MATCHING IMAGE 1 LCD!) */
              <div className="max-h-[360px] space-y-1.5 overflow-y-auto p-2 text-[11px]">
                {geomTool === null ? (
                  <div className="space-y-1 font-mono">
                    {[
                      { id: 1 as GeomToolId, text: '1:Cthức tgiác đều' },
                      { id: 2 as GeomToolId, text: '2:Cthức Hê-rông' },
                      { id: 3 as GeomToolId, text: '3:Vtrí tđối 2đth' },
                      { id: 4 as GeomToolId, text: '4:Kcách đthẳng&mp' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setGeomTool(item.id)}
                        className="flex w-full items-center justify-between rounded border border-transparent px-2 py-1.5 text-left text-[13.5px] font-extrabold tracking-tight text-[#111827] hover:border-[#136F63] hover:bg-white"
                      >
                        <span>{item.text}</span>
                        <ChevronRight className="h-4 w-4 text-[#136F63]" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10.5px] font-extrabold text-[#136F63]">
                        {geomTool === 1 && '1: Cthức Tam giác đều'}
                        {geomTool === 2 && '2: Cthức Hê-rông'}
                        {geomTool === 3 && '3: Vtrí tương đối 2 đthẳng'}
                        {geomTool === 4 && '4: Khoảng cách đthẳng & mp'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGeomTool(null)}
                        className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        ← Danh sách
                      </button>
                    </div>

                    {geomTool === 1 && (
                      <div className="space-y-1.5">
                        <label className="flex items-center justify-between rounded border border-[#98AE9C] bg-white px-2 py-1">
                          <span className="font-bold text-slate-700">Cạnh tam giác đều a =</span>
                          <input
                            value={eqTriSide}
                            onChange={(e) => setEqTriSide(e.target.value)}
                            className="w-20 text-right font-mono font-bold text-[#0F2440] focus:outline-none tabular-nums"
                          />
                        </label>
                        {eqTriErr ? (
                          <div className="font-bold text-rose-700">{eqTriErr}</div>
                        ) : eqTriRes ? (
                          <div className="space-y-1 rounded border border-[#98AE9C] bg-white p-2 text-[11.5px]">
                            <div><MathText text={`$S = \\dfrac{a^2\\sqrt{3}}{4} = ${formatExactRealLatex(eqTriRes.area).exactLatex} \\approx ${formatDecimalLatex(eqTriRes.area, 5)}$`} /></div>
                            <div><MathText text={`$h = \\dfrac{a\\sqrt{3}}{2} = ${formatExactRealLatex(eqTriRes.height).exactLatex} \\approx ${formatDecimalLatex(eqTriRes.height, 5)}$`} /></div>
                            <div><MathText text={`$R = ${formatExactRealLatex(eqTriRes.circumR).exactLatex} \\; ; \\; r = ${formatExactRealLatex(eqTriRes.inR).exactLatex}$`} /></div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {geomTool === 2 && (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-3 gap-1">
                          {(['a', 'b', 'c'] as const).map((lbl, idx) => (
                            <label key={lbl} className="flex items-center gap-1 rounded border border-[#98AE9C] bg-white px-1.5 py-0.5">
                              <span className="font-bold text-[#136F63]">{lbl}=</span>
                              <input
                                value={heronSides[idx]}
                                onChange={(e) => {
                                  const next: [string, string, string] = [...heronSides];
                                  next[idx] = e.target.value;
                                  setHeronSides(next);
                                }}
                                className="w-full font-mono font-bold focus:outline-none tabular-nums"
                              />
                            </label>
                          ))}
                        </div>
                        {heronErr ? (
                          <div className="font-bold text-rose-700">{heronErr}</div>
                        ) : heronRes ? (
                          <div className="space-y-1 rounded border border-[#98AE9C] bg-white p-2 text-[11.5px]">
                            <div><MathText text={`$p = ${formatDecimalLatex(heronRes.p, 5)},\\quad S = ${formatExactRealLatex(heronRes.area).exactLatex} \\approx ${formatDecimalLatex(heronRes.area, 5)}$`} /></div>
                            <div><MathText text={`$R \\approx ${formatDecimalLatex(heronRes.circumR, 5)},\\quad r \\approx ${formatDecimalLatex(heronRes.inR, 5)}$`} /></div>
                            <div className="font-mono text-[10px] text-slate-600">
                              h_a≈{formatDecimalLatex(heronRes.ha, 4)} · h_b≈{formatDecimalLatex(heronRes.hb, 4)} · h_c≈{formatDecimalLatex(heronRes.hc, 4)}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {geomTool === 3 && (
                      <div className="space-y-1">
                        {[
                          { lbl: 'M₁∈d₁', val: line1P, set: setLine1P },
                          { lbl: 'u₁', val: line1U, set: setLine1U },
                          { lbl: 'M₂∈d₂', val: line2P, set: setLine2P },
                          { lbl: 'u₂', val: line2U, set: setLine2U },
                        ].map((row) => (
                          <div key={row.lbl} className="flex items-center gap-1">
                            <span className="w-12 font-mono text-[10px] font-bold text-[#0F594F]">{row.lbl}</span>
                            {[0, 1, 2].map((i) => (
                              <input
                                key={i}
                                value={row.val[i]}
                                onChange={(e) => {
                                  const next: [string, string, string] = [...row.val];
                                  next[i] = e.target.value;
                                  row.set(next);
                                }}
                                className="w-full rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                              />
                            ))}
                          </div>
                        ))}
                        {twoLinesErr ? (
                          <div className="font-bold text-rose-700">{twoLinesErr}</div>
                        ) : twoLinesRes ? (
                          <div className="space-y-0.5 rounded border border-[#98AE9C] bg-white p-2 text-[11px]">
                            <div>Vị trí: <strong className="text-[#136F63]">{twoLinesRes.relation}</strong> (Góc ≈ {formatDecimalLatex(twoLinesRes.angleDeg, 4)}°)</div>
                            {twoLinesRes.intersection ? (
                              <div>Giao điểm: <strong>I({twoLinesRes.intersection.map((v) => formatDecimalLatex(v, 4)).join('; ')})</strong></div>
                            ) : (
                              <div><MathText text={`$d(d_1, d_2) = ${formatExactRealLatex(twoLinesRes.distance).exactLatex} \\approx ${formatDecimalLatex(twoLinesRes.distance, 5)}$`} /></div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {geomTool === 4 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="w-12 font-mono text-[10px] font-bold text-[#0F594F]">M∈d</span>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              value={lpPoint[i]}
                              onChange={(e) => {
                                const next: [string, string, string] = [...lpPoint];
                                next[i] = e.target.value;
                                setLpPoint(next);
                              }}
                              className="w-full rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-12 font-mono text-[10px] font-bold text-[#0F594F]">u_d</span>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              value={lpDir[i]}
                              onChange={(e) => {
                                const next: [string, string, string] = [...lpDir];
                                next[i] = e.target.value;
                                setLpDir(next);
                              }}
                              className="w-full rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-12 font-mono text-[10px] font-bold text-[#1D4ED8]">(P)ABCD</span>
                          {[0, 1, 2, 3].map((i) => (
                            <input
                              key={i}
                              value={lpPlane[i]}
                              onChange={(e) => {
                                const next: [string, string, string, string] = [...lpPlane];
                                next[i] = e.target.value;
                                setLpPlane(next);
                              }}
                              className="w-full rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                            />
                          ))}
                        </div>
                        {linePlaneErr ? (
                          <div className="font-bold text-rose-700">{linePlaneErr}</div>
                        ) : linePlaneRes ? (
                          <div className="space-y-0.5 rounded border border-[#98AE9C] bg-white p-2 text-[11px]">
                            <div><MathText text={`$d(M,(P)) = ${formatExactRealLatex(linePlaneRes.pointDist).exactLatex} \\approx ${formatDecimalLatex(linePlaneRes.pointDist, 5)}$`} /></div>
                            <div>Hình chiếu <strong>H({linePlaneRes.footH.map((v) => formatDecimalLatex(v, 4)).join('; ')})</strong></div>
                            <div>Quan hệ d &amp; (P): <strong className="text-[#136F63]">{linePlaneRes.relation}</strong> (Góc ≈ {formatDecimalLatex(linePlaneRes.angleDeg, 4)}°)</div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* MODE 6: GROUPED STAT (TỨ PHÂN VỊ) + 1-VAR STAT + VECTOR Oxyz */
              <div className="max-h-[365px] space-y-1.5 overflow-y-auto p-2 text-[10.5px]">
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'GROUPED' as const, label: 'Ghép nhóm (Q₁–Q₃)' },
                    { id: 'STAT' as const, label: 'Thống kê đơn' },
                    { id: 'VECTOR' as const, label: 'Vectơ Oxyz' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setStatVecTab(tab.id);
                        setMode(tab.id === 'VECTOR' ? 'VECTOR' : 'STAT');
                      }}
                      className={`rounded py-1 text-[9.5px] font-bold ${
                        statVecTab === tab.id ? 'bg-[#136F63] text-white' : 'bg-white text-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {statVecTab === 'GROUPED' ? (
                  <div className="space-y-1.5">
                    <div className="max-h-[115px] overflow-y-auto rounded border border-[#98AE9C] bg-white">
                      <table className="w-full text-[10.5px]">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="px-1.5 py-0.5 text-left">Cận trái [a</th>
                            <th className="px-1.5 py-0.5 text-left">Cận phải b)</th>
                            <th className="px-1.5 py-0.5 text-left">Tần số n</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {groupedClasses.map((row, idx) => (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className="px-1.5 py-0.5">
                                <input
                                  value={row.lo}
                                  onChange={(e) =>
                                    setGroupedClasses((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, lo: e.target.value } : r))
                                    )
                                  }
                                  className="w-full font-mono font-bold focus:outline-none tabular-nums"
                                />
                              </td>
                              <td className="px-1.5 py-0.5">
                                <input
                                  value={row.hi}
                                  onChange={(e) =>
                                    setGroupedClasses((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, hi: e.target.value } : r))
                                    )
                                  }
                                  className="w-full font-mono font-bold focus:outline-none tabular-nums"
                                />
                              </td>
                              <td className="px-1.5 py-0.5">
                                <input
                                  value={row.freq}
                                  onChange={(e) =>
                                    setGroupedClasses((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, freq: e.target.value } : r))
                                    )
                                  }
                                  className="w-full font-mono font-bold text-[#136F63] focus:outline-none tabular-nums"
                                />
                              </td>
                              <td className="pr-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => setGroupedClasses((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const last = groupedClasses[groupedClasses.length - 1];
                        const lo = last ? Number(last.hi) || 0 : 0;
                        const step = last ? Math.max(1, (Number(last.hi) || 10) - (Number(last.lo) || 0)) : 10;
                        setGroupedClasses((prev) => [...prev, { lo: String(lo), hi: String(lo + step), freq: '1' }]);
                      }}
                      className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-[#136F63]/60 bg-white py-0.5 text-[10px] font-bold text-[#136F63] hover:bg-teal-50"
                    >
                      <Plus className="h-3 w-3" /> Thêm nhóm [a; b)
                    </button>

                    {groupedError ? (
                      <div className="font-bold text-rose-700">{groupedError}</div>
                    ) : groupedSummary ? (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded border border-[#98AE9C] bg-white p-1.5 font-mono text-[10.5px] tabular-nums">
                        <div>n = <strong>{groupedSummary.n}</strong></div>
                        <div>x̄ = <strong className="text-[#136F63]">{formatDecimalLatex(groupedSummary.mean, 5)}</strong></div>
                        <div>Q₁ = <strong className="text-[#1D4ED8]">{formatDecimalLatex(groupedSummary.q1, 5)}</strong></div>
                        <div>Q₂(Me) = <strong>{formatDecimalLatex(groupedSummary.q2, 5)}</strong></div>
                        <div>Q₃ = <strong className="text-[#1D4ED8]">{formatDecimalLatex(groupedSummary.q3, 5)}</strong></div>
                        <div>ΔQ = <strong className="text-[#BE123C]">{formatDecimalLatex(groupedSummary.iqr, 5)}</strong></div>
                        <div>Mo = <strong>{formatDecimalLatex(groupedSummary.mode, 5)}</strong></div>
                        <div>s² / s = <strong>{formatDecimalLatex(groupedSummary.popVar, 4)} / {formatDecimalLatex(groupedSummary.popStd, 4)}</strong></div>
                      </div>
                    ) : null}
                  </div>
                ) : statVecTab === 'VECTOR' ? (
                  <div className="space-y-1.5">
                    {[
                      { name: 'a', vec: vecA, set: setVecA },
                      { name: 'b', vec: vecB, set: setVecB },
                      { name: 'c', vec: vecC, set: setVecC },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center gap-1">
                        <span className="w-8 font-bold text-[#0F594F]">
                          <MathText text={`$\\vec{${item.name}}=$`} />
                        </span>
                        {[0, 1, 2].map((i) => (
                          <input
                            key={i}
                            value={item.vec[i]}
                            onChange={(e) => {
                              const next: [string, string, string] = [...item.vec];
                              next[i] = e.target.value;
                              item.set(next);
                            }}
                            className="w-full rounded border border-[#98AE9C] bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
                          />
                        ))}
                      </div>
                    ))}
                    <div className="space-y-0.5 rounded border border-[#98AE9C] bg-white p-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Tích vô hướng:</span>
                        <span className="font-bold"><MathText text={`$\\vec{a}\\cdot\\vec{b}=${formatExactRealLatex(vecAnalysis.dot).exactLatex}$`} /></span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Tích có hướng:</span>
                        <span className="font-bold text-[#136F63]">
                          [{vecAnalysis.cross.map((v) => formatDecimalLatex(v, 5)).join('; ')}]
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Góc (a, b):</span>
                        <span className="font-mono font-bold">
                          {vecAnalysis.angleDeg !== null
                            ? angleUnit === 'DEG'
                              ? `${formatDecimalLatex(vecAnalysis.angleDeg, 5)}°`
                              : `${formatDecimalLatex(vecAnalysis.angleRad ?? 0, 5)} rad`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>Hỗn tạp [a,b]·c:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatDecimalLatex(vecAnalysis.tripleProduct, 5)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="max-h-[115px] overflow-y-auto rounded border border-[#98AE9C] bg-white">
                      <table className="w-full text-[10.5px]">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="px-2 py-0.5 text-left">Giá trị x</th>
                            <th className="px-2 py-0.5 text-left">Tần số n</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {statItems.map((it, idx) => (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className="px-1.5 py-0.5">
                                <input
                                  value={it.x}
                                  onChange={(e) =>
                                    setStatItems((prev) =>
                                      prev.map((row, i) => (i === idx ? { ...row, x: e.target.value } : row))
                                    )
                                  }
                                  className="w-full font-mono font-bold focus:outline-none tabular-nums"
                                />
                              </td>
                              <td className="px-1.5 py-0.5">
                                <input
                                  value={it.freq}
                                  onChange={(e) =>
                                    setStatItems((prev) =>
                                      prev.map((row, i) => (i === idx ? { ...row, freq: e.target.value } : row))
                                    )
                                  }
                                  className="w-full font-mono focus:outline-none tabular-nums"
                                />
                              </td>
                              <td className="pr-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => setStatItems((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatItems((prev) => [...prev, { x: '0', freq: '1' }])}
                      className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-[#136F63]/60 bg-white py-0.5 text-[10px] font-bold text-[#136F63] hover:bg-teal-50"
                    >
                      <Plus className="h-3 w-3" /> Thêm giá trị x
                    </button>
                    {statError ? (
                      <div className="font-bold text-rose-700">{statError}</div>
                    ) : statSummary ? (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded border border-[#98AE9C] bg-white p-1.5 font-mono text-[10.5px] tabular-nums">
                        <div>n = <strong>{statSummary.n}</strong></div>
                        <div>x̄ = <strong className="text-[#136F63]">{formatDecimalLatex(statSummary.mean, 5)}</strong></div>
                        <div>σ² = <strong>{formatDecimalLatex(statSummary.popVar, 5)}</strong></div>
                        <div>σ = <strong>{formatDecimalLatex(statSummary.popStd, 5)}</strong></div>
                        <div>Q₁ = <strong>{statSummary.q1}</strong></div>
                        <div>Med = <strong>{statSummary.median}</strong></div>
                        <div>Q₃ = <strong>{statSummary.q3}</strong></div>
                        <div>s = <strong>{formatDecimalLatex(statSummary.sampleStd, 5)}</strong></div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-0.5 text-right text-[7.5px] font-bold tracking-[0.14em] text-[#28486A] select-none">
          SCIENTIFIC CALCULATOR
        </div>
      </div>

      {/* VINACAL 680EX PLUS III UPPER SCULPTED CLUSTER (SHIFT/ALPHA + 4-PETAL D-PAD + ON/MENU + CALC/∫/x/OPTN) */}
      <div className="px-3.5 pt-0.5 pb-1">
        <div className="grid grid-cols-[1fr_118px_1fr] items-center gap-2">
          {/* LEFT STACK: SHIFT / ALPHA + CALC / ∫ */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <VinacalKey
                label="SHIFT"
                shiftLabel="SHIFT"
                variant="pill"
                active={shiftActive}
                onClick={() => {
                  setShiftActive((s) => !s);
                  setAlphaActive(false);
                }}
              />
              <VinacalKey
                label="ALPHA"
                alphaLabel="ALPHA"
                variant="pill"
                active={alphaActive}
                onClick={() => {
                  setAlphaActive((a) => !a);
                  setShiftActive(false);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <VinacalKey
                label="CALC"
                shiftLabel="SOLVE"
                alphaLabel="="
                onClick={() => {
                  if (shiftActive) openSolveOverlay();
                  else if (alphaActive) {
                    pressChar('=');
                    consumeModifiers();
                  } else openCalcOverlay();
                }}
              />
              <VinacalKey
                label={<span className="font-serif text-[14px]">∫<sub>□</sub><sup>□</sup></span>}
                shiftLabel="d/dx"
                alphaLabel="Σ"
                onClick={() => {
                  if (shiftActive) pressTemplate('deriv');
                  else if (alphaActive) pressTemplate('sigma');
                  else pressTemplate('integral');
                  consumeModifiers();
                }}
              />
            </div>
          </div>

          {/* CENTER: AUTHENTIC 4-PETAL SPLIT METALLIC SILVER D-PAD RING */}
          <div className="relative mx-auto flex h-[86px] w-[112px] items-center justify-center select-none">
            {/* Top Petal ▲ */}
            <button
              type="button"
              onClick={() => handleDpad('up')}
              aria-label="Lên / Lịch sử trước"
              className="absolute top-0 left-1/2 flex h-[22px] w-[48px] -translate-x-1/2 items-center justify-center rounded-t-[18px] rounded-b-[6px] border border-[#2C4766] bg-gradient-to-b from-[#F8FAFC] to-[#D6E1EE] text-[#172B4D] shadow-[0_2px_0_#466482] hover:from-white active:translate-y-[1px]"
            >
              <ChevronUp className="h-3.5 w-3.5 stroke-[2.8]" />
            </button>
            {/* Bottom Petal ▼ */}
            <button
              type="button"
              onClick={() => handleDpad('down')}
              aria-label="Xuống / Lịch sử sau"
              className="absolute bottom-0 left-1/2 flex h-[22px] w-[48px] -translate-x-1/2 items-center justify-center rounded-t-[6px] rounded-b-[18px] border border-[#2C4766] bg-gradient-to-b from-[#F8FAFC] to-[#D6E1EE] text-[#172B4D] shadow-[0_2px_0_#466482] hover:from-white active:translate-y-[1px]"
            >
              <ChevronDown className="h-3.5 w-3.5 stroke-[2.8]" />
            </button>
            {/* Left Petal ◄ */}
            <button
              type="button"
              onClick={() => handleDpad('left')}
              aria-label="Con trỏ sang trái"
              className="absolute top-1/2 left-0 flex h-[42px] w-[26px] -translate-y-1/2 items-center justify-center rounded-l-[18px] rounded-r-[6px] border border-[#2C4766] bg-gradient-to-b from-[#F8FAFC] to-[#D6E1EE] text-[#172B4D] shadow-[0_2px_0_#466482] hover:from-white active:translate-y-[1px]"
            >
              <ChevronLeft className="h-3.5 w-3.5 stroke-[2.8]" />
            </button>
            {/* Right Petal ► */}
            <button
              type="button"
              onClick={() => handleDpad('right')}
              aria-label="Con trỏ sang phải"
              className="absolute top-1/2 right-0 flex h-[42px] w-[26px] -translate-y-1/2 items-center justify-center rounded-l-[6px] rounded-r-[18px] border border-[#2C4766] bg-gradient-to-b from-[#F8FAFC] to-[#D6E1EE] text-[#172B4D] shadow-[0_2px_0_#466482] hover:from-white active:translate-y-[1px]"
            >
              <ChevronRight className="h-3.5 w-3.5 stroke-[2.8]" />
            </button>
            {/* Recessed Center Disc */}
            <div className="h-[30px] w-[44px] rounded-full border border-[#5D8FBE]/60 bg-[#82B7E6]/70 shadow-inner" />
          </div>

          {/* RIGHT STACK: ON (BLUE!) / MENU + x / OPTN */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <VinacalKey
                label="MENU"
                shiftLabel="SET-UP"
                variant="pill"
                active={overlay === 'menu'}
                onClick={() => {
                  if (shiftActive) {
                    setAngleUnit((u) => (u === 'DEG' ? 'RAD' : 'DEG'));
                    flashNotice(`Đơn vị góc: ${angleUnit === 'DEG' ? 'RAD' : 'DEG'}`);
                    consumeModifiers();
                  } else {
                    setOverlay((o) => (o === 'menu' ? 'none' : 'menu'));
                  }
                }}
              />
              <VinacalKey
                label="ON"
                shiftLabel=" "
                variant="pillBlue"
                onClick={() => {
                  setEditor(createEmptyEditor());
                  setErrorMsg(null);
                  setOverlay('none');
                  setMode('COMP');
                  consumeModifiers();
                  flashNotice('VINACAL 680EX PLUS III sẵn sàng');
                }}
                title="Khởi động lại màn hình tính (ON)"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <VinacalKey
                label={<span className="font-serif italic text-[14px]">x</span>}
                shiftLabel="x!"
                alphaLabel="x⁻¹"
                onClick={() => {
                  if (shiftActive) pressChar('!');
                  else if (alphaActive)
                    pressTemplate('pow', [[{ kind: 'char', value: '-' }, { kind: 'char', value: '1' }]]);
                  else pressChar('X');
                  consumeModifiers();
                }}
              />
              <VinacalKey
                label="OPTN"
                shiftLabel="Σ"
                alphaLabel="HÌNH"
                onClick={() => {
                  if (shiftActive) pressTemplate('sigma');
                  else if (alphaActive) {
                    setMode('GEOM');
                    setGeomTool(null);
                  } else setOverlay((o) => (o === 'optn' ? 'none' : 'optn'));
                  consumeModifiers();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SCIENTIFIC & NUMERIC KEYPAD (COMP & CMPLX) */}
      {isFormulaMode ? (
        <div className="space-y-1.5 px-3.5 pt-1 pb-3">
          {/* Row A (6 cols): □/□, √□, x², x^□, log, ln */}
          <div className="grid grid-cols-6 gap-1.5">
            <VinacalKey
              label={<span className="text-[11px]">□/□</span>}
              shiftLabel="a b/c"
              onClick={() => {
                pressTemplate('frac');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={<span className="text-[13px]">√□</span>}
              shiftLabel="∛□"
              onClick={() => {
                if (shiftActive) pressTemplate('cbrt');
                else pressTemplate('sqrt');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={<span>x<sup>2</sup></span>}
              shiftLabel="x³"
              onClick={() => {
                if (shiftActive) pressTemplate('pow', [[{ kind: 'char', value: '3' }]]);
                else pressTemplate('pow', [[{ kind: 'char', value: '2' }]]);
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={<span>x<sup>□</sup></span>}
              shiftLabel="ⁿ√□"
              onClick={() => {
                if (shiftActive) pressTemplate('nthroot');
                else pressTemplate('pow');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="log"
              shiftLabel="10ˣ"
              onClick={() => {
                if (shiftActive) {
                  pressChar('1');
                  pressChar('0');
                  pressTemplate('pow');
                } else pressChar('log(');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="ln"
              shiftLabel="eˣ"
              alphaLabel="e"
              onClick={() => {
                if (shiftActive) {
                  pressChar('e');
                  pressTemplate('pow');
                } else if (alphaActive) pressChar('e');
                else pressChar('ln(');
                consumeModifiers();
              }}
            />
          </div>

          {/* Row B (6 cols): (−), ° ' ", log□, sin, cos, tan */}
          <div className="grid grid-cols-6 gap-1.5">
            <VinacalKey
              label="(−)"
              shiftLabel="∠"
              alphaLabel="A"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('A');
                  return;
                }
                if (shiftActive) pressChar('∠');
                else if (alphaActive) pressChar('A');
                else pressChar('-');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="° ' &quot;"
              shiftLabel="←"
              alphaLabel="B"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('B');
                  return;
                }
                if (alphaActive) pressChar('B');
                else pressChar('°');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={<span className="text-[10.5px]">log<sub>□</sub>□</span>}
              shiftLabel="Abs"
              alphaLabel="C"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('C');
                  return;
                }
                if (shiftActive) pressTemplate('abs');
                else if (alphaActive) pressChar('C');
                else pressTemplate('logbase');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="sin"
              shiftLabel="sin⁻¹"
              alphaLabel="D"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('D');
                  return;
                }
                if (alphaActive) pressChar('D');
                else if (shiftActive) pressChar('asin(');
                else pressChar('sin(');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="cos"
              shiftLabel="cos⁻¹"
              alphaLabel="E"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('E');
                  return;
                }
                if (alphaActive) pressChar('E');
                else if (shiftActive) pressChar('acos(');
                else pressChar('cos(');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="tan"
              shiftLabel="tan⁻¹"
              alphaLabel="F"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('F');
                  return;
                }
                if (alphaActive) pressChar('F');
                else if (shiftActive) pressChar('atan(');
                else pressChar('tan(');
                consumeModifiers();
              }}
            />
          </div>

          {/* Row C (6 cols): RCL/STO, ENG/i, (, ), S⇔D, M+ */}
          <div className="grid grid-cols-6 gap-1.5">
            <VinacalKey
              label="RCL"
              shiftLabel="STO"
              onClick={() => {
                if (shiftActive) {
                  setStoPending(true);
                  setRclPending(false);
                } else {
                  setRclPending(true);
                  setStoPending(false);
                }
                setOverlay('vars');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={mode === 'CMPLX' ? <span className="font-serif italic text-[14px] text-[#1D4ED8]">i</span> : 'ENG'}
              shiftLabel="i"
              onClick={() => {
                if (mode !== 'CMPLX') setMode('CMPLX');
                pressChar('i');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="("
              shiftLabel="%"
              onClick={() => {
                if (shiftActive) pressChar('%');
                else pressChar('(');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label=")"
              shiftLabel=","
              alphaLabel="X"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('X');
                  return;
                }
                if (alphaActive) pressChar('X');
                else pressChar(')');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="S⇔D"
              shiftLabel="r∠θ"
              alphaLabel="Y"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('Y');
                  return;
                }
                if (alphaActive) {
                  pressChar('Y');
                } else if (shiftActive && mode === 'CMPLX') {
                  setShowPolar((p) => !p);
                  setShowDecimal(false);
                } else {
                  setShowPolar(false);
                  setShowDecimal((d) => !d);
                }
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="M+"
              shiftLabel="M−"
              alphaLabel="M"
              onClick={() => {
                if (stoPending || rclPending) {
                  handleVariableAction('M');
                  return;
                }
                if (alphaActive) pressChar('M');
                else if (shiftActive) {
                  setMemoryVars((prev) => ({ ...prev, M: prev.M - lastResult.re }));
                  flashNotice(`M − ${formatDecimalLatex(lastResult.re, 5)}`);
                } else {
                  setMemoryVars((prev) => ({ ...prev, M: prev.M + lastResult.re }));
                  flashNotice(`M + ${formatDecimalLatex(lastResult.re, 5)}`);
                }
                consumeModifiers();
              }}
            />
          </div>

          {/* NUMERIC & CORE ARITHMETIC PAD (5 cols × 4 rows — PERFECTLY ALIGNED!) */}
          <div className="grid grid-cols-5 gap-1.5 pt-0.5">
            {/* Row 1 */}
            <VinacalKey
              label="7"
              shiftLabel="VAR"
              variant="num"
              onClick={() => {
                if (shiftActive) setOverlay('vars');
                else pressChar('7');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="8"
              shiftLabel="HÌNH"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  setMode('GEOM');
                  setGeomTool(null);
                } else pressChar('8');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="9"
              shiftLabel="RESET"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  setMemoryVars(DEFAULT_MEMORY_VARS);
                  setEditor(createEmptyEditor());
                  setLastResult({ re: 0, im: 0 });
                  flashNotice('Đã đặt lại bộ nhớ');
                } else pressChar('9');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="DEL"
              shiftLabel="INS"
              alphaLabel="UNDO"
              variant="blue"
              onClick={() => {
                setHasEvaluated(false);
                setErrorMsg(null);
                setEditor((prev) => deleteAtCursor(prev));
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="AC"
              shiftLabel="OFF"
              variant="blue"
              onClick={() => {
                if (shiftActive) {
                  onClose();
                  return;
                }
                setEditor(createEmptyEditor());
                setErrorMsg(null);
                setHasEvaluated(false);
                setOverlay('none');
                setStoPending(false);
                setRclPending(false);
                consumeModifiers();
              }}
            />

            {/* Row 2 */}
            <VinacalKey label="4" variant="num" onClick={() => { pressChar('4'); consumeModifiers(); }} />
            <VinacalKey label="5" variant="num" onClick={() => { pressChar('5'); consumeModifiers(); }} />
            <VinacalKey label="6" variant="num" onClick={() => { pressChar('6'); consumeModifiers(); }} />
            <VinacalKey
              label="×"
              shiftLabel="nPr"
              variant="num"
              onClick={() => {
                if (shiftActive) pressChar('nPr', true);
                else pressChar('×', true);
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="÷"
              shiftLabel="nCr"
              variant="num"
              onClick={() => {
                if (shiftActive) pressChar('nCr', true);
                else pressChar('÷', true);
                consumeModifiers();
              }}
            />

            {/* Row 3 */}
            <VinacalKey label="1" variant="num" onClick={() => { pressChar('1'); consumeModifiers(); }} />
            <VinacalKey label="2" variant="num" onClick={() => { pressChar('2'); consumeModifiers(); }} />
            <VinacalKey label="3" variant="num" onClick={() => { pressChar('3'); consumeModifiers(); }} />
            <VinacalKey
              label="+"
              shiftLabel="Pol"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  setShowPolar(true);
                  setShowDecimal(false);
                } else pressChar('+', true);
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="−"
              shiftLabel="Rec"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  setShowPolar(false);
                } else pressChar('-', true);
                consumeModifiers();
              }}
            />

            {/* Row 4 */}
            <VinacalKey
              label="0"
              shiftLabel="Rnd"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  const rounded = Math.round(lastResult.re * 100) / 100;
                  setLastResult({ re: rounded, im: 0 });
                  flashNotice(`Làm tròn: ${rounded}`);
                } else pressChar('0');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="·"
              shiftLabel="Ran#"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  const r = Number(Math.random().toFixed(3));
                  for (const ch of String(r)) pressChar(ch);
                } else pressChar('.');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label={<span className="text-[12px]">×10<sup>x</sup></span>}
              shiftLabel="π"
              alphaLabel="e"
              variant="num"
              onClick={() => {
                if (shiftActive) pressChar('π');
                else if (alphaActive) pressChar('e');
                else {
                  pressChar('×');
                  pressChar('1');
                  pressChar('0');
                  pressTemplate('pow');
                }
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="Ans"
              shiftLabel="PreAns"
              variant="num"
              onClick={() => {
                if (shiftActive) {
                  const valStr = formatDecimalLatex(preAns.re, 8);
                  for (const ch of valStr) pressChar(ch);
                } else pressChar('Ans');
                consumeModifiers();
              }}
            />
            <VinacalKey
              label="="
              shiftLabel="≈"
              variant="num"
              onClick={() => {
                evaluateCurrentExpression(undefined, shiftActive);
                consumeModifiers();
              }}
            />
          </div>
        </div>
      ) : (
        /* FOOTER BAR WHEN IN EQUA / INEQ / TABLE / STAT / VECTOR / GEOM */
        <div className="flex items-center justify-between gap-2 border-t border-[#5D95C8]/60 bg-[#7CB2E2]/80 px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => setMode('COMP')}
            className="flex items-center gap-1 rounded-[6px] border border-[#2C4766] bg-gradient-to-b from-[#F7FAFD] to-[#DDE6F0] px-2.5 py-1.5 text-[11px] font-bold text-[#10243E] shadow-[0_2px_0_#466482] hover:from-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Về tính thường (COMP)
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === 'EQUA') runEquaSolver();
              else if (mode === 'INEQ') runIneqSolver();
              else if (mode === 'TABLE') runTableGenerator();
              else if (mode === 'GEOM') setGeomTool(null);
            }}
            className="rounded-[6px] border border-[#1E3A8A] bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] px-3.5 py-1.5 text-[11.5px] font-extrabold text-white shadow-[0_2px_0_#172554] hover:from-[#3B82F6]"
          >
            {mode === 'GEOM' ? 'Menu Hình học' : 'Tính / Cập nhật (=)'}
          </button>
        </div>
      )}
    </div>
  );
};
