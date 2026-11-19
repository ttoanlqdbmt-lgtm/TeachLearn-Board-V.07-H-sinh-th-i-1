// ============================================================================
// SCIENTIFIC CALCULATOR ENGINE (Vinacal 680EX Plus / Casio fx-580VN X)
// Natural Textbook Display AST + Safe Recursive-Descent Evaluator (Real & Complex)
// + Exact Symbolic Formatter (S<=>D) + Calculus + EQUA + INEQ + TABLE + VECTOR + STAT
// ============================================================================

export type AngleUnit = 'DEG' | 'RAD';
export type CalcMode = 'COMP' | 'CMPLX' | 'EQUA' | 'INEQ' | 'TABLE' | 'VECTOR' | 'STAT' | 'GEOM';

export type MemoryVarName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'X' | 'Y' | 'M';
export type MemoryVars = Record<MemoryVarName, number>;

export const DEFAULT_MEMORY_VARS: MemoryVars = {
  A: 0,
  B: 0,
  C: 0,
  D: 0,
  E: 0,
  F: 0,
  X: 0,
  Y: 0,
  M: 0,
};

// ============================================================================
// 1. NATURAL TEXTBOOK DISPLAY AST & CURSOR NAVIGATION
// ============================================================================

export type MathNodeKind =
  | 'char'
  | 'frac'
  | 'sqrt'
  | 'cbrt'
  | 'nthroot'
  | 'pow'
  | 'abs'
  | 'logbase'
  | 'integral'
  | 'deriv'
  | 'sigma';

export interface MathNode {
  kind: MathNodeKind;
  value?: string;
  slots?: MathNode[][];
}

export interface CursorStep {
  nodeIdx: number;
  slotIdx: number;
}

export interface CursorPos {
  path: CursorStep[];
  index: number;
}

export interface EditorState {
  nodes: MathNode[];
  cursor: CursorPos;
}

export function createEmptyEditor(): EditorState {
  return { nodes: [], cursor: { path: [], index: 0 } };
}

export function cloneNodes(nodes: MathNode[]): MathNode[] {
  return nodes.map((n) => ({
    kind: n.kind,
    value: n.value,
    slots: n.slots ? n.slots.map((s) => cloneNodes(s)) : undefined,
  }));
}

export function getSlotAtPath(root: MathNode[], path: CursorStep[]): MathNode[] | null {
  let current = root;
  for (const step of path) {
    const node = current[step.nodeIdx];
    if (!node || !node.slots || !node.slots[step.slotIdx]) return null;
    current = node.slots[step.slotIdx];
  }
  return current;
}

function getParentNode(root: MathNode[], path: CursorStep[]): MathNode | null {
  if (path.length === 0) return null;
  const parentSlot = getSlotAtPath(root, path.slice(0, -1));
  if (!parentSlot) return null;
  return parentSlot[path[path.length - 1].nodeIdx] ?? null;
}

export function insertCharNode(state: EditorState, value: string): EditorState {
  const nodes = cloneNodes(state.nodes);
  const slot = getSlotAtPath(nodes, state.cursor.path);
  if (!slot) return state;
  const idx = Math.max(0, Math.min(state.cursor.index, slot.length));
  slot.splice(idx, 0, { kind: 'char', value });
  return {
    nodes,
    cursor: { path: [...state.cursor.path], index: idx + 1 },
  };
}

/**
 * Helper to capture preceding simple operand when pressing Fraction (a/b)
 * e.g. typing "3" then pressing a/b puts "3" in numerator and cursor in denominator.
 */
function extractPrecedingOperand(slot: MathNode[], cursorIndex: number): { extracted: MathNode[]; newIndex: number } {
  if (cursorIndex <= 0) return { extracted: [], newIndex: cursorIndex };
  let start = cursorIndex - 1;
  const isOperandChar = (v?: string) =>
    !!v && /^[0-9.a-zA-ZπeX-Z]|Ans|i$/.test(v) && !['+', '-', '×', '÷', '=', ',', '∠'].includes(v);

  const prev = slot[start];
  if (prev.kind !== 'char') {
    // Take single structured node
    const extracted = slot.splice(start, 1);
    return { extracted, newIndex: start };
  }
  if (!isOperandChar(prev.value)) {
    return { extracted: [], newIndex: cursorIndex };
  }
  while (start > 0) {
    const candidate = slot[start - 1];
    if (candidate.kind === 'char' && isOperandChar(candidate.value)) {
      start--;
    } else {
      break;
    }
  }
  const extracted = slot.splice(start, cursorIndex - start);
  return { extracted, newIndex: start };
}

export function insertTemplateNode(
  state: EditorState,
  kind: Exclude<MathNodeKind, 'char'>,
  initialSlotIndex = 0,
  presetSlots?: MathNode[][]
): EditorState {
  const nodes = cloneNodes(state.nodes);
  const slot = getSlotAtPath(nodes, state.cursor.path);
  if (!slot) return state;
  let idx = Math.max(0, Math.min(state.cursor.index, slot.length));

  const slotCountMap: Record<Exclude<MathNodeKind, 'char'>, number> = {
    frac: 2,
    sqrt: 1,
    cbrt: 1,
    nthroot: 2,
    pow: 1,
    abs: 1,
    logbase: 2,
    integral: 3, // [integrand, lower, upper]
    deriv: 2,    // [expr, point]
    sigma: 3,    // [expr, start, end]
  };

  const count = slotCountMap[kind];
  const slots: MathNode[][] = presetSlots
    ? presetSlots.map((s) => cloneNodes(s))
    : Array.from({ length: count }, () => []);

  let targetSlotIdx = initialSlotIndex;

  if (kind === 'frac' && !presetSlots) {
    const { extracted, newIndex } = extractPrecedingOperand(slot, idx);
    if (extracted.length > 0) {
      slots[0] = extracted;
      idx = newIndex;
      targetSlotIdx = 1; // jump straight to denominator
    }
  }

  slot.splice(idx, 0, { kind, slots });

  // For x^2 or x^-1 (preset pow), put cursor AFTER the pow node
  if (kind === 'pow' && presetSlots) {
    return {
      nodes,
      cursor: { path: [...state.cursor.path], index: idx + 1 },
    };
  }

  return {
    nodes,
    cursor: {
      path: [...state.cursor.path, { nodeIdx: idx, slotIdx: targetSlotIdx }],
      index: slots[targetSlotIdx]?.length ?? 0,
    },
  };
}

export function moveCursorLeft(state: EditorState): EditorState {
  const { nodes, cursor } = state;
  const slot = getSlotAtPath(nodes, cursor.path);
  if (!slot) return state;

  if (cursor.index > 0) {
    const leftNode = slot[cursor.index - 1];
    if (leftNode.slots && leftNode.slots.length > 0) {
      const lastSlotIdx = leftNode.slots.length - 1;
      return {
        nodes,
        cursor: {
          path: [...cursor.path, { nodeIdx: cursor.index - 1, slotIdx: lastSlotIdx }],
          index: leftNode.slots[lastSlotIdx].length,
        },
      };
    }
    return {
      nodes,
      cursor: { path: [...cursor.path], index: cursor.index - 1 },
    };
  }

  // At index 0 of a nested slot
  if (cursor.path.length > 0) {
    const lastStep = cursor.path[cursor.path.length - 1];
    const parentPath = cursor.path.slice(0, -1);
    const parentNode = getParentNode(nodes, cursor.path);
    if (parentNode && parentNode.slots && lastStep.slotIdx > 0) {
      const prevSlotIdx = lastStep.slotIdx - 1;
      return {
        nodes,
        cursor: {
          path: [...parentPath, { nodeIdx: lastStep.nodeIdx, slotIdx: prevSlotIdx }],
          index: parentNode.slots[prevSlotIdx].length,
        },
      };
    }
    // Exit template to the left
    return {
      nodes,
      cursor: { path: parentPath, index: lastStep.nodeIdx },
    };
  }

  return state;
}

export function moveCursorRight(state: EditorState): EditorState {
  const { nodes, cursor } = state;
  const slot = getSlotAtPath(nodes, cursor.path);
  if (!slot) return state;

  if (cursor.index < slot.length) {
    const rightNode = slot[cursor.index];
    if (rightNode.slots && rightNode.slots.length > 0) {
      return {
        nodes,
        cursor: {
          path: [...cursor.path, { nodeIdx: cursor.index, slotIdx: 0 }],
          index: 0,
        },
      };
    }
    return {
      nodes,
      cursor: { path: [...cursor.path], index: cursor.index + 1 },
    };
  }

  // At end of a nested slot
  if (cursor.path.length > 0) {
    const lastStep = cursor.path[cursor.path.length - 1];
    const parentPath = cursor.path.slice(0, -1);
    const parentNode = getParentNode(nodes, cursor.path);
    if (parentNode && parentNode.slots && lastStep.slotIdx < parentNode.slots.length - 1) {
      const nextSlotIdx = lastStep.slotIdx + 1;
      return {
        nodes,
        cursor: {
          path: [...parentPath, { nodeIdx: lastStep.nodeIdx, slotIdx: nextSlotIdx }],
          index: 0,
        },
      };
    }
    // Exit template to the right
    return {
      nodes,
      cursor: { path: parentPath, index: lastStep.nodeIdx + 1 },
    };
  }

  return state;
}

/**
 * Returns { state, handled } so UI knows whether Up/Down moved inside a template
 * or should cycle through history!
 */
export function moveCursorVertical(
  state: EditorState,
  dir: 'up' | 'down'
): { state: EditorState; handled: boolean } {
  const { nodes, cursor } = state;
  if (cursor.path.length === 0) return { state, handled: false };

  // Walk upward from deepest slot to find a vertically navigable parent
  for (let depth = cursor.path.length - 1; depth >= 0; depth--) {
    const subPath = cursor.path.slice(0, depth + 1);
    const step = cursor.path[depth];
    const parentNode = getParentNode(nodes, subPath);
    if (!parentNode || !parentNode.slots) continue;

    let nextSlotIdx: number | null = null;
    if (parentNode.kind === 'frac') {
      if (dir === 'up' && step.slotIdx === 1) nextSlotIdx = 0;
      if (dir === 'down' && step.slotIdx === 0) nextSlotIdx = 1;
    } else if (parentNode.kind === 'integral' || parentNode.kind === 'sigma') {
      // slots: 0=expr, 1=lower, 2=upper
      if (dir === 'up' && (step.slotIdx === 1 || step.slotIdx === 0)) nextSlotIdx = 2;
      if (dir === 'down' && (step.slotIdx === 2 || step.slotIdx === 0)) nextSlotIdx = 1;
    } else if (parentNode.kind === 'nthroot' || parentNode.kind === 'logbase' || parentNode.kind === 'deriv') {
      if (dir === 'up' && step.slotIdx === 1) nextSlotIdx = 0;
      if (dir === 'down' && step.slotIdx === 0) nextSlotIdx = 1;
    }

    if (nextSlotIdx !== null && parentNode.slots[nextSlotIdx]) {
      const targetLen = parentNode.slots[nextSlotIdx].length;
      return {
        handled: true,
        state: {
          nodes,
          cursor: {
            path: [...cursor.path.slice(0, depth), { nodeIdx: step.nodeIdx, slotIdx: nextSlotIdx }],
            index: targetLen,
          },
        },
      };
    }
  }

  return { state, handled: false };
}

