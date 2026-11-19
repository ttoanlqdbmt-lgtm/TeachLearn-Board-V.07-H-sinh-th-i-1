export interface NormalizedSolutionStep {
  label: string;
  body: string;
}

export interface RawSolutionStepInput {
  title?: string;
  stepTitle?: string;
  leadIn?: string;
  math?: string;
  mathDetail?: string;
  content?: string;
}

// Matches one or more leading MCQ option prefixes like "A.", "A:", "B.", "**C.**"
// Carefully avoids matching expressions like "AB = 3", "A(0;2)", or "$A$".
const MCQ_OPTION_PREFIX_RE = /^(?:\s*(?:\*{1,2})?[A-Da-d]\s*[.:]\s*(?:\*{1,2})?\s*)+/;

// Matches one or more leading step labels like "Bước 1", "Bước 1:", "Bước 1.", "**Bước 1:**", "Step 1:"
const STEP_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*\d+\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;
const IDEA_PREFIX_RE = /^(?:\s*(?:\*{1,2})?Ý\s*\d+\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;
const CONCLUSION_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?Kết\s*luận\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;

const GENERIC_STEP_TITLE_RE =
  /^(?:Lời giải chi tiết|Giải chi tiết|Phân tích và giải chi tiết|Tính toán|Thiết lập và tính toán)\s*[:.]?$/i;

/**
 * Checks whether an option string already starts with A./B./C./D. or A:/B:/C:/D:.
 */
export function hasMcqOptionPrefix(optionText: string): boolean {
  if (!optionText) return false;
  return MCQ_OPTION_PREFIX_RE.test(optionText);
}

/**
 * Removes any duplicated leading A./B./C./D. or A:/B:/C:/D: prefix from an MCQ option.
 */
export function stripMcqOptionPrefix(optionText: string): string {
  if (!optionText) return '';
  const trimmed = optionText.trim();
  const stripped = trimmed.replace(MCQ_OPTION_PREFIX_RE, '').trim();
  return stripped || trimmed;
}

/**
 * Normalizes an MCQ option so rendering always displays exactly ONE clean label (A., B., C., D.).
 */
export function formatMcqOptionDisplay(
  optionText: string,
  index: number
): { letter: string; text: string } {
  const letter = ['A', 'B', 'C', 'D'][index] ?? String.fromCharCode(65 + index);
  return {
    letter,
    text: stripMcqOptionPrefix(optionText),
  };
}

/**
 * Cleans every line of a solution text segment by stripping redundant leading step titles
 * (e.g., "Bước 1", "Bước 1:", "Bước 2", "Bước 2:") and removing empty title-only lines.
 */
export function stripLeadingStepHeaders(
  text: string,
  kind: 'step' | 'idea' | 'conclusion' = 'step'
): string {
  if (!text) return '';
  const normalizedLines = text
    .replace(/\r\n/g, '\n')
    .replace(/\\n(?![a-zA-Z])/g, '\n')
    .split('\n')
    .map((rawLine) => {
      let line = rawLine.trim();
      if (!line) return '';
      line = line.replace(STEP_PREFIX_RE, '').trim();
      if (kind === 'idea') {
        line = line.replace(IDEA_PREFIX_RE, '').trim();
      } else if (kind === 'conclusion') {
        line = line.replace(CONCLUSION_PREFIX_RE, '').trim();
      }
      return line;
    })
    .filter(Boolean);

  return normalizedLines.join('\n').trim();
}

function normalizeForCompare(str: string): string {
  return str
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[\s.:;,\-–—]+/g, ' ')
    .trim();
}

function joinStepSegments(segments: string[]): string {
  let body = '';
  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    if (!body) {
      body = seg;
      continue;
    }
    const trimmedBody = body.trimEnd();
    if (/[.:;!?]$/.test(trimmedBody)) {
      body = `${trimmedBody} ${seg}`;
    } else {
      body = `${trimmedBody}. ${seg}`;
    }
  }
  return body;
}

/**
 * Normalizes a single solution step (object or string) into a single inline
 * `{ label, body }` pair with zero duplicated "Bước 1" / "Bước 2" prefixes.
 */
