// Symbolic + Numerical Function Analyzer for Vietnamese High School Math (SGK KNTT)

export type AstNode =
  | { type: 'num'; value: number }
  | { type: 'var' }
  | { type: 'neg'; arg: AstNode }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode }
  | { type: 'fn'; name: 'sin' | 'cos' | 'tan' | 'cot' | 'ln' | 'log' | 'sqrt' | 'exp' | 'abs'; arg: AstNode };

export interface DiscontinuityInfo {
  x: number;
  xLabel: string;
  isVerticalAsymptote: boolean;
  leftLimit: 'inf+' | 'inf-' | 'finite';
  rightLimit: 'inf+' | 'inf-' | 'finite';
  leftFiniteVal?: number;
  rightFiniteVal?: number;
}

export interface ExtremumInfo {
  x: number;
  y: number;
  kind: 'max' | 'min';
  xLabel: string;
  yLabel: string;
}

export interface AsymptoteResult {
  vertical: { x: number; label: string }[];
  horizontal: { y: number; side: 'both' | 'left' | 'right'; label: string }[];
  oblique: { m: number; b: number; label: string }[];
}

export type BbtBoundaryKind = 'neg_inf' | 'pos_inf' | 'critical' | 'asymptote' | 'domain_edge';

export interface BbtNode {
  x: number | null; // null for -inf / +inf
  xLabel: string;
  kind: BbtBoundaryKind;
  derivAtPoint?: '0' | '||' | 'x';
  yTop?: string;
  yBottom?: string;
  yCenter?: string;
  yLeft?: string; // used on left side of ||
  yRight?: string; // used on right side of ||
}

export interface BbtInterval {
  sign: '+' | '-' | 'undef';
  trend: 'up' | 'down' | 'undef';
  startPos: 'bottom' | 'top' | 'mid';
  endPos: 'bottom' | 'top' | 'mid';
}

export interface FunctionAnalysis {
  valid: boolean;
  error?: string;
  rawExpr: string;
  normalizedExpr: string;
  derivativeText: string;
  domainText: string;
  domainRestrictedHint?: string;
  isPeriodicNote?: string;
  extrema: ExtremumInfo[];
  inflectionPoints: { x: number; y: number; xLabel: string; yLabel: string }[];
  asymptotes: AsymptoteResult;
  bbtNodes: BbtNode[];
  bbtIntervals: BbtInterval[];
  discontinuities: DiscontinuityInfo[];
  evaluate: (x: number) => number | null;
  evaluateDerivative: (x: number) => number | null;
}

// ---------- Formatting Helpers (Vietnamese Math Convention) ----------

export function formatViNumber(val: number, maxDecimals = 2): string {
  if (!Number.isFinite(val)) return val > 0 ? '+∞' : '-∞';
  const snapped = Math.abs(val) < 1e-9 ? 0 : val;
  const nearestInt = Math.round(snapped);
  if (Math.abs(snapped - nearestInt) < 1e-6) {
    return String(nearestInt);
  }
  // Check clean fractions with small denominators (2, 3, 4, 5, 6, 8)
  for (const den of [2, 3, 4, 5, 6, 8]) {
    const num = Math.round(snapped * den);
    if (Math.abs(snapped - num / den) < 1e-6) {
      // For clean tenths/halves/quarters, decimal is often nice; keep fraction or decimal
      if (den === 2 || den === 4 || den === 5) {
        const dec = Number((num / den).toFixed(maxDecimals));
        return String(dec).replace('.', ',');
      }
      return `${num}/${den}`;
    }
  }
  // Check multiples of pi
  const piRatio = snapped / Math.PI;
  for (const den of [1, 2, 3, 4, 6]) {
    const num = Math.round(piRatio * den);
    if (num !== 0 && Math.abs(piRatio - num / den) < 1e-4) {
      const sign = num < 0 ? '-' : '';
      const absNum = Math.abs(num);
      const numStr = absNum === 1 ? '' : String(absNum);
      return den === 1 ? `${sign}${numStr}π` : `${sign}${numStr}π/${den}`;
    }
  }
  const rounded = Number(snapped.toFixed(maxDecimals));
  return String(rounded).replace('.', ',');
}

// ---------- Tokenizer & Recursive-Descent Parser ----------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'cot', 'ln', 'log', 'sqrt', 'exp', 'abs']);

function normalizeRawInput(raw: string): string {
  return raw
    .replace(/^\s*y\s*=\s*/i, '')
    .replace(/^\s*f\s*\(\s*x\s*\)\s*=\s*/i, '')
    .replace(/−|–/g, '-')
    .replace(/×|·|⋅/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-zA-Z0-9]+)/g, 'sqrt($1)')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const value = Number(numStr);
      if (Number.isNaN(value)) throw new Error(`Số không hợp lệ: "${numStr}"`);
      tokens.push({ kind: 'num', value });
      continue;
    }
    if (/[a-z]/.test(ch)) {
      let word = '';
      while (i < expr.length && /[a-z]/.test(expr[i])) {
        word += expr[i++];
      }
      if (word === 'x' || word === 'e' || word === 'pi' || FUNCTION_NAMES.has(word)) {
        tokens.push({ kind: 'ident', name: word });
      } else if (word.length > 1) {
        // Support implicit chains like "xsin" or "ex" -> split carefully
        let remaining = word;
        while (remaining.length > 0) {
          let matchedFn = '';
          for (const fn of FUNCTION_NAMES) {
            if (remaining.startsWith(fn)) {
              matchedFn = fn;
              break;
            }
          }
          if (matchedFn) {
            tokens.push({ kind: 'ident', name: matchedFn });
            remaining = remaining.slice(matchedFn.length);
          } else if (remaining.startsWith('pi')) {
            tokens.push({ kind: 'ident', name: 'pi' });
            remaining = remaining.slice(2);
          } else if (remaining[0] === 'x' || remaining[0] === 'e') {
            tokens.push({ kind: 'ident', name: remaining[0] });
            remaining = remaining.slice(1);
          } else {
            throw new Error(`Không nhận diện được ký hiệu "${word}"`);
          }
        }
      } else {
        throw new Error(`Biến hoặc hàm "${word}" chưa được hỗ trợ (hãy dùng biến x)`);
      }
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === '|') {
      throw new Error('Hãy dùng abs(...) cho giá trị tuyệt đối');
    }
    throw new Error(`Ký tự không hợp lệ: "${ch}"`);
  }

  // Insert implicit multiplication tokens: 2x, 2(, )x, )(, xsin, etc.
  const expanded: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    if (idx > 0) {
      const prev = tokens[idx - 1];
      const prevIsVal =
        prev.kind === 'num' ||
        prev.kind === 'rparen' ||
        (prev.kind === 'ident' && !FUNCTION_NAMES.has(prev.name));
      const curStartsFactor =
        cur.kind === 'num' || cur.kind === 'lparen' || cur.kind === 'ident';
      if (prevIsVal && curStartsFactor) {
        expanded.push({ kind: 'op', op: '*' });
      }
    }
    expanded.push(cur);
  }

  return expanded;
}