export function deleteAtCursor(state: EditorState): EditorState {
  const nodes = cloneNodes(state.nodes);
  const slot = getSlotAtPath(nodes, state.cursor.path);
  if (!slot) return state;

  if (state.cursor.index > 0) {
    slot.splice(state.cursor.index - 1, 1);
    return {
      nodes,
      cursor: { path: [...state.cursor.path], index: state.cursor.index - 1 },
    };
  }

  // index === 0 inside nested slot
  if (state.cursor.path.length > 0) {
    const lastStep = state.cursor.path[state.cursor.path.length - 1];
    const parentPath = state.cursor.path.slice(0, -1);
    const parentSlot = getSlotAtPath(nodes, parentPath);
    const parentNode = parentSlot?.[lastStep.nodeIdx];

    if (parentSlot && parentNode) {
      // If inside slot 0 of a template, unwrap slot 0's remaining contents into parent slot
      if (lastStep.slotIdx === 0) {
        const inner = parentNode.slots?.[0] ?? [];
        parentSlot.splice(lastStep.nodeIdx, 1, ...inner);
        return {
          nodes,
          cursor: { path: parentPath, index: lastStep.nodeIdx },
        };
      }
      // Otherwise jump to end of previous slot
      const prevSlotIdx = lastStep.slotIdx - 1;
      const prevSlot = parentNode.slots?.[prevSlotIdx] ?? [];
      return {
        nodes,
        cursor: {
          path: [...parentPath, { nodeIdx: lastStep.nodeIdx, slotIdx: prevSlotIdx }],
          index: prevSlot.length,
        },
      };
    }
  }

  return state;
}

// ============================================================================
// 2. AST -> KATEX RENDERER (WITH CURSOR) & AST -> PARSER STRING
// ============================================================================

const CHAR_TO_LATEX: Record<string, string> = {
  '×': '\\times ',
  '÷': '\\div ',
  'π': '\\pi ',
  '∠': '\\angle ',
  '°': '^\\circ ',
  'nCr': '\\mathrm{C}',
  'nPr': '\\mathrm{P}',
  'sin(': '\\sin(',
  'cos(': '\\cos(',
  'tan(': '\\tan(',
  'asin(': '\\sin^{-1}(',
  'acos(': '\\cos^{-1}(',
  'atan(': '\\tan^{-1}(',
  'sinh(': '\\sinh(',
  'cosh(': '\\cosh(',
  'tanh(': '\\tanh(',
  'ln(': '\\ln(',
  'log(': '\\log(',
  'arg(': '\\arg(',
  'Conjg(': '\\mathrm{Conjg}(',
  'Ans': '\\mathrm{Ans}',
  'e': 'e',
  'i': 'i',
};

function pathsEqual(a: CursorStep[], b: CursorStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].nodeIdx !== b[i].nodeIdx || a[i].slotIdx !== b[i].slotIdx) return false;
  }
  return true;
}

export function nodesToLatex(
  nodes: MathNode[],
  cursor?: CursorPos | null,
  showCursor = true,
  currentPath: CursorStep[] = []
): string {
  const isCursorHere = Boolean(showCursor && cursor && pathsEqual(currentPath, cursor.path));
  const cursorMark = '\\textcolor{#136F63}{\\rule[-0.18em]{1.6pt}{1.15em}}';

  const renderSlot = (slotNodes: MathNode[], nodeIdx: number, slotIdx: number): string => {
    const nextPath = [...currentPath, { nodeIdx, slotIdx }];
    const content = nodesToLatex(slotNodes, cursor, showCursor, nextPath);
    if (slotNodes.length === 0) {
      const hasCursor = Boolean(showCursor && cursor && pathsEqual(nextPath, cursor.path));
      return hasCursor ? cursorMark : '\\textcolor{#94A3B8}{\\square}';
    }
    return content;
  };

  let out = '';
  for (let i = 0; i <= nodes.length; i++) {
    if (isCursorHere && cursor && cursor.index === i) {
      out += cursorMark;
    }
    if (i === nodes.length) break;

    const node = nodes[i];
    if (node.kind === 'char') {
      const v = node.value ?? '';
      out += CHAR_TO_LATEX[v] ?? v;
    } else if (node.kind === 'frac') {
      const num = renderSlot(node.slots?.[0] ?? [], i, 0);
      const den = renderSlot(node.slots?.[1] ?? [], i, 1);
      out += `\\dfrac{${num}}{${den}}`;
    } else if (node.kind === 'sqrt') {
      const inner = renderSlot(node.slots?.[0] ?? [], i, 0);
      out += `\\sqrt{${inner}}`;
    } else if (node.kind === 'cbrt') {
      const inner = renderSlot(node.slots?.[0] ?? [], i, 0);
      out += `\\sqrt[3]{${inner}}`;
    } else if (node.kind === 'nthroot') {
      const idxStr = renderSlot(node.slots?.[0] ?? [], i, 0);
      const inner = renderSlot(node.slots?.[1] ?? [], i, 1);
      out += `\\sqrt[${idxStr}]{${inner}}`;
    } else if (node.kind === 'pow') {
      const exp = renderSlot(node.slots?.[0] ?? [], i, 0);
      // If pow is at index 0 or after an operator, add empty base box
      const prev = i > 0 ? nodes[i - 1] : null;
      const needsBase =
        !prev ||
        (prev.kind === 'char' && ['+', '-', '×', '÷', '(', '=', ','].includes(prev.value ?? ''));
      out += `${needsBase ? '\\textcolor{#94A3B8}{\\square}' : ''}^{${exp}}`;
    } else if (node.kind === 'abs') {
      const inner = renderSlot(node.slots?.[0] ?? [], i, 0);
      out += `\\left|${inner}\\right|`;
    } else if (node.kind === 'logbase') {
      const base = renderSlot(node.slots?.[0] ?? [], i, 0);
      const arg = renderSlot(node.slots?.[1] ?? [], i, 1);
      out += `\\log_{${base}}\\left(${arg}\\right)`;
    } else if (node.kind === 'integral') {
      const fn = renderSlot(node.slots?.[0] ?? [], i, 0);
      const lo = renderSlot(node.slots?.[1] ?? [], i, 1);
      const hi = renderSlot(node.slots?.[2] ?? [], i, 2);
      out += `\\int_{${lo}}^{${hi}}\\left(${fn}\\right)\\,\\mathrm{d}x`;
    } else if (node.kind === 'deriv') {
      const fn = renderSlot(node.slots?.[0] ?? [], i, 0);
      const pt = renderSlot(node.slots?.[1] ?? [], i, 1);
      out += `\\left.\\dfrac{\\mathrm{d}}{\\mathrm{d}x}\\left(${fn}\\right)\\right|_{x=${pt}}`;
    } else if (node.kind === 'sigma') {
      const fn = renderSlot(node.slots?.[0] ?? [], i, 0);
      const lo = renderSlot(node.slots?.[1] ?? [], i, 1);
      const hi = renderSlot(node.slots?.[2] ?? [], i, 2);
      out += `\\sum_{x=${lo}}^{${hi}}\\left(${fn}\\right)`;
    }
  }
  return out;
}

export function nodesToEvalString(nodes: MathNode[]): string {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === 'char') {
      const v = node.value ?? '';
      if (v === '×') out += '*';
      else if (v === '÷') out += '/';
      else if (v === 'π') out += 'pi';
      else if (v === 'nCr') out += ' nCr ';
      else if (v === 'nPr') out += ' nPr ';
      else if (v === '∠') out += ' polar ';
      else if (v === '°') out += '*pi/180';
      else out += v;
    } else if (node.kind === 'frac') {
      const num = nodesToEvalString(node.slots?.[0] ?? []);
      const den = nodesToEvalString(node.slots?.[1] ?? []);
      out += `((${num})/(${den}))`;
    } else if (node.kind === 'sqrt') {
      out += `sqrt(${nodesToEvalString(node.slots?.[0] ?? [])})`;
    } else if (node.kind === 'cbrt') {
      out += `cbrt(${nodesToEvalString(node.slots?.[0] ?? [])})`;
    } else if (node.kind === 'nthroot') {
      const n = nodesToEvalString(node.slots?.[0] ?? []);
      const a = nodesToEvalString(node.slots?.[1] ?? []);
      out += `nthroot(${n},${a})`;
    } else if (node.kind === 'pow') {
      out += `^(${nodesToEvalString(node.slots?.[0] ?? [])})`;
    } else if (node.kind === 'abs') {
      out += `abs(${nodesToEvalString(node.slots?.[0] ?? [])})`;
    } else if (node.kind === 'logbase') {
      const b = nodesToEvalString(node.slots?.[0] ?? []);
      const a = nodesToEvalString(node.slots?.[1] ?? []);
      out += `logbase(${b},${a})`;
    } else if (node.kind === 'integral') {
      const fn = nodesToEvalString(node.slots?.[0] ?? []);
      const lo = nodesToEvalString(node.slots?.[1] ?? []);
      const hi = nodesToEvalString(node.slots?.[2] ?? []);
      out += `integral(${fn},${lo},${hi})`;
    } else if (node.kind === 'deriv') {
      const fn = nodesToEvalString(node.slots?.[0] ?? []);
      const pt = nodesToEvalString(node.slots?.[1] ?? []);
      out += `deriv(${fn},${pt})`;
    } else if (node.kind === 'sigma') {
      const fn = nodesToEvalString(node.slots?.[0] ?? []);
      const lo = nodesToEvalString(node.slots?.[1] ?? []);
      const hi = nodesToEvalString(node.slots?.[2] ?? []);
      out += `sigma(${fn},${lo},${hi})`;
    }
  }
  return out;
}

