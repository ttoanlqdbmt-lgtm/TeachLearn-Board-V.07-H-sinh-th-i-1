import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  Layers,
  Loader2,
  Scale,
  Sliders,
  Sparkles,
  Table2,
  Upload,
  X,
} from 'lucide-react';
import { ExamA4Preview } from '../components/ExamA4Preview';
import { GeminiMultimodalHub } from '../components/GeminiMultimodalHub';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { KNTT_MATH_CURRICULUM, KNTTChapter } from '../data/curriculumKNTT';
import { buildSyncedMockExam, MOCK_EXAM_0107 } from '../data/mockExam0107';
import {
  BankPartType,
  BankQuestion,
  ExamPaper,
  HistoryRecord,
  MasterDataStore,
  Part1Question,
  Part2Question,
  Part3Question,
  ViewMode,
  WorksheetLayoutStyle,
} from '../types/eduplan';
import { MatrixDocxAttachment, MatrixDocxRow } from '../utils/docxExporter';
import { resolveActiveTeachingContext } from '../utils/masterDataDb';
import {
  extractTextFromDocxArrayBuffer,
  parseExamTextToBankQuestions,
  saveBankQuestionsBulk,
} from '../utils/questionBankDb';

export const AssistantModule: React.FC<{ masterData?: MasterDataStore }> = ({ masterData }) => {
  return <GeminiMultimodalHub masterData={masterData} />;
};

type CognitiveLevel = 'NB' | 'TH' | 'VD' | 'VDC';
type MatrixStructurePreset = 'bgd22' | 'p45_12' | 'p15_8' | 'custom';
type CustomRatioPresetKey =
  | 'bgd_40_30_20_10'
  | 'basic_50_30_15_5'
  | 'high_30_30_25_15'
  | 'custom_pct';

interface LevelPercentageRatios {
  NB: number;
  TH: number;
  VD: number;
  VDC: number;
}

interface PartLevelBreakdown {
  targetTotal: number;
  NB: number;
  TH: number;
  VD: number;
  VDC: number;
}

interface SelectedLessonDescriptor {
  chapterId: string;
  chapterCode: string; // e.g. 'C1'
  chapterTitle: string;
  lessonCode: string; // e.g. 'B1'
  lessonTitle: string;
  key: string; // `${chapterCode}_${lessonCode}`
}

interface BankAuditItem {
  idTag: string;
  lessonTitle: string;
  partLabel: string;
  level: CognitiveLevel;
  requested: number;
  foundExact: number;
  usedFallback: number;
}

interface WorksheetModuleProps {
  currentExam: ExamPaper;
  onUpdateExam: (exam: ExamPaper) => void;
  onCreateOnlineLink: (exam: ExamPaper) => void;
  onSaveHistory: (rec: HistoryRecord) => void;
  masterData?: MasterDataStore;
  bankItems?: BankQuestion[];
  onChangeBankItems?: (items: BankQuestion[]) => void;
}

function extractChapterCode(chapterId: string): string {
  const m = chapterId.match(/-(c\d+)$/i);
  return m ? m[1].toUpperCase() : 'C1';
}

function extractLessonCode(lessonRaw: string, fallbackIndex: number): string {
  const m = lessonRaw.match(/^Bài\s+(\d+)/i);
  return m ? `B${m[1]}` : `B${fallbackIndex + 1}`;
}

function distributeTotalByRatios(
  totalInput: number,
  ratios: LevelPercentageRatios
): Pick<PartLevelBreakdown, 'NB' | 'TH' | 'VD' | 'VDC'> {
  const total = Math.max(0, Math.round(totalInput));
  if (total <= 0) return { NB: 0, TH: 0, VD: 0, VDC: 0 };

  const rNB = Math.max(0, Number(ratios.NB) || 0);
  const rTH = Math.max(0, Number(ratios.TH) || 0);
  const rVD = Math.max(0, Number(ratios.VD) || 0);
  const rVDC = Math.max(0, Number(ratios.VDC) || 0);
  const sumPct = rNB + rTH + rVD + rVDC;

  if (sumPct <= 0) {
    return { NB: total, TH: 0, VD: 0, VDC: 0 };
  }

  const weights = [rNB, rTH, rVD, rVDC];
  const counts = weights.map((w) => Math.round((total * w) / sumPct));

  let diff = total - (counts[0] + counts[1] + counts[2] + counts[3]);

  // Prioritize NB and TH when absorbing positive rounding remainder
  const activePriority = [0, 1, 2, 3].filter((idx) => weights[idx] > 0);
  const addOrder = activePriority.length > 0 ? activePriority : [0, 1, 2, 3];
  let addCursor = 0;
  while (diff > 0) {
    const targetIdx = addOrder[addCursor % addOrder.length];
    counts[targetIdx] += 1;
    diff -= 1;
    addCursor += 1;
  }

  // Prioritize TH and NB when absorbing negative rounding excess
  const subOrder = [1, 0, 2, 3];
  let subCursor = 0;
  while (diff < 0 && subCursor < 100) {
    const targetIdx = subOrder[subCursor % subOrder.length];
    if (counts[targetIdx] > 0) {
      counts[targetIdx] -= 1;
      diff += 1;
    }
    subCursor += 1;
  }

  return {
    NB: counts[0],
    TH: counts[1],
    VD: counts[2],
    VDC: counts[3],
  };
}

function autoDistributeLevels(
  total: number,
  partType: BankPartType
): Pick<PartLevelBreakdown, 'NB' | 'TH' | 'VD' | 'VDC'> {
  if (total <= 0) return { NB: 0, TH: 0, VD: 0, VDC: 0 };

  // Pedagogical ratios per part type
  const weights =
    partType === 'part1'
      ? [0.5, 0.25, 0.17, 0.08]
      : partType === 'part2'
      ? [0.5, 0.25, 0.25, 0.0]
      : [0.0, 0.17, 0.5, 0.33];

  const raw = weights.map((w) => Math.floor(total * w));
  let remainder = total - raw.reduce((a, b) => a + b, 0);

  const priorityOrder =
    partType === 'part1'
      ? [0, 1, 2, 3]
      : partType === 'part2'
      ? [0, 1, 2, 3]
      : [2, 3, 1, 0];

  let idx = 0;
  while (remainder > 0) {
    raw[priorityOrder[idx % priorityOrder.length]] += 1;
    remainder -= 1;
    idx += 1;
  }

  return {
    NB: raw[0],
    TH: raw[1],
    VD: raw[2],
    VDC: raw[3],
  };
}

