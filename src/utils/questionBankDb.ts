import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  BankPartType,
  BankQuestion,
  DiagramKind,
  ExamPaper,
  Part1Question,
  Part2Question,
  Part2Statement,
  Part3Question,
  SolutionStep,
} from '../types/eduplan';
import { MOCK_EXAM_0107 } from '../data/mockExam0107';
import { KNTT_MATH_CURRICULUM } from '../data/curriculumKNTT';
import {
  compressImageToWebpOrJpegUnder100KB,
  incrementZeroCostStat,
} from './cloudCacheAndCompression';
import {
  buildStructuredTableFromFlatRows,
  formatMathCellForCanvas,
  parseWordTableElement,
  renderStructuredTableToImageUnder100KB,
  renderStructuredTableViaCanvasSync,
} from './tableImageRenderer';

const DB_NAME = 'eduplan_question_bank_db';
const DB_VERSION = 1;
const STORE_NAME = 'questions';
const TABLE_EXPORT_SETTINGS_KEY = 'eduplan_bank_table_export_settings_v2';

export type BankTableFormatMode =
  | 'keep_native'
  | 'markdown'
  | 'image_png'
  | 'auto_complex_to_image';

export type BankExportTableStyle =
  | 'native_word_table'
  | 'embedded_png_image'
  | 'markdown_text';

export interface BankTableExportSettings {
  tableFormatMode: BankTableFormatMode;
  exportDocxTableStyle: BankExportTableStyle;
  imageDpiScale: 2 | 3;
  preserveMathInCells: boolean;
}

export const DEFAULT_BANK_TABLE_EXPORT_SETTINGS: BankTableExportSettings = {
  tableFormatMode: 'image_png',
  exportDocxTableStyle: 'embedded_png_image',
  imageDpiScale: 2,
  preserveMathInCells: true,
};

export function loadBankTableExportSettings(): BankTableExportSettings {
  try {
    const raw = localStorage.getItem(TABLE_EXPORT_SETTINGS_KEY);
    if (!raw) return DEFAULT_BANK_TABLE_EXPORT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      tableFormatMode: parsed.tableFormatMode || DEFAULT_BANK_TABLE_EXPORT_SETTINGS.tableFormatMode,
      exportDocxTableStyle:
        parsed.exportDocxTableStyle || DEFAULT_BANK_TABLE_EXPORT_SETTINGS.exportDocxTableStyle,
      imageDpiScale: parsed.imageDpiScale === 3 ? 3 : 2,
      preserveMathInCells:
        typeof parsed.preserveMathInCells === 'boolean'
          ? parsed.preserveMathInCells
          : DEFAULT_BANK_TABLE_EXPORT_SETTINGS.preserveMathInCells,
    };
  } catch {
    return DEFAULT_BANK_TABLE_EXPORT_SETTINGS;
  }
}

export function saveBankTableExportSettings(settings: BankTableExportSettings): void {
  try {
    localStorage.setItem(TABLE_EXPORT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export interface KNTTCatalogLesson {
  code: string; // e.g. 'B4'
  title: string; // e.g. 'Bài 4. Phương trình lượng giác cơ bản'
  rawTitle: string;
}

export interface KNTTCatalogChapter {
  grade: '10' | '11' | '12';
  code: string; // e.g. 'C1'
  title: string; // e.g. 'Chương 1. Hàm số lượng giác và phương trình lượng giác'
  lessons: KNTTCatalogLesson[];
}

function formatLessonTitle(raw: string): string {
  return raw.replace(/^(Bài\s+\d+(?:–\d+)?)\s*:\s*/i, '$1. ');
}

function formatChapterTitle(raw: string, code: string): string {
  const num = code.replace(/^C/i, '');
  const cleaned = raw.replace(/^Chương\s+[IVXLC0-9]+\s*:\s*/i, '').trim();
  return `Chương ${num}. ${cleaned}`;
}

export const KNTT_CATALOG_CHAPTERS: KNTTCatalogChapter[] = KNTT_MATH_CURRICULUM.map((ch) => {
  const codeMatch = ch.id.match(/-(c\d+)$/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : 'C1';
  const lessons: KNTTCatalogLesson[] = ch.lessons.map((lRaw, idx) => {
    const bMatch = lRaw.match(/^Bài\s+(\d+)/i);
    const bCode = bMatch ? `B${bMatch[1]}` : `B${idx + 1}`;
    return {
      code: bCode,
      title: formatLessonTitle(lRaw),
      rawTitle: lRaw,
    };
  });
  return {
    grade: ch.grade,
    code,
    title: formatChapterTitle(ch.title, code),
    lessons,
  };
});

const knttMetaCache = new Map<string, { chapterTitle: string; lessonTitle: string }>();

export function lookupKNTTMeta(
  grade: '10' | '11' | '12',
  chapterCode: string,
  lessonCode: string
): { chapterTitle: string; lessonTitle: string } {
  const chCode = (chapterCode || 'C1').toUpperCase();
  const lCode = (lessonCode || 'B1').toUpperCase();
  const cacheKey = `${grade}:${chCode}:${lCode}`;
  const cached = knttMetaCache.get(cacheKey);
  if (cached) return cached;

  const ch = KNTT_CATALOG_CHAPTERS.find((c) => c.grade === grade && c.code === chCode);
  const chNum = chCode.replace(/^C/i, '');
  const lNum = lCode.replace(/^B/i, '');
  let result: { chapterTitle: string; lessonTitle: string };
  if (!ch) {
    result = {
      chapterTitle: `Chương ${chNum}`,
      lessonTitle: `Bài ${lNum}. Chuyên đề Toán ${grade} (SGK KNTT)`,
    };
  } else {
    const lesson = ch.lessons.find((l) => l.code === lCode);
    result = {
      chapterTitle: ch.title,
      lessonTitle: lesson ? lesson.title : `Bài ${lNum}. ${ch.title.replace(/^Chương\s+\d+\.\s*/i, '')}`,
    };
  }
  knttMetaCache.set(cacheKey, result);
  return result;
}

let dbInstancePromise: Promise<IDBDatabase> | null = null;
let cachedBankItems: BankQuestion[] | null = null;
let pendingLoadPromise: Promise<BankQuestion[]> | null = null;

const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function openBankDb(): Promise<IDBDatabase> {
  if (dbInstancePromise) return dbInstancePromise;
  dbInstancePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbInstancePromise = null;
      reject(new Error('IndexedDB không khả dụng trong môi trường này.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('grade', 'grade', { unique: false });
        store.createIndex('partType', 'partType', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbInstancePromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbInstancePromise = null;
      reject(req.error || new Error('Không mở được Kho IndexedDB.'));
    };
  });
  return dbInstancePromise;
}

export function normalizeSignature(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/\\(?:d|t)?frac/g, 'frac')
    .replace(/\\(?:left|right|limits|displaystyle|textstyle)\b/g, '')
    .replace(/\\mathbb\{([a-z])\}/g, '$1')
    .replace(/\\(?:overrightarrow|vec)\b/g, 'vec')
    .replace(/\\(?:widehat|hat)\b/g, 'hat')
    .replace(/\\(?:overline|bar)\b/g, 'bar')
    .replace(/\\(?:cdot|times)/g, 'mul')
    .replace(/\\(?:le|leq)/g, 'le')
    .replace(/\\(?:ge|geq)/g, 'ge')
    .replace(/\\(?:ne|neq)/g, 'ne')
    .replace(/[\s$\\{}()[\].,;:!?"'“”‘’+-]+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function buildQuestionFingerprint(item: {
  partType?: string;
  stem: string;
  options?: string[];
  statements?: { text: string }[];
  tableData?: string[][];
}): string {
  const part = item.partType || 'part1';
  const cleanStem = (item.stem || '')
    .replace(/^Câu\s+\d+\s*(\[[^\]]+\])?\s*[.:]?\s*/i, '')
    .trim();
  const stemSig = normalizeSignature(cleanStem);
  if (!stemSig) return '';

  const extras: string[] = [];
  if (item.tableData && item.tableData.length > 0) {
    const tblSig = item.tableData.map((r) => r.map(normalizeSignature).join(',')).join(';');
    if (tblSig) extras.push(`T:${tblSig}`);
  }
  if (part === 'part1' && item.options && item.options.length > 0) {
    const optSigs = item.options
      .map((o) => normalizeSignature(o))
      .filter((s) => s && s !== 'phươngána' && s !== 'phươngánb' && s !== 'phươngánc' && s !== 'phươngánd')
      .sort();
    if (optSigs.length > 0) {
      extras.push(`O:${optSigs.join('|')}`);
    }
  } else if (part === 'part2' && item.statements && item.statements.length > 0) {
    const stSigs = item.statements
      .map((s) => normalizeSignature(s.text || ''))
      .filter(Boolean);
    if (stSigs.length > 0) {
      extras.push(`S:${stSigs.join('|')}`);
    }
  }

  return extras.length > 0 ? `${part}:${stemSig}::${extras.join('::')}` : `${part}:${stemSig}`;
}

export function findDuplicateQuestionIds(items: BankQuestion[]): {
  duplicateIds: Set<string>;
  allInvolvedIds: Set<string>;
  duplicateRankById: Map<string, { groupIndex: number; occurrence: number; totalInGroup: number }>;
} {
  const groupIdsBySig = new Map<string, string[]>();

  for (let i = 0; i < items.length; i++) {
    const q = items[i];
    const sig = buildQuestionFingerprint(q);
    if (!sig) continue;
    const existingList = groupIdsBySig.get(sig);
    if (existingList) {
      existingList.push(q.id);
    } else {
      groupIdsBySig.set(sig, [q.id]);
    }
  }

  const duplicateIds = new Set<string>();
  const allInvolvedIds = new Set<string>();
  const duplicateRankById = new Map<string, { groupIndex: number; occurrence: number; totalInGroup: number }>();

  let groupCounter = 0;
  groupIdsBySig.forEach((idList) => {
    if (idList.length > 1) {
      groupCounter++;
      const total = idList.length;
      idList.forEach((id, idx) => {
        allInvolvedIds.add(id);
        if (idx > 0) {
          duplicateIds.add(id);
        }
        duplicateRankById.set(id, {
          groupIndex: groupCounter,
          occurrence: idx + 1,
          totalInGroup: total,
        });
      });
    }
  });

  return { duplicateIds, allInvolvedIds, duplicateRankById };
}

export function parseTagMeta(tag: string): {
  grade: '10' | '11' | '12';
  chapter: string;
  lesson: string;
  level: 'NB' | 'TH' | 'VD' | 'VDC';
} {
  const m = tag.match(/\[(10|11|12)-(C\d+)-(B\d+)-(NB|TH|VD|VDC)\]/i);
  if (m) {
    return {
      grade: m[1] as '10' | '11' | '12',
      chapter: m[2].toUpperCase(),
      lesson: m[3].toUpperCase(),
      level: m[4].toUpperCase() as 'NB' | 'TH' | 'VD' | 'VDC',
    };
  }
  return { grade: '12', chapter: 'C1', lesson: 'B1', level: 'TH' };
}

export function examPaperToBankQuestions(exam: ExamPaper, source = 'Đề chuẩn 0107'): BankQuestion[] {
  const now = new Date().toISOString();
  const list: BankQuestion[] = [];

  exam.part1.forEach((q) => {
    const meta = parseTagMeta(q.tag);
    list.push({
      id: `bank-${q.id}-${normalizeSignature(q.stem).slice(0, 18)}`,
      partType: 'part1',
      tag: q.tag,
      ...meta,
      stem: q.stem,
      options: q.options,
      correctIndex: q.correctIndex,
      diagram: q.diagram,
      image: q.image || q.imageUrl,
      solutionImage: q.solutionImage,
      tableData: q.tableData,
      solutionSteps: q.solutionSteps,
      source,
      updatedAt: now,
    });
  });

  exam.part2.forEach((q) => {
    const meta = parseTagMeta(q.tag);
    list.push({
      id: `bank-${q.id}-${normalizeSignature(q.stem).slice(0, 18)}`,
      partType: 'part2',
      tag: q.tag,
      ...meta,
      stem: q.stem,
      statements: q.statements,
      diagram: q.diagram,
      image: q.image || q.imageUrl,
      solutionImage: q.solutionImage,
      tableData: q.tableData,
      solutionSteps: q.solutionSteps,
      source,
      updatedAt: now,
    });
  });

  exam.part3.forEach((q) => {
    const meta = parseTagMeta(q.tag);
    list.push({
      id: `bank-${q.id}-${normalizeSignature(q.stem).slice(0, 18)}`,
      partType: 'part3',
      tag: q.tag,
      ...meta,
      stem: q.stem,
      answer: q.answer,
      diagram: q.diagram,
      image: q.image || q.imageUrl,
      solutionImage: q.solutionImage,
      tableData: q.tableData,
      solutionSteps: q.solutionSteps,
      source,
      updatedAt: now,
    });
  });

  return list;
}

function isLikelyFallbackC1B1Tag(item: BankQuestion): boolean {
  if (!item.tag || item.chapter !== 'C1' || item.lesson !== 'B1' || item.grade !== '12') {
    return false;
  }
  const lower = `${item.stem} ${(item.options || []).join(' ')}`.toLowerCase();
  const hasRealC1B1Keywords =
    /đồng biến|nghịch biến|đơn điệu|cực trị|cực đại|cực tiểu|điểm cực|giá trị cực|bảng biến thiên|f'\(x\)|y'\s*=/.test(
      lower
    );
  return !hasRealC1B1Keywords;
}

function normalizeQuestionInMemory(item: BankQuestion): BankQuestion {
  let next = item;
  const primaryImage = next.image || next.imageUrl;
  const shouldClearDiagram =
    Boolean(next.diagram) &&
    (next.id.startsWith('imp-') || Boolean(primaryImage || next.tableData));

  // Deduplicate identical image & imageUrl references in memory to cut RAM usage in half
  const hasRedundantImageUrl = Boolean(next.image && next.imageUrl && next.image === next.imageUrl);

  if (shouldClearDiagram || hasRedundantImageUrl) {
    next = {
      ...next,
      image: primaryImage,
      imageUrl: undefined,
      diagram: shouldClearDiagram ? undefined : next.diagram,
    };
  }

  if (
    next.solutionSteps &&
    next.solutionSteps.length === 1 &&
    next.solutionSteps[0].title === 'Bước 1: Phân tích và giải chi tiết' &&
    next.solutionSteps[0].leadIn === 'Từ giả thiết bài toán:' &&
    next.solutionSteps[0].math
  ) {
    const reparsed = parseVerbatimSolutionSteps(next.solutionSteps[0].math);
    if (reparsed.length > 0) {
      next = { ...next, solutionSteps: reparsed };
    }
  }

  // Auto-heal questions that were previously assigned the generic fallback [12-C1-B1-TH] tag
  if (isLikelyFallbackC1B1Tag(next)) {
    const reclassified = classifyBankQuestionKNTT(next, next.grade || '12', true);
    if (reclassified.tag !== next.tag) {
      next = {
        ...next,
        ...reclassified,
      };
    }
  }

  return next;
}

export async function loadBankQuestions(seedExam: ExamPaper): Promise<BankQuestion[]> {
  if (cachedBankItems && cachedBankItems.length > 0) {
    incrementZeroCostStat('cacheHits', 1);
    incrementZeroCostStat('firestoreReadsSaved', 1);
    return cachedBankItems;
  }
  if (pendingLoadPromise) {
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    try {
      const db = await openBankDb();
      const existing: BankQuestion[] = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as BankQuestion[]) || []);
        req.onerror = () => reject(req.error);
      });
      if (existing.length > 0) {
        const healed: BankQuestion[] = new Array(existing.length);
        const CHUNK = 600;
        for (let i = 0; i < existing.length; i++) {
          healed[i] = normalizeQuestionInMemory(existing[i]);
          if (i > 0 && i % CHUNK === 0) {
            await yieldToMain();
          }
        }
        cachedBankItems = healed;
        return healed;
      }
      const seeded = examPaperToBankQuestions(seedExam, `Đề chuẩn ${seedExam.examCode}`);
      cachedBankItems = seeded;
      await putBankQuestionsInBatches(seeded, true);
      return seeded;
    } catch {
      const fallback = examPaperToBankQuestions(seedExam, `Đề chuẩn ${seedExam.examCode}`);
      cachedBankItems = fallback;
      return fallback;
    } finally {
      pendingLoadPromise = null;
    }
  })();

  return pendingLoadPromise;
}