function parseExpression(raw: string): { ast: AstNode; normalized: string } {
  const normalized = normalizeRawInput(raw);
  if (!normalized) throw new Error('Vui lòng nhập biểu thức hàm số y = f(x).');
  const tokens = tokenize(normalized);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseAddSub(): AstNode {
    let left = parseMulDiv();
    while (peek()?.kind === 'op' && (peek() as { kind: 'op'; op: string }).op.match(/^[+-]$/)) {
      const op = (consume() as { kind: 'op'; op: '+' | '-' }).op;
      const right = parseMulDiv();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }

  function parseMulDiv(): AstNode {
    let left = parseUnary();
    while (peek()?.kind === 'op' && (peek() as { kind: 'op'; op: string }).op.match(/^[*/]$/)) {
      const op = (consume() as { kind: 'op'; op: '*' | '/' }).op;
      const right = parseUnary();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }

  function parseUnary(): AstNode {
    const t = peek();
    if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
      consume();
      const arg = parseUnary();
      return t.op === '-' ? { type: 'neg', arg } : arg;
    }
    return parsePow();
  }

  function parsePow(): AstNode {
    const base = parsePrimary();
    if (peek()?.kind === 'op' && (peek() as { kind: 'op'; op: string }).op === '^') {
      consume();
      // Right-associative unary in exponent: e^-x
      const exp = parseUnary();
      return { type: 'bin', op: '^', left: base, right: exp };
    }
    return base;
  }

  function parsePrimary(): AstNode {
    const t = peek();
    if (!t) throw new Error('Biểu thức kết thúc đột ngột.');
    if (t.kind === 'num') {
      consume();
      return { type: 'num', value: t.value };
    }
    if (t.kind === 'ident') {
      consume();
      if (t.name === 'x') return { type: 'var' };
      if (t.name === 'pi') return { type: 'num', value: Math.PI };
      if (t.name === 'e') return { type: 'num', value: Math.E };
      if (FUNCTION_NAMES.has(t.name)) {
        let arg: AstNode;
        if (peek()?.kind === 'lparen') {
          consume();
          arg = parseAddSub();
          if (peek()?.kind !== 'rparen') throw new Error(`Thiếu dấu ngoặc đóng ")" cho ${t.name}(...)`);
          consume();
        } else {
          arg = parsePrimary();
        }
        return {
          type: 'fn',
          name: t.name as Extract<AstNode, { type: 'fn' }>['name'],
          arg,
        };
      }
    }
    if (t.kind === 'lparen') {
      consume();
      const inner = parseAddSub();
      if (peek()?.kind !== 'rparen') throw new Error('Thiếu dấu ngoặc đóng ")".');
      consume();
      return inner;
    }
    throw new Error('Cú pháp biểu thức không hợp lệ.');
  }

  const ast = parseAddSub();
  if (pos < tokens.length) {
    throw new Error('Dư ký tự hoặc thiếu toán tử trong biểu thức.');
  }
  return { ast, normalized };
}

// ---------- AST Evaluator & Symbolic Differentiator ----------

function evalAst(node: AstNode, x: number): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      return x;
    case 'neg':
      return -evalAst(node.arg, x);
    case 'bin': {
      const l = evalAst(node.left, x);
      const r = evalAst(node.right, x);
      if (!Number.isFinite(l) || !Number.isFinite(r)) return NaN;
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (Math.abs(r) < 1e-12) return NaN;
          return l / r;
        case '^': {
          if (l < 0 && Math.abs(r - Math.round(r)) > 1e-9) return NaN;
          if (l === 0 && r <= 0) return NaN;
          return Math.pow(l, r);
        }
      }
      break;
    }
    case 'fn': {
      const a = evalAst(node.arg, x);
      if (!Number.isFinite(a)) return NaN;
      switch (node.name) {
        case 'sin':
          return Math.sin(a);
        case 'cos':
          return Math.cos(a);
        case 'tan': {
          if (Math.abs(Math.cos(a)) < 1e-9) return NaN;
          return Math.tan(a);
        }
        case 'cot': {
          if (Math.abs(Math.sin(a)) < 1e-9) return NaN;
          return Math.cos(a) / Math.sin(a);
        }
        case 'ln':
          return a > 1e-12 ? Math.log(a) : NaN;
        case 'log':
          return a > 1e-12 ? Math.log10(a) : NaN;
        case 'sqrt':
          return a >= -1e-12 ? Math.sqrt(Math.max(0, a)) : NaN;
        case 'exp':
          return Math.exp(a);
        case 'abs':
          return Math.abs(a);
      }
    }
  }
  return NaN;
}

const ZERO: AstNode = { type: 'num', value: 0 };
const ONE: AstNode = { type: 'num', value: 1 };