export const WorksheetModule: React.FC<WorksheetModuleProps> = ({
  currentExam,
  onUpdateExam,
  onCreateOnlineLink,
  onSaveHistory,
  masterData,
  bankItems = [],
  onChangeBankItems,
}) => {
  const masterCtx = useMemo(() => resolveActiveTeachingContext(masterData), [masterData]);
  const [subject, setSubject] = useState(masterCtx.subjectName || 'Toán');

  useEffect(() => {
    if (masterCtx.subjectName) {
      setSubject(masterCtx.subjectName);
    }
  }, [masterCtx.subjectName]);

  const applyMasterHeader = (exam: ExamPaper, chosenSubject: string): ExamPaper => ({
    ...exam,
    department: masterCtx.departmentName,
    schoolName: masterCtx.schoolName,
    author: `Biên soạn: ${masterCtx.teacherHonorific}`,
    sourceRepo: `Kho nguồn: Tài liệu ${chosenSubject.toLowerCase()} ${masterCtx.schoolYearLabel}`,
    subject: chosenSubject,
  });

  // ==================== BƯỚC 1: PHẠM VI KIẾN THỨC & TRÌNH BÀY ====================
  const [grade, setGrade] = useState<'10' | '11' | '12'>('12');
  const [semester, setSemester] = useState<'Học kỳ 1' | 'Học kỳ 2' | 'Cả năm'>('Học kỳ 1');
  const chapters = useMemo(
    () =>
      KNTT_MATH_CURRICULUM.filter(
        (c) => c.grade === grade && (semester === 'Cả năm' ? true : c.semester === semester)
      ),
    [grade, semester]
  );

  const [chapterScope, setChapterScope] = useState<string>(() => chapters[0]?.id || '12-c1');

  const availableLessons = useMemo<SelectedLessonDescriptor[]>(() => {
    const targetChapters: KNTTChapter[] =
      chapterScope === 'all'
        ? chapters
        : chapters.filter((c) => c.id === chapterScope);
    const list: SelectedLessonDescriptor[] = [];
    targetChapters.forEach((ch) => {
      const chCode = extractChapterCode(ch.id);
      ch.lessons.forEach((lRaw, idx) => {
        const lCode = extractLessonCode(lRaw, idx);
        list.push({
          chapterId: ch.id,
          chapterCode: chCode,
          chapterTitle: ch.title,
          lessonCode: lCode,
          lessonTitle: lRaw,
          key: `${chCode}_${lCode}`,
        });
      });
    });
    return list;
  }, [chapters, chapterScope]);

  const [selectedLessonKeys, setSelectedLessonKeys] = useState<string[]>(() =>
    availableLessons.length > 0 ? [availableLessons[0].key] : ['C1_B1']
  );

  // Ensure at least 1 valid lesson is selected when scope changes
  useEffect(() => {
    if (availableLessons.length === 0) return;
    setSelectedLessonKeys((prev) => {
      const valid = prev.filter((k) => availableLessons.some((l) => l.key === k));
      return valid.length > 0 ? valid : [availableLessons[0].key];
    });
  }, [availableLessons]);

  const activeLessons = useMemo(() => {
    const matched = availableLessons.filter((l) => selectedLessonKeys.includes(l.key));
    return matched.length > 0 ? matched : availableLessons.slice(0, 1);
  }, [availableLessons, selectedLessonKeys]);

  const [layoutStyle, setLayoutStyle] = useState<WorksheetLayoutStyle>('a4_bw');
  const [matrixDocxPosition, setMatrixDocxPosition] = useState<'none' | 'start' | 'end'>('none');
  const [viewMode, setViewMode] = useState<ViewMode>('teacher');

  // ==================== BƯỚC 2: MA TRẬN ĐẶC TẢ CHI TIẾT ====================
  const [presetKey, setPresetKey] = useState<MatrixStructurePreset>('bgd22');
  const [durationMinutes, setDurationMinutes] = useState<number>(90);
  const [ratioPresetKey, setRatioPresetKey] = useState<CustomRatioPresetKey>('bgd_40_30_20_10');
  const [customRatios, setCustomRatios] = useState<LevelPercentageRatios>({
    NB: 40,
    TH: 30,
    VD: 20,
    VDC: 10,
  });
  const customRatioSum =
    customRatios.NB + customRatios.TH + customRatios.VD + customRatios.VDC;

  const [p1Matrix, setP1Matrix] = useState<PartLevelBreakdown>({
    targetTotal: 12,
    NB: 6,
    TH: 3,
    VD: 2,
    VDC: 1,
  });
  const [p2Matrix, setP2Matrix] = useState<PartLevelBreakdown>({
    targetTotal: 4,
    NB: 2,
    TH: 1,
    VD: 1,
    VDC: 0,
  });
  const [p3Matrix, setP3Matrix] = useState<PartLevelBreakdown>({
    targetTotal: 6,
    NB: 0,
    TH: 1,
    VD: 3,
    VDC: 2,
  });

  const [showMatrixSpecModal, setShowMatrixSpecModal] = useState(false);

  const applyRatiosToAllParts = (ratios: LevelPercentageRatios) => {
    setP1Matrix((prev) => ({
      ...prev,
      ...distributeTotalByRatios(prev.targetTotal, ratios),
    }));
    setP2Matrix((prev) => ({
      ...prev,
      ...distributeTotalByRatios(prev.targetTotal, ratios),
    }));
    setP3Matrix((prev) => ({
      ...prev,
      ...distributeTotalByRatios(prev.targetTotal, ratios),
    }));
  };

  const applyStructurePreset = (preset: MatrixStructurePreset) => {
    setPresetKey(preset);
    if (preset === 'bgd22') {
      setDurationMinutes(90);
      setP1Matrix({ targetTotal: 12, NB: 6, TH: 3, VD: 2, VDC: 1 });
      setP2Matrix({ targetTotal: 4, NB: 2, TH: 1, VD: 1, VDC: 0 });
      setP3Matrix({ targetTotal: 6, NB: 0, TH: 1, VD: 3, VDC: 2 });
    } else if (preset === 'p45_12') {
      setDurationMinutes(45);
      setP1Matrix({ targetTotal: 8, NB: 4, TH: 2, VD: 2, VDC: 0 });
      setP2Matrix({ targetTotal: 2, NB: 1, TH: 1, VD: 0, VDC: 0 });
      setP3Matrix({ targetTotal: 2, NB: 0, TH: 0, VD: 1, VDC: 1 });
    } else if (preset === 'p15_8') {
      setDurationMinutes(15);
      setP1Matrix({ targetTotal: 6, NB: 3, TH: 2, VD: 1, VDC: 0 });
      setP2Matrix({ targetTotal: 1, NB: 0, TH: 1, VD: 0, VDC: 0 });
      setP3Matrix({ targetTotal: 1, NB: 0, TH: 0, VD: 1, VDC: 0 });
    } else if (preset === 'custom') {
      applyRatiosToAllParts(customRatios);
    }
  };

  const p1LevelSum = p1Matrix.NB + p1Matrix.TH + p1Matrix.VD + p1Matrix.VDC;
  const p2LevelSum = p2Matrix.NB + p2Matrix.TH + p2Matrix.VD + p2Matrix.VDC;
  const p3LevelSum = p3Matrix.NB + p3Matrix.TH + p3Matrix.VD + p3Matrix.VDC;

  const p1Mismatch = p1LevelSum !== p1Matrix.targetTotal;
  const p2Mismatch = p2LevelSum !== p2Matrix.targetTotal;
  const p3Mismatch = p3LevelSum !== p3Matrix.targetTotal;
  const hasAnyMismatch = p1Mismatch || p2Mismatch || p3Mismatch;

  const totalQuestions = p1Matrix.targetTotal + p2Matrix.targetTotal + p3Matrix.targetTotal;
  const totalCommands = p1LevelSum + p2LevelSum * 4 + p3LevelSum;
  const targetCommands = p1Matrix.targetTotal + p2Matrix.targetTotal * 4 + p3Matrix.targetTotal;

  const handleAutoBalanceLevels = () => {
    if (presetKey === 'custom') {
      applyRatiosToAllParts(customRatios);
      return;
    }
    setP1Matrix((prev) => ({
      ...prev,
      ...autoDistributeLevels(prev.targetTotal, 'part1'),
    }));
    setP2Matrix((prev) => ({
      ...prev,
      ...autoDistributeLevels(prev.targetTotal, 'part2'),
    }));
    setP3Matrix((prev) => ({
      ...prev,
      ...autoDistributeLevels(prev.targetTotal, 'part3'),
    }));
  };

  // Build detailed Matrix Specification Rows mapping selected lessons x parts x levels -> Standard IDs
  const matrixSpecRows = useMemo<MatrixDocxRow[]>(() => {
    const rows: MatrixDocxRow[] = [];
    const lessonsPool =
      activeLessons.length > 0
        ? activeLessons
        : [
            {
              chapterId: '12-c1',
              chapterCode: 'C1',
              chapterTitle: 'Chương I',
              lessonCode: 'B1',
              lessonTitle: 'Bài 1. Chuyên đề trọng tâm',
              key: 'C1_B1',
            },
          ];

    let sttCounter = 1;
    let lessonCursor = 0;

    const pushPartRows = (
      partType: BankPartType,
      partLabel: string,
      formatCode: 'TN' | 'DS' | 'TLN',
      breakdown: PartLevelBreakdown,
      pointPerQuestion: number
    ) => {
      const levels: CognitiveLevel[] = ['NB', 'TH', 'VD', 'VDC'];
      levels.forEach((lv) => {
        const count = breakdown[lv];
        if (count <= 0) return;

        // Distribute `count` questions across the chosen lessons
        const countByLesson = new Map<string, { lesson: SelectedLessonDescriptor; qCount: number }>();
        for (let i = 0; i < count; i++) {
          const chosenLesson = lessonsPool[lessonCursor % lessonsPool.length];
          lessonCursor += 1;
          const existing = countByLesson.get(chosenLesson.key);
          if (existing) {
            existing.qCount += 1;
          } else {
            countByLesson.set(chosenLesson.key, { lesson: chosenLesson, qCount: 1 });
          }
        }

        countByLesson.forEach(({ lesson, qCount }) => {
          const cmdCount = partType === 'part2' ? qCount * 4 : qCount;
          const pts = (qCount * pointPerQuestion).toFixed(2).replace('.', ',');
          const idTag = `[T${grade}-${lesson.chapterCode}_${lesson.lessonCode}_${lv}-${formatCode}]`;
          rows.push({
            stt: sttCounter++,
            lessonTitle: lesson.lessonTitle,
            partLabel,
            levelLabel: lv,
            idTag,
            questionCount: qCount,
            commandCount: cmdCount,
            points: `${pts}đ`,
          });
        });
      });
    };

    pushPartRows('part1', 'Phần I (TN 4 lựa chọn)', 'TN', p1Matrix, 0.25);
    pushPartRows('part2', 'Phần II (Đúng/Sai × 4 ý)', 'DS', p2Matrix, 1.0);
    pushPartRows('part3', 'Phần III (Trả lời ngắn)', 'TLN', p3Matrix, 0.5);

    return rows;
  }, [activeLessons, grade, p1Matrix, p2Matrix, p3Matrix]);

  const matrixAttachment = useMemo<MatrixDocxAttachment>(
    () => ({
      position: matrixDocxPosition,
      title: `BẢNG MA TRẬN & ĐẶC TẢ ĐỀ KIỂM TRA MÔN ${subject.toUpperCase()} - KHỐI ${grade}`,
      summaryLine: `Quy mô: ${totalQuestions} câu (${targetCommands} lệnh hỏi) · Thời gian: ${durationMinutes} phút · Phạm vi: ${activeLessons.length} bài học`,
      rows: matrixSpecRows,
    }),
    [matrixDocxPosition, subject, grade, totalQuestions, targetCommands, durationMinutes, activeLessons.length, matrixSpecRows]
  );

  // ==================== BƯỚC 3: 2 CHẾ ĐỘ TẠO ĐỀ (NGÂN HÀNG HOẶC GEMINI AI) ====================
  const [customTopic, setCustomTopic] = useState('');
  const [realWorldRatio, setRealWorldRatio] = useState(40);
  const [includeParamM, setIncludeParamM] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [generatingBank, setGeneratingBank] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [bankAuditReport, setBankAuditReport] = useState<BankAuditItem[] | null>(null);

  const toggleLessonSelection = (lessonKey: string) => {
    setSelectedLessonKeys((prev) => {
      if (prev.includes(lessonKey)) {
        if (prev.length === 1) return prev; // Keep at least 1 lesson selected
        return prev.filter((k) => k !== lessonKey);
      }
      return [...prev, lessonKey];
    });
  };

  // Mode 1: Assemble Exam from Question Bank matching exact IDs & Matrix
  const handleGenerateFromBank = () => {
    if (hasAnyMismatch) {
      handleAutoBalanceLevels();
    }
    setGeneratingBank(true);
    setStatusMsg(null);

    try {
      const usedQuestionIds = new Set<string>();
      const auditList: BankAuditItem[] = [];
      const selectedChapterCodes = new Set(activeLessons.map((l) => l.chapterCode));

      const pickQuestionsForPart = (
        partType: BankPartType,
        partLabel: string,
        formatCode: 'TN' | 'DS' | 'TLN',
        breakdown: PartLevelBreakdown
      ): { picked: BankQuestion[]; tagsAssigned: string[] } => {
        const picked: BankQuestion[] = [];
        const tagsAssigned: string[] = [];
        const levels: CognitiveLevel[] = ['NB', 'TH', 'VD', 'VDC'];
        let lessonIdx = 0;

        levels.forEach((lv) => {
          const needed = breakdown[lv];
          if (needed <= 0) return;

          // Group slots by selected lessons
          const slotsByLesson = new Map<string, { lesson: SelectedLessonDescriptor; count: number }>();
          for (let i = 0; i < needed; i++) {
            const lesson = activeLessons[lessonIdx % activeLessons.length];
            lessonIdx += 1;
            const cur = slotsByLesson.get(lesson.key);
            if (cur) cur.count += 1;
            else slotsByLesson.set(lesson.key, { lesson, count: 1 });
          }

          slotsByLesson.forEach(({ lesson, count }) => {
            const idTag = `[T${grade}-${lesson.chapterCode}_${lesson.lessonCode}_${lv}-${formatCode}]`;

            // 1. Exact match: grade + partType + chapter + lesson + level
            const exactMatches = bankItems.filter(
              (q) =>
                !usedQuestionIds.has(q.id) &&
                q.partType === partType &&
                q.grade === grade &&
                q.chapter.toUpperCase() === lesson.chapterCode &&
                q.lesson.toUpperCase() === lesson.lessonCode &&
                q.level === lv
            );

            let exactTaken = 0;
            exactMatches.slice(0, count).forEach((q) => {
              usedQuestionIds.add(q.id);
              picked.push(q);
              tagsAssigned.push(idTag);
              exactTaken += 1;
            });

            let remaining = count - exactTaken;
            let fallbackTaken = 0;

            // 2. Same chapter & level in same grade
            if (remaining > 0) {
              const chapterMatches = bankItems.filter(
                (q) =>
                  !usedQuestionIds.has(q.id) &&
                  q.partType === partType &&
                  q.grade === grade &&
                  selectedChapterCodes.has(q.chapter.toUpperCase()) &&
                  q.level === lv
              );
              chapterMatches.slice(0, remaining).forEach((q) => {
                usedQuestionIds.add(q.id);
                picked.push(q);
                tagsAssigned.push(idTag);
                fallbackTaken += 1;
                remaining -= 1;
              });
            }

            // 3. Same grade & partType & level
            if (remaining > 0) {
              const gradeLevelMatches = bankItems.filter(
                (q) =>
                  !usedQuestionIds.has(q.id) &&
                  q.partType === partType &&
                  q.grade === grade &&
                  q.level === lv
              );
              gradeLevelMatches.slice(0, remaining).forEach((q) => {
                usedQuestionIds.add(q.id);
                picked.push(q);
                tagsAssigned.push(idTag);
                fallbackTaken += 1;
                remaining -= 1;
              });
            }

            // 4. Any available question of same partType in bank
            if (remaining > 0) {
              const anyPartMatches = bankItems.filter(
                (q) => !usedQuestionIds.has(q.id) && q.partType === partType
              );
              anyPartMatches.slice(0, remaining).forEach((q) => {
                usedQuestionIds.add(q.id);
                picked.push(q);
                tagsAssigned.push(idTag);
                fallbackTaken += 1;
                remaining -= 1;
              });
            }

            auditList.push({
              idTag,
              lessonTitle: lesson.lessonTitle,
              partLabel,
              level: lv,
              requested: count,
              foundExact: exactTaken,
              usedFallback: fallbackTaken,
            });
          });
        });

        return { picked, tagsAssigned };
      };

      const p1Res = pickQuestionsForPart('part1', 'Phần I (TN)', 'TN', p1Matrix);
      const p2Res = pickQuestionsForPart('part2', 'Phần II (Đ/S)', 'DS', p2Matrix);
      const p3Res = pickQuestionsForPart('part3', 'Phần III (TLN)', 'TLN', p3Matrix);

      const part1: Part1Question[] = p1Res.picked.map((q, idx) => ({
        id: `bank_p1_${idx + 1}_${Date.now()}`,
        number: idx + 1,
        tag: p1Res.tagsAssigned[idx] || q.tag,
        stem: q.stem,
        options: q.options || ['Phương án A.', 'Phương án B.', 'Phương án C.', 'Phương án D.'],
        correctIndex: q.correctIndex ?? 0,
        diagram: q.diagram,
        image: q.image || q.imageUrl,
        imageUrl: q.imageUrl || q.image,
        solutionImage: q.solutionImage,
        tableData: q.tableData,
        solutionSteps: q.solutionSteps || [
          { title: 'Bước 1: Phân tích', leadIn: 'Theo giả thiết bài toán:', math: 'Chọn phương án đúng.' },
        ],
      }));

      // Top up from mock exam if bank had fewer items than targetTotal
      while (part1.length < p1Matrix.targetTotal) {
        const fb = MOCK_EXAM_0107.part1[part1.length % MOCK_EXAM_0107.part1.length];
        part1.push({
          ...fb,
          id: `fb_p1_${part1.length + 1}`,
          number: part1.length + 1,
          tag: p1Res.tagsAssigned[part1.length] || `[T${grade}-C1_B1_NB-TN]`,
        });
      }

      const part2: Part2Question[] = p2Res.picked.map((q, idx) => ({
        id: `bank_p2_${idx + 1}_${Date.now()}`,
        number: idx + 1,
        tag: p2Res.tagsAssigned[idx] || q.tag,
        stem: q.stem,
        diagram: q.diagram,
        image: q.image || q.imageUrl,
        imageUrl: q.imageUrl || q.image,
        solutionImage: q.solutionImage,
        tableData: q.tableData,
        solutionSteps: q.solutionSteps,
        statements:
          q.statements || MOCK_EXAM_0107.part2[idx % MOCK_EXAM_0107.part2.length].statements,
      }));

      while (part2.length < p2Matrix.targetTotal) {
        const fb = MOCK_EXAM_0107.part2[part2.length % MOCK_EXAM_0107.part2.length];
        part2.push({
          ...fb,
          id: `fb_p2_${part2.length + 1}`,
          number: part2.length + 1,
          tag: p2Res.tagsAssigned[part2.length] || `[T${grade}-C1_B1_TH-DS]`,
        });
      }

      const part3: Part3Question[] = p3Res.picked.map((q, idx) => ({
        id: `bank_p3_${idx + 1}_${Date.now()}`,
        number: idx + 1,
        tag: p3Res.tagsAssigned[idx] || q.tag,
        stem: q.stem,
        answer: (q.answer || '0').replace(/\./g, ',').slice(0, 8),
        diagram: q.diagram,
        image: q.image || q.imageUrl,
        imageUrl: q.imageUrl || q.image,
        solutionImage: q.solutionImage,
        tableData: q.tableData,
        solutionSteps: q.solutionSteps || [
          { title: 'Bước 1: Giải chi tiết', leadIn: 'Ta có:', math: `Đáp số là $${q.answer || '0'}$.` },
        ],
      }));

      while (part3.length < p3Matrix.targetTotal) {
        const fb = MOCK_EXAM_0107.part3[part3.length % MOCK_EXAM_0107.part3.length];
        part3.push({
          ...fb,
          id: `fb_p3_${part3.length + 1}`,
          number: part3.length + 1,
          tag: p3Res.tagsAssigned[part3.length] || `[T${grade}-C1_B1_VD-TLN]`,
        });
      }

      const scopeTitle =
        activeLessons.length === 1
          ? activeLessons[0].lessonTitle.toUpperCase()
          : `ĐỀ KIỂM TRA THEO MA TRẬN (${activeLessons.length} BÀI HỌC) - LỚP ${grade}`;

      const builtExam: ExamPaper = applyMasterHeader(
        {
          ...currentExam,
          id: `bank-matrix-${Date.now()}`,
          examTitle: scopeTitle,
          grade,
          durationMinutes,
          examCode: String(Math.floor(1000 + Math.random() * 8999)),
          part1,
          part2,
          part3,
        },
        subject
      );

      onUpdateExam(builtExam);
      onSaveHistory({
        id: builtExam.id,
        title: `${builtExam.examTitle} — Mã đề ${builtExam.examCode}`,
        docType: 'exam',
        grade,
        subject,
        examCode: builtExam.examCode,
        createdAt: new Date().toISOString(),
        examData: builtExam,
      });

      setBankAuditReport(auditList);
      const missingCount = auditList.filter((a) => a.foundExact < a.requested).length;
      if (missingCount === 0) {
        setStatusMsg(
          `Đã bốc thành công ${totalQuestions} câu (${targetCommands} lệnh hỏi) khớp 100% mã ID từ Ngân hàng đề!`
        );
      } else {
        setStatusMsg(
          `Đã ghép xong đề ${totalQuestions} câu từ Ngân hàng đề (${missingCount} mã ID thiếu câu khớp tuyệt đối đã được bù tự động từ câu cùng chương/khối).`
        );
      }
    } finally {
      setGeneratingBank(false);
    }
  };

  // Mode 2: Generate Brand New Exam via Gemini AI strictly following the Step 2 Matrix
  const handleGenerateWithAI = async () => {
    if (hasAnyMismatch) {
      handleAutoBalanceLevels();
    }
    setGeneratingAI(true);
    setStatusMsg(null);
    setBankAuditReport(null);

    const lessonsSummary = activeLessons.map((l) => `${l.key}: ${l.lessonTitle}`).join('; ');
    const matrixPromptDetail = matrixSpecRows
      .map((r) => `${r.idTag} (${r.partLabel} - ${r.levelLabel}: ${r.questionCount} câu)`)
      .join(', ');

    try {
      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          grade,
          semester,
          topic:
            customTopic.trim() ||
            `Ma trận đặc tả (${activeLessons.length} bài): ${matrixPromptDetail}`,
          lesson: lessonsSummary,
          part1Count: Math.min(p1Matrix.targetTotal, 20),
          part2Count: Math.min(p2Matrix.targetTotal, 6),
          part3Count: Math.min(p3Matrix.targetTotal, 8),
          realWorldRatio,
          includeParamM,
          matrixBreakdown: {
            part1: p1Matrix,
            part2: p2Matrix,
            part3: p3Matrix,
            specRows: matrixSpecRows,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi sinh đề từ Gemini AI');
      const g = data.exam;

      // Expand per-question standard ID tags from matrixSpecRows
      const expandTagsForPart = (partLabelPrefix: string): string[] => {
        const list: string[] = [];
        matrixSpecRows
          .filter((r) => r.partLabel.startsWith(partLabelPrefix))
          .forEach((r) => {
            for (let i = 0; i < r.questionCount; i++) {
              list.push(r.idTag);
            }
          });
        return list;
      };

      const p1Tags = expandTagsForPart('Phần I');
      const p2Tags = expandTagsForPart('Phần II');
      const p3Tags = expandTagsForPart('Phần III');

      const built: ExamPaper = applyMasterHeader(
        {
          ...currentExam,
          id: `ai-matrix-${Date.now()}`,
          examTitle:
            g.title ||
            `ĐỀ KIỂM TRA THEO MA TRẬN MÔN ${subject.toUpperCase()} - KHỐI ${grade}`,
          grade,
          durationMinutes,
          examCode: g.examCode || String(Math.floor(1000 + Math.random() * 8999)),
          part1: (g.part1 || []).slice(0, p1Matrix.targetTotal).map((q: any, idx: number) => ({
            id: q.id || `ai_p1_${idx + 1}`,
            number: idx + 1,
            tag: p1Tags[idx] || q.tag || `[T${grade}-C1_B1_NB-TN]`,
            stem: q.stem || '',
            options: q.options || ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            solutionSteps: q.solutionSteps || [
              { title: 'Bước 1: Phân tích', leadIn: 'Theo giả thiết:', math: '' },
            ],
          })),
          part2: (g.part2 || []).slice(0, p2Matrix.targetTotal).map((q: any, idx: number) => ({
            id: q.id || `ai_p2_${idx + 1}`,
            number: idx + 1,
            tag: p2Tags[idx] || q.tag || `[T${grade}-C1_B1_TH-DS]`,
            stem: q.stem || '',
            statements: (q.statements || []).map((s: any, sIdx: number) => ({
              label: s.label || (['a', 'b', 'c', 'd'][sIdx] as 'a' | 'b' | 'c' | 'd'),
              text: s.text || '',
              isTrue: Boolean(s.isTrue),
              stepTitle:
                s.stepTitle || `Bước ${sIdx + 1}: Xét ý ${s.label || ['a', 'b', 'c', 'd'][sIdx]})`,
              leadIn: s.leadIn || 'Theo giả thiết của bài toán:',
              explanation: s.explanation || '',
            })),
          })),
          part3: (g.part3 || []).slice(0, p3Matrix.targetTotal).map((q: any, idx: number) => ({
            id: q.id || `ai_p3_${idx + 1}`,
            number: idx + 1,
            tag: p3Tags[idx] || q.tag || `[T${grade}-C1_B1_VD-TLN]`,
            stem: q.stem || '',
            answer: String(q.answer || '0').replace('.', ',').slice(0, 4),
            solutionSteps: q.solutionSteps || [],
          })),
        },
        subject
      );

      onUpdateExam(built);
      onSaveHistory({
        id: built.id,
        title: `${built.examTitle} — Mã đề ${built.examCode}`,
        docType: 'worksheet',
        grade,
        subject,
        examCode: built.examCode,
        createdAt: new Date().toISOString(),
        examData: built,
      });
      setStatusMsg(
        `Gemini AI đã biên soạn mới đề thi (${built.part1.length + built.part2.length + built.part3.length} câu) theo đúng Ma trận đặc tả!`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi sinh đề từ Gemini AI');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleUploadCustomExam = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let rawText = '';
      if (file.name.toLowerCase().endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        rawText = await extractTextFromDocxArrayBuffer(buf);
      } else {
        rawText = await file.text();
      }
      const parsedItems = parseExamTextToBankQuestions(
        rawText,
        file.name,
        grade as '10' | '11' | '12'
      );
      if (parsedItems.length > 0 && onChangeBankItems) {
        const mergedResult = await saveBankQuestionsBulk(parsedItems, bankItems);
        onChangeBankItems(mergedResult.items);
        setStatusMsg(
          `Đã trích xuất và nạp ${parsedItems.length} câu hỏi từ "${file.name}" vào Ngân hàng đề!`
        );
      } else {
        setStatusMsg(`Đã nạp tệp "${file.name}" vào bộ xử lý chuẩn hóa A4.`);
      }
    } catch {
      setStatusMsg(`Đã nạp tệp "${file.name}" vào hàng đợi xử lý A4.`);
    }
    e.target.value = '';
  };

  const renderPartMatrixRow = (
    title: string,
    subtitle: string,
    matrix: PartLevelBreakdown,
    setMatrix: React.Dispatch<React.SetStateAction<PartLevelBreakdown>>,
    isPart2 = false
  ) => {
    const sum = matrix.NB + matrix.TH + matrix.VD + matrix.VDC;
    const mismatch = sum !== matrix.targetTotal;

    return (
      <div
        className={`rounded-[6px] border p-3 transition-colors ${
          mismatch
            ? 'border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/20'
            : 'border-[#E2E8F0] bg-[#F8FAFC] dark:border-slate-800 dark:bg-slate-800/50'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
              {title}
            </div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{subtitle}</div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
              Tổng câu:
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={matrix.targetTotal}
              onChange={(e) => {
                const nextTotal = Math.max(0, Number(e.target.value));
                setPresetKey('custom');
                const autoSplit = distributeTotalByRatios(nextTotal, customRatios);
                setMatrix({
                  targetTotal: nextTotal,
                  ...autoSplit,
                });
              }}
              className="h-8 w-16 rounded-[5px] border border-[#CBD5E1] bg-white px-2 text-center text-[13px] font-bold text-[#136F63] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-emerald-400"
            />
            {isPart2 && (
              <span className="rounded-[4px] bg-[#E0F2FE] px-2 py-0.5 text-[11.5px] font-semibold text-[#0369A1] tabular-nums dark:bg-slate-800 dark:text-[#BAE6FD]">
                = {matrix.targetTotal * 4} lệnh
              </span>
            )}
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {(
            [
              { key: 'NB', label: 'Nhận biết' },
              { key: 'TH', label: 'Thông hiểu' },
              { key: 'VD', label: 'Vận dụng' },
              { key: 'VDC', label: 'VD Cao' },
            ] as const
          ).map((lv) => (
            <div
              key={lv.key}
              className="rounded-[5px] border border-[#E2E8F0] bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                <span>{lv.key}</span>
                <span className="text-[10.5px] font-normal text-slate-400">{lv.label}</span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={matrix[lv.key]}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value));
                  setPresetKey('custom');
                  setMatrix((prev) => ({
                    ...prev,
                    [lv.key]: val,
                  }));
                }}
                className="mt-1 h-7 w-full rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 text-center text-[13px] font-semibold text-slate-900 tabular-nums focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          ))}
        </div>

        {mismatch && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[12px] font-medium text-amber-700 dark:text-amber-300">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Tổng mức độ ({sum} câu) chưa khớp tổng mục tiêu ({matrix.targetTotal} câu).
              </span>
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ==================== CỘT TRÁI: THIẾT LẬP MA TRẬN & NGUỒN ĐỀ ==================== */}
        <div className="no-print space-y-4 xl:col-span-5">
          {/* BƯỚC 1: PHẠM VI KIẾN THỨC & PHONG CÁCH TRÌNH BÀY */}
          <section className="rounded-[6px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[#136F63] text-xs font-bold text-white">
                  1
                </span>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Phạm vi Kiến thức &amp; Phong cách trình bày
                </h3>
              </div>
              <span className="text-[12px] font-medium text-[#136F63] dark:text-emerald-400">
                SGK Kết nối tri thức
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Môn học
                </label>
                <select
                  value={subject}
                  onChange={(e) => {
                    const nextSub = e.target.value;
                    setSubject(nextSub);
                    onUpdateExam(applyMasterHeader(currentExam, nextSub));
                  }}
                  className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option>Toán</option>
                  <option>Vật lý</option>
                  <option>Hóa học</option>
                  <option>Sinh học</option>
                  <option>Tin học</option>
                  <option>Ngữ văn</option>
                  <option>Tiếng Anh</option>
                  <option>Lịch sử</option>
                  <option>Địa lý</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Khối lớp
                </label>
                <select
                  value={grade}
                  onChange={(e) => {
                    const g = e.target.value as '10' | '11' | '12';
                    setGrade(g);
                    const firstChap =
                      KNTT_MATH_CURRICULUM.find(
                        (c) => c.grade === g && (semester === 'Cả năm' ? true : c.semester === semester)
                      ) || KNTT_MATH_CURRICULUM.find((c) => c.grade === g);
                    if (firstChap) {
                      setChapterScope(firstChap.id);
                      const chCode = extractChapterCode(firstChap.id);
                      const lCode = extractLessonCode(firstChap.lessons[0], 0);
                      setSelectedLessonKeys([`${chCode}_${lCode}`]);
                      onUpdateExam(
                        applyMasterHeader(
                          buildSyncedMockExam(g, firstChap.id, firstChap.lessons[0]),
                          subject
                        )
                      );
                    }
                  }}
                  className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="10">Lớp 10</option>
                  <option value="11">Lớp 11</option>
                  <option value="12">Lớp 12</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Học kỳ
                </label>
                <select
                  value={semester}
                  onChange={(e) => {
                    const sem = e.target.value as 'Học kỳ 1' | 'Học kỳ 2' | 'Cả năm';
                    setSemester(sem);
                    const firstChap =
                      KNTT_MATH_CURRICULUM.find(
                        (c) => c.grade === grade && (sem === 'Cả năm' ? true : c.semester === sem)
                      ) || KNTT_MATH_CURRICULUM.find((c) => c.grade === grade);
                    if (firstChap) {
                      setChapterScope(sem === 'Cả năm' ? 'all' : firstChap.id);
                    }
                  }}
                  className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Học kỳ 1">Học kỳ 1</option>
                  <option value="Học kỳ 2">Học kỳ 2</option>
                  <option value="Cả năm">Cả năm / Ôn THPT</option>
                </select>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Chương / Chủ đề
                </label>
                <select
                  value={chapterScope}
                  onChange={(e) => {
                    const nextScope = e.target.value;
                    setChapterScope(nextScope);
                  }}
                  className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">-- Tất cả chương trong {semester} (Đề tổng hợp) --</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-select Lessons Checklist */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                    Bài học cụ thể (Đã chọn{' '}
                    <span className="font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                      {activeLessons.length}/{availableLessons.length}
                    </span>{' '}
                    bài)
                  </label>
                  <div className="flex items-center gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() => setSelectedLessonKeys(availableLessons.map((l) => l.key))}
                      className="font-medium text-[#136F63] hover:underline dark:text-emerald-400"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        availableLessons[0] && setSelectedLessonKeys([availableLessons[0].key])
                      }
                      className="font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="max-h-36 space-y-1 overflow-y-auto rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] p-2 dark:border-slate-700 dark:bg-slate-800/60">
                  {availableLessons.map((item) => {
                    const checked = selectedLessonKeys.includes(item.key);
                    return (
                      <label
                        key={item.key}
                        className={`flex cursor-pointer items-start gap-2 rounded-[5px] px-2 py-1.5 text-[13px] transition-colors ${
                          checked
                            ? 'bg-[#E0F2FE]/80 font-medium text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]'
                            : 'text-slate-700 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLessonSelection(item.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#136F63]"
                        />
                        <span className="min-w-0 flex-1 leading-snug">
                          <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#136F63] tabular-nums dark:bg-slate-900 dark:text-emerald-400">
                            {item.key}
                          </span>
                          {item.lessonTitle}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Presentation Style & DOCX Matrix Attachment Option */}
            <div className="mt-3.5 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setLayoutStyle('a4_bw')}
                  className={`rounded-[6px] border p-2.5 text-left transition-colors ${
                    layoutStyle === 'a4_bw'
                      ? 'border-[#136F63] bg-[#136F63] text-white'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="text-[13px] font-semibold">A4 Chuẩn in ấn</div>
                  <div
                    className={`mt-0.5 text-[11.5px] ${
                      layoutStyle === 'a4_bw' ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Đen trắng tiết kiệm mực, chuẩn đề BGD.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLayoutStyle('two_col_peace')}
                  className={`rounded-[6px] border p-2.5 text-left transition-colors ${
                    layoutStyle === 'two_col_peace'
                      ? 'border-[#136F63] bg-[#136F63] text-white'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="text-[13px] font-semibold">Phiếu 2 cột màu sắc</div>
                  <div
                    className={`mt-0.5 text-[11.5px] ${
                      layoutStyle === 'two_col_peace'
                        ? 'text-white/85'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Trình bày 2 cột trực quan, nổi bật phần thi.
                  </div>
                </button>
              </div>

              <div className="mt-2.5">
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Kèm trang Ma trận đặc tả chi tiết trong file Word (.docx) &amp; Bản in A4
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'Không kèm' },
                      { id: 'start', label: 'Ở đầu file (.docx)' },
                      { id: 'end', label: 'Ở cuối file (.docx)' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMatrixDocxPosition(opt.id)}
                      className={`rounded-[5px] border px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors ${
                        matrixDocxPosition === opt.id
                          ? 'border-[#136F63] bg-[#E0F2FE] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]'
                          : 'border-[#E2E8F0] bg-white text-slate-600 hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* BƯỚC 2: THIẾT LẬP MA TRẬN ĐẶC TẢ ĐỀ THI CHI TIẾT */}
          <section className="rounded-[6px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[#136F63] text-xs font-bold text-white">
                  2
                </span>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Thiết lập Ma trận Đặc tả Đề thi chi tiết
                </h3>
              </div>
              <span className="rounded-[5px] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1] tabular-nums dark:bg-slate-800 dark:text-[#BAE6FD]">
                {totalQuestions} câu · {totalCommands} lệnh · {durationMinutes}p
              </span>
            </div>

            {/* 4 Quick Structure Presets */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {(
                [
                  { key: 'bgd22', label: 'Mặc định BGD', sub: '22 câu - 90p' },
                  { key: 'p45_12', label: 'Đề 45 phút', sub: '12 câu - 45p' },
                  { key: 'p15_8', label: 'Đề 15 phút', sub: '8 câu - 15p' },
                  { key: 'custom', label: 'Tùy chỉnh', sub: 'Tự nhập số câu' },
                ] as const
              ).map((pr) => (
                <button
                  key={pr.key}
                  type="button"
                  onClick={() => applyStructurePreset(pr.key)}
                  className={`rounded-[6px] border px-2.5 py-2 text-left transition-colors ${
                    presetKey === pr.key
                      ? 'border-[#136F63] bg-[#136F63] text-white'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="truncate text-[12.5px] font-semibold">{pr.label}</div>
                  <div
                    className={`truncate text-[11px] tabular-nums ${
                      presetKey === pr.key ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {pr.sub}
                  </div>
                </button>
              ))}
            </div>

            {/* Preset Ratios Bar when Custom Mode is active */}
            {presetKey === 'custom' && (
              <div className="mt-2.5 rounded-[6px] border border-[#136F63]/35 bg-[#F8FAFC] p-2.5 dark:border-emerald-700/50 dark:bg-slate-800/60">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                    Tỷ lệ Mức độ chuẩn (NB - TH - VD - VDC):
                  </span>
                  <span
                    className={`text-[11.5px] font-semibold tabular-nums ${
                      customRatioSum === 100
                        ? 'text-[#136F63] dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Tổng tỷ lệ: {customRatioSum}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {[
                    {
                      key: 'bgd_40_30_20_10' as const,
                      label: 'Chuẩn BGD',
                      sub: '40% - 30% - 20% - 10%',
                      ratios: { NB: 40, TH: 30, VD: 20, VDC: 10 },
                    },
                    {
                      key: 'basic_50_30_15_5' as const,
                      label: 'Cơ bản',
                      sub: '50% - 30% - 15% - 5%',
                      ratios: { NB: 50, TH: 30, VD: 15, VDC: 5 },
                    },
                    {
                      key: 'high_30_30_25_15' as const,
                      label: 'Phân hóa cao',
                      sub: '30% - 30% - 25% - 15%',
                      ratios: { NB: 30, TH: 30, VD: 25, VDC: 15 },
                    },
                    {
                      key: 'custom_pct' as const,
                      label: 'Tự nhập % tỷ lệ',
                      sub: `${customRatios.NB}%-${customRatios.TH}%-${customRatios.VD}%-${customRatios.VDC}%`,
                      ratios: null,
                    },
                  ].map((rp) => {
                    const active = ratioPresetKey === rp.key;
                    return (
                      <button
                        key={rp.key}
                        type="button"
                        onClick={() => {
                          setRatioPresetKey(rp.key);
                          if (rp.ratios) {
                            setCustomRatios(rp.ratios);
                            applyRatiosToAllParts(rp.ratios);
                          } else {
                            applyRatiosToAllParts(customRatios);
                          }
                        }}
                        className={`rounded-[5px] border px-2 py-1.5 text-left transition-colors ${
                          active
                            ? 'border-[#136F63] bg-[#E0F2FE] text-[#0369A1] dark:border-[#136F63] dark:bg-slate-800 dark:text-[#BAE6FD]'
                            : 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        <div className="truncate text-[11.5px] font-semibold">{rp.label}</div>
                        <div
                          className={`truncate text-[10.5px] tabular-nums ${
                            active
                              ? 'font-medium text-[#136F63] dark:text-emerald-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {rp.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {ratioPresetKey === 'custom_pct' && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-[#E2E8F0] pt-2 dark:border-slate-700">
                    {(
                      [
                        { key: 'NB', label: '% NB' },
                        { key: 'TH', label: '% TH' },
                        { key: 'VD', label: '% VD' },
                        { key: 'VDC', label: '% VDC' },
                      ] as const
                    ).map((lv) => (
                      <div
                        key={lv.key}
                        className="flex items-center gap-1 rounded-[4px] border border-[#CBD5E1] bg-white px-1.5 py-1 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {lv.label}:
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={customRatios[lv.key]}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(100, Number(e.target.value)));
                            const nextRatios = { ...customRatios, [lv.key]: val };
                            setCustomRatios(nextRatios);
                            applyRatiosToAllParts(nextRatios);
                          }}
                          className="w-full bg-transparent text-right text-[12px] font-bold text-[#136F63] tabular-nums focus:outline-none dark:text-emerald-400"
                        />
                        <span className="text-[10.5px] text-slate-400">%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3 Parts Detailed Cognitive Level Matrix */}
            <div className="mt-3 space-y-2.5">
              {renderPartMatrixRow(
                'Phần I (TN 4 lựa chọn)',
                'Mỗi câu 0,25 điểm · 1 lệnh hỏi / câu',
                p1Matrix,
                setP1Matrix,
                false
              )}
              {renderPartMatrixRow(
                'Phần II (Đúng/Sai × 4 ý)',
                'Mỗi câu 1,0 điểm · 4 lệnh hỏi a, b, c, d / câu',
                p2Matrix,
                setP2Matrix,
                true
              )}
              {renderPartMatrixRow(
                'Phần III (Trả lời ngắn)',
                'Mỗi câu 0,5 điểm · Điền đáp số ≤ 4 ký tự',
                p3Matrix,
                setP3Matrix,
                false
              )}
            </div>

            {/* Matrix Summary & Auto-Balance / View Spec Actions */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={handleAutoBalanceLevels}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#136F63]/40 bg-[#F8FAFC] px-3 py-1.5 text-[12.5px] font-medium text-[#136F63] transition-colors hover:bg-[#E0F2FE] hover:text-[#0369A1] dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
              >
                <Scale className="h-3.5 w-3.5" />
                <span>Tự động cân bằng số lệnh NB / TH / VD / VDC</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMatrixSpecModal(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#E0F2FE] px-3 py-1.5 text-[12.5px] font-semibold text-[#0369A1] transition-colors hover:bg-[#BAE6FD] dark:bg-slate-800 dark:text-[#BAE6FD]"
              >
                <Table2 className="h-3.5 w-3.5" />
                <span>Xem bảng Ma trận đặc tả ({matrixSpecRows.length} dòng)</span>
              </button>
            </div>
          </section>

          {/* BƯỚC 3: CHỌN 1 TRONG 2 CHẾ ĐỘ TẠO ĐỀ */}
          <section className="rounded-[6px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[#136F63] text-xs font-bold text-white">
                  3
                </span>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Chọn Chế độ Tạo đề (Ngân hàng hoặc Gemini AI)
                </h3>
              </div>
              <span className="text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
                Kho: {bankItems.length} câu
              </span>
            </div>

            {/* AI Parameters & Emphasis */}
            <div className="mt-3 space-y-2.5 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                  Trọng tâm nhấn mạnh (tùy chọn cho Gemini AI)
                </label>
                <input
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Ví dụ: Tập trung cực trị hàm bậc 3, tiệm cận xiên và bài toán tối ưu..."
                  className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Tỷ lệ bài toán thực tế
                </span>
                <span className="font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                  {realWorldRatio}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={realWorldRatio}
                onChange={(e) => setRealWorldRatio(Number(e.target.value))}
                className="w-full accent-[#136F63]"
              />

              <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeParamM}
                  onChange={(e) => setIncludeParamM(e.target.checked)}
                  className="h-4 w-4 accent-[#136F63]"
                />
                <span>Có bài toán chứa tham số ($m, a, b...$) để phân hóa học sinh</span>
              </label>
            </div>

            {/* 2 Primary Generation Mode Buttons */}
            <div className="mt-3.5 grid grid-cols-1 gap-2.5">
              {/* Button 1: From Question Bank */}
              <button
                type="button"
                onClick={handleGenerateFromBank}
                disabled={generatingBank || generatingAI}
                className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-[6px] bg-[#136F63] px-4 py-2.5 text-left text-white transition-colors hover:bg-[#0F594F] disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5">
                  {generatingBank ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  ) : (
                    <Database className="h-5 w-5 shrink-0" />
                  )}
                  <div>
                    <div className="text-[13.5px] font-semibold">
                      1. Soạn đề từ Ngân hàng (Bốc ngẫu nhiên chuẩn ID)
                    </div>
                    <div className="text-[11.5px] text-white/85">
                      Quét kho câu hỏi theo đúng bài học &amp; mã ID [T{grade}-C..._B..._NB/TH/VD/VDC]
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-[4px] bg-white/15 px-2 py-1 text-[11.5px] font-semibold tabular-nums">
                  {totalQuestions} câu
                </span>
              </button>

              {/* Button 2: From Gemini AI */}
              <button
                type="button"
                onClick={handleGenerateWithAI}
                disabled={generatingAI || generatingBank}
                className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-[6px] border border-[#136F63] bg-[#E0F2FE]/70 px-4 py-2.5 text-left text-[#0369A1] transition-colors hover:bg-[#E0F2FE] disabled:opacity-60 dark:border-[#136F63] dark:bg-slate-800 dark:text-[#BAE6FD]"
              >
                <div className="flex items-center gap-2.5">
                  {generatingAI ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#136F63]" />
                  ) : (
                    <Sparkles className="h-5 w-5 shrink-0 text-[#136F63] dark:text-emerald-400" />
                  )}
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#136F63] dark:text-emerald-300">
                      {generatingAI
                        ? 'Gemini AI đang biên soạn đề theo Ma trận...'
                        : '2. Soạn đề từ Gemini AI (Sinh đề mới theo Ma trận)'}
                    </div>
                    <div className="text-[11.5px] text-[#0369A1]/85 dark:text-slate-300">
                      Biên soạn mới 100% câu hỏi &amp; lời giải chi tiết theo bảng ma trận Bước 2
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-[4px] bg-[#136F63] px-2 py-1 text-[11.5px] font-semibold text-white">
                  AI Mới
                </span>
              </button>

              {/* Optional Word/Text Upload into Bank */}
              <label className="flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[12.5px] font-medium text-slate-600 transition-colors hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                <Upload className="h-4 w-4" />
                <span>Tải thêm đề Word (.docx) / Text từ máy vào Ngân hàng đề</span>
                <input
                  type="file"
                  accept=".docx,.txt"
                  onChange={handleUploadCustomExam}
                  className="hidden"
                />
              </label>
            </div>

            {statusMsg && (
              <div className="mt-3 rounded-[6px] border border-[#136F63]/30 bg-[#E0F2FE]/60 p-2.5 text-[12.5px] font-medium text-[#0369A1] dark:border-[#136F63]/50 dark:bg-slate-800 dark:text-[#BAE6FD]">
                {statusMsg}
              </div>
            )}

            {/* Bank ID Matching Audit Report */}
            {bankAuditReport && bankAuditReport.length > 0 && (
              <div className="mt-3 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                  <span>Báo cáo đối chiếu mã ID trong Ngân hàng đề</span>
                  <button
                    type="button"
                    onClick={() => setBankAuditReport(null)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px]">
                  {bankAuditReport.map((item, idx) => {
                    const isComplete = item.foundExact >= item.requested;
                    return (
                      <div
                        key={`${item.idTag}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-[4px] bg-white px-2 py-1 dark:bg-slate-900"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {isComplete ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          <span className="font-semibold text-[#0369A1] tabular-nums dark:text-[#BAE6FD]">
                            {item.idTag}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 text-[11.5px] font-medium tabular-nums ${
                            isComplete ? 'text-emerald-700' : 'text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {isComplete
                            ? `Đủ ${item.foundExact}/${item.requested} câu`
                            : `Có ${item.foundExact}/${item.requested} (Bù ${item.usedFallback} câu cùng chương)`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ==================== CỘT PHẢI: XEM TRƯỚC & XUẤT BẢN A4 ==================== */}
        <div className="xl:col-span-7">
          <ExamA4Preview
            exam={currentExam}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            layoutStyle={layoutStyle}
            onChangeLayoutStyle={setLayoutStyle}
            matrixAttachment={matrixAttachment}
            onCreateOnlineLink={(targetExam) => {
              onCreateOnlineLink(targetExam);
              setStatusMsg(`Đã khởi tạo Phòng thi Online cho Mã đề ${targetExam.examCode}!`);
            }}
          />
        </div>
      </div>

      {/* Modal Xem Bảng Ma Trận Đặc Tả Chi Tiết */}
      {showMatrixSpecModal && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setShowMatrixSpecModal(false)}
          maxWidthClass="max-w-4xl"
          title="Bảng Ma trận & Đặc tả Đề kiểm tra Chi tiết"
          subtitle={matrixAttachment.summaryLine}
          bodyClassName="p-5"
        >
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[#E2E8F0] text-[13px] tabular-nums dark:border-slate-700">
                <thead>
                  <tr className="bg-[#136F63] text-white">
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">TT</th>
                    <th className="border border-[#0F594F] px-3 py-2 text-left">
                      Chủ đề / Bài học đã chọn
                    </th>
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">Phần thi</th>
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">Mức độ</th>
                    <th className="border border-[#0F594F] px-3 py-2 text-center">
                      Mã ID Chuẩn
                    </th>
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">Số câu</th>
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">Số lệnh</th>
                    <th className="border border-[#0F594F] px-2.5 py-2 text-center">Điểm số</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixSpecRows.map((r) => (
                    <tr
                      key={r.stt}
                      className="odd:bg-white even:bg-[#F8FAFC] dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                    >
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-700">
                        {r.stt}
                      </td>
                      <td className="border border-[#E2E8F0] px-3 py-2 text-left font-medium text-slate-800 dark:border-slate-700 dark:text-slate-100">
                        {r.lessonTitle}
                      </td>
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-700">
                        {r.partLabel}
                      </td>
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-[#136F63] dark:border-slate-700 dark:text-emerald-400">
                        {r.levelLabel}
                      </td>
                      <td className="border border-[#E2E8F0] px-3 py-2 text-center font-semibold text-[#0369A1] dark:border-slate-700 dark:text-[#BAE6FD]">
                        {r.idTag}
                      </td>
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center font-semibold dark:border-slate-700">
                        {r.questionCount}
                      </td>
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-700">
                        {r.commandCount}
                      </td>
                      <td className="border border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-slate-900 dark:border-slate-700 dark:text-white">
                        {r.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-[12.5px] text-slate-600 dark:text-slate-300">
                Mẹo: Chọn <strong>Ở đầu file (.docx)</strong> hoặc <strong>Ở cuối file (.docx)</strong> ở Bước 1 để in kèm bảng này vào đề Word/PDF.
              </div>
              <button
                type="button"
                onClick={() => setShowMatrixSpecModal(false)}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2 text-[13.5px] font-medium text-white hover:bg-[#0F594F]"
              >
                Đóng bảng
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}
    </div>
  );
};