async function putBankQuestionsInBatches(items: BankQuestion[], clearFirst = false): Promise<void> {
  try {
    const db = await openBankDb();
    if (clearFirst) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await yieldToMain();
    }

    const BATCH_SIZE = 250;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const slice = items.slice(i, i + BATCH_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (let j = 0; j < slice.length; j++) {
          store.put(normalizeQuestionInMemory(slice[j]));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (i + BATCH_SIZE < items.length) {
        await yieldToMain();
      }
    }
  } catch {
    // fallback in memory
  }
}

export async function replaceAllBankQuestions(items: BankQuestion[]): Promise<BankQuestion[]> {
  cachedBankItems = items;
  await putBankQuestionsInBatches(items, true);
  return items;
}

export async function saveBankQuestionsBulk(
  currentItems: BankQuestion[],
  incoming: BankQuestion[]
): Promise<{ items: BankQuestion[]; added: number; skippedDuplicates: number }> {
  const seen = new Set<string>();
  const seenStemOnly = new Set<string>();
  for (let i = 0; i < currentItems.length; i++) {
    const q = currentItems[i];
    const fp = buildQuestionFingerprint(q);
    if (fp) seen.add(fp);
    const stemOnly = `${q.partType}:${normalizeSignature(q.stem)}`;
    if (stemOnly.length > 45) {
      seenStemOnly.add(stemOnly);
    }
    if (i > 0 && i % 1000 === 0) {
      await yieldToMain();
    }
  }

  const merged = [...currentItems];
  const newlyAdded: BankQuestion[] = [];
  let added = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < incoming.length; i++) {
    const item = normalizeQuestionInMemory(incoming[i]);
    const fp = buildQuestionFingerprint(item);
    const stemOnly = `${item.partType}:${normalizeSignature(item.stem)}`;
    const isDuplicate =
      !item.stem.trim() ||
      !fp ||
      seen.has(fp) ||
      (stemOnly.length > 45 &&
        !/hình vẽ|bảng biến thiên|đồ thị như|bảng số liệu|khẳng định nào|mệnh đề nào/i.test(item.stem) &&
        seenStemOnly.has(stemOnly));

    if (isDuplicate) {
      skippedDuplicates++;
      continue;
    }
    seen.add(fp);
    if (stemOnly.length > 45) {
      seenStemOnly.add(stemOnly);
    }
    merged.push(item);
    newlyAdded.push(item);
    added++;
    if (i > 0 && i % 500 === 0) {
      await yieldToMain();
    }
  }

  cachedBankItems = merged;
  if (newlyAdded.length > 0) {
    // Only write newly added questions to IndexedDB instead of rewriting all 9,391+ existing questions!
    await putBankQuestionsInBatches(newlyAdded, false);
  }
  return { items: merged, added, skippedDuplicates };
}

