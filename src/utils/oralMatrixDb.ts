import {
  BankPartType,
  BankQuestion,
  BoardEssayQuestion,
  ExamPaper,
  LiveQuizPackage,
  OralCheckMatrixConfig,
  OralQuestionFormat,
} from '../types/eduplan';
import { buildSyncedMockExam } from '../data/mockExam0107';
import {
  buildExamFromSelectedBankQuestions,
  examPaperToBankQuestions,
  KNTT_CATALOG_CHAPTERS,
  lookupKNTTMeta,
} from './questionBankDb';

const STORAGE_KEY = 'eduplan_oral_matrix_configs_v1';

export type CognitiveLevel = 'NB' | 'TH' | 'VD' | 'VDC';

export function getDefaultChapterForGrade(grade: '10' | '11' | '12'): string {
  const ch = KNTT_CATALOG_CHAPTERS.find((c) => c.grade === grade);
  return ch ? ch.code : 'C1';
}

export function buildTopicLabelFromScope(
  grade: '10' | '11' | '12',
  chapterCode: string,
  lessonCode: string
): string {
  if (chapterCode === 'all') {
    return `Tổng hợp kiến thức Toán ${grade}`;
  }
  const meta = lookupKNTTMeta(grade, chapterCode, lessonCode === 'all' ? 'B1' : lessonCode);
  if (lessonCode === 'all') {
    return meta.chapterTitle;
  }
  return `${meta.chapterTitle} — ${meta.lessonTitle}`;
}

export function createDefaultOralMatrixConfig(
  grade: '10' | '11' | '12'
): OralCheckMatrixConfig {
  const chapterCode = getDefaultChapterForGrade(grade);
  return {
    id: `matrix-${grade}-${Date.now()}`,
    grade,
    chapterCode,
    lessonCode: 'all',
    topicLabel: buildTopicLabelFromScope(grade, chapterCode, 'all'),
    formats: {
      part1: true,
      part2: false,
      part3: true,
      essay: false,
    },
    levelCounts: {
      NB: 1,
      TH: 2,
      VD: 1,
      VDC: 0,
    },
    essayPromptNote: '',
    semester: 1,
    targetColumnMode: 'auto',
    timeLimitMinutes: 10,
    packageCount: 3,
    isLocked: false,
    updatedAt: new Date().toISOString(),
  };
}

export function loadAllOralMatrixConfigs(): Partial<Record<'10' | '11' | '12', OralCheckMatrixConfig>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadOralMatrixConfigForGrade(
  grade: '10' | '11' | '12'
): OralCheckMatrixConfig | null {
  const all = loadAllOralMatrixConfigs();
  const found = all[grade];
  if (!found || !found.isLocked) return null;
  return found;
}