function simplifyAst(n: AstNode): AstNode {
  if (n.type === 'num' || n.type === 'var') return n;
  if (n.type === 'neg') {
    const a = simplifyAst(n.arg);
    if (a.type === 'num') return { type: 'num', value: -a.value };
    if (a.type === 'neg') return a.arg;
    return { type: 'neg', arg: a };
  }
  if (n.type === 'fn') {
    return { type: 'fn', name: n.name, arg: simplifyAst(n.arg) };
  }
  const l = simplifyAst(n.left);
  const r = simplifyAst(n.right);
  if (l.type === 'num' && r.type === 'num') {
    const v = evalAst({ type: 'bin', op: n.op, left: l, right: r }, 0);
    if (Number.isFinite(v)) return { type: 'num', value: v };
  }
  if (n.op === '+') {
    if (l.type === 'num' && l.value === 0) return r;
    if (r.type === 'num' && r.value === 0) return l;
  }
  if (n.op === '-') {
    if (r.type === 'num' && r.value === 0) return l;
    if (l.type === 'num' && l.value === 0) return simplifyAst({ type: 'neg', arg: r });
  }
  if (n.op === '*') {
    if ((l.type === 'num' && l.value === 0) || (r.type === 'num' && r.value === 0)) return ZERO;
    if (l.type === 'num' && l.value === 1) return r;
    if (r.type === 'num' && r.value === 1) return l;
    if (l.type === 'num' && l.value === -1) return simplifyAst({ type: 'neg', arg: r });
    if (r.type === 'num' && r.value === -1) return simplifyAst({ type: 'neg', arg: l });
  }
  if (n.op === '/') {
    if (l.type === 'num' && l.value === 0) return ZERO;
    if (r.type === 'num' && r.value === 1) return l;
  }
  if (n.op === '^') {
    if (r.type === 'num' && r.value === 0) return ONE;
    if (r.type === 'num' && r.value === 1) return l;
  }
  return { type: 'bin', op: n.op, left: l, right: r };
}

function differentiateAst(n: AstNode): AstNode {
  switch (n.type) {
    case 'num':
      return ZERO;
    case 'var':
      return ONE;
    case 'neg':
      return simplifyAst({ type: 'neg', arg: differentiateAst(n.arg) });
    case 'bin': {
      const u = n.left;
      const v = n.right;
      const du = differentiateAst(u);
      const dv = differentiateAst(v);
      switch (n.op) {
        case '+':
          return simplifyAst({ type: 'bin', op: '+', left: du, right: dv });
        case '-':
          return simplifyAst({ type: 'bin', op: '-', left: du, right: dv });
        case '*':
          return simplifyAst({
            type: 'bin',
            op: '+',
            left: { type: 'bin', op: '*', left: du, right: v },
            right: { type: 'bin', op: '*', left: u, right: dv },
          });
        case '/':
          return simplifyAst({
            type: 'bin',
            op: '/',
            left: {
              type: 'bin',
              op: '-',
              left: { type: 'bin', op: '*', left: du, right: v },
              right: { type: 'bin', op: '*', left: u, right: dv },
            },
            right: { type: 'bin', op: '^', left: v, right: { type: 'num', value: 2 } },
          });
        case '^': {
          // Constant exponent: u^c -> c * u^(c-1) * du
          if (v.type === 'num') {
            return simplifyAst({
              type: 'bin',
              op: '*',
              left: {
                type: 'bin',
                op: '*',
                left: v,
                right: { type: 'bin', op: '^', left: u, right: { type: 'num', value: v.value - 1 } },
              },
              right: du,
            });
          }
          // Constant base: a^v -> a^v * ln(a) * dv
          if (u.type === 'num' && u.value > 0) {
            const lnA: AstNode =
              Math.abs(u.value - Math.E) < 1e-9
                ? ONE
                : { type: 'fn', name: 'ln', arg: u };
            return simplifyAst({
              type: 'bin',
              op: '*',
              left: { type: 'bin', op: '*', left: n, right: lnA },
              right: dv,
            });
          }
          // General u^v -> u^v * (dv * ln(u) + v * du / u)
          return simplifyAst({
            type: 'bin',
            op: '*',
            left: n,
            right: {
              type: 'bin',
              op: '+',
              left: { type: 'bin', op: '*', left: dv, right: { type: 'fn', name: 'ln', arg: u } },
              right: {
                type: 'bin',
                op: '/',
                left: { type: 'bin', op: '*', left: v, right: du },
                right: u,
              },
            },
          });
        }
      }
      break;
    }
    case 'fn': {
      const u = n.arg;
      const du = differentiateAst(u);
      switch (n.name) {
        case 'sin':
          return simplifyAst({ type: 'bin', op: '*', left: { type: 'fn', name: 'cos', arg: u }, right: du });
        case 'cos':
          return simplifyAst({
            type: 'bin',
            op: '*',
            left: { type: 'neg', arg: { type: 'fn', name: 'sin', arg: u } },
            right: du,
          });
        case 'tan':
          return simplifyAst({
            type: 'bin',
            op: '/',
            left: du,
            right: { type: 'bin', op: '^', left: { type: 'fn', name: 'cos', arg: u }, right: { type: 'num', value: 2 } },
          });
        case 'cot':
          return simplifyAst({
            type: 'neg',
            arg: {
              type: 'bin',
              op: '/',
              left: du,
              right: { type: 'bin', op: '^', left: { type: 'fn', name: 'sin', arg: u }, right: { type: 'num', value: 2 } },
            },
          });
        case 'ln':
          return simplifyAst({ type: 'bin', op: '/', left: du, right: u });
        case 'log':
          return simplifyAst({
            type: 'bin',
            op: '/',
            left: du,
            right: { type: 'bin', op: '*', left: u, right: { type: 'num', value: Math.LN10 } },
          });
        case 'sqrt':
          return simplifyAst({
            type: 'bin',
            op: '/',
            left: du,
            right: { type: 'bin', op: '*', left: { type: 'num', value: 2 }, right: n },
          });
        case 'exp':
          return simplifyAst({ type: 'bin', op: '*', left: n, right: du });
        case 'abs':
          return simplifyAst({
            type: 'bin',
            op: '/',
            left: { type: 'bin', op: '*', left: u, right: du },
            right: n,
          });
      }
    }
  }
  return ZERO;
}

function formatAst(node: AstNode, parentPrec = 0): string {
  switch (node.type) {
    case 'num': {
      if (Math.abs(node.value - Math.E) < 1e-9) return 'e';
      if (Math.abs(node.value - Math.PI) < 1e-9) return 'π';
      return formatViNumber(node.value, 3);
    }
    case 'var':
      return 'x';
    case 'neg': {
      const inner = formatAst(node.arg, 3);
      const s = `-${inner}`;
      return parentPrec > 2 ? `(${s})` : s;
    }
    case 'fn': {
      const argStr = formatAst(node.arg, 0);
      if (node.name === 'sqrt') return `√(${argStr})`;
      if (node.name === 'abs') return `|${argStr}|`;
      if (node.name === 'exp') return `e^(${argStr})`;
      return `${node.name}(${argStr})`;
    }
    case 'bin': {
      const prec = node.op === '+' || node.op === '-' ? 1 : node.op === '*' || node.op === '/' ? 2 : 4;
      const l = formatAst(node.left, prec);
      const r = formatAst(node.right, node.op === '-' || node.op === '/' ? prec + 1 : prec);
      let s = '';
      if (node.op === '*') {
        if (node.left.type === 'num' && (node.right.type === 'var' || node.right.type === 'fn' || (node.right.type === 'bin' && node.right.op === '^'))) {
          s = `${l}${r}`;
        } else {
          s = `${l}·${r}`;
        }
      } else if (node.op === '^') {
        const expStr = node.right.type === 'num' || node.right.type === 'var' ? r : `(${formatAst(node.right, 0)})`;
        s = `${l}^${expStr}`;
      } else {
        s = `${l} ${node.op} ${r}`;
      }
      return parentPrec > prec ? `(${s})` : s;
    }
  }
}