export async function updateBankQuestion(
  currentItems: BankQuestion[],
  updated: BankQuestion
): Promise<BankQuestion[]> {
  const cleanUpdated = normalizeQuestionInMemory(updated);
  const next = currentItems.map((q) => (q.id === cleanUpdated.id ? cleanUpdated : q));
  cachedBankItems = next;
  try {
    const db = await openBankDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(cleanUpdated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback in memory
  }
  return next;
}

export async function deleteBankQuestion(currentItems: BankQuestion[], id: string): Promise<BankQuestion[]> {
  const next = currentItems.filter((q) => q.id !== id);
  cachedBankItems = next;
  try {
    const db = await openBankDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback in memory
  }
  return next;
}

export async function deleteBankQuestionsBulk(
  currentItems: BankQuestion[],
  ids: Set<string>
): Promise<BankQuestion[]> {
  const next = currentItems.filter((q) => !ids.has(q.id));
  cachedBankItems = next;
  try {
    const db = await openBankDb();
    const idArray = Array.from(ids);
    const BATCH_SIZE = 300;
    for (let i = 0; i < idArray.length; i += BATCH_SIZE) {
      const slice = idArray.slice(i, i + BATCH_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (let j = 0; j < slice.length; j++) {
          store.delete(slice[j]);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (i + BATCH_SIZE < idArray.length) {
        await yieldToMain();
      }
    }
  } catch {
    // fallback in memory
  }
  return next;
}

function getOmmlAttr(el: Element | undefined | null, attrName = 'val'): string | undefined {
  if (!el) return undefined;
  const direct =
    el.getAttribute(`m:${attrName}`) ??
    el.getAttribute(`w:${attrName}`) ??
    el.getAttribute(attrName);
  if (direct !== null && direct !== undefined) return direct;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.localName === attrName) return a.value;
  }
  return undefined;
}

// Convert OMML XML element inside Word .docx into accurate LaTeX string (100% verbatim math)
function ommlNodeToLatex(node: Element): string {
  const name = node.localName;
  if (name === 't') {
    return (node.textContent || '')
      // Escape literal braces and backslashes inside <m:t> BEFORE inserting LaTeX commands
      .replace(/\\/g, '\\setminus ')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/ℝ/g, '\\mathbb{R} ')
      .replace(/ℤ/g, '\\mathbb{Z} ')
      .replace(/ℕ/g, '\\mathbb{N} ')
      .replace(/ℚ/g, '\\mathbb{Q} ')
      .replace(/ℂ/g, '\\mathbb{C} ')
      .replace(/≠/g, '\\ne ')
      .replace(/∉/g, '\\notin ')
      .replace(/∈/g, '\\in ')
      .replace(/⊂/g, '\\subset ')
      .replace(/⊃/g, '\\supset ')
      .replace(/⊆/g, '\\subseteq ')
      .replace(/⊇/g, '\\supseteq ')
      .replace(/∪/g, '\\cup ')
      .replace(/∩/g, '\\cap ')
      .replace(/∖/g, '\\setminus ')
      .replace(/∅/g, '\\varnothing ')
      .replace(/≤/g, '\\le ')
      .replace(/≥/g, '\\ge ')
      .replace(/⇔/g, '\\Leftrightarrow ')
      .replace(/⇒/g, '\\Rightarrow ')
      .replace(/→/g, '\\to ')
      .replace(/∞/g, '\\infty ')
      .replace(/±/g, '\\pm ')
      .replace(/⊥/g, '\\perp ')
      .replace(/∥/g, '\\parallel ')
      .replace(/△/g, '\\triangle ')
      .replace(/∠/g, '\\angle ')
      .replace(/°|∘/g, '^\\circ ')
      .replace(/π/g, '\\pi ')
      .replace(/α/g, '\\alpha ')
      .replace(/β/g, '\\beta ')
      .replace(/γ/g, '\\gamma ')
      .replace(/Δ/g, '\\Delta ')
      .replace(/φ/g, '\\varphi ')
      .replace(/ω/g, '\\omega ')
      .replace(/·|⋅/g, '\\cdot ');
  }
  if (name === 'f') {
    const num = node.getElementsByTagNameNS('*', 'num')[0];
    const den = node.getElementsByTagNameNS('*', 'den')[0];
    return `\\dfrac{${num ? childrenLatex(num) : ''}}{${den ? childrenLatex(den) : ''}}`;
  }
  if (name === 'sSup') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const sup = node.getElementsByTagNameNS('*', 'sup')[0];
    return `${e ? childrenLatex(e) : ''}^{${sup ? childrenLatex(sup) : ''}}`;
  }
  if (name === 'sSub') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const sub = node.getElementsByTagNameNS('*', 'sub')[0];
    return `${e ? childrenLatex(e) : ''}_{${sub ? childrenLatex(sub) : ''}}`;
  }
  if (name === 'sSubSup') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const sub = node.getElementsByTagNameNS('*', 'sub')[0];
    const sup = node.getElementsByTagNameNS('*', 'sup')[0];
    return `${e ? childrenLatex(e) : ''}_{${sub ? childrenLatex(sub) : ''}}^{${sup ? childrenLatex(sup) : ''}}`;
  }
  if (name === 'rad') {
    const deg = node.getElementsByTagNameNS('*', 'deg')[0];
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const degLatex = deg ? childrenLatex(deg).trim() : '';
    return degLatex
      ? `\\sqrt[${degLatex}]{${e ? childrenLatex(e) : ''}}`
      : `\\sqrt{${e ? childrenLatex(e) : ''}}`;
  }
  if (name === 'nary') {
    const naryPr = node.getElementsByTagNameNS('*', 'naryPr')[0];
    const chrEl = naryPr?.getElementsByTagNameNS('*', 'chr')[0];
    const chrVal = getOmmlAttr(chrEl, 'val') || '∫';
    const sub = node.getElementsByTagNameNS('*', 'sub')[0];
    const sup = node.getElementsByTagNameNS('*', 'sup')[0];
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    let op = '\\int';
    if (chrVal.includes('∑')) op = '\\sum';
    else if (chrVal.includes('∏')) op = '\\prod';
    else if (chrVal.includes('∪')) op = '\\bigcup';
    else if (chrVal.includes('∩')) op = '\\bigcap';
    const subStr = sub ? childrenLatex(sub).trim() : '';
    const supStr = sup ? childrenLatex(sup).trim() : '';
    const bounds = `${subStr ? `_{${subStr}}` : ''}${supStr ? `^{${supStr}}` : ''}`;
    return `${op}${bounds} ${e ? childrenLatex(e) : ''}`;
  }
  if (name === 'd') {
    const dPr = node.getElementsByTagNameNS('*', 'dPr')[0];
    const begEl = dPr?.getElementsByTagNameNS('*', 'begChr')[0];
    const endEl = dPr?.getElementsByTagNameNS('*', 'endChr')[0];
    const beg = getOmmlAttr(begEl, 'val') ?? '(';
    const end = getOmmlAttr(endEl, 'val') ?? ')';
    const eEls = Array.from(node.childNodes).filter(
      (c): c is Element => c.nodeType === 1 && (c as Element).localName === 'e'
    );
    const inner = eEls.map((e) => childrenLatex(e)).join(', ');
    const leftMap = beg === '{' ? '\\{' : beg === '}' ? '\\}' : beg === '|' ? '|' : beg;
    const rightMap = end === '}' ? '\\}' : end === '{' ? '\\{' : end === '|' ? '|' : end === '' ? '' : end;
    return `${leftMap}${inner}${rightMap}`;
  }
  if (name === 'eqArr') {
    const eEls = Array.from(node.childNodes).filter(
      (c): c is Element => c.nodeType === 1 && (c as Element).localName === 'e'
    );
    const rows = eEls.map((e) => childrenLatex(e)).filter(Boolean);
    if (rows.length <= 1) return rows[0] || '';
    return `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
  }
  if (name === 'm') {
    const mrEls = Array.from(node.getElementsByTagNameNS('*', 'mr'));
    const rows = mrEls.map((mr) => {
      const eEls = Array.from(mr.childNodes).filter(
        (c): c is Element => c.nodeType === 1 && (c as Element).localName === 'e'
      );
      return eEls.map((e) => childrenLatex(e)).join(' & ');
    });
    return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
  }
  if (name === 'acc') {
    const accPr = node.getElementsByTagNameNS('*', 'accPr')[0];
    const chrEl = accPr?.getElementsByTagNameNS('*', 'chr')[0];
    // ECMA-376 default for <m:acc> when <m:chr> is omitted is U+0302 (circumflex hat)
    const chr = getOmmlAttr(chrEl, 'val') ?? '\u0302';
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const inner = (e ? childrenLatex(e) : '').trim();
    if (chr.includes('¯') || chr.includes('‾') || chr.includes('\u0304') || chr.includes('\u0305')) {
      return `\\overline{${inner}}`;
    }
    if (chr.includes('~') || chr.includes('˜') || chr.includes('\u0303')) {
      return `\\widetilde{${inner}}`;
    }
    if (chr.includes('\u20d7') || chr.includes('⃗') || chr.includes('→') || chr.includes('\u2192') || chr.includes('\u20d6')) {
      // 3-vertex uppercase like B'AB or ABC is an angle hat
      if (/^[A-Z]'?[A-Z]'?[A-Z]'?$/.test(inner)) {
        return `\\widehat{${inner}}`;
      }
      return inner.length > 1 ? `\\overrightarrow{${inner}}` : `\\vec{${inner}}`;
    }
    return inner.length > 1 ? `\\widehat{${inner}}` : `\\hat{${inner}}`;
  }
  if (name === 'groupChr') {
    const groupChrPr = node.getElementsByTagNameNS('*', 'groupChrPr')[0];
    const chrEl = groupChrPr?.getElementsByTagNameNS('*', 'chr')[0];
    const chr = getOmmlAttr(chrEl, 'val') ?? '';
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const inner = (e ? childrenLatex(e) : '').trim();
    if (chr.includes('→') || chr.includes('\u20d7') || chr.includes('⃗')) {
      return `\\overrightarrow{${inner}}`;
    }
    if (chr.includes('^') || chr.includes('\u0302') || chr.includes('ˆ')) {
      return `\\widehat{${inner}}`;
    }
    return inner;
  }
  if (name === 'bar') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    return `\\overline{${e ? childrenLatex(e) : ''}}`;
  }
  if (name === 'limLow') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const lim = node.getElementsByTagNameNS('*', 'lim')[0];
    return `${e ? childrenLatex(e) : ''}_{${lim ? childrenLatex(lim) : ''}}`;
  }
  if (name === 'limUpp') {
    const e = node.getElementsByTagNameNS('*', 'e')[0];
    const lim = node.getElementsByTagNameNS('*', 'lim')[0];
    return `${e ? childrenLatex(e) : ''}^{${lim ? childrenLatex(lim) : ''}}`;
  }
  return childrenLatex(node);
}

function childrenLatex(parent: Element): string {
  let out = '';
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1) {
      const el = child as Element;
      if (el.localName.endsWith('Pr')) continue;
      out += ommlNodeToLatex(el);
    }
  }
  return out;
}

export function convertTableRowsToMarkdown(rows: string[][], preserveMath = true): string {
  if (!rows || rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount === 0) return '';

  const normalizeCell = (val: string) => {
    const clean = (val || '').replace(/\r?\n/g, ' ').replace(/\|/g, '∣').trim();
    return preserveMath ? clean : formatMathCellForCanvas(clean);
  };

  const paddedRows = rows.map((r) => {
    const rowCopy = new Array(colCount).fill('');
    for (let i = 0; i < colCount; i++) {
      rowCopy[i] = normalizeCell(r[i] || '');
    }
    return rowCopy;
  });

  const headerLine = `| ${paddedRows[0].join(' | ')} |`;
  const dividerLine = `| ${paddedRows[0].map(() => ':---:').join(' | ')} |`;
  const bodyLines = paddedRows.slice(1).map((r) => `| ${r.join(' | ')} |`);

  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

export function isComplexTableStructure(rows: string[][], hasMergedCells = false): boolean {
  if (hasMergedCells) return true;
  if (!rows || rows.length === 0) return false;
  const colCounts = rows.map((r) => r.length);
  const maxCols = Math.max(...colCounts);
  const minCols = Math.min(...colCounts);
  if (maxCols !== minCols || maxCols > 6) return true;
  const joined = rows.map((r) => r.join(' ')).join(' ');
  if (/y'|f'\(x\)|\\infty|∞|↗|↘|\\nearrow|\\searrow|\|\|/.test(joined)) return true;
  return false;
}

export function renderTableToPngBase64(rows: string[][], dprScale?: number): string {
  if (!rows || rows.length === 0) return '';
  const settings = loadBankTableExportSettings();
  const dpr = dprScale || settings.imageDpiScale || 2;
  const structured = buildStructuredTableFromFlatRows(rows);
  return renderStructuredTableViaCanvasSync(structured, dpr, 94 * 1024);
}

function extractParagraphContent(
  pEl: Element,
  mediaMap: Map<string, string>
): { text: string; images: string[]; markedOpt?: string } {
  let line = '';
  const images: string[] = [];
  let markedOpt: string | undefined;

  const processNode = (node: Element) => {
    const localName = node.localName;
    if (localName === 'r') {
      const rPr = node.getElementsByTagNameNS('*', 'rPr')[0];
      let isHighlightedChoice = false;
      if (rPr) {
        const uEl = rPr.getElementsByTagNameNS('*', 'u')[0];
        if (uEl) {
          const uVal = uEl.getAttribute('w:val') || uEl.getAttribute('val') || 'single';
          if (uVal !== 'none') isHighlightedChoice = true;
        }
        const colorEl = rPr.getElementsByTagNameNS('*', 'color')[0];
        if (colorEl) {
          const cVal = (colorEl.getAttribute('w:val') || colorEl.getAttribute('val') || '').toLowerCase();
          if (/^(c00000|ff0000|ee0000|dc2626|b91c1c|e11d48|990000|cc0000)$/.test(cVal)) {
            isHighlightedChoice = true;
          }
        }
      }

      let runText = '';
      for (let k = 0; k < node.childNodes.length; k++) {
        const rc = node.childNodes[k];
        if (rc.nodeType !== 1) continue;
        const rcEl = rc as Element;
        if (rcEl.localName === 't') {
          runText += rcEl.textContent || '';
        } else if (rcEl.localName === 'tab') {
          runText += ' ';
        } else if (rcEl.localName === 'br' || rcEl.localName === 'cr') {
          runText += '\n';
        } else if (rcEl.localName === 'drawing' || rcEl.localName === 'pict' || rcEl.localName === 'object') {
          const blips = Array.from(rcEl.getElementsByTagNameNS('*', 'blip'));
          blips.forEach((blip) => {
            const embedId =
              blip.getAttribute('r:embed') ||
              blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
              blip.getAttribute('embed');
            if (embedId && mediaMap.has(embedId)) {
              images.push(mediaMap.get(embedId)!);
            }
          });
          const vImgs = Array.from(rcEl.getElementsByTagNameNS('*', 'imagedata'));
          vImgs.forEach((vImg) => {
            const relId =
              vImg.getAttribute('r:id') ||
              vImg.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
              vImg.getAttribute('id');
            if (relId && mediaMap.has(relId)) {
              images.push(mediaMap.get(relId)!);
            }
          });
        }
      }

      if (isHighlightedChoice) {
        const optMatch = runText.trim().match(/^([A-D])(?:\.|$)/);
        if (optMatch && !markedOpt) {
          markedOpt = optMatch[1];
        }
      }
      line += runText;
    } else if (localName === 'oMath' || localName === 'oMathPara') {
      const latex = ommlNodeToLatex(node).trim();
      if (latex) {
        line += ` $${latex}$ `;
      }
    } else if (localName === 'hyperlink' || localName === 'smartTag' || localName === 'sdtContent' || localName === 'ins') {
      for (let k = 0; k < node.childNodes.length; k++) {
        const sub = node.childNodes[k];
        if (sub.nodeType === 1) processNode(sub as Element);
      }
    }
  };

  for (let j = 0; j < pEl.childNodes.length; j++) {
    const child = pEl.childNodes[j];
    if (child.nodeType === 1) {
      processNode(child as Element);
    }
  }

  return {
    text: line.replace(/[ \t]+/g, ' ').trim(),
    images,
    markedOpt,
  };
}

export async function extractTextFromDocxArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Tệp Word (.docx) không chứa nội dung word/document.xml hợp lệ.');
  }

  // Load relationships from word/_rels/document.xml.rels to extract embedded images
  const mediaMap = new Map<string, string>();
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    try {
      const relsXml = await relsFile.async('string');
      const parser = new DOMParser();
      const relsDoc = parser.parseFromString(relsXml, 'application/xml');
      const relEls = Array.from(relsDoc.getElementsByTagNameNS('*', 'Relationship'));
      for (const relEl of relEls) {
        const id = relEl.getAttribute('Id') || '';
        const target = relEl.getAttribute('Target') || '';
        if (!id || !target) continue;
        const normalizedTarget = target.startsWith('/')
          ? target.slice(1)
          : target.startsWith('word/')
          ? target
          : `word/${target.replace(/^\.\//, '')}`;
        const mediaFile = zip.file(normalizedTarget);
        if (mediaFile && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedTarget)) {
          const ext = normalizedTarget.split('.').pop()?.toLowerCase() || 'png';
          const mime =
            ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'gif'
              ? 'image/gif'
              : ext === 'svg'
              ? 'image/svg+xml'
              : ext === 'webp'
              ? 'image/webp'
              : 'image/png';
          const base64 = await mediaFile.async('base64');
          if (base64) {
            const rawDataUrl = `data:${mime};base64,${base64}`;
            const compressedDataUrl =
              mime === 'image/svg+xml'
                ? rawDataUrl
                : await compressImageToWebpOrJpegUnder100KB(rawDataUrl, 94 * 1024);
            mediaMap.set(id, compressedDataUrl);
          }
        }
      }
    } catch {
      // Ignore relationship parsing errors and continue extracting text/tables
    }
  }

  const xmlText = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const bodyEl = xmlDoc.getElementsByTagNameNS('*', 'body')[0] || xmlDoc.documentElement;

  const lines: string[] = [];
  const tableSettings = loadBankTableExportSettings();

  const traverseBodyChildren = async (container: Element) => {
    for (let i = 0; i < container.childNodes.length; i++) {
      const node = container.childNodes[i];
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const localName = el.localName;

      if (localName === 'p') {
        const { text, images, markedOpt } = extractParagraphContent(el, mediaMap);
        if (text) {
          lines.push(markedOpt ? `${text} [[MARKED_OPT:${markedOpt}]]` : text);
        }
        images.forEach((imgDataUrl) => {
          lines.push(`[[DOCX_IMAGE:${imgDataUrl}]]`);
        });
      } else if (localName === 'tbl') {
        const structured = parseWordTableElement(el, extractParagraphContent, mediaMap);
        const flatText = structured.flatRows.map((r) => r.join('   ')).join('\n');
        const isOptionLayoutTable =
          (/\bA\.\s+/.test(flatText) && /\bB\.\s+/.test(flatText)) ||
          (/(?:^|\s)a\)\s+/.test(flatText) && /(?:^|\s)b\)\s+/.test(flatText) && /(?:^|\s)c\)\s+/.test(flatText));

        if (isOptionLayoutTable) {
          structured.flatRows.forEach((r) => {
            const line = r.filter(Boolean).join('   ').trim();
            if (line) lines.push(line);
          });
          structured.embeddedImages.forEach((img) => lines.push(`[[DOCX_IMAGE:${img}]]`));
        } else if (structured.rows.length > 0) {
          const isComplex =
            structured.hasMergedCells ||
            structured.isVariationTable ||
            isComplexTableStructure(structured.flatRows, structured.hasMergedCells);
          lines.push(`[[TABLE_COMPLEX:${isComplex ? '1' : '0'}]]`);
          lines.push(`[[TABLE_DATA:${JSON.stringify(structured.flatRows)}]]`);
          const tableImgUrl = await renderStructuredTableToImageUnder100KB(
            structured,
            tableSettings.imageDpiScale || 2,
            94 * 1024
          );
          if (tableImgUrl) {
            lines.push(`[[TABLE_IMAGE:${tableImgUrl}]]`);
          }
          structured.embeddedImages.forEach((img) => lines.push(`[[DOCX_IMAGE:${img}]]`));
        }
      } else if (localName === 'sdt') {
        const sdtContent = el.getElementsByTagNameNS('*', 'sdtContent')[0];
        if (sdtContent) await traverseBodyChildren(sdtContent);
      }
    }
  };

  await traverseBodyChildren(bodyEl);

  return lines.join('\n');
}