/**
 * Detect which memory variables (X, Y, A..F) are used in an expression for CALC mode.
 */
export function detectVariablesInNodes(nodes: MathNode[]): MemoryVarName[] {
  const found = new Set<MemoryVarName>();
  const validVars = new Set<string>(['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F', 'M']);
  const walk = (list: MathNode[], skipX = false) => {
    for (const n of list) {
      if (n.kind === 'char' && n.value && validVars.has(n.value)) {
        if (!(skipX && n.value === 'X')) {
          found.add(n.value as MemoryVarName);
        }
      }
      if (n.slots) {
        if (n.kind === 'integral' || n.kind === 'deriv' || n.kind === 'sigma') {
          // Bound variable X inside slot 0 is local
          walk(n.slots[0], true);
          for (let s = 1; s < n.slots.length; s++) walk(n.slots[s], skipX);
        } else {
          for (const s of n.slots) walk(s, skipX);
        }
      }
    }
  };
  walk(nodes, false);
  const order: MemoryVarName[] = ['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F', 'M'];
  return order.filter((v) => found.has(v));
}

// ============================================================================
// 3. COMPLEX NUMBER ARITHMETIC
// ============================================================================

export interface Complex {
  re: number;
  im: number;
}

export const C = {
  fromReal: (re: number): Complex => ({ re, im: 0 }),
  isReal: (z: Complex, eps = 1e-10): boolean => Math.abs(z.im) < eps,
  add: (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a: Complex, b: Complex): Complex => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  }),
  div: (a: Complex, b: Complex): Complex => {
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) throw new Error('Math ERROR: Chia cho 0');
    return {
      re: (a.re * b.re + a.im * b.im) / d,
      im: (a.im * b.re - a.re * b.im) / d,
    };
  },
  abs: (z: Complex): number => Math.hypot(z.re, z.im),
  argRad: (z: Complex): number => Math.atan2(z.im, z.re),
  conj: (z: Complex): Complex => ({ re: z.re, im: -z.im }),
  pow: (a: Complex, b: Complex): Complex => {
    if (C.isReal(a) && C.isReal(b)) {
      if (a.re < 0 && !Number.isInteger(b.re)) {
        // Complex principal power
        const r = Math.abs(a.re);
        const theta = Math.PI;
        const mag = Math.pow(r, b.re);
        return { re: mag * Math.cos(b.re * theta), im: mag * Math.sin(b.re * theta) };
      }
      const val = Math.pow(a.re, b.re);
      if (Number.isNaN(val)) throw new Error('Math ERROR');
      return { re: val, im: 0 };
    }
    if (C.abs(a) === 0) {
      if (C.abs(b) === 0) return { re: 1, im: 0 };
      return { re: 0, im: 0 };
    }
    const r = C.abs(a);
    const theta = C.argRad(a);
    const lnR = Math.log(r);
    // exp((b.re + i b.im) * (lnR + i theta))
    const expRe = b.re * lnR - b.im * theta;
    const expIm = b.re * theta + b.im * lnR;
    const mag = Math.exp(expRe);
    return { re: mag * Math.cos(expIm), im: mag * Math.sin(expIm) };
  },
  sqrt: (z: Complex): Complex => {
    if (C.isReal(z) && z.re >= 0) return { re: Math.sqrt(z.re), im: 0 };
    const r = C.abs(z);
    const re = Math.sqrt((r + z.re) / 2);
    const im = Math.sqrt(Math.max(0, (r - z.re) / 2)) * (z.im < 0 ? -1 : 1);
    return { re, im };
  },
};

// ============================================================================
// 4. SAFE RECURSIVE-DESCENT MATHEMATICAL PARSER & EVALUATOR
// ============================================================================

export interface EvalContext {
  angleUnit: AngleUnit;
  vars: MemoryVars;
  ans: Complex;
  allowComplex: boolean;
}

type TokenType = 'NUM' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';
interface Token {
  type: TokenType;
  val: string;
}

const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'ln', 'log', 'sqrt', 'cbrt', 'nthroot', 'abs', 'logbase',
  'integral', 'deriv', 'sigma', 'arg', 'Conjg',
]);

const KNOWN_WORDS = new Set([
  ...KNOWN_FUNCTIONS,
  'pi', 'Ans', 'nCr', 'nPr', 'polar',
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      let hasDot = false;
      while (i < s.length && (/[0-9]/.test(s[i]) || (s[i] === '.' && !hasDot))) {
        if (s[i] === '.') hasDot = true;
        num += s[i++];
      }
      // Scientific notation e.g. 1.5E-3
      if (i < s.length && (s[i] === 'E' || s[i] === 'e') && /[0-9+-]/.test(s[i + 1] ?? '')) {
        const nextIsSign = s[i + 1] === '+' || s[i + 1] === '-';
        const hasDigitAfter = nextIsSign ? /[0-9]/.test(s[i + 2] ?? '') : /[0-9]/.test(s[i + 1] ?? '');
        if (hasDigitAfter && s[i] === 'E') {
          num += s[i++];
          if (s[i] === '+' || s[i] === '-') num += s[i++];
          while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
        }
      }
      tokens.push({ type: 'NUM', val: num });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      // Match longest known keyword/function first so implicit multiplication like "2x" or "XY" or "eX" works
      let matched = '';
      for (const word of KNOWN_WORDS) {
        if (s.startsWith(word, i)) {
          // Ensure "sin" doesn't match prefix of "sinh"
          if (word.length > matched.length) {
            matched = word;
          }
        }
      }
      if (matched) {
        if (matched === 'nCr' || matched === 'nPr' || matched === 'polar') {
          tokens.push({ type: 'OP', val: matched });
        } else {
          tokens.push({ type: 'IDENT', val: matched });
        }
        i += matched.length;
        continue;
      }
      // Single-letter variable or constant (x, X, Y, A..F, M, e, i)
      tokens.push({ type: 'IDENT', val: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', val: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', val: ')' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', val: ',' });
      i++;
      continue;
    }
    if ('+-*/^!%'.includes(ch)) {
      tokens.push({ type: 'OP', val: ch });
      i++;
      continue;
    }
    throw new Error(`Syntax ERROR: Ký tự không hợp lệ "${ch}"`);
  }

  tokens.push({ type: 'EOF', val: '' });
  return tokens;
}

// Split raw argument string at top-level commas (used for integral/deriv/sigma lazy expression args)
function splitTopLevelArgs(expr: string, startIdx: number): { args: string[]; endIdx: number } {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  let i = startIdx;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      if (depth === 0) {
        args.push(current.trim());
        return { args, endIdx: i + 1 };
      }
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  throw new Error('Syntax ERROR: Thiếu dấu đóng ngoặc ")"');
}

function factorial(n: number): number {
  if (n < 0 || !Number.isFinite(n)) throw new Error('Math ERROR: Giai thừa số âm');
  if (Math.abs(n - Math.round(n)) < 1e-10) {
    const k = Math.round(n);
    if (k > 170) throw new Error('Math ERROR: Tràn số giai thừa');
    let res = 1;
    for (let i = 2; i <= k; i++) res *= i;
    return res;
  }
  // Lanczos approximation for Gamma(n + 1)
  const z = n + 1;
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z - 1 + i);
  const t = z - 1 + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z - 0.5) * Math.exp(-t) * x;
}

function nCr(n: number, r: number): number {
  const ni = Math.round(n);
  const ri = Math.round(r);
  if (Math.abs(n - ni) > 1e-9 || Math.abs(r - ri) > 1e-9 || ni < 0 || ri < 0 || ri > ni) {
    throw new Error('Math ERROR: Tham số nCr không hợp lệ');
  }
  const k = Math.min(ri, ni - ri);
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (ni - k + i)) / i;
  }
  return Math.round(res);
}

function nPr(n: number, r: number): number {
  const ni = Math.round(n);
  const ri = Math.round(r);
  if (Math.abs(n - ni) > 1e-9 || Math.abs(r - ri) > 1e-9 || ni < 0 || ri < 0 || ri > ni) {
    throw new Error('Math ERROR: Tham số nPr không hợp lệ');
  }
  let res = 1;
  for (let i = 0; i < ri; i++) res *= ni - i;
  return res;
}

// Numerical definite integral using composite Gauss-Legendre 8-point quadrature
function computeDefiniteIntegral(
  fnExpr: string,
  a: number,
  b: number,
  ctx: EvalContext
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Math ERROR: Cận tích phân không hợp lệ');
  if (Math.abs(b - a) < 1e-15) return 0;

  const evalAt = (x: number): number => {
    const val = evaluateString(fnExpr, {
      ...ctx,
      vars: { ...ctx.vars, X: x },
      allowComplex: false,
    });
    if (!Number.isFinite(val.re)) throw new Error('Math ERROR: Tích phân phân kỳ');
    return val.re;
  };

  // 8-point Gauss-Legendre nodes & weights on [-1, 1]
  const nodes = [
    -0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498,
    0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
  ];
  const weights = [
    0.10122853629037626, 0.22238103445337447, 0.3137066458778873, 0.362683783378362,
    0.362683783378362, 0.3137066458778873, 0.22238103445337447, 0.10122853629037626,
  ];

  const panels = 24;
  const h = (b - a) / panels;
  let total = 0;
  for (let p = 0; p < panels; p++) {
    const x0 = a + p * h;
    const mid = x0 + h * 0.5;
    const half = h * 0.5;
    let sub = 0;
    for (let k = 0; k < 8; k++) {
      sub += weights[k] * evalAt(mid + half * nodes[k]);
    }
    total += sub * half;
  }
  return total;
}

// High-accuracy Richardson-extrapolated central difference derivative
function computeDerivative(fnExpr: string, x0: number, ctx: EvalContext): number {
  if (!Number.isFinite(x0)) throw new Error('Math ERROR: Điểm đạo hàm không hợp lệ');
  const f = (x: number): number =>
    evaluateString(fnExpr, { ...ctx, vars: { ...ctx.vars, X: x }, allowComplex: false }).re;
  const h = Math.max(1e-5, Math.abs(x0) * 1e-5);
  const d1 = (f(x0 + h) - f(x0 - h)) / (2 * h);
  const h2 = h / 2;
  const d2 = (f(x0 + h2) - f(x0 - h2)) / (2 * h2);
  // Richardson extrapolation: (4*d2 - d1) / 3
  const res = (4 * d2 - d1) / 3;
  if (!Number.isFinite(res)) throw new Error('Math ERROR: Không tồn tại đạo hàm');
  return res;
}