export function saveOralMatrixConfig(config: OralCheckMatrixConfig): void {
  try {
    const all = loadAllOralMatrixConfigs();
    all[config.grade] = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function getEffectiveBankForGradeAndChapter(
  bankItems: BankQuestion[],
  grade: '10' | '11' | '12',
  chapterCode: string
): { pool: BankQuestion[]; isSupplemented: boolean } {
  const gradeBank = bankItems.filter((q) => q.grade === grade);

  if (chapterCode !== 'all') {
    const chapterBank = gradeBank.filter(
      (q) => q.chapter.toUpperCase() === chapterCode.toUpperCase()
    );
    if (chapterBank.length >= 4) {
      return { pool: gradeBank, isSupplemented: false };
    }
    const chapterId = `${grade}-${chapterCode.toLowerCase()}`;
    const sampleExam = buildSyncedMockExam(grade, chapterId);
    const sampleBank = examPaperToBankQuestions(
      sampleExam,
      `Ngân hàng chuẩn KNTT Khối ${grade}`
    ).map((q, idx) => ({
      ...q,
      id: `kntt-${grade}-${chapterCode}-${idx}-${q.id}`,
      grade,
      chapter: chapterCode.toUpperCase(),
    }));

    const seen = new Set(gradeBank.map((q) => q.id));
    const merged = [...gradeBank, ...sampleBank.filter((q) => !seen.has(q.id))];
    return { pool: merged, isSupplemented: true };
  }

  if (gradeBank.length >= 6) {
    return { pool: gradeBank, isSupplemented: false };
  }

  // Supplement starter KNTT items across first 2 chapters of the grade if bank has < 6 questions
  const chaptersForGrade = KNTT_CATALOG_CHAPTERS.filter((c) => c.grade === grade).slice(0, 3);
  const supplemented: BankQuestion[] = [...gradeBank];
  chaptersForGrade.forEach((ch) => {
    const ex = buildSyncedMockExam(grade, `${grade}-${ch.code.toLowerCase()}`);
    const qs = examPaperToBankQuestions(ex, `Ngân hàng chuẩn KNTT Khối ${grade}`).map((q, i) => ({
      ...q,
      id: `kntt-${grade}-${ch.code}-${i}-${q.id}`,
      grade,
      chapter: ch.code,
    }));
    supplemented.push(...qs);
  });
  return { pool: supplemented, isSupplemented: true };
}

export interface ScopeAvailabilityStats {
  totalInScope: number;
  totalInGrade: number;
  byLevel: Record<CognitiveLevel, number>;
  byPart: Record<BankPartType, number>;
  isSupplemented: boolean;
}

export function countAvailabilityForScope(
  bankItems: BankQuestion[],
  grade: '10' | '11' | '12',
  chapterCode: string,
  lessonCode: string,
  enabledFormats?: { part1: boolean; part2: boolean; part3: boolean; essay: boolean }
): ScopeAvailabilityStats {
  const { pool, isSupplemented } = getEffectiveBankForGradeAndChapter(
    bankItems,
    grade,
    chapterCode
  );

  const scoped = pool.filter((q) => {
    if (q.grade !== grade) return false;
    if (chapterCode !== 'all' && q.chapter.toUpperCase() !== chapterCode.toUpperCase()) {
      return false;
    }
    if (lessonCode !== 'all' && q.lesson.toUpperCase() !== lessonCode.toUpperCase()) {
      return false;
    }
    if (enabledFormats && !enabledFormats.essay) {
      if (!enabledFormats[q.partType]) return false;
    }
    return true;
  });

  const byLevel: Record<CognitiveLevel, number> = { NB: 0, TH: 0, VD: 0, VDC: 0 };
  const byPart: Record<BankPartType, number> = { part1: 0, part2: 0, part3: 0 };

  scoped.forEach((q) => {
    byLevel[q.level] = (byLevel[q.level] || 0) + 1;
    byPart[q.partType] = (byPart[q.partType] || 0) + 1;
  });

  return {
    totalInScope: scoped.length,
    totalInGrade: pool.length,
    byLevel,
    byPart,
    isSupplemented,
  };
}

export function formatMatrixRequirementSummary(matrix: OralCheckMatrixConfig): string {
  const lvlParts: string[] = [];
  if (matrix.levelCounts.NB > 0) lvlParts.push(`${matrix.levelCounts.NB} câu Nhận biết`);
  if (matrix.levelCounts.TH > 0) lvlParts.push(`${matrix.levelCounts.TH} câu Thông hiểu`);
  if (matrix.levelCounts.VD > 0) lvlParts.push(`${matrix.levelCounts.VD} câu Vận dụng`);
  if (matrix.levelCounts.VDC > 0) lvlParts.push(`${matrix.levelCounts.VDC} câu Vận dụng cao`);

  const fmtParts: string[] = [];
  if (matrix.formats.part1) fmtParts.push('Trắc nghiệm 4 lựa chọn');
  if (matrix.formats.part2) fmtParts.push('Đúng/Sai');
  if (matrix.formats.part3) fmtParts.push('Trả lời ngắn');
  if (matrix.formats.essay) fmtParts.push('Tự luận trình bày bảng');

  return `${matrix.topicLabel} · Gồm ${lvlParts.join(', ') || '1 câu kiểm tra'} (${fmtParts.join(', ')})`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toBoardEssayStem(q: BankQuestion): string {
  const raw = (q.stem || '').trim();
  if (q.partType === 'part3') return raw;
  if (/\?\s*$/.test(raw)) return raw;
  if (/\b(là|bằng)\s*:?\s*$/i.test(raw)) {
    return `${raw.replace(/\s*:?\s*$/, '')} bao nhiêu? (Trình bày lời giải chi tiết trên bảng)`;
  }
  return `${raw} (Trình bày lời giải chi tiết trên bảng)`;
}

function bankQuestionToEssay(q: BankQuestion, number: number): BoardEssayQuestion {
  let refAnswer = q.answer || '';
  if (!refAnswer && q.partType === 'part1' && q.options && q.correctIndex !== undefined) {
    refAnswer = q.options[q.correctIndex] || '';
  } else if (!refAnswer && q.partType === 'part2' && q.statements) {
    refAnswer = q.statements
      .map((s) => `${s.label}) ${s.isTrue ? 'Đúng' : 'Sai'}`)
      .join(' · ');
  }

  return {
    id: `essay-${number}-${q.id}`,
    number,
    tag: q.tag,
    level: q.level,
    stem: toBoardEssayStem(q),
    diagram: q.diagram,
    image: q.image || q.imageUrl,
    tableData: q.tableData,
    referenceAnswer: refAnswer,
    solutionSteps:
      q.solutionSteps && q.solutionSteps.length > 0
        ? q.solutionSteps
        : [
            {
              title: 'Bước 1: Gợi ý chấm điểm trình bày bảng',
              leadIn: 'Đáp án chuẩn tham khảo:',
              math: refAnswer || 'Kiểm tra lập luận và kết quả cuối cùng của học sinh.',
            },
          ],
  };
}

export function generateRandomPackagesFromMatrix(
  bankItems: BankQuestion[],
  matrix: OralCheckMatrixConfig,
  baseExam: ExamPaper,
  className?: string
): LiveQuizPackage[] {
  const { pool } = getEffectiveBankForGradeAndChapter(
    bankItems,
    matrix.grade,
    matrix.chapterCode
  );

  // Build hierarchical fallback scopes strictly within the same Grade
  const scopeExact = pool.filter((q) => {
    if (q.grade !== matrix.grade) return false;
    if (matrix.chapterCode !== 'all' && q.chapter.toUpperCase() !== matrix.chapterCode.toUpperCase()) {
      return false;
    }
    if (matrix.lessonCode !== 'all' && q.lesson.toUpperCase() !== matrix.lessonCode.toUpperCase()) {
      return false;
    }
    return true;
  });

  const scopeChapter = pool.filter((q) => {
    if (q.grade !== matrix.grade) return false;
    if (matrix.chapterCode !== 'all' && q.chapter.toUpperCase() !== matrix.chapterCode.toUpperCase()) {
      return false;
    }
    return true;
  });

  const scopeGrade = pool.filter((q) => q.grade === matrix.grade);

  const enabledFormats: OralQuestionFormat[] = [];
  if (matrix.formats.part1) enabledFormats.push('part1');
  if (matrix.formats.part2) enabledFormats.push('part2');
  if (matrix.formats.part3) enabledFormats.push('part3');
  if (matrix.formats.essay) enabledFormats.push('essay');
  if (enabledFormats.length === 0) enabledFormats.push('part1');

  const requestedSlots: CognitiveLevel[] = [];
  (['NB', 'TH', 'VD', 'VDC'] as CognitiveLevel[]).forEach((lvl) => {
    const cnt = Math.max(0, matrix.levelCounts[lvl] || 0);
    for (let i = 0; i < cnt; i++) requestedSlots.push(lvl);
  });
  if (requestedSlots.length === 0) {
    requestedSlots.push('TH');
  }

  // Map each cognitive slot to a target format evenly while putting essay on higher-order slots if mixed
  const assignFormatsToSlots = (slots: CognitiveLevel[]): { level: CognitiveLevel; format: OralQuestionFormat }[] => {
    const hasEssay = enabledFormats.includes('essay');
    const objFormats = enabledFormats.filter((f) => f !== 'essay') as BankPartType[];

    if (hasEssay && objFormats.length === 0) {
      return slots.map((level) => ({ level, format: 'essay' }));
    }

    if (!hasEssay) {
      return slots.map((level, idx) => ({
        level,
        format: enabledFormats[idx % enabledFormats.length],
      }));
    }

    // Both essay and objective enabled: reserve at least 1 higher-order slot (from end) for essay
    const essayCount = Math.max(1, Math.round(slots.length / enabledFormats.length));
    const result: { level: CognitiveLevel; format: OralQuestionFormat }[] = slots.map((level, idx) => ({
      level,
      format: objFormats[idx % objFormats.length],
    }));
    for (let i = 0; i < essayCount && i < result.length; i++) {
      result[result.length - 1 - i].format = 'essay';
    }
    return result;
  };

  const slotSpecs = assignFormatsToSlots(requestedSlots);
  const globalUsedIds = new Set<string>();
  const packages: LiveQuizPackage[] = [];

  for (let pIdx = 0; pIdx < matrix.packageCount; pIdx++) {
    const pkgUsedIds = new Set<string>();
    const chosenPart1: BankQuestion[] = [];
    const chosenPart2: BankQuestion[] = [];
    const chosenPart3: BankQuestion[] = [];
    const chosenEssays: BoardEssayQuestion[] = [];
    const levelSummary: Record<CognitiveLevel, number> = { NB: 0, TH: 0, VD: 0, VDC: 0 };

    const pickOne = (level: CognitiveLevel, format: OralQuestionFormat): BankQuestion | null => {
      const targetPartTypes: BankPartType[] =
        format === 'essay' ? ['part3', 'part1', 'part2'] : [format];

      const tiers = [scopeExact, scopeChapter, scopeGrade];

      // Pass 1: match exact level + preferred format + unused globally
      for (const tier of tiers) {
        for (const pt of targetPartTypes) {
          const candidates = shuffleArray(
            tier.filter(
              (q) =>
                q.partType === pt &&
                q.level === level &&
                !pkgUsedIds.has(q.id) &&
                !globalUsedIds.has(q.id)
            )
          );
          if (candidates.length > 0) return candidates[0];
        }
      }

      // Pass 2: match exact level + preferred format + unused in this package (allows reuse across packages if bank is small)
      for (const tier of tiers) {
        for (const pt of targetPartTypes) {
          const candidates = shuffleArray(
            tier.filter((q) => q.partType === pt && q.level === level && !pkgUsedIds.has(q.id))
          );
          if (candidates.length > 0) return candidates[0];
        }
      }

      // Pass 3: match preferred format regardless of level (unused globally first)
      for (const tier of tiers) {
        for (const pt of targetPartTypes) {
          const candidates = shuffleArray(
            tier.filter((q) => q.partType === pt && !pkgUsedIds.has(q.id) && !globalUsedIds.has(q.id))
          );
          if (candidates.length > 0) return candidates[0];
        }
      }

      // Pass 4: any question in scope/grade unused in this package
      for (const tier of tiers) {
        const candidates = shuffleArray(tier.filter((q) => !pkgUsedIds.has(q.id)));
        if (candidates.length > 0) return candidates[0];
      }

      // Pass 5: fallback to first item in scopeGrade if even pkgUsedIds exhausted
      return scopeGrade.length > 0
        ? scopeGrade[Math.floor(Math.random() * scopeGrade.length)]
        : null;
    };

    slotSpecs.forEach((slot) => {
      const picked = pickOne(slot.level, slot.format);
      if (!picked) {
        if (slot.format === 'essay') {
          const num = chosenEssays.length + 1;
          chosenEssays.push({
            id: `essay-custom-${pIdx}-${num}`,
            number: num,
            tag: `[${matrix.grade}-${matrix.chapterCode === 'all' ? 'C1' : matrix.chapterCode}-${matrix.lessonCode === 'all' ? 'B1' : matrix.lessonCode}-${slot.level}]`,
            level: slot.level,
            stem:
              matrix.essayPromptNote?.trim() ||
              `Trình bày trên bảng nội dung trọng tâm thuộc ${matrix.topicLabel} (Mức độ ${slot.level}).`,
            referenceAnswer: 'Giáo viên đánh giá trực tiếp phần trình bày của học sinh trên bảng.',
            solutionSteps: [
              {
                title: 'Bước 1: Đánh giá bài trình bày bảng',
                leadIn: 'Tiêu chí chấm:',
                math: 'Đúng phương pháp, biến đổi chính xác, kết luận rõ ràng.',
              },
            ],
          });
          levelSummary[slot.level]++;
        }
        return;
      }

      pkgUsedIds.add(picked.id);
      globalUsedIds.add(picked.id);
      levelSummary[slot.level]++;

      if (slot.format === 'essay') {
        const essayItem = bankQuestionToEssay(picked, chosenEssays.length + 1);
        if (matrix.essayPromptNote?.trim() && chosenEssays.length === 0) {
          essayItem.stem = `${matrix.essayPromptNote.trim()}\n\nBài tập áp dụng: ${essayItem.stem}`;
        }
        chosenEssays.push(essayItem);
      } else if (picked.partType === 'part1') {
        chosenPart1.push(picked);
      } else if (picked.partType === 'part2') {
        chosenPart2.push(picked);
      } else {
        chosenPart3.push(picked);
      }
    });

    const objExam = buildExamFromSelectedBankQuestions(
      [...chosenPart1, ...chosenPart2, ...chosenPart3],
      baseExam,
      `${matrix.topicLabel} · Gói đề số 0${pIdx + 1}${className ? ` · Lớp ${className}` : ''}`
    );

    packages.push({
      packageIndex: pIdx + 1,
      packageLabel: `Gói đề số 0${pIdx + 1}`,
      examPaper: {
        ...objExam,
        grade: matrix.grade,
        durationMinutes: matrix.timeLimitMinutes,
      },
      essays: chosenEssays,
      totalItems:
        objExam.part1.length +
        objExam.part2.length +
        objExam.part3.length +
        chosenEssays.length,
      levelSummary,
    });
  }

  return packages;
}