export function inferTagFromText(
  text: string,
  fallbackGrade: '10' | '11' | '12' = '12',
  ignoreExistingTag = false,
  partTypeHint?: BankPartType
): {
  tag: string;
  grade: '10' | '11' | '12';
  chapter: string;
  lesson: string;
  level: 'NB' | 'TH' | 'VD' | 'VDC';
} {
  if (!ignoreExistingTag) {
    const existing = text.match(/\[(10|11|12)-(C\d+)-(B\d+)-(NB|TH|VD|VDC)\]/i);
    if (existing) {
      const meta = parseTagMeta(existing[0]);
      const lowerCheck = text.toLowerCase();
      const isBogusFallback =
        meta.grade === '12' &&
        meta.chapter === 'C1' &&
        meta.lesson === 'B1' &&
        !/đồng biến|nghịch biến|đơn điệu|cực trị|cực đại|cực tiểu|điểm cực|giá trị cực|bảng biến thiên|f'\(x\)|y'\s*=/.test(
          lowerCheck
        );
      if (!isBogusFallback) {
        return {
          tag: `[${meta.grade}-${meta.chapter}-${meta.lesson}-${meta.level}]`,
          ...meta,
        };
      }
    }
  }

  const cleanText = text.replace(/\[(10|11|12)-(C\d+)-(B\d+)-(NB|TH|VD|VDC)\]/gi, ' ');
  const lower = cleanText.toLowerCase();

  let grade: '10' | '11' | '12' = fallbackGrade;
  let chapter = 'C1';
  let lesson = 'B1';

  const hasOxyz =
    /oxyz|\(\s*x\s*-\s*\d+\s*\)\^\{?2\}?.*\+\s*\(\s*z|x\^\{?2\}?\s*\+\s*y\^\{?2\}?\s*\+\s*z\^\{?2\}?|\bcao độ\b|trục oz\b|mặt phẳng\s*\(oxy\)|mặt phẳng\s*\(oyz\)|mặt phẳng\s*\(oxz\)|(;[^;)]+;[^;)]+\))/.test(
      lower
    );
  const hasOxy =
    !hasOxyz &&
    (/mặt phẳng tọa độ oxy|trong mặt phẳng oxy|hệ tọa độ oxy|trục ox\b|trục oy\b/.test(lower) ||
      /\b(?:A|B|C|M|N|I)\(\s*-?\d+\s*;\s*-?\d+\s*\)/.test(cleanText));
  const hasGroupedData =
    /ghép nhóm|\[\s*\d+\s*;\s*\d+\s*\)|nhóm chứa|tần số tích lũy|giá trị đại diện/.test(lower);
  const has3DShapes =
    /hình chóp|khối chóp|lăng trụ|khối lăng trụ|tứ diện|hình hộp|hình lập phương|chóp cụt/.test(lower);
  const hasIntegral = /\\int\b|∫|tích phân|nguyên hàm/.test(lower);
  const hasTrigFunc =
    /(?:\\|\b)(?:sin|cos|tan|cot)(?:\s*\(|\s+[x234\alpha\beta]|\^|\b)|lượng giác|radian|cung lượng giác|góc lượng giác/.test(
      lower
    );
  const hasExpLog =
    /\\log\b|log_|\\ln\b|lôgarit|logarit|hàm số mũ|phương trình mũ|bất phương trình mũ|lũy thừa với số mũ/.test(
      lower
    );

  // 1. LỚP 12 — CHƯƠNG 5 & CHƯƠNG 2: TỌA ĐỘ OXYZ & VECTƠ KHÔNG GIAN
  if (
    hasOxyz ||
    /mặt cầu|vectơ pháp tuyến của mặt phẳng|phương trình mặt phẳng/.test(lower)
  ) {
    grade = '12';
    if (/mặt cầu|bán kính mặt cầu|tâm của mặt cầu/.test(lower)) {
      chapter = 'C5';
      lesson = 'B17';
    } else if (
      /góc giữa hai mặt phẳng|góc giữa đường thẳng và mặt phẳng|góc giữa hai đường thẳng/.test(lower) &&
      hasOxyz
    ) {
      chapter = 'C5';
      lesson = 'B16';
    } else if (
      /phương trình đường thẳng|phương trình tham số|phương trình chính tắc|vectơ chỉ phương|đường thẳng d\b|đường thẳng \\delta/.test(
        lower
      ) &&
      !/phương trình mặt phẳng/.test(lower)
    ) {
      chapter = 'C5';
      lesson = 'B15';
    } else if (
      /phương trình mặt phẳng|vectơ pháp tuyến|mặt phẳng đi qua|khoảng cách từ điểm.*đến mặt phẳng|mặt phẳng \(p\)|mặt phẳng \(\\alpha\)|mặt phẳng \(q\)/.test(
        lower
      )
    ) {
      chapter = 'C5';
      lesson = 'B14';
    } else if (
      /tích vô hướng|tích có hướng|trọng tâm|trung điểm|cùng phương|độ dài đoạn thẳng|\bvec\{a\}\s*\\cdot/.test(
        lower
      )
    ) {
      chapter = 'C2';
      lesson = 'B8';
    } else {
      chapter = 'C2';
      lesson = 'B7';
    }
  }
  // 2. LỚP 12 — CHƯƠNG 2: VECTƠ TRONG KHÔNG GIAN (Bài 6)
  else if (
    has3DShapes &&
    (/vectơ|\\overrightarrow|\\vec\b|tích vô hướng|quy tắc hình hộp/.test(lower))
  ) {
    grade = '12';
    chapter = 'C2';
    lesson = 'B6';
  }
  // 3. LỚP 12 — CHƯƠNG 4: NGUYÊN HÀM VÀ TÍCH PHÂN (Bài 11, 12, 13)
  else if (
    hasIntegral ||
    /diện tích hình phẳng|khối tròn xoay|quay quanh trục|vật thể giới hạn bởi hai mặt phẳng/.test(lower)
  ) {
    grade = '12';
    chapter = 'C4';
    if (
      /diện tích hình phẳng|khối tròn xoay|quay quanh trục|quay hình phẳng|thiết diện|vật thể giới hạn/.test(
        lower
      )
    ) {
      lesson = 'B13';
    } else if (
      /tích phân|\\int_|∫_|vận tốc v\(t\)|gia tốc a\(t\)|quãng đường|tốc độ tăng|trữ lượng gỗ/.test(
        lower
      ) &&
      !/họ tất cả các nguyên hàm|tìm nguyên hàm|một nguyên hàm/.test(lower)
    ) {
      lesson = 'B12';
    } else {
      lesson = 'B11';
    }
  }
  // 4. LỚP 12 — CHƯƠNG 6: XÁC SUẤT CÓ ĐIỀU KIỆN & BAYES (Bài 18, 19)
  else if (
    /xác suất có điều kiện|công thức bayes|\bbayes\b|xác suất toàn phần|\\mid\b|p\(a\s*\|\s*b\)|p\(b\s*\|\s*a\)|dương tính|âm tính|camera ai|tỷ lệ linh kiện|tỉ lệ phế phẩm/.test(
      lower
    )
  ) {
    grade = '12';
    chapter = 'C6';
    if (/bayes|toàn phần|tỷ lệ linh kiện|tỉ lệ phế phẩm|dương tính|âm tính|nhà máy i|lô hàng/.test(lower)) {
      lesson = 'B19';
    } else {
      lesson = 'B18';
    }
  }
  // 5. LỚP 10, 11, 12 — THỐNG KÊ MẪU SỐ LIỆU GHÉP NHÓM & KHÔNG GHÉP NHÓM
  else if (
    hasGroupedData ||
    /tứ phân vị|khoảng biến thiên|phương sai|độ lệch chuẩn|số trung bình|trung vị|\bmốt\b|mẫu số liệu/.test(
      lower
    )
  ) {
    if (hasGroupedData) {
      if (/phương sai|độ lệch chuẩn|\bs\^2\b/.test(lower)) {
        grade = '12';
        chapter = 'C3';
        lesson = 'B10';
      } else if (/khoảng biến thiên|khoảng tứ phân vị|\\delta_q|\\delta q/.test(lower)) {
        grade = '12';
        chapter = 'C3';
        lesson = 'B9';
      } else if (/số trung bình|trung vị|tứ phân vị|\bmốt\b|\bq_1\b|\bq_2\b|\bq_3\b|\bm_o\b|\bm_e\b/.test(lower)) {
        grade = '11';
        chapter = 'C3';
        lesson = 'B9';
      } else {
        grade = '11';
        chapter = 'C3';
        lesson = 'B8';
      }
    } else {
      grade = '10';
      chapter = 'C5';
      if (/sai số|số gần đúng|quy tròn/.test(lower)) {
        lesson = 'B12';
      } else if (/phương sai|độ lệch chuẩn|khoảng biến thiên|khoảng tứ phân vị/.test(lower)) {
        lesson = 'B14';
      } else {
        lesson = 'B13';
      }
    }
  }
  // 6. LỚP 11 — CHƯƠNG 1: LƯỢNG GIÁC (Bài 1, 2, 3, 4)
  else if (
    hasTrigFunc &&
    !/nguyên hàm|tích phân|đạo hàm|tiếp tuyến|định lí côsin|định lí sin|giải tam giác/.test(lower)
  ) {
    grade = '11';
    chapter = 'C1';
    if (
      /phương trình|nghiệm của|tập nghiệm|số nghiệm|k\\pi|k2\\pi|k\s*\\in\s*\\mathbb\{z\}|k\s*∈\s*z/.test(
        lower
      )
    ) {
      lesson = 'B4';
    } else if (
      /tập xác định|tập giá trị|chu kì|tuần hoàn|hàm số chẵn|hàm số lẻ|đồ thị hàm số y\s*=/.test(lower)
    ) {
      lesson = 'B3';
    } else if (
      /công thức cộng|công thức nhân đôi|biến đổi tổng thành tích|biến đổi tích thành tổng|sin\s*\(\s*a\s*[+-]\s*b\)|cos\s*\(\s*a\s*[+-]\s*b\)|cos\s*2|sin\s*2/.test(
        lower
      )
    ) {
      lesson = 'B2';
    } else {
      lesson = 'B1';
    }
  }
  // 7. LỚP 11 — CHƯƠNG 2: DÃY SỐ, CẤP SỐ CỘNG, CẤP SỐ NHÂN (Bài 5, 6, 7)
  else if (
    /cấp số cộng|cấp số nhân|công sai|công bội|dãy số|\bu_n\b|\bu_\{n|\bu_1\b|\bu_2\b|\bs_n\b/.test(
      lower
    ) &&
    !/\\lim|giới hạn/.test(lower)
  ) {
    grade = '11';
    chapter = 'C2';
    if (/cấp số nhân|công bội/.test(lower)) {
      lesson = 'B7';
    } else if (/cấp số cộng|công sai/.test(lower)) {
      lesson = 'B6';
    } else {
      lesson = 'B5';
    }
  }
  // 8. LỚP 11 — CHƯƠNG 5: GIỚI HẠN & HÀM SỐ LIÊN TỤC (Bài 15, 16, 17)
  else if (
    (/\\lim\b|giới hạn của|hàm số liên tục|liên tục tại|gián đoạn tại|lùi vô hạn/.test(lower)) &&
    !/tiệm cận/.test(lower)
  ) {
    grade = '11';
    chapter = 'C5';
    if (/liên tục|gián đoạn/.test(lower)) {
      lesson = 'B17';
    } else if (/dãy số|n\s*\\to\s*\+?\\infty|lùi vô hạn|\bu_n\b/.test(lower)) {
      lesson = 'B15';
    } else {
      lesson = 'B16';
    }
  }
  // 9. LỚP 11 — CHƯƠNG 6: HÀM SỐ MŨ VÀ HÀM SỐ LÔGARIT (Bài 18, 19, 20, 21)
  else if (
    hasExpLog ||
    (/(?:phương trình|bất phương trình|nghiệm).*(?:\d+\^\{?[x2-9]|e\^\{?x)/.test(lower)) ||
    (/lãi kép|lãi suất.*kì hạn|gửi tiết kiệm/.test(lower))
  ) {
    grade = '11';
    chapter = 'C6';
    if (
      /phương trình|bất phương trình|nghiệm của|tập nghiệm|tổng các nghiệm|tích các nghiệm/.test(lower)
    ) {
      lesson = 'B21';
    } else if (
      /tập xác định|đạo hàm|đồng biến|nghịch biến|đồ thị|hàm số mũ|hàm số lôgarit|lãi kép|lãi suất|gửi tiết kiệm/.test(
        lower
      )
    ) {
      lesson = 'B20';
    } else if (/\\log\b|log_|\\ln\b|lôgarit|logarit/.test(lower)) {
      lesson = 'B19';
    } else {
      lesson = 'B18';
    }
  }
  // 10. LỚP 11 — CHƯƠNG 4 & CHƯƠNG 7: HÌNH HỌC KHÔNG GIAN TỔNG HỢP
  else if (
    has3DShapes ||
    /vuông góc với mặt phẳng|hai mặt phẳng vuông góc|hai đường thẳng chéo nhau|góc nhị diện|giao tuyến của hai mặt phẳng|phép chiếu song song/.test(
      lower
    )
  ) {
    grade = '11';
    if (/thể tích|v_\{?s\.|v\s*=\s*\\frac\{1\}\{3\}|v\s*=\s*\\dfrac\{1\}\{3\}/.test(lower)) {
      chapter = 'C7';
      lesson = 'B27';
    } else if (/khoảng cách|\bd\s*\(/.test(lower)) {
      chapter = 'C7';
      lesson = 'B26';
    } else if (/hai mặt phẳng vuông góc|góc nhị diện|góc giữa hai mặt phẳng/.test(lower)) {
      chapter = 'C7';
      lesson = 'B25';
    } else if (
      /góc giữa đường thẳng.*và mặt phẳng|góc giữa.*và mặt phẳng|góc giữa cạnh bên.*và mặt đáy|phép chiếu vuông góc/.test(
        lower
      )
    ) {
      chapter = 'C7';
      lesson = 'B24';
    } else if (/vuông góc với mặt phẳng|\\perp\s*\(/.test(lower)) {
      chapter = 'C7';
      lesson = 'B23';
    } else if (/hai đường thẳng vuông góc|góc giữa hai đường thẳng/.test(lower)) {
      chapter = 'C7';
      lesson = 'B22';
    } else if (/phép chiếu song song|hình biểu diễn/.test(lower)) {
      chapter = 'C4';
      lesson = 'B14';
    } else if (/hai mặt phẳng song song|thalès|thales/.test(lower)) {
      chapter = 'C4';
      lesson = 'B13';
    } else if (/song song với mặt phẳng|\\parallel\s*\(/.test(lower)) {
      chapter = 'C4';
      lesson = 'B12';
    } else if (/hai đường thẳng song song|hai đường thẳng chéo nhau|vị trí tương đối của hai đường thẳng/.test(lower)) {
      chapter = 'C4';
      lesson = 'B11';
    } else {
      chapter = 'C4';
      lesson = 'B10';
    }
  }
  // 11. LỚP 10 & 11 — TỔ HỢP VÀ XÁC SUẤT CỔ ĐIỂN / QUY TẮC TÍNH XÁC SUẤT
  else if (
    /hoán vị|chỉnh hợp|tổ hợp|quy tắc cộng|quy tắc nhân|nhị thức newton|hệ số của x\^|có bao nhiêu cách|có bao nhiêu số tự nhiên/.test(
      lower
    )
  ) {
    grade = '10';
    chapter = 'C8';
    if (/nhị thức newton|khai triển|hệ số của/.test(lower)) {
      lesson = 'B25';
    } else if (/hoán vị|chỉnh hợp|tổ hợp|c_n\^k|a_n\^k|c_\{\d+\}\^\{\d+\}|a_\{\d+\}\^\{\d+\}/.test(lower)) {
      lesson = 'B24';
    } else {
      lesson = 'B23';
    }
  } else if (
    /xác suất|biến cố|không gian mẫu|xúc xắc|đồng xu|chọn ngẫu nhiên/.test(lower)
  ) {
    if (
      /biến cố độc lập|biến cố xung khắc|công thức cộng xác suất|công thức nhân xác suất|hai xạ thủ|hai người cùng bắn|p\(a\s*\\cup\s*b\)|p\(a\s*\\cap\s*b\)/.test(
        lower
      )
    ) {
      grade = '11';
      chapter = 'C8';
      if (/công thức nhân|cả hai.*bắn trúng|ít nhất một người bắn trúng/.test(lower)) {
        lesson = 'B30';
      } else if (/công thức cộng|p\(a\s*\\cup\s*b\)/.test(lower)) {
        lesson = 'B29';
      } else {
        lesson = 'B28';
      }
    } else {
      grade = '10';
      chapter = 'C9';
      lesson = /biến cố đối|ít nhất/.test(lower) ? 'B27' : 'B26';
    }
  }
  // 12. LỚP 10 — MỆNH ĐỀ, TẬP HỢP, HỆ BPT BẬC NHẤT HAI ẨN, TAM GIÁC, OXY, BẬC HAI
  else if (
    /bất phương trình bậc nhất hai ẩn|hệ bất phương trình bậc nhất hai ẩn|miền nghiệm|thuê hai loại xe tải|loại xe tải a và b/.test(
      lower
    )
  ) {
    grade = '10';
    chapter = 'C2';
    lesson = /hệ bất phương trình|thuê hai loại xe|loại a và loại b/.test(lower) ? 'B4' : 'B3';
  } else if (
    /mệnh đề phủ định|mệnh đề đảo|mệnh đề kéo theo|\\forall|\\exists|giao của hai tập hợp|hợp của hai tập hợp|tập hợp con|a\s*\\cap\s*b|a\s*\\cup\s*b|a\s*\\setminus\s*b/.test(
      lower
    )
  ) {
    grade = '10';
    chapter = 'C1';
    lesson = /tập hợp|\\cap\b|\\cup\b|\\setminus\b/.test(lower) ? 'B2' : 'B1';
  } else if (
    /định lí côsin|định lí sin|bán kính đường tròn ngoại tiếp|bán kính đường tròn nội tiếp|giải tam giác|herong/.test(
      lower
    )
  ) {
    grade = '10';
    chapter = 'C3';
    lesson = 'B6';
  } else if (
    /elip|hypebol|parabol\s+y\^2|tiêu điểm|tiêu cự|đường chuẩn|phương trình đường tròn|tâm và bán kính của đường tròn/.test(
      lower
    ) ||
    hasOxy
  ) {
    grade = '10';
    chapter = 'C7';
    if (/elip|hypebol|tiêu điểm|tiêu cự|đường chuẩn/.test(lower)) {
      lesson = 'B22';
    } else if (/đường tròn|tiếp tuyến của đường tròn/.test(lower)) {
      lesson = 'B21';
    } else if (/khoảng cách từ điểm|góc giữa hai đường thẳng|vị trí tương đối/.test(lower)) {
      lesson = 'B20';
    } else {
      lesson = 'B19';
    }
  } else if (
    /tam thức bậc hai|bất phương trình bậc hai|đỉnh của parabol|trục đối xứng của parabol|hàm số bậc hai/.test(
      lower
    )
  ) {
    grade = '10';
    chapter = 'C6';
    if (/tam thức bậc hai|bất phương trình bậc hai/.test(lower)) {
      lesson = 'B17';
    } else {
      lesson = 'B16';
    }
  } else if (
    (/vectơ|\\overrightarrow|\\vec\b/.test(lower)) &&
    !hasOxyz &&
    !has3DShapes
  ) {
    grade = '10';
    chapter = 'C4';
    if (/tích vô hướng/.test(lower)) lesson = 'B11';
    else if (/tọa độ/.test(lower)) lesson = 'B10';
    else if (/trọng tâm|trung điểm/.test(lower)) lesson = 'B9';
    else if (/tổng|hiệu|quy tắc ba điểm|hình bình hành/.test(lower)) lesson = 'B8';
    else lesson = 'B7';
  }
  // 13. LỚP 11 CHƯƠNG 9 (ĐẠO HÀM) & LỚP 12 CHƯƠNG 1 (ỨNG DỤNG ĐẠO HÀM)
  else if (
    /tiếp tuyến của đồ thị|hệ số góc của tiếp tuyến|đạo hàm cấp hai|f''\(x\)|y''/.test(lower) &&
    !/tâm đối xứng|điểm uốn/.test(lower)
  ) {
    grade = '11';
    chapter = 'C9';
    if (/cấp hai|f''|y''/.test(lower)) lesson = 'B33';
    else if (/tiếp tuyến/.test(lower)) lesson = 'B31';
    else lesson = 'B32';
  } else if (/tiệm cận đứng|tiệm cận ngang|tiệm cận xiên|đường tiệm cận/.test(lower)) {
    grade = '12';
    chapter = 'C1';
    lesson = 'B3';
  } else if (
    /tốc độ truyền dẫn|chi phí.*nhỏ nhất|lợi nhuận.*lớn nhất|lợi nhuận.*cực đại|doanh thu|hạt điều|tấm nhôm|hình thang cân.*nội tiếp|cắt bỏ ở bốn góc/.test(
      lower
    )
  ) {
    grade = '12';
    chapter = 'C1';
    lesson = 'B5';
  } else if (
    /giá trị lớn nhất|giá trị nhỏ nhất|\bgtln\b|\bgtnn\b|\\max\b|\\min\b|lớn nhất của hàm số|nhỏ nhất của hàm số/.test(
      lower
    )
  ) {
    grade = '12';
    chapter = 'C1';
    lesson = 'B2';
  } else if (
    /đồng biến|nghịch biến|đơn điệu|cực trị|cực đại|cực tiểu|điểm cực|giá trị cực|bảng biến thiên/.test(
      lower
    )
  ) {
    grade = '12';
    chapter = 'C1';
    lesson = 'B1';
  } else if (
    /đồ thị như hình|đường cong trong hình|tâm đối xứng|điểm uốn|hàm số bậc ba|hàm số trùng phương|giao điểm của đồ thị/.test(
      lower
    )
  ) {
    grade = '12';
    chapter = 'C1';
    lesson = 'B4';
  } else if (/đạo hàm của hàm số|tính đạo hàm|f'\(x\)|y'/.test(lower)) {
    grade = '11';
    chapter = 'C9';
    lesson = 'B32';
  } else if (/tập xác định của hàm số/.test(lower)) {
    grade = '10';
    chapter = 'C6';
    lesson = 'B15';
  }

  // COGNITIVE LEVEL DETERMINATION (NB | TH | VD | VDC)
  let level: 'NB' | 'TH' | 'VD' | 'VDC' = 'TH';

  const isHardModelingOrVDC =
    /làm tròn kết quả|làm tròn đến hàng|nội tiếp trong nửa đường tròn|cắt bỏ ở bốn góc|chi tiết máy|tham số m để.*có đúng|giá trị nguyên của tham số m|nhỏ nhất của biểu thức p\s*=/.test(
      lower
    );

  const isApplicationVD =
    /lợi nhuận|doanh thu|chi phí|tốc độ truyền dẫn|trữ lượng gỗ|khu rừng|nhà máy sản xuất|hợp tác xã|bằng bao nhiêu|khoảng cách giữa hai đường thẳng chéo nhau|góc nhị diện|tham số m\b/.test(
      lower
    );

  const isDirectRecognitionNB =
    /tập nghiệm của phương trình|nghiệm của phương trình|họ tất cả các nguyên hàm|điểm cực tiểu của hàm số|điểm cực đại của hàm số|giá trị cực tiểu|giá trị cực đại|tiệm cận đứng.*là|tiệm cận ngang.*là|vectơ pháp tuyến.*là|vectơ chỉ phương.*là|tâm của mặt cầu|bán kính của mặt cầu|công sai của cấp số cộng|công bội của cấp số nhân|tập xác định của hàm số|mệnh đề phủ định|công thức tính/.test(
      lower
    ) && !isApplicationVD && !isHardModelingOrVDC;

  if (partTypeHint === 'part3') {
    level = isHardModelingOrVDC ? 'VDC' : 'VD';
  } else if (partTypeHint === 'part2') {
    level = isHardModelingOrVDC || isApplicationVD ? 'VD' : 'TH';
  } else {
    if (isHardModelingOrVDC) {
      level = 'VDC';
    } else if (isApplicationVD) {
      level = 'VD';
    } else if (isDirectRecognitionNB) {
      level = 'NB';
    } else {
      level = 'TH';
    }
  }

  return {
    tag: `[${grade}-${chapter}-${lesson}-${level}]`,
    grade,
    chapter,
    lesson,
    level,
  };
}

export function classifyBankQuestionKNTT(
  item: Partial<BankQuestion>,
  fallbackGrade: '10' | '11' | '12' = '12',
  ignoreExistingTag = true
): {
  tag: string;
  grade: '10' | '11' | '12';
  chapter: string;
  lesson: string;
  level: 'NB' | 'TH' | 'VD' | 'VDC';
} {
  const parts: string[] = [];
  if (!ignoreExistingTag && item.tag) {
    parts.push(item.tag);
  }
  if (item.stem) parts.push(item.stem);
  if (item.options && item.options.length > 0) {
    parts.push(item.options.join(' '));
  }
  if (item.statements && item.statements.length > 0) {
    parts.push(item.statements.map((s) => s.text).join(' '));
  }
  if (item.solutionSteps && item.solutionSteps.length > 0) {
    parts.push(item.solutionSteps.map((s) => `${s.title || ''} ${s.math || ''}`).join(' '));
  }
  return inferTagFromText(parts.join(' '), fallbackGrade, ignoreExistingTag, item.partType);
}

export function inferDiagramFromText(text: string): DiagramKind | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('elip') && lower.includes('đường tròn tâm o')) {
    return 'ellipse_circle_solid';
  }
  if (lower.includes('hình thang cân abcd nội tiếp trong nửa đường tròn')) {
    return 'semicircle_trapezoid';
  }
  if (lower.includes('tấm nhôm hình vuông') && lower.includes('cắt bỏ ở bốn góc')) {
    return 'open_box_cutout';
  }
  if (lower.includes('s.abcd') && (lower.includes('hình chữ nhật') || lower.includes('hình vuông'))) {
    return 'pyramid_rect';
  }
  if (lower.includes('diện tích hình phẳng') && lower.includes('-3') && lower.includes('+2')) {
    return 'cubic_area';
  }
  if (lower.includes('tâm đối xứng') && lower.includes('điểm uốn')) {
    return 'cubic_graph_p2';
  }
  if (lower.includes('tiệm cận xiên') || (lower.includes('x^2') && lower.includes('x + 1') && lower.includes('cực trị'))) {
    return 'rational_oblique_p2';
  }
  if (lower.includes('tiệm cận đứng') || lower.includes('tiệm cận ngang')) {
    return 'bbt_rational';
  }
  if (lower.includes('bảng biến thiên') && (lower.includes('điểm cực tiểu') || lower.includes('điểm cực đại') || lower.includes('hàm số bậc ba'))) {
    return 'bbt_cubic';
  }
  return undefined;
}

function extractTableRowsFromText(text: string): {
  cleanText: string;
  tableImage?: string;
  tableData?: string[][];
} {
  const lines = text.split('\n');
  const tableLines: string[] = [];
  const normalLines: string[] = [];

  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.includes('|') &&
      (trimmed.split('|').length > 2 ||
        trimmed.startsWith('|') ||
        trimmed.endsWith('|') ||
        /Nhóm|Tần số|Thời gian|Giá trị|Tần suất/i.test(trimmed))
    ) {
      tableLines.push(trimmed);
      inTable = true;
    } else {
      if (inTable && tableLines.length > 0 && !trimmed) {
        inTable = false;
      } else if (inTable && trimmed.length < 3) {
        tableLines.push(trimmed);
      } else {
        inTable = false;
        normalLines.push(line);
      }
    }
  }

  if (tableLines.length >= 2) {
    const rows = tableLines
      .map((tl) =>
        tl
          .split('|')
          .map((c) => c.trim())
          .filter((c, idx, arr) => !((idx === 0 || idx === arr.length - 1) && !c))
      )
      .filter((r) => r.length > 0);

    if (rows.length > 0) {
      const pngBase64 = renderTableToPngBase64(rows);
      return { cleanText: normalLines.join('\n'), tableImage: pngBase64, tableData: rows };
    }
  }

  return { cleanText: text };
}

function parseVerbatimSolutionSteps(rawSolText: string): SolutionStep[] {
  const cleanSol = rawSolText
    .replace(/\s+(?=Bước\s+\d+[:.])/gi, '\n')
    .replace(/\s+(?=Kết luận\s*:)/gi, '\n')
    .trim();
  if (!cleanSol) return [];

  const lines = cleanSol
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const steps: SolutionStep[] = [];
  let currentStep: SolutionStep | null = null;

  for (const line of lines) {
    const stepHeaderMatch = line.match(/^(Bước\s+\d+[:.]?\s*.*)$/i);
    if (stepHeaderMatch) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        title: stepHeaderMatch[1].trim(),
        leadIn: '',
        math: '',
      };
    } else if (/^Kết luận:/i.test(line)) {
      if (currentStep) {
        currentStep.math = currentStep.math ? `${currentStep.math}\n${line}` : line;
      } else {
        steps.push({ title: 'Kết luận', leadIn: '', math: line });
      }
    } else {
      if (!currentStep) {
        currentStep = {
          title: 'Lời giải chi tiết',
          leadIn: '',
          math: line,
        };
      } else {
        currentStep.math = currentStep.math ? `${currentStep.math}\n${line}` : line;
      }
    }
  }

  if (currentStep) steps.push(currentStep);
  return steps;
}

export function parseExamTextToBankQuestions(
  rawText: string,
  sourceName = 'Nhập từ tệp',
  fallbackGrade: '10' | '11' | '12' = '12'
): BankQuestion[] {
  const cleanedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();

  if (!cleanedText) return [];

  const lines = cleanedText.split('\n');
  let activePart: BankPartType = 'part1';
  const blocks: { part: BankPartType; lines: string[] }[] = [];
  let currentBlock: { part: BankPartType; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip formatting instruction lines if any
    if (/^Canh lề câu hỏi|^Trình bày lời giải kết thúc/i.test(line)) continue;

    if (/^PHẦN\s+I\b/i.test(line)) {
      activePart = 'part1';
      continue;
    }
    if (/^PHẦN\s+II\b/i.test(line)) {
      activePart = 'part2';
      continue;
    }
    if (/^PHẦN\s+III\b/i.test(line)) {
      activePart = 'part3';
      continue;
    }
    if (/^BẢNG ĐÁP ÁN/i.test(line)) {
      break;
    }

    if (/^Câu\s+\d+/i.test(line)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { part: activePart, lines: [line] };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  // If user pasted a single question without "Câu 1.", treat whole text as one block
  if (blocks.length === 0 && cleanedText.length > 10) {
    blocks.push({ part: 'part1', lines: cleanedText.split('\n').map((l) => l.trim()).filter(Boolean) });
  }

  const now = new Date().toISOString();
  const results: BankQuestion[] = [];

  blocks.forEach((blk, idx) => {
    const joined = blk.lines.join('\n');
    const firstLine = blk.lines[0] || '';
    const cleanedFirst = firstLine
      .replace(/^Câu\s+\d+\s*(\[[^\]]+\])?\s*[.:]?\s*/i, '')
      .trim();

    // Split solution from question body (supporting multiple solution keywords)
    const solSplit = joined.split(/\n?(?:LỜI GIẢI|Lời giải:?|Hướng dẫn giải:?|Lời giải chi tiết:?)\s*\n?/i);
    const bodyText = solSplit[0] || joined;
    const rawSolText = solSplit.slice(1).join('\n') || '';

    // Extract structured tableData from [[TABLE_DATA:...]]
    let rawTableRows: string[][] | undefined = undefined;
    const tableDataMatch = bodyText.match(/\[\[TABLE_DATA:(\[[\s\S]*?\])\]\]/);
    if (tableDataMatch) {
      try {
        rawTableRows = JSON.parse(tableDataMatch[1]);
      } catch {
        rawTableRows = undefined;
      }
    }
    const tableComplexMatch = bodyText.match(/\[\[TABLE_COMPLEX:([01])\]\]/);
    const isComplexTbl =
      tableComplexMatch?.[1] === '1' ||
      (rawTableRows ? isComplexTableStructure(rawTableRows) : false);

    // Extract Layer 1 (stem) images: [[DOCX_IMAGE:...]] or [[TABLE_IMAGE:...]]
    const docxStemImgMatch = bodyText.match(/\[\[DOCX_IMAGE:(data:image\/[^;\]]+;base64,[^\]]+)\]\]/);
    const tableStemImgMatch = bodyText.match(/\[\[TABLE_IMAGE:(data:image\/(?:png|webp|jpeg|jpg);base64,[^\]]+)\]\]/);

    // Apply user's Advanced Table Format Settings when importing
    const tableSettings = loadBankTableExportSettings();
    let tableData: string[][] | undefined = rawTableRows;
    let stemImage: string | undefined = docxStemImgMatch ? docxStemImgMatch[1] : undefined;
    let markdownTableBlock = '';

    if (rawTableRows && rawTableRows.length > 0) {
      const mode = tableSettings.tableFormatMode;
      if (mode === 'markdown') {
        markdownTableBlock = convertTableRowsToMarkdown(
          rawTableRows,
          tableSettings.preserveMathInCells
        );
        tableData = undefined;
      } else if (mode === 'image_png' || (mode === 'auto_complex_to_image' && isComplexTbl)) {
        stemImage =
          tableStemImgMatch?.[1] ||
          stemImage ||
          renderTableToPngBase64(rawTableRows, tableSettings.imageDpiScale);
        tableData = undefined;
      } else {
        // 'keep_native' or simple table in 'auto_complex_to_image'
        tableData = rawTableRows;
      }
    } else if (!stemImage && tableStemImgMatch) {
      stemImage = tableStemImgMatch[1];
    }

    // Extract Layer 2 (solution) images from rawSolText: [[DOCX_IMAGE:...]] or [[TABLE_IMAGE:...]]
    let solutionImage: string | undefined = undefined;
    const docxSolImgMatch = rawSolText.match(/\[\[DOCX_IMAGE:(data:image\/[^;\]]+;base64,[^\]]+)\]\]/);
    const tableSolImgMatch = rawSolText.match(/\[\[TABLE_IMAGE:(data:image\/(?:png|webp|jpeg|jpg);base64,[^\]]+)\]\]/);
    if (tableSolImgMatch) {
      solutionImage = tableSolImgMatch[1];
    } else if (docxSolImgMatch) {
      solutionImage = docxSolImgMatch[1];
    }

    // Check for underlined/red-marked option in bodyText
    let markedOptionLetter: string | undefined = undefined;
    const markedOptMatch = bodyText.match(/\[\[MARKED_OPT:([A-D])\]\]/);
    if (markedOptMatch) {
      markedOptionLetter = markedOptMatch[1];
    }

    let cleanBodyText = bodyText
      .replace(/\[\[TABLE_COMPLEX:[01]\]\]/g, '')
      .replace(/\[\[TABLE_DATA:\[[\s\S]*?\]\]\]/g, '')
      .replace(/\[\[TABLE_IMAGE:[^\]]+\]\]/g, '')
      .replace(/\[\[DOCX_IMAGE:[^\]]+\]\]/g, '')
      .replace(/\[\[MARKED_OPT:[A-D]\]\]/g, '')
      .trim();

    const solText = rawSolText
      .replace(/\[\[TABLE_COMPLEX:[01]\]\]/g, '')
      .replace(/\[\[TABLE_DATA:\[[\s\S]*?\]\]\]/g, '')
      .replace(/\[\[TABLE_IMAGE:[^\]]+\]\]/g, '')
      .replace(/\[\[DOCX_IMAGE:[^\]]+\]\]/g, '')
      .replace(/\[\[MARKED_OPT:[A-D]\]\]/g, '')
      .trim();

    if (!stemImage && !tableData && !markdownTableBlock) {
      const extracted = extractTableRowsFromText(cleanBodyText);
      cleanBodyText = extracted.cleanText;
      if (extracted.tableData && extracted.tableData.length > 0) {
        const mode = tableSettings.tableFormatMode;
        const complex = isComplexTableStructure(extracted.tableData);
        if (mode === 'markdown') {
          markdownTableBlock = convertTableRowsToMarkdown(
            extracted.tableData,
            tableSettings.preserveMathInCells
          );
        } else if (mode === 'image_png' || (mode === 'auto_complex_to_image' && complex)) {
          stemImage =
            extracted.tableImage ||
            renderTableToPngBase64(extracted.tableData, tableSettings.imageDpiScale);
          tableData = undefined;
        } else {
          tableData = extracted.tableData;
        }
      }
    }

    const hasStatements = /(?:^|\n)\s*a\)\s+/i.test(cleanBodyText) && /(?:^|\n)\s*b\)\s+/i.test(cleanBodyText);
    const hasOptions = /(?:^|\n|\s)A\.\s+/.test(cleanBodyText) && /(?:^|\n|\s)B\.\s+/.test(cleanBodyText);
    let partType: BankPartType = blk.part;
    if (hasStatements) partType = 'part2';
    else if (hasOptions) partType = 'part1';
    else if (blk.part === 'part3' || /Trả lời:|Giá trị cần tìm/i.test(solText)) partType = 'part3';

    const meta = inferTagFromText(`${firstLine} ${cleanBodyText} ${solText}`, fallbackGrade, false, partType);
    // Do NOT redraw synthetic diagrams for imported Word questions ("hình không cần vẽ lại")
    const diagram: DiagramKind | undefined = undefined;

    if (partType === 'part1') {
      const optRegex = /(?:^|\n|\s)([A-D])\.\s+([\s\S]*?)(?=(?:\n|\s+[A-D]\.\s+|\n[A-D]\.\s+|$))/g;
      const beforeA = cleanBodyText.split(/(?:^|\n|\s)A\.\s+/)[0] || cleanedFirst;
      const baseStem = beforeA.replace(/^Câu\s+\d+\s*(\[[^\]]+\])?\s*[.:]?\s*/i, '').trim();
      const stem = markdownTableBlock ? `${baseStem}\n${markdownTableBlock}` : baseStem;
      const opts: [string, string, string, string] = ['Phương án A.', 'Phương án B.', 'Phương án C.', 'Phương án D.'];
      let m: RegExpExecArray | null;
      while ((m = optRegex.exec(cleanBodyText)) !== null) {
        const letterIdx = ['A', 'B', 'C', 'D'].indexOf(m[1]);
        if (letterIdx >= 0) {
          opts[letterIdx] = m[2].replace(/\n/g, ' ').trim();
        }
      }

      let correctIndex: 0 | 1 | 2 | 3 = 0;
      if (markedOptionLetter) {
        const mi = ['A', 'B', 'C', 'D'].indexOf(markedOptionLetter.toUpperCase());
        if (mi >= 0) correctIndex = mi as 0 | 1 | 2 | 3;
      }
      const pickMatch = solText.match(/Chọn\s+([A-D])/i) || solText.match(/Đáp án[:\s]+([A-D])/i);
      if (pickMatch) {
        const ci = ['A', 'B', 'C', 'D'].indexOf(pickMatch[1].toUpperCase());
        if (ci >= 0) correctIndex = ci as 0 | 1 | 2 | 3;
      }

      const verbatimSteps = parseVerbatimSolutionSteps(solText);

      results.push({
        id: `imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        partType: 'part1',
        ...meta,
        stem,
        options: opts,
        correctIndex,
        diagram,
        image: stemImage,
        imageUrl: stemImage,
        solutionImage,
        tableData,
        solutionSteps:
          verbatimSteps.length > 0
            ? verbatimSteps
            : [{ title: 'Lời giải', leadIn: '', math: `Đáp án đúng: ${['A', 'B', 'C', 'D'][correctIndex]}.` }],
        source: sourceName,
        updatedAt: now,
      });
    } else if (partType === 'part2') {
      const beforeA = cleanBodyText.split(/(?:^|\n)\s*a\)\s+/i)[0] || cleanedFirst;
      const stem = beforeA.replace(/^Câu\s+\d+\s*(\[[^\]]+\])?\s*[.:]?\s*/i, '').trim();
      const labels: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];
      const verbatimSteps = parseVerbatimSolutionSteps(solText);

      const stmts = labels.map((lb, sIdx): Part2Statement => {
        const stMatch = cleanBodyText.match(
          new RegExp(`(?:^|\\n)\\s*${lb}\\)\\s+([\\s\\S]*?)(?=\\n\\s*[a-d]\\)\\s+|$)`, 'i')
        );
        const verdictMatch =
          solText.match(new RegExp(`${lb}\\)\\s*(Đúng|Sai)`, 'i')) ||
          solText.match(new RegExp(`mệnh đề\\s+${lb}\\)\\s*(Đúng|Sai)`, 'i'));
        const isTrue = verdictMatch ? verdictMatch[1].toLowerCase() === 'đúng' : sIdx < 2;
        const matchedStep = verbatimSteps[sIdx];
        return {
          label: lb,
          text: stMatch ? stMatch[1].replace(/\n/g, ' ').trim() : `Mệnh đề ${lb})`,
          isTrue,
          stepTitle: matchedStep?.title || `Bước ${sIdx + 1}: Xét ý ${lb})`,
          leadIn: matchedStep?.leadIn || '',
          explanation: matchedStep?.math || (isTrue ? `Mệnh đề ${lb}) Đúng.` : `Mệnh đề ${lb}) Sai.`),
        };
      }) as [Part2Statement, Part2Statement, Part2Statement, Part2Statement];

      results.push({
        id: `imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        partType: 'part2',
        ...meta,
        stem,
        statements: stmts,
        diagram,
        image: stemImage,
        imageUrl: stemImage,
        solutionImage,
        tableData,
        solutionSteps: verbatimSteps,
        source: sourceName,
        updatedAt: now,
      });
    } else {
      const ansSource = solText || cleanBodyText;
      const ansMatch =
        ansSource.match(/Trả lời:\s*([^\n]+)/i) ||
        ansSource.match(/Giá trị cần tìm là\s*([^\n.]+)/i) ||
        ansSource.match(/Đáp số:\s*([^\n]+)/i);
      const answer = ansMatch
        ? ansMatch[1].trim().replace(/\./g, ',').slice(0, 8)
        : '0';
      const stem = cleanBodyText
        .replace(/^Câu\s+\d+\s*(\[[^\]]+\])?\s*[.:]?\s*/i, '')
        .replace(/\n?\s*(?:Trả lời|Đáp số):\s*[^\n]+/gi, '')
        .trim();

      const verbatimSteps = parseVerbatimSolutionSteps(solText);

      results.push({
        id: `imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        partType: 'part3',
        ...meta,
        stem,
        answer,
        diagram,
        image: stemImage,
        imageUrl: stemImage,
        solutionImage,
        tableData,
        solutionSteps:
          verbatimSteps.length > 0
            ? verbatimSteps
            : [{ title: 'Trả lời', leadIn: '', math: `Trả lời: ${answer}` }],
        source: sourceName,
        updatedAt: now,
      });
    }
  });

  return results;
}

export async function rescanBankQuestions(items: BankQuestion[]): Promise<BankQuestion[]> {
  const now = new Date().toISOString();
  const updated: BankQuestion[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Re-evaluate full question content (stem + options + statements + solution) ignoring stale tags
    const inferred = classifyBankQuestionKNTT(item, item.grade || '12', true);
    const primaryImage = item.image || item.imageUrl;
    const shouldClearDiagram =
      item.id.startsWith('imp-') || Boolean(primaryImage || item.tableData);
    updated[i] = {
      ...item,
      tag: inferred.tag,
      grade: inferred.grade,
      chapter: inferred.chapter,
      lesson: inferred.lesson,
      level: inferred.level,
      image: primaryImage,
      imageUrl: undefined,
      diagram: shouldClearDiagram ? undefined : item.diagram,
      updatedAt: now,
    };
    if (i > 0 && i % 400 === 0) {
      await yieldToMain();
    }
  }
  await replaceAllBankQuestions(updated);
  return updated;
}

export async function normalizeAndDeduplicateBank(
  items: BankQuestion[]
): Promise<{ items: BankQuestion[]; removedDuplicates: number }> {
  const seen = new Set<string>();
  const seenStemOnly = new Set<string>();
  const cleaned: BankQuestion[] = [];
  let removedDuplicates = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cleanStem = item.stem
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\\n(?![a-zA-Z])/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidate = { ...item, stem: cleanStem };
    const fp = buildQuestionFingerprint(candidate);
    const stemOnly = `${item.partType}:${normalizeSignature(cleanStem)}`;
    const isDuplicate =
      !cleanStem ||
      !fp ||
      seen.has(fp) ||
      (stemOnly.length > 45 &&
        !/hình vẽ|bảng biến thiên|đồ thị như|bảng số liệu|khẳng định nào|mệnh đề nào/i.test(cleanStem) &&
        seenStemOnly.has(stemOnly));

    if (isDuplicate) {
      removedDuplicates++;
    } else {
      seen.add(fp);
      if (stemOnly.length > 45) {
        seenStemOnly.add(stemOnly);
      }
      const primaryImage = item.image || item.imageUrl;
      const shouldClearDiagram =
        item.id.startsWith('imp-') || Boolean(primaryImage || item.tableData);
      const inferred = classifyBankQuestionKNTT(candidate, item.grade || '12', true);
      cleaned.push(
        normalizeQuestionInMemory({
          ...item,
          stem: cleanStem,
          tag: inferred.tag,
          grade: inferred.grade,
          chapter: inferred.chapter,
          lesson: inferred.lesson,
          level: inferred.level,
          image: primaryImage,
          imageUrl: undefined,
          diagram: shouldClearDiagram ? undefined : item.diagram,
          answer: item.answer ? item.answer.replace(/\./g, ',').slice(0, 8) : item.answer,
        })
      );
    }
    if (i > 0 && i % 400 === 0) {
      await yieldToMain();
    }
  }

  await replaceAllBankQuestions(cleaned);
  return { items: cleaned, removedDuplicates };
}

export function build22BgdExamFromBank(
  items: BankQuestion[],
  baseExam: ExamPaper,
  preferredGrade?: 'all' | '10' | '11' | '12'
): ExamPaper {
  const pool =
    preferredGrade && preferredGrade !== 'all'
      ? items.filter((q) => q.grade === preferredGrade)
      : items;

  const p1Pool = pool.filter((q) => q.partType === 'part1');
  const p2Pool = pool.filter((q) => q.partType === 'part2');
  const p3Pool = pool.filter((q) => q.partType === 'part3');

  // Select 12 Part I striving for 3A-3B-3C-3D balance
  const selectedP1Raw: BankQuestion[] = [];
  const usedP1 = new Set<string>();
  ([0, 1, 2, 3] as const).forEach((ci) => {
    const matches = p1Pool.filter((q) => (q.correctIndex ?? 0) === ci && !usedP1.has(q.id));
    matches.slice(0, 3).forEach((m) => {
      selectedP1Raw.push(m);
      usedP1.add(m.id);
    });
  });
  p1Pool.forEach((q) => {
    if (selectedP1Raw.length < 12 && !usedP1.has(q.id)) {
      selectedP1Raw.push(q);
      usedP1.add(q.id);
    }
  });

  const part1: Part1Question[] = selectedP1Raw.slice(0, 12).map((q, idx) => ({
    id: `sel_p1_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    options: q.options || ['Phương án A.', 'Phương án B.', 'Phương án C.', 'Phương án D.'],
    correctIndex: q.correctIndex ?? 0,
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps || [
      { title: 'Bước 1: Giải chi tiết', leadIn: 'Ta có:', math: 'Chọn đáp án đúng theo suy luận.' },
    ],
  }));
  while (part1.length < 12) {
    const fallback = MOCK_EXAM_0107.part1[part1.length];
    part1.push({ ...fallback, number: part1.length + 1 });
  }

  const part2: Part2Question[] = p2Pool.slice(0, 4).map((q, idx) => ({
    id: `sel_p2_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps,
    statements:
      q.statements ||
      MOCK_EXAM_0107.part2[idx % MOCK_EXAM_0107.part2.length].statements,
  }));
  while (part2.length < 4) {
    const fallback = MOCK_EXAM_0107.part2[part2.length];
    part2.push({ ...fallback, number: part2.length + 1 });
  }

  const part3: Part3Question[] = p3Pool.slice(0, 6).map((q, idx) => ({
    id: `sel_p3_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    answer: (q.answer || '0').replace(/\./g, ',').slice(0, 8),
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps || [
      { title: 'Bước 1: Tính toán', leadIn: 'Ta có:', math: `Giá trị cần tìm là $${q.answer || '0'}$.` },
    ],
  }));
  while (part3.length < 6) {
    const fallback = MOCK_EXAM_0107.part3[part3.length];
    part3.push({ ...fallback, number: part3.length + 1 });
  }

  return {
    ...baseExam,
    id: `bgd22-${Date.now()}`,
    examCode: String(Math.floor(1000 + Math.random() * 8999)),
    examTitle:
      preferredGrade && preferredGrade !== 'all'
        ? `ĐỀ CHỌN LỌC 22 CÂU CHUẨN BGD — TOÁN ${preferredGrade}`
        : 'ĐỀ CHỌN LỌC 22 CÂU CHUẨN BGD (TỪ KHO CÂU HỎI)',
    part1,
    part2,
    part3,
  };
}