export function normalizeSolutionStep(
  step: RawSolutionStepInput | string,
  index: number
): NormalizedSolutionStep {
  if (typeof step === 'string') {
    const raw = step.trim();
    const stepMatch = raw.match(/^\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*(\d+)/i);
    const ideaMatch = raw.match(/^\s*(?:\*{1,2})?Ý\s*(\d+)/i);
    const conclMatch = raw.match(/^\s*(?:\*{1,2})?Kết\s*luận\b/i);

    let kind: 'step' | 'idea' | 'conclusion' = 'step';
    let label = `Bước ${index + 1}:`;
    if (ideaMatch && !stepMatch) {
      kind = 'idea';
      label = `Ý ${ideaMatch[1]}:`;
    } else if (conclMatch && !stepMatch) {
      kind = 'conclusion';
      label = 'Kết luận:';
    } else if (stepMatch) {
      label = `Bước ${stepMatch[1]}:`;
    }

    const body = stripLeadingStepHeaders(raw, kind);
    return { label, body };
  }

  const rawTitle = (step.title ?? step.stepTitle ?? '').trim();
  const rawLeadIn = (step.leadIn ?? '').trim();
  const rawMath = (step.math ?? step.mathDetail ?? step.content ?? '').trim();

  const probe = rawTitle || rawLeadIn || rawMath;
  const ideaMatch = rawTitle.match(/^\s*(?:\*{1,2})?Ý\s*(\d+)/i);
  const conclOnlyMatch = rawTitle.match(/^\s*(?:\*{1,2})?Kết\s*luận\s*[:.]?\s*$/i);
  const stepMatch = probe.match(/^\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*(\d+)/i);

  let kind: 'step' | 'idea' | 'conclusion' = 'step';
  let label = `Bước ${index + 1}:`;

  if (ideaMatch) {
    kind = 'idea';
    label = `Ý ${ideaMatch[1]}:`;
  } else if (conclOnlyMatch) {
    kind = 'conclusion';
    label = 'Kết luận:';
  } else if (stepMatch) {
    label = `Bước ${stepMatch[1]}:`;
  }

  const cleanTitle = stripLeadingStepHeaders(rawTitle, kind);
  const cleanLeadIn = stripLeadingStepHeaders(rawLeadIn, kind);
  const cleanMath = stripLeadingStepHeaders(rawMath, kind);

  const hasDetail = Boolean(cleanLeadIn || cleanMath);
  const segments: string[] = [];

  if (cleanTitle && !(hasDetail && GENERIC_STEP_TITLE_RE.test(cleanTitle))) {
    segments.push(cleanTitle);
  }

  if (cleanLeadIn) {
    const normLead = normalizeForCompare(cleanLeadIn);
    const normLast = segments.length > 0 ? normalizeForCompare(segments[segments.length - 1]) : '';
    const normMath = normalizeForCompare(cleanMath);
    if (
      normLead &&
      normLead !== normLast &&
      !(normMath && (normMath === normLead || normMath.startsWith(`${normLead} `)))
    ) {
      segments.push(cleanLeadIn);
    }
  }

  if (cleanMath) {
    const normMath = normalizeForCompare(cleanMath);
    const normLast = segments.length > 0 ? normalizeForCompare(segments[segments.length - 1]) : '';
    if (normMath && normMath !== normLast) {
      if (segments.length === 1 && normLast && normMath.startsWith(`${normLast} `)) {
        segments[0] = cleanMath;
      } else {
        segments.push(cleanMath);
      }
    }
  }

  return {
    label,
    body: joinStepSegments(segments),
  };
}

/**
 * Splits a multi-step raw string (only when distinct step numbers appear, e.g., Bước 1... Bước 2...)
 * and returns normalized `{ label, body }` items with zero duplicated headers.
 */