// ---------- Polynomial Formatting Helper ----------

function formatPolynomialString(coeffsDesc: number[]): string {
  // coeffsDesc[0] = highest degree
  const deg = coeffsDesc.length - 1;
  const parts: string[] = [];
  coeffsDesc.forEach((coef, idx) => {
    const p = deg - idx;
    if (Math.abs(coef) < 1e-7) return;
    const isNeg = coef < 0;
    const absC = Math.abs(coef);
    const numStr = formatViNumber(absC, 2);
    let term = '';
    if (p === 0) {
      term = numStr;
    } else if (p === 1) {
      term = Math.abs(absC - 1) < 1e-7 ? 'x' : `${numStr}x`;
    } else {
      term = Math.abs(absC - 1) < 1e-7 ? `x^${p}` : `${numStr}x^${p}`;
    }
    if (parts.length === 0) {
      parts.push(isNeg ? `-${term}` : term);
    } else {
      parts.push(isNeg ? `- ${term}` : `+ ${term}`);
    }
  });
  return parts.length ? parts.join(' ') : '0';
}

// Extract polynomial coefficients [a_n, ..., a_0] if AST is a pure polynomial up to deg 4
function tryExtractPolynomial(node: AstNode): number[] | null {
  const addPoly = (a: number[], b: number[], sign = 1): number[] => {
    const len = Math.max(a.length, b.length);
    const res = new Array(len).fill(0);
    for (let i = 0; i < a.length; i++) res[len - a.length + i] += a[i];
    for (let i = 0; i < b.length; i++) res[len - b.length + i] += sign * b[i];
    while (res.length > 1 && Math.abs(res[0]) < 1e-9) res.shift();
    return res;
  };
  const mulPoly = (a: number[], b: number[]): number[] | null => {
    if (a.length + b.length - 2 > 4) return null;
    const res = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        res[i + j] += a[i] * b[j];
      }
    }
    while (res.length > 1 && Math.abs(res[0]) < 1e-9) res.shift();
    return res;
  };

  switch (node.type) {
    case 'num':
      return [node.value];
    case 'var':
      return [1, 0];
    case 'neg': {
      const inner = tryExtractPolynomial(node.arg);
      return inner ? inner.map((v) => -v) : null;
    }
    case 'fn':
      return null;
    case 'bin': {
      const l = tryExtractPolynomial(node.left);
      if (!l) return null;
      if (node.op === '^') {
        if (node.right.type !== 'num') return null;
        const exp = Math.round(node.right.value);
        if (Math.abs(node.right.value - exp) > 1e-9 || exp < 0 || exp > 4) return null;
        let acc: number[] | null = [1];
        for (let k = 0; k < exp; k++) {
          if (!acc) return null;
          acc = mulPoly(acc, l);
        }
        return acc;
      }
      const r = tryExtractPolynomial(node.right);
      if (!r) return null;
      if (node.op === '+') return addPoly(l, r, 1);
      if (node.op === '-') return addPoly(l, r, -1);
      if (node.op === '*') return mulPoly(l, r);
      if (node.op === '/' && r.length === 1 && Math.abs(r[0]) > 1e-9) {
        return l.map((v) => v / r[0]);
      }
      return null;
    }
  }
}

// ---------- Root Refinement & Calculus Probing ----------

function bisectRoot(fn: (x: number) => number, a: number, b: number): number | null {
  let fa = fn(a);
  let fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (Math.abs(fa) < 1e-10) return a;
  if (Math.abs(fb) < 1e-10) return b;
  if (fa * fb > 0) return null;
  let lo = a;
  let hi = b;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = fn(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-11 || Math.abs(hi - lo) < 1e-11) return mid;
    if (fa * fm <= 0) {
      hi = mid;
      fb = fm;
    } else {
      lo = mid;
      fa = fm;
    }
  }
  return 0.5 * (lo + hi);
}

function dedupeSorted(vals: number[], eps = 1e-4): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > eps) {
      out.push(Math.abs(v) < 1e-8 ? 0 : v);
    }
  }
  return out;
}

function classifyLimit(evalFn: (x: number) => number | null, x0: number, dir: -1 | 1): {
  kind: 'inf+' | 'inf-' | 'finite';
  val?: number;
} {
  const deltas = [1e-2, 1e-3, 1e-4, 1e-5];
  const samples = deltas.map((d) => evalFn(x0 + dir * d));
  if (samples.some((s) => s === null || !Number.isFinite(s))) {
    // Check slightly farther out if tiny delta hit NaN
    const s1 = evalFn(x0 + dir * 1e-2);
    const s2 = evalFn(x0 + dir * 2e-3);
    if (s1 !== null && s2 !== null && Math.abs(s2) > 50 && Math.abs(s2) > Math.abs(s1)) {
      return { kind: s2 > 0 ? 'inf+' : 'inf-' };
    }
    return { kind: 'finite', val: undefined };
  }
  const nums = samples as number[];
  const last = nums[nums.length - 1];
  const prev = nums[nums.length - 2];
  if (Math.abs(last) > 30 && Math.abs(last) > Math.abs(prev) * 1.5) {
    return { kind: last > 0 ? 'inf+' : 'inf-' };
  }
  return { kind: 'finite', val: last };
}