export function buildExamFromSelectedBankQuestions(
  selected: BankQuestion[],
  baseExam: ExamPaper,
  customTitle?: string
): ExamPaper {
  const p1Items = selected.filter((q) => q.partType === 'part1');
  const p2Items = selected.filter((q) => q.partType === 'part2');
  const p3Items = selected.filter((q) => q.partType === 'part3');

  const part1: Part1Question[] = p1Items.map((q, idx) => ({
    id: `sel_p1_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    options: q.options || ['Phương án A.', 'Phương án B.', 'Phương án C.', 'Phương án D.'],
    correctIndex: q.correctIndex ?? 0,
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps || [
      { title: 'Bước 1: Giải chi tiết', leadIn: 'Ta có:', math: 'Chọn đáp án đúng theo suy luận.' },
    ],
  }));

  const part2: Part2Question[] = p2Items.map((q, idx) => ({
    id: `sel_p2_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps,
    statements:
      q.statements ||
      MOCK_EXAM_0107.part2[idx % MOCK_EXAM_0107.part2.length].statements,
  }));

  const part3: Part3Question[] = p3Items.map((q, idx) => ({
    id: `sel_p3_${idx + 1}`,
    number: idx + 1,
    tag: q.tag,
    stem: q.stem,
    answer: (q.answer || '0').replace(/\./g, ',').slice(0, 8),
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    imageUrl: q.imageUrl || q.image,
    solutionImage: q.solutionImage,
    tableData: q.tableData,
    solutionSteps: q.solutionSteps || [
      { title: 'Bước 1: Tính toán', leadIn: 'Ta có:', math: `Giá trị cần tìm là $${q.answer || '0'}$.` },
    ],
  }));

  const gradeSet = new Set(selected.map((q) => q.grade));
  const resolvedGrade: '10' | '11' | '12' =
    gradeSet.size === 1 ? (Array.from(gradeSet)[0] as '10' | '11' | '12') : baseExam.grade;

  return {
    ...baseExam,
    id: `custom-${Date.now()}`,
    examCode: String(Math.floor(1000 + Math.random() * 8999)),
    grade: resolvedGrade,
    examTitle:
      customTitle || `ĐỀ CHỌN LỌC ${selected.length} CÂU CHUYÊN ĐỀ (TỪ KHO CÂU HỎI)`,
    part1,
    part2,
    part3,
  };
}