export function normalizeRawSolutionStringToSteps(rawText: string): NormalizedSolutionStep[] {
  if (!rawText || !rawText.trim()) return [];
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\\n(?![a-zA-Z])/g, '\n')
    .replace(/\s+(?=(?:\*{1,2})?(?:Bước|Buoc|Step)\s+\d+\s*[:.\-–—])/gi, '\n')
    .trim();

  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Group lines by distinct step numbers so repeated "Bước 1\nBước 1: ..." stays 1 step
  const groups: { stepNum: string | null; lines: string[] }[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*(\d+)\b/i);
    if (m) {
      const num = m[1];
      const prev = groups[groups.length - 1];
      if (prev && prev.stepNum === num) {
        prev.lines.push(line);
      } else {
        groups.push({ stepNum: num, lines: [line] });
      }
    } else if (groups.length > 0) {
      groups[groups.length - 1].lines.push(line);
    } else {
      groups.push({ stepNum: null, lines: [line] });
    }
  }

  const results: NormalizedSolutionStep[] = [];
  for (let i = 0; i < groups.length; i++) {
    const grp = groups[i];
    const normalizedStep = normalizeSolutionStep(grp.lines.join('\n'), results.length);
    if (normalizedStep.body) {
      results.push(normalizedStep);
    }
  }
  return results;
}

/**
 * Normalizes an entire solutionSteps array (from .json bank, lessons, or Gemini AI)
 * into clean, deduplicated single-label horizontal steps.
 */
export function normalizeSolutionSteps(
  steps?: Array<RawSolutionStepInput | string> | null
): NormalizedSolutionStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];

  // Handle single blob item that actually embeds Bước 1 ... Bước 2 ...
  if (steps.length === 1) {
    const only = steps[0];
    const combinedRaw =
      typeof only === 'string'
        ? only
        : [only.title ?? only.stepTitle ?? '', only.leadIn ?? '', only.math ?? only.mathDetail ?? only.content ?? '']
            .filter(Boolean)
            .join('\n');
    const stepNums = Array.from(
      combinedRaw.matchAll(/(?:^|\n)\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*(\d+)\b/gi),
      (m) => m[1]
    );
    const distinctNums = new Set(stepNums);
    if (distinctNums.size >= 2) {
      return normalizeRawSolutionStringToSteps(combinedRaw);
    }
  }

  const output: NormalizedSolutionStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const item = steps[i];
    if (!item) continue;
    const normalized = normalizeSolutionStep(item, output.length);
    if (normalized.body) {
      output.push(normalized);
    }
  }

  return output;
}

// ============================================================================
// KATEX SYNTAX NORMALIZATION, EXAMPLE/CONCLUSION PREFIX CLEANING & SAFE JSON
// ============================================================================

const EXAMPLE_TITLE_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Ví\s*dụ|Vi\s*du|VD)\s*\d*\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;

/**
 * Strips duplicated leading prefixes like "Ví dụ 1:", "Ví dụ 1.", "VD 2:" from an example title.
 */
export function stripExampleTitlePrefix(title: string): string {
  if (!title) return '';
  const trimmed = title.trim();
  const stripped = trimmed.replace(EXAMPLE_TITLE_PREFIX_RE, '').trim();
  return stripped || trimmed;
}

/**
 * Formats an example title cleanly as "Ví dụ N: <clean title>" without duplicate "Ví dụ 1:" prefixes.
 */
export function formatExampleTitle(title: string, index: number): string {
  const clean = stripExampleTitlePrefix(title);
  if (!clean) return `Ví dụ ${index + 1}`;
  return `Ví dụ ${index + 1}: ${clean}`;
}

const ANSWER_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Đáp\s*số(?:\s*chuẩn)?|Đáp\s*án(?:\s*đúng)?|Trả\s*lời|Kết\s*luận|Kết\s*quả(?:\s*chuẩn)?)\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;

const QUESTION_CODE_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Bài\s*tập|Câu|Ví\s*dụ|Vi\s*du|VD)\s*\d+\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;

/**
 * Strips duplicated leading "Kết luận:" / "Đáp số:" / "Trả lời:" prefix from an answer/conclusion line.
 */
export function stripConclusionPrefix(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const stripped = trimmed.replace(CONCLUSION_PREFIX_RE, '').trim();
  return stripped || trimmed;
}

/**
 * Strips duplicated leading "Đáp số:", "Đáp án đúng:", "Trả lời:", "Kết luận:" prefixes.
 */
export function stripAnswerPrefix(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const stripped = trimmed.replace(ANSWER_PREFIX_RE, '').trim();
  return stripped || trimmed;
}