function computeSigma(fnExpr: string, start: number, end: number, ctx: EvalContext): number {
  const s = Math.round(start);
  const e = Math.round(end);
  if (e < s) return 0;
  if (e - s > 5000) throw new Error('Math ERROR: Quá giới hạn 5000 số hạng tổng Σ');
  let total = 0;
  for (let k = s; k <= e; k++) {
    const val = evaluateString(fnExpr, {
      ...ctx,
      vars: { ...ctx.vars, X: k },
      allowComplex: false,
    });
    if (!Number.isFinite(val.re)) throw new Error('Math ERROR');
    total += val.re;
  }
  return total;
}

/**
 * Pre-resolve lazy calculus operators integral(...), deriv(...), sigma(...)
 * by replacing them with evaluated numeric literals before tokenizing.
 */
function preprocessCalculusCalls(expr: string, ctx: EvalContext): string {
  const keywords = ['integral(', 'deriv(', 'sigma('];
  let result = expr;
  let guard = 0;

  while (guard++ < 30) {
    let foundIdx = -1;
    let foundKw = '';
    for (const kw of keywords) {
      const idx = result.indexOf(kw);
      if (idx !== -1 && (foundIdx === -1 || idx < foundIdx)) {
        foundIdx = idx;
        foundKw = kw;
      }
    }
    if (foundIdx === -1) break;

    const { args, endIdx } = splitTopLevelArgs(result, foundIdx + foundKw.length);
    let numericVal = 0;
    if (foundKw === 'integral(') {
      if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
        throw new Error('Syntax ERROR: Thiếu biểu thức hoặc cận tích phân');
      }
      const lo = evaluateString(args[1], { ...ctx, allowComplex: false }).re;
      const hi = evaluateString(args[2], { ...ctx, allowComplex: false }).re;
      numericVal = computeDefiniteIntegral(args[0], lo, hi, ctx);
    } else if (foundKw === 'deriv(') {
      if (args.length !== 2 || !args[0] || !args[1]) {
        throw new Error('Syntax ERROR: Thiếu hàm số hoặc giá trị x');
      }
      const pt = evaluateString(args[1], { ...ctx, allowComplex: false }).re;
      numericVal = computeDerivative(args[0], pt, ctx);
    } else if (foundKw === 'sigma(') {
      if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
        throw new Error('Syntax ERROR: Thiếu biểu thức hoặc cận tổng Σ');
      }
      const lo = evaluateString(args[1], { ...ctx, allowComplex: false }).re;
      const hi = evaluateString(args[2], { ...ctx, allowComplex: false }).re;
      numericVal = computeSigma(args[0], lo, hi, ctx);
    }

    const replacement = `(${numericVal < 0 ? `0-${Math.abs(numericVal)}` : numericVal})`;
    result = result.slice(0, foundIdx) + replacement + result.slice(endIdx);
  }
  return result;
}

export function evaluateString(rawExpr: string, ctx: EvalContext): Complex {
  const trimmed = rawExpr.trim();
  if (!trimmed) return { re: 0, im: 0 };

  const prepped = preprocessCalculusCalls(trimmed, ctx);
  const tokens = tokenize(prepped);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const toRad = (val: number) => (ctx.angleUnit === 'DEG' ? (val * Math.PI) / 180 : val);
  const fromRad = (val: number) => (ctx.angleUnit === 'DEG' ? (val * 180) / Math.PI : val);

  const requireReal = (z: Complex, msg = 'Math ERROR'): number => {
    if (!C.isReal(z)) throw new Error(msg);
    return z.re;
  };

  function parseExpression(): Complex {
    let left = parseTerm();
    while (peek().type === 'OP' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const right = parseTerm();
      left = op === '+' ? C.add(left, right) : C.sub(left, right);
    }
    return left;
  }

  function isImplicitMulNext(): boolean {
    const t = peek();
    return t.type === 'LPAREN' || t.type === 'IDENT' || t.type === 'NUM';
  }

  function parseTerm(): Complex {
    let left = parseCombinatorics();
    while (true) {
      const t = peek();
      if (t.type === 'OP' && (t.val === '*' || t.val === '/')) {
        consume();
        const right = parseCombinatorics();
        left = t.val === '*' ? C.mul(left, right) : C.div(left, right);
      } else if (isImplicitMulNext()) {
        const right = parseCombinatorics();
        left = C.mul(left, right);
      } else {
        break;
      }
    }
    return left;
  }

  function parseCombinatorics(): Complex {
    let left = parseUnary();
    while (
      peek().type === 'OP' &&
      (peek().val === 'nCr' || peek().val === 'nPr' || peek().val === 'polar')
    ) {
      const op = consume().val;
      const right = parseUnary();
      if (op === 'nCr') {
        left = C.fromReal(nCr(requireReal(left), requireReal(right)));
      } else if (op === 'nPr') {
        left = C.fromReal(nPr(requireReal(left), requireReal(right)));
      } else if (op === 'polar') {
        const r = requireReal(left);
        const ang = toRad(requireReal(right));
        left = { re: r * Math.cos(ang), im: r * Math.sin(ang) };
      }
    }
    return left;
  }

  function parseUnary(): Complex {
    if (peek().type === 'OP' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const val = parseUnary();
      return op === '-' ? { re: -val.re, im: -val.im } : val;
    }
    return parsePower();
  }

  function parsePower(): Complex {
    let base = parsePostfix();
    if (peek().type === 'OP' && peek().val === '^') {
      consume();
      const exp = parseUnary();
      const res = C.pow(base, exp);
      if (!ctx.allowComplex && !C.isReal(res)) {
        throw new Error('Math ERROR: Lũy thừa số âm');
      }
      base = res;
    }
    return base;
  }

  function parsePostfix(): Complex {
    let val = parsePrimary();
    while (peek().type === 'OP' && (peek().val === '!' || peek().val === '%')) {
      const op = consume().val;
      if (op === '!') {
        val = C.fromReal(factorial(requireReal(val)));
      } else if (op === '%') {
        val = { re: val.re / 100, im: val.im / 100 };
      }
    }
    return val;
  }

  function parseArgList(): Complex[] {
    if (peek().type !== 'LPAREN') throw new Error('Syntax ERROR: Thiếu "("');
    consume();
    const args: Complex[] = [];
    if (peek().type !== 'RPAREN') {
      args.push(parseExpression());
      while (peek().type === 'COMMA') {
        consume();
        args.push(parseExpression());
      }
    }
    // Allow Casio-style omitted trailing closing paren at EOF
    if (peek().type === 'RPAREN') {
      consume();
    } else if (peek().type !== 'EOF') {
      throw new Error('Syntax ERROR: Thiếu ")"');
    }
    return args;
  }

  function parsePrimary(): Complex {
    const t = peek();

    if (t.type === 'NUM') {
      consume();
      const n = Number(t.val);
      if (!Number.isFinite(n)) throw new Error('Syntax ERROR');
      return C.fromReal(n);
    }

    if (t.type === 'LPAREN') {
      consume();
      const val = parseExpression();
      if (peek().type === 'RPAREN') {
        consume();
      } else if (peek().type !== 'EOF') {
        throw new Error('Syntax ERROR: Thiếu ")"');
      }
      return val;
    }

    if (t.type === 'IDENT') {
      consume();
      const name = t.val;

      if (name === 'pi') return C.fromReal(Math.PI);
      if (name === 'e') return C.fromReal(Math.E);
      if (name === 'Ans') return ctx.ans;
      if (name === 'i') {
        if (!ctx.allowComplex) throw new Error('Math ERROR: Chuyển sang MODE 2 (CMPLX) để dùng số ảo i');
        return { re: 0, im: 1 };
      }
      if (name === 'x' || name === 'X') return C.fromReal(ctx.vars.X);
      if (name === 'y' || name === 'Y') return C.fromReal(ctx.vars.Y);
      if (name in ctx.vars) {
        return C.fromReal(ctx.vars[name as MemoryVarName]);
      }

      if (KNOWN_FUNCTIONS.has(name)) {
        const args = parseArgList();
        if (name === 'nthroot') {
          if (args.length !== 2) throw new Error('Syntax ERROR');
          const n = requireReal(args[0]);
          const a = args[1];
          if (n === 0) throw new Error('Math ERROR');
          if (C.isReal(a) && a.re < 0 && Math.abs(n - Math.round(n)) < 1e-9 && Math.abs(Math.round(n)) % 2 === 1) {
            return C.fromReal(-Math.pow(-a.re, 1 / n));
          }
          const res = C.pow(a, C.fromReal(1 / n));
          if (!ctx.allowComplex && !C.isReal(res)) throw new Error('Math ERROR: Căn chẵn số âm');
          return res;
        }
        if (name === 'logbase') {
          if (args.length !== 2) throw new Error('Syntax ERROR');
          const b = requireReal(args[0]);
          const a = requireReal(args[1]);
          if (b <= 0 || b === 1 || a <= 0) throw new Error('Math ERROR: Điều kiện logarit');
          return C.fromReal(Math.log(a) / Math.log(b));
        }

        if (args.length !== 1) throw new Error(`Syntax ERROR: Hàm ${name} cần 1 đối số`);
        const a = args[0];

        if (name === 'abs') return C.fromReal(C.abs(a));
        if (name === 'arg') return C.fromReal(fromRad(C.argRad(a)));
        if (name === 'Conjg') return C.conj(a);
        if (name === 'sqrt') {
          if (!ctx.allowComplex && (!C.isReal(a) || a.re < 0)) {
            throw new Error('Math ERROR: Căn bậc hai số âm');
          }
          return C.sqrt(a);
        }
        if (name === 'cbrt') {
          const r = requireReal(a);
          return C.fromReal(Math.cbrt(r));
        }

        const r = requireReal(a);
        switch (name) {
          case 'sin':
            return C.fromReal(Math.sin(toRad(r)));
          case 'cos':
            return C.fromReal(Math.cos(toRad(r)));
          case 'tan': {
            const rad = toRad(r);
            if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error('Math ERROR: tan không xác định');
            return C.fromReal(Math.tan(rad));
          }
          case 'asin':
            if (r < -1 || r > 1) throw new Error('Math ERROR');
            return C.fromReal(fromRad(Math.asin(r)));
          case 'acos':
            if (r < -1 || r > 1) throw new Error('Math ERROR');
            return C.fromReal(fromRad(Math.acos(r)));
          case 'atan':
            return C.fromReal(fromRad(Math.atan(r)));
          case 'sinh':
            return C.fromReal(Math.sinh(r));
          case 'cosh':
            return C.fromReal(Math.cosh(r));
          case 'tanh':
            return C.fromReal(Math.tanh(r));
          case 'ln':
            if (r <= 0) throw new Error('Math ERROR: ln(x) yêu cầu x > 0');
            return C.fromReal(Math.log(r));
          case 'log':
            if (r <= 0) throw new Error('Math ERROR: log(x) yêu cầu x > 0');
            return C.fromReal(Math.log10(r));
          default:
            throw new Error(`Syntax ERROR: Không rõ hàm ${name}`);
        }
      }
      throw new Error(`Syntax ERROR: Biến "${name}" không hợp lệ`);
    }

    throw new Error('Syntax ERROR: Biểu thức chưa đầy đủ');
  }

  const value = parseExpression();
  if (peek().type !== 'EOF') {
    throw new Error('Syntax ERROR');
  }
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
    throw new Error('Math ERROR');
  }
  return value;
}