export async function exportBankToJsonFile(
  items: BankQuestion[],
  filenamePrefix = 'TeachLearnEdu_KhoCauHoi',
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const exportedAt = new Date().toISOString();
  const blobParts: BlobPart[] = [
    `{"app":"TeachLearn Edu","schemaVersion":1,"exportedAt":${JSON.stringify(
      exportedAt
    )},"totalQuestions":${items.length},"questions":[\n`,
  ];

  const CHUNK_SIZE = 200;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, items.length);
    const lines: string[] = [];
    for (let j = i; j < end; j++) {
      const q = items[j];
      // Omit duplicate imageUrl when identical to image so backup size is halved and never hits string limit
      const compact: BankQuestion =
        q.image && q.imageUrl && q.image === q.imageUrl
          ? { ...q, imageUrl: undefined }
          : q;
      const prefix = j === 0 ? '' : ',\n';
      lines.push(prefix + JSON.stringify(compact));
    }
    blobParts.push(lines.join(''));
    onProgress?.(end, items.length);
    if (end < items.length && i % 400 === 0) {
      await yieldToMain();
    }
  }

  blobParts.push('\n]}');

  const blob = new Blob(blobParts, {
    type: 'application/json;charset=utf-8',
  });
  const dateStr = exportedAt.slice(0, 10);
  const filename = `${filenamePrefix}_${dateStr}.json`;

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    saveAs(blob, filename);
  }
}