function classifyInfinityLimit(evalFn: (x: number) => number | null, side: 'left' | 'right'): {
  text: string;
  horizontalY: number | null;
} {
  const sign = side === 'right' ? 1 : -1;
  const xs = [sign * 80, sign * 300, sign * 1500, sign * 8000];
  const ys = xs.map((x) => evalFn(x));
  if (ys.some((v) => v === null || !Number.isFinite(v))) {
    return { text: '∅', horizontalY: null };
  }
  const nums = ys as number[];
  const yLast = nums[nums.length - 1];
  const yPrev = nums[nums.length - 2];
  if (Math.abs(yLast - yPrev) < 1e-3 && Math.abs(yLast) < 1e4) {
    const snapped = Math.abs(yLast) < 1e-5 ? 0 : yLast;
    return { text: formatViNumber(snapped, 2), horizontalY: snapped };
  }
  if (Math.abs(yLast) > Math.abs(yPrev)) {
    return { text: yLast > 0 ? '+∞' : '-∞', horizontalY: null };
  }
  // Oscillating (like sin/cos)
  return { text: 'Không xác định', horizontalY: null };
}

function collectDenominators(node: AstNode, list: AstNode[]) {
  if (node.type === 'bin') {
    if (node.op === '/') list.push(node.right);
    collectDenominators(node.left, list);
    collectDenominators(node.right, list);
  } else if (node.type === 'neg' || node.type === 'fn') {
    if (node.type === 'fn' && node.name === 'tan') {
      list.push({ type: 'fn', name: 'cos', arg: node.arg });
    }
    if (node.type === 'fn' && node.name === 'cot') {
      list.push({ type: 'fn', name: 'sin', arg: node.arg });
    }
    collectDenominators(node.arg, list);
  }
}

function hasTrigAst(node: AstNode): boolean {
  if (node.type === 'fn') {
    if (node.name === 'sin' || node.name === 'cos' || node.name === 'tan' || node.name === 'cot') {
      return true;
    }
    return hasTrigAst(node.arg);
  }
  if (node.type === 'neg') return hasTrigAst(node.arg);
  if (node.type === 'bin') return hasTrigAst(node.left) || hasTrigAst(node.right);
  return false;
}

function hasLogOrSqrtRestriction(node: AstNode): boolean {
  if (node.type === 'fn') {
    if (node.name === 'ln' || node.name === 'log' || node.name === 'sqrt') return true;
    return hasLogOrSqrtRestriction(node.arg);
  }
  if (node.type === 'neg') return hasLogOrSqrtRestriction(node.arg);
  if (node.type === 'bin') return hasLogOrSqrtRestriction(node.left) || hasLogOrSqrtRestriction(node.right);
  return false;
}

// ---------- Main Analyzer ----------