/**
 * Removes duplicated leading "Ví dụ 1:" / "Bài tập 1:" or repeated card heading from the first line
 * of a question/example stem when the header bar already renders that title.
 */
export function stripDuplicateHeadingFromStem(stem: string, heading?: string): string {
  if (!stem) return '';
  let out = stem.trim();

  if (heading && heading.trim()) {
    const cleanHeading = heading.trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
    const headingCore = stripExampleTitlePrefix(cleanHeading);
    const candidates = [cleanHeading, headingCore].filter((c) => c.length >= 4);
    for (const cand of candidates) {
      const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^(?:\\*{1,2})?${escaped}(?:\\*{1,2})?\\s*[:.\\-–—]?\\s*`, 'i');
      if (re.test(out)) {
        const next = out.replace(re, '').trim();
        if (next) {
          out = next;
          break;
        }
      }
    }
  }

  // If heading already indicates Ví dụ / Bài tập, remove redundant leading "Ví dụ 1:" / "Bài tập 1:" in stem
  if (heading && /^(?:Ví\s*dụ|Vi\s*du|VD|Bài\s*tập)\s*\d*/i.test(heading.trim())) {
    const stripped = out.replace(QUESTION_CODE_PREFIX_RE, '').trim();
    if (stripped) out = stripped;
  }

  return out;
}

/**
 * Normalizes double-escaped LaTeX commands (`\\frac` -> `\frac`, `\\overrightarrow` -> `\overrightarrow`,
 * `\\sqrt` -> `\sqrt`, `\\left` -> `\left`, `\\right` -> `\right`) while preserving valid LaTeX row breaks
 * (`\\ ` or `\\[4pt]` or `\\\cmd` inside aligned/cases/matrix environments).
 */
export function normalizeDoubleEscapedLatex(input: string): string {
  if (!input) return '';
  let out = input;
  // Convert double-escaped commands (exact 2 backslashes before 2+ letter LaTeX command or \{ \} \, \; \! \| \( \))
  out = out.replace(/(?<!\\)\\\\(?=(?:[a-zA-Z]{2,}|[{}(),;!|]))/g, '\\');
  // Convert double-escaped \[ ... \] unless it is a row spacing like \\[4pt]
  out = out.replace(/(?<!\\)\\\\\[(?![\d.-]+\s*(?:pt|em|ex|mm|cm|px)\])/g, '\\[');
  out = out.replace(/(?<!\\)\\\\\]/g, '\\]');
  return out;
}

const VIETNAMESE_PROSE_RE =
  /(?:^|\s)([a-zA-Z]*[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ][a-zA-ZàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]*)/;

const MATH_SIGNAL_RE = /(?:\\[a-zA-Z]+|[=<>^_+\-*/]|[0-9]|[a-zA-Z]\s*\()/;

/**
 * Auto-heals odd / unmatched `$` delimiters line-by-line (while keeping `$$...$$` display blocks
 * and escaped `\$` untouched) so a stray `$` never breaks rendering of the rest of the paragraph.
 */
export function balanceInlineDollarDelimiters(input: string): string {
  if (!input || !input.includes('$')) return input;

  const blockHolders: string[] = [];
  const escapedHolders: string[] = [];

  // 1. Temporarily protect escaped \$
  let work = input.replace(/\\\$/g, () => {
    const idx = escapedHolders.length;
    escapedHolders.push('\\$');
    return `\uE000ESC${idx}\uE000`;
  });

  // 2. Balance unmatched $$ across the text first
  const ddMatches = work.match(/\$\$/g);
  if (ddMatches && ddMatches.length % 2 === 1) {
    work = `${work}$$`;
  }

  // 3. Protect paired $$...$$ blocks
  work = work.replace(/\$\$([\s\S]*?)\$\$/g, (full) => {
    const idx = blockHolders.length;
    blockHolders.push(full);
    return `\uE000BLK${idx}\uE000`;
  });

  // 4. Balance single $ on each line independently so an error on line 1 never leaks to line 2
  const lines = work.split('\n').map((line) => {
    const dollarPositions: number[] = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '$') dollarPositions.push(i);
    }
    if (dollarPositions.length % 2 === 0) return line;

    const lastIdx = dollarPositions[dollarPositions.length - 1];
    const afterLast = line.slice(lastIdx + 1);

    // Case A: Trailing lone $ with only optional punctuation after it
    if (/^[.,;:!?)\s]*$/.test(afterLast)) {
      return line.slice(0, lastIdx) + afterLast;
    }

    // Case B: Content after last $ has math signals -> close $ before trailing Vietnamese prose or end punctuation
    if (MATH_SIGNAL_RE.test(afterLast)) {
      // Find first Vietnamese prose word outside \text{...}
      const withoutTextCmd = afterLast.replace(/\\text\{[^}]*\}/g, (m) => ' '.repeat(m.length));
      const vnMatch = VIETNAMESE_PROSE_RE.exec(withoutTextCmd);
      if (vnMatch && vnMatch.index > 0) {
        let cut = vnMatch.index;
        while (cut > 0 && /\s/.test(afterLast[cut - 1])) cut -= 1;
        return `${line.slice(0, lastIdx + 1)}${afterLast.slice(0, cut)}$${afterLast.slice(cut)}`;
      }
      // Close before trailing sentence punctuation at end of line
      const punctMatch = afterLast.match(/^(.*?)([.,;:!?]+\s*)$/);
      if (punctMatch && punctMatch[1].trim()) {
        return `${line.slice(0, lastIdx + 1)}${punctMatch[1].trimEnd()}$${punctMatch[2]}`;
      }
      return `${line.trimEnd()}$`;
    }

    // Case C: Stray $ before pure Vietnamese text -> remove the stray $
    return line.slice(0, lastIdx) + afterLast;
  });

  let restored = lines.join('\n');
  restored = restored.replace(/\uE000BLK(\d+)\uE000/g, (_m, idxStr: string) => blockHolders[Number(idxStr)] ?? '');
  restored = restored.replace(/\uE000ESC(\d+)\uE000/g, (_m, idxStr: string) => escapedHolders[Number(idxStr)] ?? '\\$');
  return restored;
}

/**
 * Universal KaTeX Auto-Sanitizer:
 * 1. Repairs stray control chars (`\f`, `\b`) caused by single-backslash JSON escapes.
 * 2. Normalizes double-escaped LaTeX backslashes (`\\frac` -> `\frac`, `\\overrightarrow` -> `\overrightarrow`).
 * 3. Converts legacy `\[...\]` -> `$$...$$` and `\(...\)` -> `$...$`.
 * 4. Converts KaTeX-incompatible environments (`align*`, `eqnarray*`, `equation*`, `gather*`)
 *    and normalizes `\dfrac` / `\tfrac` -> `\frac`, `\mbox` -> `\text`, `\bm` -> `\boldsymbol`.
 * 5. Balances odd / unmatched `$` delimiters so broken AI math never corrupts surrounding prose.
 */
export function sanitizeKatexMath(input: string): string {
  if (!input) return '';
  let out = input
    // Repair accidental control chars from unescaped JSON \f (form-feed) or \b (backspace)
    .replace(/\u000c/g, '\\f')
    .replace(/\u0008/g, '\\b')
    .replace(/\r\n/g, '\n');

  // Normalize double-escaped LaTeX commands from JSON/AI (\\frac -> \frac, \\overrightarrow -> \overrightarrow)
  out = normalizeDoubleEscapedLatex(out);

  // Convert \[ ... \] -> $$ ... $$ and \( ... \) -> $ ... $
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`);
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`);

  // Convert \begin{align*}...\end{align*} / \begin{align}...\end{align} / \begin{eqnarray*}...\end{eqnarray*}
  out = out.replace(
    /\\begin\{(?:align\*?|eqnarray\*?|flalign\*?|multline\*?)\}([\s\S]*?)\\end\{(?:align\*?|eqnarray\*?|flalign\*?|multline\*?)\}/gi,
    (_m, inner: string) => {
      const cleanedInner = inner
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\nonumber\b/g, '')
        .replace(/\\notag\b/g, '')
        .trim();
      return `$$\\begin{aligned}${cleanedInner}\\end{aligned}$$`;
    }
  );

  // Convert \begin{equation*}...\end{equation*} -> $$...$$
  out = out.replace(
    /\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/gi,
    (_m, inner: string) => {
      const cleanedInner = inner
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\nonumber\b/g, '')
        .replace(/\\notag\b/g, '')
        .trim();
      return `$$${cleanedInner}$$`;
    }
  );

  // Convert \begin{gather*}...\end{gather*} -> $$\begin{gathered}...\end{gathered}$$
  out = out.replace(
    /\\begin\{gather\*?\}([\s\S]*?)\\end\{gather\*?\}/gi,
    (_m, inner: string) => `$$\\begin{gathered}${inner.trim()}\\end{gathered}$$`
  );

  // Normalize \dfrac / \tfrac -> \frac and other LaTeX macros for 100% KaTeX compatibility
  out = out
    .replace(/\\(?:d|t)frac(?![a-zA-Z])/g, '\\frac')
    .replace(/\\mbox\{/g, '\\text{')
    .replace(/\\mathbbm\{/g, '\\mathbb{')
    .replace(/\\bm\{/g, '\\boldsymbol{')
    .replace(/\\hdots\b/g, '\\dots')
    .replace(/\\operatorname\*\{/g, '\\operatorname{')
    .replace(/\\nonumber\b/g, '')
    .replace(/\\notag\b/g, '');

  // Avoid accidental nested $$$$ when an environment was already wrapped in $$...$$
  out = out.replace(/\${3,}/g, () => '$$');

  // Heal any odd/unmatched $ delimiters so text after an unclosed formula never breaks
  out = balanceInlineDollarDelimiters(out);

  return out.trim();
}

const LATEX_ESCAPE_COLLISION_RE =
  /^(?:frac\b|forall\b|flat\b|fbox\b|tan\b|tanh\b|text\b|textbf\b|textit\b|textrm\b|texttt\b|textsf\b|tfrac\b|mathrm\b|times\b|to\b|triangle\b|theta\b|tau\b|tilde\b|top\b|begin\b|beta\b|bar\b|big\b|Big\b|bigg\b|Bigg\b|binom\b|boxed\b|bullet\b|bot\b|bf\b|bm\b|bold\b|boldsymbol\b|right\b|rightarrow\b|Rightarrow\b|rho\b|rangle\b|rceil\b|rfloor\b|rbrace\b|rbrack\b|rm\b|neq\b|ne\b|not\b|notin\b|nleq\b|ngeq\b|nabla\b|nu\b|ni\b|natural\b)/;

/**
 * Safely escapes unescaped LaTeX backslashes (`\`) inside JSON string literals
 * BEFORE calling `JSON.parse()`, preventing JSON syntax crashes on math formulas.
 */
export function escapeRawJsonMathBackslashes(rawJson: string): string {
  const cleaned = rawJson
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let out = '';
  let inString = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
      }
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch === '\\') {
      const next = cleaned[i + 1];
      if (next === undefined) {
        out += '\\\\';
        continue;
      }
      if (next === '\\' || next === '"' || next === '/') {
        out += ch + next;
        i += 1;
        continue;
      }
      const rest = cleaned.slice(i + 1, i + 20);
      if (LATEX_ESCAPE_COLLISION_RE.test(rest)) {
        out += '\\\\' + next;
        i += 1;
        continue;
      }
      if (next === 'b' || next === 'f' || next === 'n' || next === 'r' || next === 't') {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(cleaned.slice(i + 2, i + 6))) {
        out += ch + next;
        i += 1;
        continue;
      }
      // Invalid JSON escape (e.g., \d in \dfrac, \s in \sin, \l in \left, \{, \}, \,) -> escape it!
      out += '\\\\' + next;
      i += 1;
      continue;
    }

    // Escape raw control characters inside JSON string literals so JSON.parse never crashes
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    if (ch === '\u000c') {
      out += '\\\\f';
      continue;
    }
    if (ch === '\u0008') {
      out += '\\\\b';
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }

    out += ch;
  }

  return out;
}

export function safeParseJsonWithMathEscape<T = unknown>(rawText: string): T {
  const escaped = escapeRawJsonMathBackslashes(rawText);
  return JSON.parse(escaped) as T;
}