export function parseBankFromJsonText(rawJson: string): BankQuestion[] {
  const parsed = JSON.parse(rawJson);
  const now = new Date().toISOString();

  if (Array.isArray(parsed)) {
    return parsed
      .filter((x) => x && typeof x.stem === 'string')
      .map((x, i) =>
        normalizeQuestionInMemory({
          ...x,
          id: x.id || `json-${Date.now()}-${i}`,
          image: x.image || x.imageUrl,
          updatedAt: x.updatedAt || now,
        })
      );
  }
  if (parsed && Array.isArray(parsed.questions)) {
    return parsed.questions
      .filter((x: any) => x && typeof x.stem === 'string')
      .map((x: any, i: number) =>
        normalizeQuestionInMemory({
          ...x,
          id: x.id || `json-${Date.now()}-${i}`,
          image: x.image || x.imageUrl,
          updatedAt: x.updatedAt || now,
        })
      );
  }
  if (parsed && (Array.isArray(parsed.part1) || Array.isArray(parsed.part2) || Array.isArray(parsed.part3))) {
    return examPaperToBankQuestions(parsed as ExamPaper, 'Nạp từ tệp JSON đề');
  }
  throw new Error('Cấu trúc JSON không đúng định dạng Kho câu hỏi TeachLearn Edu.');
}