export function analyzeFunction(rawExpr: string): FunctionAnalysis {
  let ast: AstNode;
  let normalizedExpr = '';
  try {
    const parsed = parseExpression(rawExpr);
    ast = parsed.ast;
    normalizedExpr = parsed.normalized;
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Biểu thức hàm số chưa hợp lệ.',
      rawExpr,
      normalizedExpr: rawExpr,
      derivativeText: '',
      domainText: '',
      extrema: [],
      inflectionPoints: [],
      asymptotes: { vertical: [], horizontal: [], oblique: [] },
      bbtNodes: [],
      bbtIntervals: [],
      discontinuities: [],
      evaluate: () => null,
      evaluateDerivative: () => null,
    };
  }

  const dAst = differentiateAst(ast);
  const ddAst = differentiateAst(dAst);

  const evaluate = (x: number): number | null => {
    const v = evalAst(ast, x);
    return Number.isFinite(v) ? v : null;
  };
  const evaluateDerivative = (x: number): number | null => {
    const v = evalAst(dAst, x);
    return Number.isFinite(v) ? v : null;
  };

  // Check if at least some points in [-10; 10] are valid
  let validSampleCount = 0;
  for (let x = -10; x <= 10; x += 0.25) {
    if (evaluate(x) !== null) validSampleCount++;
  }
  if (validSampleCount === 0) {
    return {
      valid: false,
      error: 'Hàm số không xác định trên miền khảo sát [-10; 10]. Hãy kiểm tra biểu thức căn/lôgarit.',
      rawExpr,
      normalizedExpr,
      derivativeText: '',
      domainText: '∅',
      extrema: [],
      inflectionPoints: [],
      asymptotes: { vertical: [], horizontal: [], oblique: [] },
      bbtNodes: [],
      bbtIntervals: [],
      discontinuities: [],
      evaluate,
      evaluateDerivative,
    };
  }

  // Detect exact rational 1/1 or 2/1 or pure polynomial
  const poly = tryExtractPolynomial(ast);
  const rationalPair =
    ast.type === 'bin' && ast.op === '/'
      ? { num: tryExtractPolynomial(ast.left), den: tryExtractPolynomial(ast.right) }
      : null;

  let derivativeText = `y' = ${formatAst(dAst)}`;
  if (poly) {
    const dPoly = poly.slice(0, -1).map((c, idx) => c * (poly.length - 1 - idx));
    derivativeText = `y' = ${formatPolynomialString(dPoly)}`;
  } else if (rationalPair?.num && rationalPair?.den && rationalPair.den.length === 2) {
    const [p, q] = rationalPair.den;
    if (rationalPair.num.length <= 2) {
      const [a, b] = rationalPair.num.length === 2 ? rationalPair.num : [0, rationalPair.num[0]];
      const det = a * q - b * p;
      const denStr = formatPolynomialString([p, q]);
      derivativeText = `y' = ${formatViNumber(det)} / (${denStr})²`;
    } else if (rationalPair.num.length === 3) {
      const [a, b, c] = rationalPair.num;
      // (a x^2 + b x + c) / (p x + q) => numerator of derivative is (2ax+b)(px+q) - p(ax^2+bx+c) = ap x^2 + 2aq x + (bq - cp)
      const numD = [a * p, 2 * a * q, b * q - c * p];
      const denStr = formatPolynomialString([p, q]);
      derivativeText = `y' = (${formatPolynomialString(numD)}) / (${denStr})²`;
    }
  }

  // 1. Find singularities / vertical asymptotes in [-8; 8]
  const denomNodes: AstNode[] = [];
  collectDenominators(ast, denomNodes);
  const rawSingularities: number[] = [];

  for (const dn of denomNodes) {
    const dPoly = tryExtractPolynomial(dn);
    if (dPoly && dPoly.length === 2 && Math.abs(dPoly[0]) > 1e-9) {
      rawSingularities.push(-dPoly[1] / dPoly[0]);
    } else if (dPoly && dPoly.length === 3 && Math.abs(dPoly[0]) > 1e-9) {
      const [A, B, C] = dPoly;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        rawSingularities.push((-B - Math.sqrt(disc)) / (2 * A));
        rawSingularities.push((-B + Math.sqrt(disc)) / (2 * A));
      }
    } else {
      const fDen = (x: number) => evalAst(dn, x);
      const step = 0.05;
      for (let x = -8; x < 8; x += step) {
        const v1 = fDen(x);
        const v2 = fDen(x + step);
        if (Number.isFinite(v1) && Number.isFinite(v2) && v1 * v2 <= 0) {
          const root = bisectRoot(fDen, x, x + step);
          if (root !== null) rawSingularities.push(root);
        }
      }
    }
  }

  const singularities = dedupeSorted(rawSingularities).filter((s) => Math.abs(s) <= 8);
  const discontinuities: DiscontinuityInfo[] = singularities.map((s) => {
    const lLim = classifyLimit(evaluate, s, -1);
    const rLim = classifyLimit(evaluate, s, 1);
    const isVA =
      lLim.kind === 'inf+' ||
      lLim.kind === 'inf-' ||
      rLim.kind === 'inf+' ||
      rLim.kind === 'inf-';
    return {
      x: s,
      xLabel: formatViNumber(s),
      isVerticalAsymptote: isVA,
      leftLimit: lLim.kind,
      rightLimit: rLim.kind,
      leftFiniteVal: lLim.val,
      rightFiniteVal: rLim.val,
    };
  });

  // 2. Domain & Asymptotes
  let domainText = 'ℝ';
  let domainRestrictedHint: string | undefined;
  const isTrig = hasTrigAst(ast);
  const hasDomainRestriction = hasLogOrSqrtRestriction(ast);

  // Detect domain interval edges (e.g. ln(x) -> (0; +∞), sqrt(4-x^2) -> [-2; 2])
  let domainMinEdge: { x: number; inclusive: boolean } | null = null;
  let domainMaxEdge: { x: number; inclusive: boolean } | null = null;

  if (hasDomainRestriction) {
    const scanStep = 0.05;
    let firstValid: number | null = null;
    let lastValid: number | null = null;
    for (let x = -12; x <= 12.001; x += scanStep) {
      if (evaluate(x) !== null) {
        if (firstValid === null) firstValid = x;
        lastValid = x;
      }
    }
    if (firstValid !== null && firstValid > -11.5) {
      // Binary search exact left domain boundary
      let lo = firstValid - scanStep;
      let hi = firstValid;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (evaluate(mid) !== null) hi = mid;
        else lo = mid;
      }
      const edge = Math.abs(hi) < 1e-6 ? 0 : hi;
      domainMinEdge = { x: edge, inclusive: evaluate(edge) !== null };
    }
    if (lastValid !== null && lastValid < 11.5) {
      let lo = lastValid;
      let hi = lastValid + scanStep;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (evaluate(mid) !== null) lo = mid;
        else hi = mid;
      }
      const edge = Math.abs(lo) < 1e-6 ? 0 : lo;
      domainMaxEdge = { x: edge, inclusive: evaluate(edge) !== null };
    }

    if (domainMinEdge && domainMaxEdge) {
      domainText = `${domainMinEdge.inclusive ? '[' : '('}${formatViNumber(domainMinEdge.x)}; ${formatViNumber(domainMaxEdge.x)}${domainMaxEdge.inclusive ? ']' : ')'}`;
    } else if (domainMinEdge) {
      domainText = `${domainMinEdge.inclusive ? '[' : '('}${formatViNumber(domainMinEdge.x)}; +∞)`;
    } else if (domainMaxEdge) {
      domainText = `(-∞; ${formatViNumber(domainMaxEdge.x)}${domainMaxEdge.inclusive ? ']' : ')'}`;
    } else if (singularities.length > 0) {
      domainText = `ℝ \\ {${singularities.map((s) => formatViNumber(s)).join('; ')}}`;
    }
  } else if (singularities.length > 0) {
    if (isTrig) {
      domainText = `ℝ \\ {điểm gián đoạn}`;
      domainRestrictedHint = 'Khảo sát trên khoảng [-4; 4]';
    } else {
      domainText = `ℝ \\ {${singularities.map((s) => formatViNumber(s)).join('; ')}}`;
    }
  }

  // Vertical Asymptotes
  const verticalAsymptotes = discontinuities
    .filter((d) => d.isVerticalAsymptote)
    .map((d) => ({ x: d.x, label: `x = ${d.xLabel}` }));

  // Horizontal & Oblique Asymptotes
  const horizontalAsymptotes: AsymptoteResult['horizontal'] = [];
  const obliqueAsymptotes: AsymptoteResult['oblique'] = [];

  if (rationalPair?.num && rationalPair?.den && rationalPair.den.length === 2) {
    const [p, q] = rationalPair.den;
    if (rationalPair.num.length === 2) {
      const a = rationalPair.num[0];
      const yAsym = a / p;
      horizontalAsymptotes.push({ y: yAsym, side: 'both', label: `y = ${formatViNumber(yAsym)}` });
    } else if (rationalPair.num.length === 1) {
      horizontalAsymptotes.push({ y: 0, side: 'both', label: 'y = 0' });
    } else if (rationalPair.num.length === 3 && Math.abs(p) > 1e-9) {
      const [a, b] = rationalPair.num;
      const m = a / p;
      const k = (b - m * q) / p;
      const kStr = Math.abs(k) < 1e-7 ? '' : k > 0 ? ` + ${formatViNumber(k)}` : ` - ${formatViNumber(Math.abs(k))}`;
      const mStr = Math.abs(m - 1) < 1e-7 ? 'x' : Math.abs(m + 1) < 1e-7 ? '-x' : `${formatViNumber(m)}x`;
      obliqueAsymptotes.push({ m, b: k, label: `y = ${mStr}${kStr}` });
    }
  } else if (!poly && !isTrig) {
    const rightInf = classifyInfinityLimit(evaluate, 'right');
    const leftInf = classifyInfinityLimit(evaluate, 'left');
    if (
      rightInf.horizontalY !== null &&
      leftInf.horizontalY !== null &&
      Math.abs(rightInf.horizontalY - leftInf.horizontalY) < 1e-4
    ) {
      horizontalAsymptotes.push({
        y: rightInf.horizontalY,
        side: 'both',
        label: `y = ${formatViNumber(rightInf.horizontalY)}`,
      });
    } else {
      if (leftInf.horizontalY !== null && !domainMinEdge) {
        horizontalAsymptotes.push({
          y: leftInf.horizontalY,
          side: 'left',
          label: `y = ${formatViNumber(leftInf.horizontalY)} (x → -∞)`,
        });
      }
      if (rightInf.horizontalY !== null && !domainMaxEdge) {
        horizontalAsymptotes.push({
          y: rightInf.horizontalY,
          side: 'right',
          label: `y = ${formatViNumber(rightInf.horizontalY)} (x → +∞)`,
        });
      }
    }
  }

  // 3. Find Extrema (roots of y' = 0)
  const scanLo = domainMinEdge ? domainMinEdge.x + 1e-4 : isTrig ? -3.6 : -8;
  const scanHi = domainMaxEdge ? domainMaxEdge.x - 1e-4 : isTrig ? 3.6 : 8;
  const rawCritXs: number[] = [];

  if (poly) {
    // Exact derivative roots for deg <= 3
    if (poly.length === 3) {
      // ax^2 + bx + c -> 2ax + b = 0
      const [a, b] = poly;
      if (Math.abs(a) > 1e-9) rawCritXs.push(-b / (2 * a));
    } else if (poly.length === 4) {
      // ax^3 + bx^2 + cx + d -> 3ax^2 + 2bx + c = 0
      const [a, b, c] = poly;
      const A = 3 * a;
      const B = 2 * b;
      const C = c;
      const disc = B * B - 4 * A * C;
      if (disc > 1e-10) {
        rawCritXs.push((-B - Math.sqrt(disc)) / (2 * A));
        rawCritXs.push((-B + Math.sqrt(disc)) / (2 * A));
      }
    }
  } else if (rationalPair?.num && rationalPair?.den && rationalPair.den.length === 2 && rationalPair.num.length === 3) {
    const [a, b, c] = rationalPair.num;
    const [p, q] = rationalPair.den;
    const A = a * p;
    const B = 2 * a * q;
    const C = b * q - c * p;
    const disc = B * B - 4 * A * C;
    if (disc > 1e-10 && Math.abs(A) > 1e-9) {
      rawCritXs.push((-B - Math.sqrt(disc)) / (2 * A));
      rawCritXs.push((-B + Math.sqrt(disc)) / (2 * A));
    }
  }

  // Numerical scan fallback (or degree-4 / trig / exp / log)
  if (rawCritXs.length === 0 && !(poly && poly.length <= 4) && !(rationalPair?.num && rationalPair?.den && rationalPair.den.length === 2 && rationalPair.num.length <= 3)) {
    const fDeriv = (x: number) => evalAst(dAst, x);
    const steps = 600;
    const h = (scanHi - scanLo) / steps;
    for (let i = 0; i < steps; i++) {
      const x1 = scanLo + i * h;
      const x2 = x1 + h;
      // Skip intervals spanning a singularity
      if (singularities.some((s) => s >= x1 - 1e-4 && s <= x2 + 1e-4)) continue;
      const d1 = fDeriv(x1);
      const d2 = fDeriv(x2);
      if (!Number.isFinite(d1) || !Number.isFinite(d2)) continue;
      if (d1 * d2 <= 0) {
        const r = bisectRoot(fDeriv, x1, x2);
        if (r !== null && r > scanLo + 1e-5 && r < scanHi - 1e-5) {
          rawCritXs.push(r);
        }
      }
    }
  }

  const critXs = dedupeSorted(rawCritXs).filter(
    (cx) =>
      evaluate(cx) !== null &&
      !singularities.some((s) => Math.abs(s - cx) < 1e-3) &&
      (!domainMinEdge || cx > domainMinEdge.x + 1e-4) &&
      (!domainMaxEdge || cx < domainMaxEdge.x - 1e-4)
  );

  // Filter strictly sign-changing extrema
  const extrema: ExtremumInfo[] = [];
  for (const cx of critXs) {
    const eps = 1e-3;
    const dLeft = evaluateDerivative(cx - eps);
    const dRight = evaluateDerivative(cx + eps);
    const yVal = evaluate(cx);
    if (dLeft !== null && dRight !== null && yVal !== null && dLeft * dRight < 0) {
      extrema.push({
        x: cx,
        y: yVal,
        kind: dLeft > 0 ? 'max' : 'min',
        xLabel: formatViNumber(cx),
        yLabel: formatViNumber(yVal),
      });
    }
  }

  // Inflection points for cubic
  const inflectionPoints: { x: number; y: number; xLabel: string; yLabel: string }[] = [];
  if (poly && poly.length === 4 && Math.abs(poly[0]) > 1e-9) {
    const ix = -poly[1] / (3 * poly[0]);
    const iy = evaluate(ix);
    if (iy !== null) {
      inflectionPoints.push({
        x: ix,
        y: iy,
        xLabel: formatViNumber(ix),
        yLabel: formatViNumber(iy),
      });
    }
  } else {
    // Check ddAst sign changes near center
    const fdd = (x: number) => evalAst(ddAst, x);
    if (poly && poly.length === 5) {
      for (let x = -6; x < 6; x += 0.1) {
        const v1 = fdd(x);
        const v2 = fdd(x + 0.1);
        if (Number.isFinite(v1) && Number.isFinite(v2) && v1 * v2 <= 0) {
          const rx = bisectRoot(fdd, x, x + 0.1);
          if (rx !== null) {
            const ry = evaluate(rx);
            if (ry !== null) {
              inflectionPoints.push({ x: rx, y: ry, xLabel: formatViNumber(rx), yLabel: formatViNumber(ry) });
            }
          }
        }
      }
    }
  }

  // 4. Construct Bảng Biến Thiên (SGK Structure)
  // Keep BBT clean: max 5 interior critical points / singularities
  const isPeriodicNote = isTrig && extrema.length > 0 ? 'Bảng biến thiên đại diện trên [-3,6; 3,6]' : undefined;

  const leftBoundary: BbtNode = domainMinEdge
    ? {
        x: domainMinEdge.x,
        xLabel: formatViNumber(domainMinEdge.x),
        kind: 'domain_edge',
        derivAtPoint: domainMinEdge.inclusive ? undefined : '||',
      }
    : isTrig
    ? { x: -3.6, xLabel: '-3,6', kind: 'domain_edge' }
    : { x: null, xLabel: '-∞', kind: 'neg_inf' };

  const rightBoundary: BbtNode = domainMaxEdge
    ? {
        x: domainMaxEdge.x,
        xLabel: formatViNumber(domainMaxEdge.x),
        kind: 'domain_edge',
        derivAtPoint: domainMaxEdge.inclusive ? undefined : '||',
      }
    : isTrig
    ? { x: 3.6, xLabel: '3,6', kind: 'domain_edge' }
    : { x: null, xLabel: '+∞', kind: 'pos_inf' };

  type InteriorEvent =
    | { x: number; kind: 'extremum'; ext: ExtremumInfo }
    | { x: number; kind: 'discont'; disc: DiscontinuityInfo };

  const interiorEvents: InteriorEvent[] = [
    ...extrema.slice(0, 5).map((ext): InteriorEvent => ({ x: ext.x, kind: 'extremum', ext })),
    ...discontinuities
      .filter((d) => (!domainMinEdge || d.x > domainMinEdge.x + 1e-3) && (!domainMaxEdge || d.x < domainMaxEdge.x - 1e-3))
      .slice(0, 3)
      .map((disc): InteriorEvent => ({ x: disc.x, kind: 'discont', disc })),
  ].sort((a, b) => a.x - b.x);

  const bbtNodes: BbtNode[] = [leftBoundary];
  for (const ev of interiorEvents) {
    if (ev.kind === 'extremum') {
      bbtNodes.push({
        x: ev.ext.x,
        xLabel: ev.ext.xLabel,
        kind: 'critical',
        derivAtPoint: '0',
        yTop: ev.ext.kind === 'max' ? ev.ext.yLabel : undefined,
        yBottom: ev.ext.kind === 'min' ? ev.ext.yLabel : undefined,
      });
    } else {
      const mapLim = (lim: 'inf+' | 'inf-' | 'finite', val?: number) =>
        lim === 'inf+' ? '+∞' : lim === 'inf-' ? '-∞' : val !== undefined ? formatViNumber(val) : '∅';
      bbtNodes.push({
        x: ev.disc.x,
        xLabel: ev.disc.xLabel,
        kind: 'asymptote',
        derivAtPoint: '||',
        yLeft: mapLim(ev.disc.leftLimit, ev.disc.leftFiniteVal),
        yRight: mapLim(ev.disc.rightLimit, ev.disc.rightFiniteVal),
      });
    }
  }
  bbtNodes.push(rightBoundary);

  // Determine sign and arrow direction on each interval between consecutive bbtNodes
  const bbtIntervals: BbtInterval[] = [];
  for (let i = 0; i < bbtNodes.length - 1; i++) {
    const leftN = bbtNodes[i];
    const rightN = bbtNodes[i + 1];
    let probeX: number;
    if (leftN.x === null && rightN.x === null) {
      probeX = 0;
    } else if (leftN.x === null && rightN.x !== null) {
      probeX = rightN.x - 1.5;
    } else if (leftN.x !== null && rightN.x === null) {
      probeX = leftN.x + 1.5;
    } else {
      probeX = 0.5 * ((leftN.x as number) + (rightN.x as number));
    }

    const dVal = evaluateDerivative(probeX);
    if (dVal === null || !Number.isFinite(dVal)) {
      bbtIntervals.push({ sign: 'undef', trend: 'undef', startPos: 'mid', endPos: 'mid' });
      continue;
    }
    const sign: '+' | '-' = dVal >= 0 ? '+' : '-';
    const trend: 'up' | 'down' = sign === '+' ? 'up' : 'down';
    bbtIntervals.push({
      sign,
      trend,
      startPos: trend === 'up' ? 'bottom' : 'top',
      endPos: trend === 'up' ? 'top' : 'bottom',
    });
  }

  // Assign y labels at boundary nodes (first and last)
  if (bbtNodes.length >= 2) {
    const firstInt = bbtIntervals[0];
    const lastInt = bbtIntervals[bbtIntervals.length - 1];

    if (leftBoundary.kind === 'neg_inf') {
      const leftLim = classifyInfinityLimit(evaluate, 'left');
      let lbl = leftLim.text;
      if (lbl === 'Không xác định' || lbl === '∅') {
        lbl = firstInt.trend === 'up' ? '-∞' : '+∞';
      }
      if (firstInt.startPos === 'bottom') leftBoundary.yBottom = lbl;
      else leftBoundary.yTop = lbl;
    } else if (leftBoundary.x !== null) {
      const lv = evaluate(leftBoundary.x + 1e-4);
      const lLim = classifyLimit(evaluate, leftBoundary.x, 1);
      const lbl = lLim.kind === 'inf+' ? '+∞' : lLim.kind === 'inf-' ? '-∞' : lv !== null ? formatViNumber(lv) : '∅';
      if (firstInt.startPos === 'bottom') leftBoundary.yBottom = lbl;
      else leftBoundary.yTop = lbl;
    }

    if (rightBoundary.kind === 'pos_inf') {
      const rightLim = classifyInfinityLimit(evaluate, 'right');
      let lbl = rightLim.text;
      if (lbl === 'Không xác định' || lbl === '∅') {
        lbl = lastInt.trend === 'up' ? '+∞' : '-∞';
      }
      if (lastInt.endPos === 'top') rightBoundary.yTop = lbl;
      else rightBoundary.yBottom = lbl;
    } else if (rightBoundary.x !== null) {
      const rv = evaluate(rightBoundary.x - 1e-4);
      const rLim = classifyLimit(evaluate, rightBoundary.x, -1);
      const lbl = rLim.kind === 'inf+' ? '+∞' : rLim.kind === 'inf-' ? '-∞' : rv !== null ? formatViNumber(rv) : '∅';
      if (lastInt.endPos === 'top') rightBoundary.yTop = lbl;
      else rightBoundary.yBottom = lbl;
    }
  }

  return {
    valid: true,
    rawExpr,
    normalizedExpr,
    derivativeText,
    domainText,
    domainRestrictedHint,
    isPeriodicNote,
    extrema,
    inflectionPoints,
    asymptotes: {
      vertical: verticalAsymptotes,
      horizontal: horizontalAsymptotes,
      oblique: obliqueAsymptotes,
    },
    bbtNodes,
    bbtIntervals,
    discontinuities,
    evaluate,
    evaluateDerivative,
  };
}