// ============================================================================
// 5. EXACT SYMBOLIC & DECIMAL FORMATTER (S <=> D)
// ============================================================================

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function approximateFraction(x: number, maxDen = 10000, tol = 1e-10): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  if (Math.abs(absX - Math.round(absX)) < tol) {
    return [sign * Math.round(absX), 1];
  }
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = absX;
  for (let iter = 0; iter < 32; iter++) {
    const a = Math.floor(b);
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    if (k > maxDen) break;
    h2 = h1; h1 = h;
    k2 = k1; k1 = k;
    if (Math.abs(absX - h1 / k1) < tol) {
      return [sign * h1, k1];
    }
    const frac = b - a;
    if (frac < 1e-14) break;
    b = 1 / frac;
  }
  if (k1 <= maxDen && Math.abs(absX - h1 / k1) < tol) {
    return [sign * h1, k1];
  }
  return null;
}

function simplifySqrtInt(n: number): { coef: number; rad: number } {
  let coef = 1;
  let rad = Math.round(n);
  for (let d = 2; d * d <= rad; d++) {
    while (rad % (d * d) === 0) {
      coef *= d;
      rad /= d * d;
    }
  }
  return { coef, rad };
}

export function formatDecimalLatex(val: number, maxDigits = 10): string {
  if (!Number.isFinite(val)) return '\\text{Math ERROR}';
  if (Math.abs(val) < 1e-12) return '0';
  const abs = Math.abs(val);
  if (abs >= 1e10 || abs < 1e-6) {
    const expStr = val.toExponential(6);
    const [mant, exp] = expStr.split('e');
    const cleanMant = mant.replace(/\.?0+$/, '');
    const expInt = parseInt(exp, 10);
    return `${cleanMant} \\times 10^{${expInt}}`;
  }
  const rounded = Number(val.toPrecision(maxDigits));
  return String(rounded);
}

export function formatExactRealLatex(val: number): { exactLatex: string; decimalLatex: string; hasDistinctExact: boolean } {
  const decimalLatex = formatDecimalLatex(val);
  if (!Number.isFinite(val)) return { exactLatex: decimalLatex, decimalLatex, hasDistinctExact: false };
  if (Math.abs(val) < 1e-12) return { exactLatex: '0', decimalLatex: '0', hasDistinctExact: false };

  // 1. Exact integer or rational p/q
  const frac = approximateFraction(val, 10000, 1e-10);
  if (frac) {
    const [p, q] = frac;
    if (q === 1) {
      return { exactLatex: String(p), decimalLatex: String(p), hasDistinctExact: false };
    }
    const sign = p < 0 ? '-' : '';
    const exactLatex = `${sign}\\dfrac{${Math.abs(p)}}{${q}}`;
    return { exactLatex, decimalLatex, hasDistinctExact: true };
  }

  // 2. Exact multiple of pi: (p/q) * pi
  const piFrac = approximateFraction(val / Math.PI, 120, 1e-10);
  if (piFrac && piFrac[0] !== 0) {
    const [p, q] = piFrac;
    const sign = p < 0 ? '-' : '';
    const absP = Math.abs(p);
    const num = absP === 1 ? '\\pi' : `${absP}\\pi`;
    const exactLatex = q === 1 ? `${sign}${num}` : `${sign}\\dfrac{${num}}{${q}}`;
    return { exactLatex, decimalLatex, hasDistinctExact: true };
  }

  // 3. Exact pure radical: +/- sqrt(p/q) = +/- (a*sqrt(k))/b
  const sqFrac = approximateFraction(val * val, 144, 1e-9);
  if (sqFrac && sqFrac[0] > 0 && sqFrac[0] <= 2500) {
    const [p, q] = sqFrac;
    // sqrt(p/q) = sqrt(p*q)/q
    const { coef, rad } = simplifySqrtInt(p * q);
    if (rad > 1) {
      const g = gcd(coef, q);
      const a = coef / g;
      const b = q / g;
      const sign = val < 0 ? '-' : '';
      const num = a === 1 ? `\\sqrt{${rad}}` : `${a}\\sqrt{${rad}}`;
      const exactLatex = b === 1 ? `${sign}${num}` : `${sign}\\dfrac{${num}}{${b}}`;
      return { exactLatex, decimalLatex, hasDistinctExact: true };
    }
  }

  // 4. Quadratic surd: (a + b*sqrt(c)) / d
  const rads = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21];
  for (const d of [1, 2, 3, 4, 5, 6, 8, 9, 10, 12]) {
    const scaled = val * d;
    for (const c of rads) {
      const sc = Math.sqrt(c);
      for (let b = -16; b <= 16; b++) {
        if (b === 0) continue;
        const aFloat = scaled - b * sc;
        const a = Math.round(aFloat);
        if (a !== 0 && Math.abs(a) <= 24 && Math.abs(aFloat - a) < 1e-8) {
          const g = gcd(gcd(Math.abs(a), Math.abs(b)), d);
          const aa = a / g;
          const bb = b / g;
          const dd = d / g;
          const bAbs = Math.abs(bb);
          const bPart = bAbs === 1 ? `\\sqrt{${c}}` : `${bAbs}\\sqrt{${c}}`;
          const bSign = bb > 0 ? '+' : '-';
          const num = `${aa} ${bSign} ${bPart}`;
          const exactLatex = dd === 1 ? num : `\\dfrac{${num}}{${dd}}`;
          return { exactLatex, decimalLatex, hasDistinctExact: true };
        }
      }
    }
  }

  // 5. Special 15°/75° trig values: (±sqrt(6) ± sqrt(2))/4
  const specialCombos: Array<{ v: number; tex: string }> = [
    { v: (Math.sqrt(6) + Math.sqrt(2)) / 4, tex: '\\dfrac{\\sqrt{6} + \\sqrt{2}}{4}' },
    { v: (Math.sqrt(6) - Math.sqrt(2)) / 4, tex: '\\dfrac{\\sqrt{6} - \\sqrt{2}}{4}' },
    { v: (-Math.sqrt(6) + Math.sqrt(2)) / 4, tex: '\\dfrac{-\\sqrt{6} + \\sqrt{2}}{4}' },
    { v: (-Math.sqrt(6) - Math.sqrt(2)) / 4, tex: '-\\dfrac{\\sqrt{6} + \\sqrt{2}}{4}' },
  ];
  for (const sp of specialCombos) {
    if (Math.abs(val - sp.v) < 1e-9) {
      return { exactLatex: sp.tex, decimalLatex, hasDistinctExact: true };
    }
  }

  return { exactLatex: decimalLatex, decimalLatex, hasDistinctExact: false };
}

export function formatComplexResult(
  z: Complex,
  angleUnit: AngleUnit,
  polarMode = false
): { exactLatex: string; decimalLatex: string; polarLatex: string; hasDistinctExact: boolean } {
  const r = C.abs(z);
  const thetaRad = C.argRad(z);
  const thetaVal = angleUnit === 'DEG' ? (thetaRad * 180) / Math.PI : thetaRad;
  const rFmt = formatExactRealLatex(r);
  const tFmt = formatExactRealLatex(thetaVal);
  const unitSym = angleUnit === 'DEG' ? '^\\circ' : '';
  const polarLatex = `${rFmt.exactLatex}\\angle ${tFmt.exactLatex}${unitSym}`;

  if (C.isReal(z)) {
    const f = formatExactRealLatex(z.re);
    return {
      exactLatex: polarMode ? polarLatex : f.exactLatex,
      decimalLatex: f.decimalLatex,
      polarLatex,
      hasDistinctExact: f.hasDistinctExact || polarMode,
    };
  }

  const reZero = Math.abs(z.re) < 1e-10;
  const reFmt = formatExactRealLatex(z.re);
  const imAbsFmt = formatExactRealLatex(Math.abs(z.im));
  const imSign = z.im >= 0 ? '+' : '-';

  const buildBinomial = (useExact: boolean) => {
    const reStr = useExact ? reFmt.exactLatex : reFmt.decimalLatex;
    const imStr = useExact ? imAbsFmt.exactLatex : imAbsFmt.decimalLatex;
    const imTerm = imStr === '1' ? 'i' : `${imStr}i`;
    if (reZero) return z.im < 0 ? `-${imTerm}` : imTerm;
    return `${reStr} ${imSign} ${imTerm}`;
  };

  const exactBin = buildBinomial(true);
  const decBin = buildBinomial(false);

  return {
    exactLatex: polarMode ? polarLatex : exactBin,
    decimalLatex: decBin,
    polarLatex,
    hasDistinctExact: exactBin !== decBin || polarMode,
  };
}

// ============================================================================
// 6. SOLVE (SHIFT + CALC) NUMERICAL ROOT FINDER
// ============================================================================