function extractInlineMarkdownTableFromStem(stem: string): {
  cleanStem: string;
  rows?: string[][];
} {
  if (!stem || !stem.includes('|') || !stem.includes('\n')) {
    return { cleanStem: stem };
  }
  const lines = stem.split('\n');
  const tableLines: string[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|') && t.endsWith('|') && t.split('|').length >= 3) {
      tableLines.push(t);
    } else {
      textLines.push(line);
    }
  }
  if (tableLines.length < 2) return { cleanStem: stem };
  const rows = tableLines
    .map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
    )
    .filter((row) => !row.every((c) => /^:?-{2,}:?$/.test(c)));
  if (rows.length === 0) return { cleanStem: stem };
  return {
    cleanStem: textLines.join('\n').trim(),
    rows,
  };
}

export async function applyTableFormatModeToBank(
  items: BankQuestion[],
  settings: BankTableExportSettings
): Promise<{ items: BankQuestion[]; convertedCount: number }> {
  saveBankTableExportSettings(settings);
  let convertedCount = 0;
  const updated: BankQuestion[] = new Array(items.length);

  for (let i = 0; i < items.length; i++) {
    const q = items[i];
    const mdExtracted = extractInlineMarkdownTableFromStem(q.stem);
    const rows =
      q.tableData && q.tableData.length > 0
        ? q.tableData
        : mdExtracted.rows && mdExtracted.rows.length > 0
        ? mdExtracted.rows
        : q.diagram === 'stat_table_12'
        ? [
            ['Thời gian (phút)', '[30; 50)', '[50; 70)', '[70; 90)', '[90; 110)', '[110; 130)'],
            ['Số học sinh', '6', '10', '12', '8', '4'],
          ]
        : undefined;

    if (!rows) {
      updated[i] = q;
      continue;
    }

    convertedCount++;
    const baseStem = mdExtracted.cleanStem;
    const isComplex = isComplexTableStructure(rows);
    const mode = settings.tableFormatMode;

    if (mode === 'markdown') {
      const mdTable = convertTableRowsToMarkdown(rows, settings.preserveMathInCells);
      updated[i] = {
        ...q,
        stem: `${baseStem}\n${mdTable}`,
        tableData: rows,
        image: undefined,
        imageUrl: undefined,
      };
    } else if (mode === 'image_png' || (mode === 'auto_complex_to_image' && isComplex)) {
      const capturedImg = await renderStructuredTableToImageUnder100KB(
        buildStructuredTableFromFlatRows(rows),
        settings.imageDpiScale,
        94 * 1024
      );
      updated[i] = {
        ...q,
        stem: baseStem,
        tableData: rows,
        image: capturedImg || q.image,
        imageUrl: undefined,
      };
    } else {
      // keep_native
      updated[i] = {
        ...q,
        stem: baseStem,
        tableData: rows,
        image: undefined,
        imageUrl: undefined,
      };
    }

    if (i > 0 && i % 300 === 0) {
      await yieldToMain();
    }
  }

  await replaceAllBankQuestions(updated);
  return { items: updated, convertedCount };
}

export async function exportBankToMarkdownFile(
  items: BankQuestion[],
  settings: BankTableExportSettings,
  filenamePrefix = 'TeachLearnEdu_NganHangDe_Markdown'
): Promise<void> {
  const exportedAt = new Date().toISOString().slice(0, 10);
  const parts: string[] = [
    `# NGÂN HÀNG CÂU HỎI TOÁN THPT (CHUẨN SGK KẾT NỐI TRI THỨC)`,
    `> Ngày xuất: ${exportedAt} · Tổng số câu: ${items.length} · Định dạng bảng: ${settings.tableFormatMode}`,
    '',
  ];

  items.forEach((q, idx) => {
    const mdExtracted = extractInlineMarkdownTableFromStem(q.stem);
    parts.push(`### Câu ${idx + 1} ${q.tag}`);
    parts.push(mdExtracted.cleanStem);

    const rows = q.tableData || mdExtracted.rows;
    if (rows && rows.length > 0) {
      if (settings.exportDocxTableStyle === 'embedded_png_image' && (q.image || q.imageUrl)) {
        parts.push(`\n![Bảng số liệu Câu ${idx + 1}](${q.image || q.imageUrl})\n`);
      } else {
        parts.push('\n' + convertTableRowsToMarkdown(rows, settings.preserveMathInCells) + '\n');
      }
    } else if (q.image || q.imageUrl) {
      parts.push(`\n![Hình minh họa Câu ${idx + 1}](${q.image || q.imageUrl})\n`);
    }

    if (q.partType === 'part1' && q.options) {
      const letters = ['A', 'B', 'C', 'D'];
      q.options.forEach((opt, oIdx) => {
        const mark = oIdx === (q.correctIndex ?? 0) ? ' **(Đáp án đúng)**' : '';
        parts.push(`- **${letters[oIdx]}.** ${opt}${mark}`);
      });
    } else if (q.partType === 'part2' && q.statements) {
      q.statements.forEach((st) => {
        parts.push(`- **${st.label})** ${st.text} — **${st.isTrue ? 'Đúng' : 'Sai'}**`);
      });
    } else if (q.partType === 'part3') {
      parts.push(`- **Trả lời ngắn:** \`${q.answer || ''}\``);
    }

    if (q.solutionSteps && q.solutionSteps.length > 0) {
      parts.push('\n**LỜI GIẢI CHI TIẾT:**');
      q.solutionSteps.forEach((s) => {
        parts.push(`- *${s.title}*: ${[s.leadIn, s.math].filter(Boolean).join(' ')}`);
      });
    }
    parts.push('\n---\n');
  });

  const blob = new Blob([parts.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const filename = `${filenamePrefix}_${exportedAt}.md`;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    saveAs(blob, filename);
  }
}