export function solveEquationNumerical(
  rawExpr: string,
  initialGuess: number,
  ctx: EvalContext
): { x: number; residual: number } {
  // Support "LHS = RHS" as "LHS - (RHS) = 0"
  const eqIdx = rawExpr.indexOf('=');
  const fnExpr =
    eqIdx !== -1
      ? `(${rawExpr.slice(0, eqIdx)}) - (${rawExpr.slice(eqIdx + 1)})`
      : rawExpr;

  const f = (x: number): number => {
    const val = evaluateString(fnExpr, {
      ...ctx,
      vars: { ...ctx.vars, X: x },
      allowComplex: false,
    });
    return val.re;
  };

  const tryNewton = (start: number): { x: number; residual: number } | null => {
    let x = start;
    for (let iter = 0; iter < 80; iter++) {
      let fx: number;
      try {
        fx = f(x);
      } catch {
        return null;
      }
      if (!Number.isFinite(fx)) return null;
      if (Math.abs(fx) < 1e-11) return { x, residual: fx };
      const h = Math.max(1e-6, Math.abs(x) * 1e-6);
      let dfx: number;
      try {
        dfx = (f(x + h) - f(x - h)) / (2 * h);
      } catch {
        return null;
      }
      if (!Number.isFinite(dfx) || Math.abs(dfx) < 1e-13) {
        // Nudge slightly
        x += 0.137;
        continue;
      }
      const step = fx / dfx;
      const clamped = Math.max(-50, Math.min(50, step));
      x -= clamped;
      if (Math.abs(step) < 1e-11) {
        const res = f(x);
        if (Math.abs(res) < 1e-7) return { x, residual: res };
      }
    }
    try {
      const res = f(x);
      if (Number.isFinite(res) && Math.abs(res) < 1e-6) return { x, residual: res };
    } catch {
      // ignore
    }
    return null;
  };

  const guesses = [initialGuess, initialGuess + 0.5, initialGuess - 0.5, 0, 1, -1, 2, -2, 5, -5, 10];
  for (const g of guesses) {
    const found = tryNewton(g);
    if (found) return found;
  }

  // Fallback bisection scan around initialGuess
  const scanStart = initialGuess - 20;
  const scanEnd = initialGuess + 20;
  const steps = 400;
  const dx = (scanEnd - scanStart) / steps;
  let prevX = scanStart;
  let prevY = NaN;
  try {
    prevY = f(prevX);
  } catch {
    prevY = NaN;
  }
  for (let i = 1; i <= steps; i++) {
    const curX = scanStart + i * dx;
    let curY = NaN;
    try {
      curY = f(curX);
    } catch {
      curY = NaN;
    }
    if (Number.isFinite(prevY) && Number.isFinite(curY) && prevY * curY <= 0) {
      let lo = prevX;
      let hi = curX;
      let fLo = prevY;
      for (let b = 0; b < 60; b++) {
        const mid = (lo + hi) / 2;
        const fMid = f(mid);
        if (Math.abs(fMid) < 1e-11) return { x: mid, residual: fMid };
        if (fLo * fMid <= 0) {
          hi = mid;
        } else {
          lo = mid;
          fLo = fMid;
        }
      }
      const mid = (lo + hi) / 2;
      return { x: mid, residual: f(mid) };
    }
    prevX = curX;
    prevY = curY;
  }

  throw new Error('Can\'t Solve: Không tìm thấy nghiệm gần giá trị khởi tạo');
}

// ============================================================================
// 7. MODE 3: EQUA (LINEAR SYSTEMS 2/3/4 & POLYNOMIAL EQUATIONS DEG 2/3/4)
// ============================================================================

export interface LinearSystemResult {
  status: 'unique' | 'infinite' | 'none';
  values?: number[];
  latexLines: string[];
}

export function solveLinearSystem(matrix: number[][], rhs: number[]): LinearSystemResult {
  const n = rhs.length;
  const aug = matrix.map((row, i) => [...row, rhs[i]]);
  const eps = 1e-10;
  let row = 0;

  for (let col = 0; col < n && row < n; col++) {
    let pivot = row;
    for (let r = row + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (Math.abs(aug[pivot][col]) < eps) continue;

    [aug[row], aug[pivot]] = [aug[pivot], aug[row]];
    const div = aug[row][col];
    for (let c = col; c <= n; c++) aug[row][c] /= div;

    for (let r = 0; r < n; r++) {
      if (r !== row && Math.abs(aug[r][col]) > eps) {
        const factor = aug[r][col];
        for (let c = col; c <= n; c++) aug[r][c] -= factor * aug[row][c];
      }
    }
    row++;
  }

  // Check inconsistent rows
  for (let r = 0; r < n; r++) {
    let allZero = true;
    for (let c = 0; c < n; c++) {
      if (Math.abs(aug[r][c]) > eps) {
        allZero = false;
        break;
      }
    }
    if (allZero && Math.abs(aug[r][n]) > eps) {
      return {
        status: 'none',
        latexLines: ['\\text{Hệ phương trình vô nghiệm } (S = \\emptyset)'],
      };
    }
  }

  if (row < n) {
    return {
      status: 'infinite',
      latexLines: ['\\text{Hệ phương trình có vô số nghiệm}'],
    };
  }

  const varNames = ['x', 'y', 'z', 't'];
  const values = aug.map((r) => (Math.abs(r[n]) < 1e-12 ? 0 : r[n]));
  const latexLines = values.map((v, i) => {
    const fmt = formatExactRealLatex(v);
    return fmt.hasDistinctExact
      ? `${varNames[i]} = ${fmt.exactLatex} \\approx ${fmt.decimalLatex}`
      : `${varNames[i]} = ${fmt.exactLatex}`;
  });

  return { status: 'unique', values, latexLines };
}

export interface PolyRootResult {
  roots: Complex[];
  realRoots: number[];
  latexLines: string[];
  extremaLines: string[];
}

function evalPolyComplex(coeffs: number[], z: Complex): Complex {
  let acc: Complex = { re: 0, im: 0 };
  for (const c of coeffs) {
    acc = C.add(C.mul(acc, z), { re: c, im: 0 });
  }
  return acc;
}

/**
 * Solve polynomial equation c[0]x^n + c[1]x^{n-1} + ... + c[n] = 0 for degree 2, 3, 4.
 * Uses exact quadratic formula for deg 2 and Durand-Kerner + polishing for deg 3 & 4.
 */
export function solvePolynomial(coeffsInput: number[]): PolyRootResult {
  // Trim leading zeros
  const coeffs = [...coeffsInput];
  while (coeffs.length > 1 && Math.abs(coeffs[0]) < 1e-12) {
    coeffs.shift();
  }
  const deg = coeffs.length - 1;
  if (deg <= 0) {
    const isZero = Math.abs(coeffs[0] ?? 0) < 1e-12;
    return {
      roots: [],
      realRoots: [],
      latexLines: [isZero ? '\\text{Nghiệm đúng } \\forall x \\in \\mathbb{R}' : '\\text{Vô nghiệm } (S = \\emptyset)'],
      extremaLines: [],
    };
  }
  if (deg === 1) {
    const x = -coeffs[1] / coeffs[0];
    const fmt = formatExactRealLatex(x);
    return {
      roots: [C.fromReal(x)],
      realRoots: [x],
      latexLines: [`x = ${fmt.exactLatex}`],
      extremaLines: [],
    };
  }

  let roots: Complex[] = [];
  const extremaLines: string[] = [];

  if (deg === 2) {
    const [a, b, c] = coeffs;
    const delta = b * b - 4 * a * c;
    if (delta > 1e-12) {
      const s = Math.sqrt(delta);
      roots = [C.fromReal((-b + s) / (2 * a)), C.fromReal((-b - s) / (2 * a))];
    } else if (Math.abs(delta) <= 1e-12) {
      roots = [C.fromReal(-b / (2 * a)), C.fromReal(-b / (2 * a))];
    } else {
      const s = Math.sqrt(-delta);
      roots = [
        { re: -b / (2 * a), im: s / (2 * a) },
        { re: -b / (2 * a), im: -s / (2 * a) },
      ];
    }
    const xv = -b / (2 * a);
    const yv = a * xv * xv + b * xv + c;
    const extremumName = a > 0 ? '\\text{GTNN (Đỉnh)}' : '\\text{GTLN (Đỉnh)}';
    extremaLines.push(
      `${extremumName}:\\; x = ${formatExactRealLatex(xv).exactLatex},\\; y = ${formatExactRealLatex(yv).exactLatex}`
    );
  } else {
    // Normalize monic polynomial
    const lead = coeffs[0];
    const monic = coeffs.map((c) => c / lead);

    // Cauchy root radius bound
    const maxC = Math.max(...monic.slice(1).map((c) => Math.abs(c)));
    const radius = 1 + maxC;
    // Initial asymmetric roots on circle
    roots = Array.from({ length: deg }, (_, k) => {
      const ang = (2 * Math.PI * k) / deg + 0.37;
      return { re: radius * Math.cos(ang), im: radius * Math.sin(ang) };
    });

    // Durand-Kerner iterations
    for (let iter = 0; iter < 300; iter++) {
      let maxDelta = 0;
      for (let i = 0; i < deg; i++) {
        const pz = evalPolyComplex(monic, roots[i]);
        let denom: Complex = { re: 1, im: 0 };
        for (let j = 0; j < deg; j++) {
          if (i !== j) {
            denom = C.mul(denom, C.sub(roots[i], roots[j]));
          }
        }
        const denomMag = C.abs(denom);
        if (denomMag < 1e-18) continue;
        const delta = C.div(pz, denom);
        roots[i] = C.sub(roots[i], delta);
        maxDelta = Math.max(maxDelta, C.abs(delta));
      }
      if (maxDelta < 1e-12) break;
    }

    // Clean tiny imaginary / real parts
    roots = roots.map((r) => ({
      re: Math.abs(r.re) < 1e-9 ? 0 : r.re,
      im: Math.abs(r.im) < 1e-7 ? 0 : r.im,
    }));

    // Compute local extrema for deg 3 or deg 4 via derivative polynomial
    const derivCoeffs = coeffs.slice(0, -1).map((c, idx) => c * (deg - idx));
    const crit = solvePolynomial(derivCoeffs);
    const uniqueCrit = dedupeNumbers(crit.realRoots);
    uniqueCrit.forEach((xc) => {
      const yc = evalPolyComplex(coeffs, C.fromReal(xc)).re;
      // Second derivative test
      const d2 = derivCoeffs
        .slice(0, -1)
        .reduce((acc, c, idx) => acc + c * (deg - 1 - idx) * Math.pow(xc, deg - 2 - idx), 0);
      if (Math.abs(d2) > 1e-7) {
        const tag = d2 < 0 ? '\\text{CĐ}' : '\\text{CT}';
        extremaLines.push(
          `${tag}:\\; x = ${formatExactRealLatex(xc).exactLatex},\\; y = ${formatExactRealLatex(yc).exactLatex}`
        );
      }
    });
  }

  // Sort: real roots descending first, then complex conjugate pairs
  roots.sort((a, b) => {
    const aReal = Math.abs(a.im) < 1e-7 ? 0 : 1;
    const bReal = Math.abs(b.im) < 1e-7 ? 0 : 1;
    if (aReal !== bReal) return aReal - bReal;
    if (Math.abs(b.re - a.re) > 1e-7) return b.re - a.re;
    return b.im - a.im;
  });

  const realRoots = roots
    .filter((r) => Math.abs(r.im) < 1e-7)
    .map((r) => r.re)
    .sort((a, b) => a - b);

  const latexLines = roots.map((r, i) => {
    const fmt = formatComplexResult(r, 'RAD', false);
    return fmt.hasDistinctExact && Math.abs(r.im) < 1e-7
      ? `x_${i + 1} = ${fmt.exactLatex} \\approx ${fmt.decimalLatex}`
      : `x_${i + 1} = ${fmt.exactLatex}`;
  });

  return { roots, realRoots, latexLines, extremaLines };
}

function dedupeNumbers(nums: number[], tol = 1e-6): number[] {
  const sorted = [...nums].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of sorted) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]) > tol) {
      out.push(x);
    }
  }
  return out;
}

// ============================================================================
// 8. MODE 4: INEQ (POLYNOMIAL INEQUALITIES DEG 2, 3, 4)
// ============================================================================

export type IneqOp = '>' | '<' | '>=' | '<=';

export interface IneqResult {
  latex: string;
  realRoots: number[];
}

export function solvePolynomialInequality(coeffs: number[], op: IneqOp): IneqResult {
  const poly = solvePolynomial(coeffs);
  const evalP = (x: number) => coeffs.reduce((acc, c) => acc * x + c, 0);
  const satisfies = (val: number) => {
    if (op === '>') return val > 1e-10;
    if (op === '<') return val < -1e-10;
    if (op === '>=') return val >= -1e-10;
    return val <= 1e-10;
  };
  const inclusive = op === '>=' || op === '<=';

  const uniqueRoots = dedupeNumbers(poly.realRoots, 1e-5);
  // Build test intervals: (-inf, r0), (r0, r1), ..., (rk, +inf)
  const bounds: Array<number | null> = [null, ...uniqueRoots, null];
  const openIntervals: Array<{ lo: number | null; hi: number | null }> = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    let sample: number;
    if (lo === null && hi === null) sample = 0;
    else if (lo === null && hi !== null) sample = hi - 1;
    else if (lo !== null && hi === null) sample = lo + 1;
    else sample = ((lo as number) + (hi as number)) / 2;

    if (satisfies(evalP(sample))) {
      openIntervals.push({ lo, hi });
    }
  }

  // Merge adjacent intervals if inclusive and touching at a root
  const merged: Array<{ lo: number | null; hi: number | null; loInc: boolean; hiInc: boolean }> = [];
  for (const iv of openIntervals) {
    const item = {
      lo: iv.lo,
      hi: iv.hi,
      loInc: inclusive && iv.lo !== null,
      hiInc: inclusive && iv.hi !== null,
    };
    const prev = merged[merged.length - 1];
    if (prev && inclusive && prev.hi !== null && item.lo !== null && Math.abs(prev.hi - item.lo) < 1e-5) {
      prev.hi = item.hi;
      prev.hiInc = item.hiInc;
    } else {
      merged.push(item);
    }
  }

  // Isolated roots that satisfy >= 0 or <= 0 even when adjacent open intervals don't
  const isolatedPoints: number[] = [];
  if (inclusive) {
    for (const r of uniqueRoots) {
      const covered = merged.some(
        (m) =>
          (m.lo === null || r > m.lo - 1e-5) &&
          (m.hi === null || r < m.hi + 1e-5)
      );
      if (!covered) isolatedPoints.push(r);
    }
  }

  if (merged.length === 0 && isolatedPoints.length === 0) {
    return { latex: 'S = \\emptyset \\;\\text{(Vô nghiệm)}', realRoots: uniqueRoots };
  }

  if (merged.length === 1 && merged[0].lo === null && merged[0].hi === null) {
    return { latex: 'S = \\mathbb{R} \\;\\text{(Mọi } x \\in \\mathbb{R}\\text{)}', realRoots: uniqueRoots };
  }

  const fmtBound = (v: number) => formatExactRealLatex(v).exactLatex;
  const parts: string[] = merged.map((m) => {
    const leftBracket = m.lo === null ? '(' : m.loInc ? '[' : '(';
    const rightBracket = m.hi === null ? ')' : m.hiInc ? ']' : ')';
    const leftVal = m.lo === null ? '-\\infty' : fmtBound(m.lo);
    const rightVal = m.hi === null ? '+\\infty' : fmtBound(m.hi);
    return `${leftBracket}${leftVal};\\, ${rightVal}${rightBracket}`;
  });

  if (isolatedPoints.length > 0) {
    parts.push(`\\{${isolatedPoints.map(fmtBound).join(';\\, ')}\\}`);
  }

  return {
    latex: `x \\in ${parts.join(' \\cup ')}`,
    realRoots: uniqueRoots,
  };
}

// ============================================================================
// 9. MODE 5: TABLE (FUNCTION VALUES f(x), g(x))
// ============================================================================

export interface TableRow {
  x: number;
  fx: number | null;
  gx: number | null;
  isMaxFx?: boolean;
  isMinFx?: boolean;
}

export function generateFunctionTable(
  fxExpr: string,
  gxExpr: string,
  start: number,
  end: number,
  step: number,
  ctx: EvalContext
): TableRow[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step <= 0) {
    throw new Error('Tham số Start / End / Step không hợp lệ (Step phải > 0)');
  }
  const count = Math.floor((end - start) / step) + 1;
  if (count <= 0) throw new Error('Giá trị End phải lớn hơn hoặc bằng Start');
  if (count > 200) throw new Error('Bảng giá trị tối đa 200 dòng — hãy tăng Step');

  const rows: TableRow[] = [];
  let maxFx = -Infinity;
  let minFx = Infinity;

  for (let i = 0; i < count; i++) {
    const x = Number((start + i * step).toPrecision(10));
    let fx: number | null = null;
    let gx: number | null = null;

    if (fxExpr.trim()) {
      try {
        const res = evaluateString(fxExpr, {
          ...ctx,
          vars: { ...ctx.vars, X: x },
          allowComplex: false,
        });
        if (Number.isFinite(res.re)) {
          fx = res.re;
          if (fx > maxFx) maxFx = fx;
          if (fx < minFx) minFx = fx;
        }
      } catch {
        fx = null;
      }
    }

    if (gxExpr.trim()) {
      try {
        const res = evaluateString(gxExpr, {
          ...ctx,
          vars: { ...ctx.vars, X: x },
          allowComplex: false,
        });
        if (Number.isFinite(res.re)) gx = res.re;
      } catch {
        gx = null;
      }
    }

    rows.push({ x, fx, gx });
  }

  if (Number.isFinite(maxFx) && Number.isFinite(minFx)) {
    for (const r of rows) {
      if (r.fx !== null && Math.abs(r.fx - maxFx) < 1e-10) r.isMaxFx = true;
      if (r.fx !== null && Math.abs(r.fx - minFx) < 1e-10) r.isMinFx = true;
    }
  }

  return rows;
}

// ============================================================================
// 10. MODE 6A: VECTOR (Oxyz 3D OPERATIONS)
// ============================================================================

export type Vec3 = [number, number, number];

export interface VectorAnalysis {
  dot: number;
  cross: Vec3;
  sum: Vec3;
  diff: Vec3;
  magA: number;
  magB: number;
  magCross: number;
  angleDeg: number | null;
  angleRad: number | null;
  tripleProduct: number; // [a, b] . c
}

export function analyzeVectors(a: Vec3, b: Vec3, c: Vec3 = [0, 0, 0]): VectorAnalysis {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross: Vec3 = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const sum: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const diff: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const magA = Math.hypot(a[0], a[1], a[2]);
  const magB = Math.hypot(b[0], b[1], b[2]);
  const magCross = Math.hypot(cross[0], cross[1], cross[2]);

  let angleRad: number | null = null;
  let angleDeg: number | null = null;
  if (magA > 1e-12 && magB > 1e-12) {
    const cosT = Math.max(-1, Math.min(1, dot / (magA * magB)));
    angleRad = Math.acos(cosT);
    angleDeg = (angleRad * 180) / Math.PI;
  }

  const tripleProduct = cross[0] * c[0] + cross[1] * c[1] + cross[2] * c[2];

  return { dot, cross, sum, diff, magA, magB, magCross, angleDeg, angleRad, tripleProduct };
}

// ============================================================================
// 11. MODE 6B: STAT (1-VARIABLE STATISTICS)
// ============================================================================

export interface StatItem {
  x: number;
  freq: number;
}

export interface StatSummary {
  n: number;
  sumX: number;
  sumX2: number;
  mean: number;
  popVar: number;     // sigma^2
  popStd: number;     // sigma
  sampleVar: number;  // s^2
  sampleStd: number;  // s
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

function computeMedian(sorted: number[]): number {
  const m = sorted.length;
  if (m === 0) return 0;
  const mid = Math.floor(m / 2);
  return m % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeStatistics(items: StatItem[]): StatSummary {
  const expanded: number[] = [];
  let n = 0;
  let sumX = 0;
  let sumX2 = 0;

  for (const it of items) {
    if (!Number.isFinite(it.x) || !Number.isFinite(it.freq) || it.freq <= 0) continue;
    const f = Math.round(it.freq);
    n += f;
    sumX += it.x * f;
    sumX2 += it.x * it.x * f;
    if (expanded.length < 5000) {
      for (let k = 0; k < f && expanded.length < 5000; k++) expanded.push(it.x);
    }
  }

  if (n === 0) {
    throw new Error('Nhập ít nhất 1 giá trị dữ liệu thống kê');
  }

  const mean = sumX / n;
  const popVar = Math.max(0, sumX2 / n - mean * mean);
  const popStd = Math.sqrt(popVar);
  const sampleVar = n > 1 ? Math.max(0, (sumX2 - (sumX * sumX) / n) / (n - 1)) : 0;
  const sampleStd = Math.sqrt(sampleVar);

  expanded.sort((a, b) => a - b);
  const min = expanded[0];
  const max = expanded[expanded.length - 1];
  const median = computeMedian(expanded);
  const mid = Math.floor(expanded.length / 2);
  const lowerHalf = expanded.slice(0, mid);
  const upperHalf = expanded.length % 2 === 0 ? expanded.slice(mid) : expanded.slice(mid + 1);
  const q1 = lowerHalf.length > 0 ? computeMedian(lowerHalf) : min;
  const q3 = upperHalf.length > 0 ? computeMedian(upperHalf) : max;

  return { n, sumX, sumX2, mean, popVar, popStd, sampleVar, sampleStd, min, q1, median, q3, max };
}

// ============================================================================
// 12. GROUPED STATISTICS & QUARTILES (THỐNG KÊ GHÉP NHÓM — VINACAL 680EX PLUS III)
// ============================================================================

export interface GroupedStatClass {
  lo: number;
  hi: number;
  freq: number;
}

export interface GroupedStatSummary {
  n: number;
  mean: number;
  popVar: number;
  popStd: number;
  sampleVar: number;
  sampleStd: number;
  q1: number;
  q2: number; // Median Me
  q3: number;
  iqr: number; // Delta_Q = Q3 - Q1
  mode: number;
  range: number;
}

export function computeGroupedStatistics(classesInput: GroupedStatClass[]): GroupedStatSummary {
  const classes = classesInput
    .filter((c) => Number.isFinite(c.lo) && Number.isFinite(c.hi) && Number.isFinite(c.freq) && c.hi > c.lo && c.freq >= 0)
    .sort((a, b) => a.lo - b.lo);

  const n = classes.reduce((acc, c) => acc + c.freq, 0);
  if (classes.length === 0 || n <= 0) {
    throw new Error('Nhập ít nhất 1 nhóm [a; b) hợp lệ với tần số > 0');
  }

  let sumMid = 0;
  let sumMid2 = 0;
  for (const c of classes) {
    const mid = (c.lo + c.hi) / 2;
    sumMid += mid * c.freq;
    sumMid2 += mid * mid * c.freq;
  }

  const mean = sumMid / n;
  const popVar = Math.max(0, sumMid2 / n - mean * mean);
  const popStd = Math.sqrt(popVar);
  const sampleVar = n > 1 ? Math.max(0, (sumMid2 - (sumMid * sumMid) / n) / (n - 1)) : 0;
  const sampleStd = Math.sqrt(sampleVar);

  // Quartile interpolation: Q_k = u_m + ((k*n/4 - C) / n_m) * (u_{m+1} - u_m)
  const computeQuartile = (fraction: number): number => {
    const target = fraction * n;
    let cfPrev = 0;
    for (const c of classes) {
      const cfNext = cfPrev + c.freq;
      if (cfNext >= target && c.freq > 0) {
        return c.lo + ((target - cfPrev) / c.freq) * (c.hi - c.lo);
      }
      cfPrev = cfNext;
    }
    return classes[classes.length - 1].hi;
  };

  const q1 = computeQuartile(0.25);
  const q2 = computeQuartile(0.5);
  const q3 = computeQuartile(0.75);
  const iqr = q3 - q1;

  // Mode M_o = u_m + ((n_m - n_{m-1}) / ((n_m - n_{m-1}) + (n_m - n_{m+1}))) * (u_{m+1} - u_m)
  let modalIdx = 0;
  for (let i = 1; i < classes.length; i++) {
    if (classes[i].freq > classes[modalIdx].freq) modalIdx = i;
  }
  const nm = classes[modalIdx].freq;
  const nPrev = modalIdx > 0 ? classes[modalIdx - 1].freq : 0;
  const nNext = modalIdx < classes.length - 1 ? classes[modalIdx + 1].freq : 0;
  const d1 = nm - nPrev;
  const d2 = nm - nNext;
  const mode =
    d1 + d2 > 0
      ? classes[modalIdx].lo + (d1 / (d1 + d2)) * (classes[modalIdx].hi - classes[modalIdx].lo)
      : (classes[modalIdx].lo + classes[modalIdx].hi) / 2;

  const range = classes[classes.length - 1].hi - classes[0].lo;

  return { n, mean, popVar, popStd, sampleVar, sampleStd, q1, q2, q3, iqr, mode, range };
}

// ============================================================================
// 13. VINACAL 680EX PLUS III GEOMETRY & FORMULA SHORTCUTS
// 1: Cthức tgiác đều | 2: Cthức Hê-rông | 3: Vtrí tđối 2đth | 4: Kcách đthẳng&mp
// ============================================================================

export interface EquilateralResult {
  area: number;
  height: number;
  circumR: number;
  inR: number;
  perimeter: number;
}

export function solveEquilateralTriangle(a: number): EquilateralResult {
  if (!Number.isFinite(a) || a <= 0) throw new Error('Cạnh tam giác đều a phải > 0');
  const s3 = Math.sqrt(3);
  return {
    area: (a * a * s3) / 4,
    height: (a * s3) / 2,
    circumR: (a * s3) / 3,
    inR: (a * s3) / 6,
    perimeter: 3 * a,
  };
}

export interface HeronResult {
  p: number;
  area: number;
  circumR: number;
  inR: number;
  ha: number;
  hb: number;
  hc: number;
}

export function solveHeronTriangle(a: number, b: number, c: number): HeronResult {
  if (![a, b, c].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error('Độ dài 3 cạnh a, b, c phải > 0');
  }
  if (a + b <= c || a + c <= b || b + c <= a) {
    throw new Error('Không thỏa mãn bất đẳng thức tam giác');
  }
  const p = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, p * (p - a) * (p - b) * (p - c)));
  return {
    p,
    area,
    circumR: (a * b * c) / (4 * area),
    inR: area / p,
    ha: (2 * area) / a,
    hb: (2 * area) / b,
    hc: (2 * area) / c,
  };
}

export interface TwoLines3DResult {
  relation: 'Trùng nhau' | 'Song song' | 'Cắt nhau' | 'Chéo nhau';
  distance: number;
  intersection?: Vec3;
  angleDeg: number;
}

export function analyzeTwoLines3D(p1: Vec3, u1: Vec3, p2: Vec3, u2: Vec3): TwoLines3DResult {
  const magU1 = Math.hypot(u1[0], u1[1], u1[2]);
  const magU2 = Math.hypot(u2[0], u2[1], u2[2]);
  if (magU1 < 1e-10 || magU2 < 1e-10) {
    throw new Error('Vectơ chỉ phương phải khác vectơ-không');
  }
  const cross: Vec3 = [
    u1[1] * u2[2] - u1[2] * u2[1],
    u1[2] * u2[0] - u1[0] * u2[2],
    u1[0] * u2[1] - u1[1] * u2[0],
  ];
  const magCross = Math.hypot(cross[0], cross[1], cross[2]);
  const p1p2: Vec3 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const dotU = Math.abs(u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2]);
  const angleDeg = (Math.acos(Math.min(1, dotU / (magU1 * magU2))) * 180) / Math.PI;

  if (magCross < 1e-9) {
    // Parallel or coincident: distance = |[p1p2, u1]| / |u1|
    const c2: Vec3 = [
      p1p2[1] * u1[2] - p1p2[2] * u1[1],
      p1p2[2] * u1[0] - p1p2[0] * u1[2],
      p1p2[0] * u1[1] - p1p2[1] * u1[0],
    ];
    const dist = Math.hypot(c2[0], c2[1], c2[2]) / magU1;
    return {
      relation: dist < 1e-8 ? 'Trùng nhau' : 'Song song',
      distance: dist < 1e-8 ? 0 : dist,
      angleDeg: 0,
    };
  }

  // Coplanarity test: |[u1, u2] . p1p2|
  const triple = cross[0] * p1p2[0] + cross[1] * p1p2[1] + cross[2] * p1p2[2];
  const dist = Math.abs(triple) / magCross;
  if (dist < 1e-7) {
    // Intersecting: solve p1 + t*u1 = p2 + s*u2 using normal equations
    const dot11 = u1[0] * u1[0] + u1[1] * u1[1] + u1[2] * u1[2];
    const dot22 = u2[0] * u2[0] + u2[1] * u2[1] + u2[2] * u2[2];
    const dot12 = u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2];
    const r1 = p1p2[0] * u1[0] + p1p2[1] * u1[1] + p1p2[2] * u1[2];
    const r2 = p1p2[0] * u2[0] + p1p2[1] * u2[1] + p1p2[2] * u2[2];
    const det = dot11 * dot22 - dot12 * dot12;
    const t = (r1 * dot22 - r2 * dot12) / det;
    const inter: Vec3 = [p1[0] + t * u1[0], p1[1] + t * u1[1], p1[2] + t * u1[2]];
    return { relation: 'Cắt nhau', distance: 0, intersection: inter, angleDeg };
  }

  return { relation: 'Chéo nhau', distance: dist, angleDeg };
}

export interface LinePlane3DResult {
  pointDist: number;
  footH: Vec3;
  relation: 'Nằm trong mp' | 'Song song mp' | 'Cắt mp';
  lineDist: number;
  angleDeg: number;
  intersection?: Vec3;
}

export function analyzeLinePlane3D(
  M: Vec3,
  u: Vec3,
  plane: [number, number, number, number] // Ax + By + Cz + D = 0
): LinePlane3DResult {
  const [A, B, Ccoef, D] = plane;
  const magN = Math.hypot(A, B, Ccoef);
  if (magN < 1e-10) throw new Error('Vectơ pháp tuyến (A; B; C) phải khác (0; 0; 0)');
  const valM = A * M[0] + B * M[1] + Ccoef * M[2] + D;
  const pointDist = Math.abs(valM) / magN;
  const k = -valM / (magN * magN);
  const footH: Vec3 = [M[0] + A * k, M[1] + B * k, M[2] + Ccoef * k];

  const magU = Math.hypot(u[0], u[1], u[2]);
  const dotNU = A * u[0] + B * u[1] + Ccoef * u[2];
  if (magU < 1e-10) {
    return { pointDist, footH, relation: pointDist < 1e-8 ? 'Nằm trong mp' : 'Song song mp', lineDist: pointDist, angleDeg: 0 };
  }

  if (Math.abs(dotNU) < 1e-9) {
    return {
      pointDist,
      footH,
      relation: pointDist < 1e-8 ? 'Nằm trong mp' : 'Song song mp',
      lineDist: pointDist < 1e-8 ? 0 : pointDist,
      angleDeg: 0,
    };
  }

  const sinPhi = Math.min(1, Math.abs(dotNU) / (magN * magU));
  const angleDeg = (Math.asin(sinPhi) * 180) / Math.PI;
  const t = -valM / dotNU;
  const intersection: Vec3 = [M[0] + t * u[0], M[1] + t * u[1], M[2] + t * u[2]];
  return {
    pointDist,
    footH,
    relation: 'Cắt mp',
    lineDist: 0,
    angleDeg,
    intersection,
  };
}

