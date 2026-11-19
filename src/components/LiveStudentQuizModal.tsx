import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Package,
  PenLine,
  Play,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  BankQuestion,
  BoardEssayQuestion,
  Classroom,
  ClassroomStudent,
  ExamPaper,
  GradeColumnTarget,
  LiveQuizPackage,
  OralCheckMatrixConfig,
  Part1Question,
  Part2Question,
  Part3Question,
  StudentAttemptRecord,
  StudentQuizQuestionDetail,
  SubjectGradeEntry,
} from '../types/eduplan';
import { MathText } from './MathText';
import { ExamDiagram } from './ExamDiagrams';
import {
  formatMcqOptionDisplay,
  normalizeSolutionSteps,
  stripAnswerPrefix,
} from '../utils/solutionFormat';
import { getStudentAvatarGradient, getStudentInitials } from '../utils/classroomDb';
import {
  createEmptyGradeEntry,
  formatScoreValue,
  loadGradebookConfig,
  makeGradeEntryId,
  suggestNextTxColumn,
} from '../utils/gradebookDb';
import {
  createDefaultOralMatrixConfig,
  formatMatrixRequirementSummary,
  generateRandomPackagesFromMatrix,
} from '../utils/oralMatrixDb';
import { GradeTargetSelection } from './StudentPickerModal';
import { SmartboardViewport } from './SmartboardViewport';
import {
  FloatingMathKeypad,
  sanitizeShortAnswerValue,
  SHORT_ANSWER_MAX_LEN,
} from './FloatingMathKeypad';

const SMAS_COLUMN_OPTIONS: { key: GradeColumnTarget; label: string }[] = [
  { key: 'tx1', label: 'ĐĐG TX 1' },
  { key: 'tx2', label: 'ĐĐG TX 2' },
  { key: 'tx3', label: 'ĐĐG TX 3' },
  { key: 'tx4', label: 'ĐĐG TX 4' },
  { key: 'tx5', label: 'ĐĐG TX 5' },
  { key: 'gk', label: 'ĐĐG GK' },
  { key: 'ck', label: 'ĐĐG CK' },
];

interface LiveStudentQuizModalProps {
  open: boolean;
  student: ClassroomStudent | null;
  classroom: Classroom | null;
  currentExam: ExamPaper;
  bankItems: BankQuestion[];
  gradebookMap?: Record<string, SubjectGradeEntry>;
  matrixConfig?: OralCheckMatrixConfig | null;
  initialGradeTarget?: GradeTargetSelection;
  onEditMatrix?: () => void;
  onClose: () => void;
  onSaveAttempt: (
    studentId: string,
    attempt: StudentAttemptRecord,
    syncGlobalExam?: { score: number; tabSwitches: number },
    gradeTarget?: GradeTargetSelection
  ) => Promise<void> | void;
}

export const LiveStudentQuizModal: React.FC<LiveStudentQuizModalProps> = ({
  open,
  student,
  classroom,
  currentExam,
  bankItems,
  gradebookMap = {},
  matrixConfig,
  initialGradeTarget,
  onEditMatrix,
  onClose,
  onSaveAttempt,
}) => {
  // Always begin at Step 2 ('choose_package'), never jump straight to default exam
  const [stage, setStage] = useState<'choose_package' | 'solving'>('choose_package');
  const [packageSeed, setPackageSeed] = useState(0);
  const [selectedPkgIndex, setSelectedPkgIndex] = useState<number | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);

  const [ansP1, setAnsP1] = useState<Record<string, number>>({});
  const [ansP2, setAnsP2] = useState<Record<string, boolean>>({});
  const [ansP3, setAnsP3] = useState<Record<string, string>>({});
  const [essayNotes, setEssayNotes] = useState<Record<string, string>>({});
  const [essayScores, setEssayScores] = useState<Record<string, string>>({});
  const [essayFeedbacks, setEssayFeedbacks] = useState<Record<string, string>>({});
  const [essayScoreError, setEssayScoreError] = useState<string | null>(null);

  const [submittedAttempt, setSubmittedAttempt] = useState<StudentAttemptRecord | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const [activeKeypadQId, setActiveKeypadQId] = useState<string | null>(null);
  const [focusedQIndex, setFocusedQIndex] = useState<number>(0);

  const questionCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const p3InputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const submitQuizRef = useRef<() => void>(() => {});

  const effectiveMatrix: OralCheckMatrixConfig = useMemo(() => {
    const grade = classroom?.grade || currentExam.grade || '12';
    if (matrixConfig && matrixConfig.isLocked) {
      return matrixConfig;
    }
    return createDefaultOralMatrixConfig(grade);
  }, [matrixConfig, classroom?.grade, currentExam.grade]);

  const [targetSemester, setTargetSemester] = useState<1 | 2>(
    initialGradeTarget?.semester || effectiveMatrix.semester || 1
  );
  const [targetColumn, setTargetColumn] = useState<GradeColumnTarget>(
    initialGradeTarget?.targetColumn || 'tx1'
  );

  // Quick bonus/oral after submission
  const [quickMode, setQuickMode] = useState<'bonus' | 'oral'>('bonus');
  const [oralScoreInput, setOralScoreInput] = useState('9');
  const [quickNote, setQuickNote] = useState('');
  const [extraSavedMsg, setExtraSavedMsg] = useState<string | null>(null);

  // Generate 3 or 4 randomized packages strictly adhering to Step 1 matrix
  const packages: LiveQuizPackage[] = useMemo(() => {
    if (!open || !student) return [];
    return generateRandomPackagesFromMatrix(
      bankItems,
      effectiveMatrix,
      currentExam,
      classroom?.name
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?.id, packageSeed, effectiveMatrix, bankItems, currentExam, classroom?.name]);

  const activePackage: LiveQuizPackage | null = useMemo(() => {
    if (!selectedPkgIndex) return null;
    return packages.find((p) => p.packageIndex === selectedPkgIndex) || packages[0] || null;
  }, [packages, selectedPkgIndex]);

  const studentGradeEntry = useMemo(() => {
    if (!student || !classroom) return undefined;
    const id = makeGradeEntryId(classroom.id, targetSemester, student.id);
    return gradebookMap[id] || createEmptyGradeEntry(classroom.id, targetSemester, student.id);
  }, [student, classroom, targetSemester, gradebookMap]);

  const suggestedColumn = useMemo(() => {
    const cfg = loadGradebookConfig();
    return suggestNextTxColumn(studentGradeEntry, cfg.txColumnCount);
  }, [studentGradeEntry]);

  // Reset cleanly back to Step 2 whenever opening for a student or regenerating packages
  useEffect(() => {
    if (!open) return;
    setStage('choose_package');
    setSelectedPkgIndex(null);
    setAnsP1({});
    setAnsP2({});
    setAnsP3({});
    setEssayNotes({});
    setEssayScores({});
    setEssayFeedbacks({});
    setEssayScoreError(null);
    setSubmittedAttempt(null);
    setActiveKeypadQId(null);
    setFocusedQIndex(0);
    setElapsedSeconds(0);
    setTabSwitches(0);
    setExpandedSolutions({});
    setExtraSavedMsg(null);
    setQuickNote('');
  }, [open, student?.id, packageSeed, effectiveMatrix.updatedAt]);

  useEffect(() => {
    if (!open || !student) return;
    if (initialGradeTarget) {
      setTargetSemester(initialGradeTarget.semester);
      setTargetColumn(initialGradeTarget.targetColumn);
    } else {
      setTargetSemester(effectiveMatrix.semester);
      if (effectiveMatrix.targetColumnMode !== 'auto') {
        setTargetColumn(effectiveMatrix.targetColumnMode);
      } else {
        setTargetColumn(suggestedColumn);
      }
    }
  }, [
    open,
    student?.id,
    initialGradeTarget,
    effectiveMatrix.semester,
    effectiveMatrix.targetColumnMode,
    suggestedColumn,
  ]);

  // Timer tick ONLY during Step 3 ('solving') before submission
  useEffect(() => {
    if (!open || stage !== 'solving' || submittedAttempt) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, stage, submittedAttempt]);

  // Visibility anti-cheat listener ONLY during Step 3 ('solving')
  useEffect(() => {
    if (!open || stage !== 'solving' || submittedAttempt) return;
    const onVis = () => {
      if (document.hidden) {
        setTabSwitches((c) => c + 1);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [open, stage, submittedAttempt]);

  // Flat objective question list for keyboard navigation (← / →) & quick answer (1-4 / A-D)
  const navExam = activePackage?.examPaper || currentExam;
  const flatQuizQuestions = useMemo(() => {
    const list: Array<{ part: 'part1' | 'part2' | 'part3'; id: string; number: number }> = [];
    navExam.part1.forEach((q) => list.push({ part: 'part1', id: q.id, number: q.number }));
    navExam.part2.forEach((q) => list.push({ part: 'part2', id: q.id, number: q.number }));
    navExam.part3.forEach((q) => list.push({ part: 'part3', id: q.id, number: q.number }));
    return list;
  }, [navExam]);

  // Comprehensive Exam/Oral Quiz Keyboard Shortcuts (1-4 / A-D, ← / →, Ctrl+Enter)
  useEffect(() => {
    if (!open || stage !== 'solving' || submittedAttempt) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Enter -> Submit immediately (even when inside an input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        setActiveKeypadQId(null);
        submitQuizRef.current();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Left / Right arrows to move between questions (skip if user is moving caret inside text input)
      if (!isTextInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (flatQuizQuestions.length === 0) return;
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        setFocusedQIndex((prev) => {
          const nextIdx = (prev + delta + flatQuizQuestions.length) % flatQuizQuestions.length;
          const nextQ = flatQuizQuestions[nextIdx];
          if (nextQ) {
            const cardEl = questionCardRefs.current[nextQ.id];
            cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (nextQ.part === 'part3') {
              setActiveKeypadQId(nextQ.id);
              p3InputRefs.current[nextQ.id]?.focus();
            } else {
              setActiveKeypadQId(null);
            }
          }
          return nextIdx;
        });
        return;
      }

      if (isTextInput) return;

      // 1-4 or A-D to pick option on currently focused question
      const keyLower = e.key.toLowerCase();
      const choiceMap: Record<string, number> = {
        '1': 0,
        a: 0,
        '2': 1,
        b: 1,
        '3': 2,
        c: 2,
        '4': 3,
        d: 3,
      };
      if (keyLower in choiceMap && flatQuizQuestions.length > 0) {
        const cur = flatQuizQuestions[Math.min(focusedQIndex, flatQuizQuestions.length - 1)];
        if (!cur) return;
        const optIdx = choiceMap[keyLower];
        if (cur.part === 'part1') {
          e.preventDefault();
          setAnsP1((prev) => ({ ...prev, [cur.id]: optIdx }));
        } else if (cur.part === 'part2') {
          e.preventDefault();
          const subLabel = (['a', 'b', 'c', 'd'] as const)[optIdx];
          const k = `${cur.id}-${subLabel}`;
          setAnsP2((prev) => ({ ...prev, [k]: prev[k] === true ? false : true }));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, stage, submittedAttempt, flatQuizQuestions, focusedQIndex]);

  if (!open || !student) return null;

  const activeExam = activePackage?.examPaper || currentExam;
  const activeEssays: BoardEssayQuestion[] = activePackage?.essays || [];
  const timeLimitMinutes = effectiveMatrix.timeLimitMinutes;

  const objQuestionCount =
    activeExam.part1.length + activeExam.part2.length + activeExam.part3.length;
  const totalQuestions = objQuestionCount + activeEssays.length;

  const answeredCount =
    Object.keys(ansP1).length +
    activeExam.part2.filter((q) =>
      q.statements.some((s) => ansP2[`${q.id}-${s.label}`] !== undefined)
    ).length +
    activeExam.part3.filter((q) => (ansP3[q.id] || '').trim().length > 0).length +
    activeEssays.filter((q) => (essayScores[q.id] || '').trim().length > 0).length;

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const remainingSeconds =
    timeLimitMinutes > 0 ? Math.max(0, timeLimitMinutes * 60 - elapsedSeconds) : null;

  const handleSelectPackage = (pkgIndex: number) => {
    setSelectedPkgIndex(pkgIndex);
    setElapsedSeconds(0);
    setTabSwitches(0);
    setAnsP1({});
    setAnsP2({});
    setAnsP3({});
    setEssayNotes({});
    setEssayScores({});
    setEssayFeedbacks({});
    setEssayScoreError(null);
    setSubmittedAttempt(null);
    setActiveKeypadQId(null);
    setFocusedQIndex(0);
    setStage('solving');
  };

  const handleGradeAndSubmit = async () => {
    if (submittedAttempt || !activePackage) return;

    // Validate teacher essay scores if essays exist
    if (activeEssays.length > 0) {
      const missing = activeEssays.find((q) => (essayScores[q.id] || '').trim() === '');
      if (missing) {
        setEssayScoreError(
          `Vui lòng nhập điểm Giáo viên chấm trực tiếp cho Câu tự luận ${missing.number} trước khi Nộp bài & Lưu vào SMAS.`
        );
        return;
      }
    }
    setEssayScoreError(null);

    const letters = ['A', 'B', 'C', 'D'];
    const details: StudentQuizQuestionDetail[] = [];

    let rawEarned = 0;
    let rawMax = 0;
    let correctCount = 0;

    // Part I: 0.25 per question weight
    activeExam.part1.forEach((q: Part1Question) => {
      const pickedIdx = ansP1[q.id];
      const isCorrect = pickedIdx === q.correctIndex;
      rawMax += 0.25;
      if (isCorrect) {
        rawEarned += 0.25;
        correctCount++;
      }
      details.push({
        questionNumber: q.number,
        tag: q.tag,
        partLabel: 'Phần I (TN 4 lựa chọn)',
        studentAnswer: pickedIdx !== undefined ? letters[pickedIdx] : 'Chưa chọn',
        correctAnswer: letters[q.correctIndex],
        isCorrect,
      });
    });

    // Part II: 1.0 per question weight (BGD 2025)
    activeExam.part2.forEach((q: Part2Question) => {
      let matched = 0;
      const stuSummary: string[] = [];
      const keySummary: string[] = [];
      q.statements.forEach((s) => {
        const picked = ansP2[`${q.id}-${s.label}`];
        if (picked === s.isTrue) matched++;
        stuSummary.push(`${s.label}:${picked === undefined ? '-' : picked ? 'Đ' : 'S'}`);
        keySummary.push(`${s.label}:${s.isTrue ? 'Đ' : 'S'}`);
      });
      const pts =
        matched === 4 ? 1.0 : matched === 3 ? 0.5 : matched === 2 ? 0.25 : matched === 1 ? 0.1 : 0;
      rawMax += 1.0;
      rawEarned += pts;
      if (matched === 4) correctCount++;
      details.push({
        questionNumber: q.number,
        tag: q.tag,
        partLabel: 'Phần II (Đúng/Sai)',
        studentAnswer: stuSummary.join(' '),
        correctAnswer: keySummary.join(' '),
        isCorrect: matched === 4,
      });
    });

    // Part III: 0.5 per question weight
    const normalizeShort = (val: string) =>
      val.trim().replace(/\s+/g, '').replace('.', ',').toLowerCase();

    activeExam.part3.forEach((q: Part3Question) => {
      const stuVal = (ansP3[q.id] || '').trim();
      const isCorrect = normalizeShort(stuVal) === normalizeShort(q.answer);
      rawMax += 0.5;
      if (isCorrect) {
        rawEarned += 0.5;
        correctCount++;
      }
      details.push({
        questionNumber: q.number,
        tag: q.tag,
        partLabel: 'Phần III (Trả lời ngắn)',
        studentAnswer: stuVal || 'Trống',
        correctAnswer: q.answer,
        isCorrect,
      });
    });

    // Board Essays (Teacher-graded directly on 0-10 scale)
    let essayTotalScore = 0;
    activeEssays.forEach((q) => {
      const parsed = Math.max(
        0,
        Math.min(10, Number((essayScores[q.id] || '0').replace(',', '.')) || 0)
      );
      essayTotalScore += parsed;
      if (parsed >= 5) correctCount++;
      details.push({
        questionNumber: q.number,
        tag: q.tag,
        partLabel: 'Tự luận trình bày bảng (GV chấm)',
        studentAnswer: `${parsed.toFixed(2).replace('.', ',')}đ${
          essayFeedbacks[q.id]?.trim() ? ` (${essayFeedbacks[q.id].trim()})` : ''
        }`,
        correctAnswer: q.referenceAnswer || 'Đánh giá trực tiếp trên bảng',
        isCorrect: parsed >= 5,
      });
    });

    const objNormalized = rawMax > 0 ? (rawEarned / rawMax) * 10 : 0;
    const essayAvg = activeEssays.length > 0 ? essayTotalScore / activeEssays.length : 0;

    let finalNormalized = 0;
    if (objQuestionCount > 0 && activeEssays.length > 0) {
      finalNormalized =
        (objNormalized * objQuestionCount + essayAvg * activeEssays.length) /
        (objQuestionCount + activeEssays.length);
    } else if (activeEssays.length > 0) {
      finalNormalized = essayAvg;
    } else if (objQuestionCount > 0) {
      finalNormalized = objNormalized;
    }

    const finalScore = Math.round(finalNormalized * 100) / 100;
    const colLabel =
      SMAS_COLUMN_OPTIONS.find((o) => o.key === targetColumn)?.label || targetColumn.toUpperCase();

    const attempt: StudentAttemptRecord = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: student.id,
      classId: student.classId,
      type: activeEssays.length > 0 && objQuestionCount === 0 ? 'oral' : 'quiz',
      title: `${activePackage.packageLabel} · ${effectiveMatrix.topicLabel}`,
      score: finalScore,
      maxScore: 10,
      correctCount,
      totalQuestions,
      durationSeconds: elapsedSeconds,
      tabSwitches,
      note:
        tabSwitches > 0
          ? `${activePackage.packageLabel} · Lưu ${colLabel} HK${targetSemester} (${tabSwitches} lần chuyển tab)`
          : `${activePackage.packageLabel} · Lưu ${colLabel} HK${targetSemester} · Hợp lệ`,
      details,
      createdAt: new Date().toISOString(),
    };

    setSubmittedAttempt(attempt);
    setActiveKeypadQId(null);
    await onSaveAttempt(
      student.id,
      attempt,
      {
        score: finalScore,
        tabSwitches,
      },
      { semester: targetSemester, targetColumn }
    );
  };
  submitQuizRef.current = () => {
    void handleGradeAndSubmit();
  };

  const handleSaveBonusOrOral = async (customBonusDelta?: number) => {
    const isBonus = quickMode === 'bonus' || customBonusDelta !== undefined;
    const value =
      customBonusDelta !== undefined
        ? customBonusDelta
        : Math.max(0, Math.min(10, Number(oralScoreInput.replace(',', '.')) || 0));

    const attempt: StudentAttemptRecord = {
      id: `att-extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: student.id,
      classId: student.classId,
      type: isBonus ? 'bonus' : 'oral',
      title: isBonus
        ? `Điểm cộng phát biểu / trả bài (+${value})`
        : 'Chấm điểm điều chỉnh trực tiếp',
      score: value,
      maxScore: isBonus ? 2 : 10,
      note: quickNote.trim() || (isBonus ? 'Thưởng trực tiếp sau khi lên bảng' : 'Đánh giá trực tiếp trên lớp'),
      createdAt: new Date().toISOString(),
    };

    await onSaveAttempt(
      student.id,
      attempt,
      undefined,
      !isBonus ? { semester: targetSemester, targetColumn } : undefined
    );
    const colLabel =
      SMAS_COLUMN_OPTIONS.find((o) => o.key === targetColumn)?.label || targetColumn.toUpperCase();
    setExtraSavedMsg(
      isBonus
        ? `Đã cộng +${value} điểm thưởng vào hồ sơ của ${student.fullName}.`
        : `Đã cập nhật điểm ${value.toFixed(1).replace('.', ',')} vào cột ${colLabel} (HK${targetSemester}) trên Sổ điểm SMAS.`
    );
    setQuickNote('');
  };

  const formatSummaryList = [
    effectiveMatrix.formats.part1 && 'Trắc nghiệm 4 lựa chọn',
    effectiveMatrix.formats.part2 && 'Đúng/Sai',
    effectiveMatrix.formats.part3 && 'Trả lời ngắn',
    effectiveMatrix.formats.essay && 'Tự luận trình bày bảng',
  ]
    .filter(Boolean)
    .join(', ');

  const targetColLabel =
    SMAS_COLUMN_OPTIONS.find((o) => o.key === targetColumn)?.label || targetColumn.toUpperCase();

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-4xl"
      showPenToolbarByDefault={stage === 'solving'}
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#0F172A] dark:text-white">{student.fullName}</span>
          <span className="text-[12px] font-semibold text-[#136F63]">Lớp {classroom?.name || '—'}</span>
          {stage === 'solving' && activePackage && (
            <span className="rounded-[8px] bg-[#E0F2FE] px-2 py-0.5 text-[12px] font-semibold text-[#0369A1]">
              {activePackage.packageLabel}
            </span>
          )}
        </div>
      }
      subtitle={
        stage === 'choose_package'
          ? 'Bước 2 · Học sinh tự chọn 1 Gói đề ngẫu nhiên theo Ma trận giáo viên đã thiết lập'
          : `${remainingSeconds !== null ? `Còn lại: ${formatDuration(remainingSeconds)}` : `Thời gian: ${formatDuration(elapsedSeconds)}`} · Tiến độ: ${answeredCount}/${totalQuestions} câu · Rời Tab: ${tabSwitches}`
      }
      headerActions={
        onEditMatrix && !submittedAttempt ? (
          <button
            type="button"
            onClick={onEditMatrix}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#136F63]" />
            Sửa Ma trận
          </button>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      <div>

        {/* ===================================================================== */}
        {/* BƯỚC 2: MÀN HÌNH HỌC SINH CHỌN GÓI BÀI LÀM                           */}
        {/* ===================================================================== */}
        {stage === 'choose_package' && (
          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            {/* Greeting & Locked Teacher Requirements */}
            <div className="rounded-[8px] border border-[#136F63]/25 bg-[#F8FAFC] p-5 dark:border-teal-800 dark:bg-teal-950/30">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-[12px] font-semibold tracking-wide text-[#136F63] uppercase dark:text-teal-300">
                    Chào mừng em lên bảng kiểm tra bài
                  </div>
                  <h2 className="text-[18px] font-semibold tracking-tight text-[#0F172A] dark:text-white">
                    Xin mời {student.fullName} (Lớp {classroom?.name}) chọn Gói đề thực hiện
                  </h2>
                  <p className="text-[13.5px] leading-relaxed text-[#334155] dark:text-slate-200">
                    <strong>Yêu cầu kiến thức:</strong>{' '}
                    {formatMatrixRequirementSummary(effectiveMatrix)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-[#64748B] tabular-nums dark:text-slate-300">
                    <span>
                      Thời gian:{' '}
                      <strong className="text-[#0F172A] dark:text-white">
                        {timeLimitMinutes > 0 ? `${timeLimitMinutes} phút` : 'Không giới hạn'}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Dạng thức: <strong className="text-[#0F172A] dark:text-white">{formatSummaryList}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Ghi điểm SMAS:{' '}
                      <strong className="text-[#136F63] dark:text-teal-300">
                        {targetColLabel} (HK{targetSemester})
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Allow adjusting target SMAS column before starting */}
                <div className="flex flex-col gap-1.5 rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-[12px] dark:border-teal-800 dark:bg-slate-900">
                  <span className="font-semibold text-[#136F63] dark:text-teal-300">
                    Cột lưu Sổ điểm SMAS:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={targetSemester}
                      onChange={(e) => setTargetSemester(Number(e.target.value) as 1 | 2)}
                      aria-label="Học kỳ lưu điểm SMAS"
                      className="h-8 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value={1}>HK1</option>
                      <option value={2}>HK2</option>
                    </select>
                    <select
                      value={targetColumn}
                      onChange={(e) => setTargetColumn(e.target.value as GradeColumnTarget)}
                      aria-label="Cột điểm lưu SMAS"
                      className="h-8 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-semibold text-[#136F63] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300"
                    >
                      {SMAS_COLUMN_OPTIONS.map((opt) => {
                        const val = studentGradeEntry?.[opt.key];
                        const isSug = opt.key === suggestedColumn;
                        return (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                            {val !== null && val !== undefined
                              ? ` (${formatScoreValue(val, 2)})`
                              : isSug
                                ? ' (Trống · Gợi ý)'
                                : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Mystery Package Boxes */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                  Hãy bấm chọn 1 trong {packages.length} Hộp nhiệm vụ bên dưới để mở đề:
                </div>
                <button
                  type="button"
                  onClick={() => setPackageSeed((s) => s + 1)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#136F63]" />
                  Xáo trộn bộ gói mới
                </button>
              </div>

              <div
                className={`grid grid-cols-1 gap-4 ${
                  packages.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
                }`}
              >
                {packages.map((pkg) => {
                  const objCount =
                    pkg.examPaper.part1.length +
                    pkg.examPaper.part2.length +
                    pkg.examPaper.part3.length;
                  const essayCount = pkg.essays.length;

                  return (
                    <button
                      key={pkg.packageIndex}
                      type="button"
                      onClick={() => handleSelectPackage(pkg.packageIndex)}
                      className="group flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-5 text-left shadow-xs transition duration-150 hover:-translate-y-0.5 hover:border-[#136F63] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-400"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#136F63]/10 text-[#136F63] transition group-hover:bg-[#136F63] group-hover:text-white dark:bg-teal-950/60 dark:text-teal-300">
                            <Package className="h-6 w-6" />
                          </div>
                          <span className="text-[12px] font-semibold text-[#64748B] tabular-nums">
                            #{String(pkg.packageIndex).padStart(2, '0')}
                          </span>
                        </div>

                        <h4 className="mt-4 text-[15px] font-semibold text-[#0F172A] group-hover:text-[#136F63] dark:text-white dark:group-hover:text-teal-300">
                          {pkg.packageLabel}
                        </h4>

                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#334155] dark:text-slate-300">
                          Gồm <strong>{pkg.totalItems} câu hỏi</strong> bốc ngẫu nhiên từ Kho đề Khối{' '}
                          {effectiveMatrix.grade}, tuân thủ đúng ma trận kiểm tra.
                        </p>

                        <div className="mt-3 space-y-1 border-t border-[#E2E8F0] pt-2.5 text-[12px] text-[#64748B] tabular-nums dark:border-slate-800 dark:text-slate-400">
                          {objCount > 0 && (
                            <div>• Trắc nghiệm tự động: {objCount} câu</div>
                          )}
                          {essayCount > 0 && (
                            <div>• Tự luận trình bày bảng: {essayCount} câu</div>
                          )}
                          <div>
                            • Mức độ:{' '}
                            {[
                              pkg.levelSummary.NB > 0 ? `${pkg.levelSummary.NB} NB` : null,
                              pkg.levelSummary.TH > 0 ? `${pkg.levelSummary.TH} TH` : null,
                              pkg.levelSummary.VD > 0 ? `${pkg.levelSummary.VD} VD` : null,
                              pkg.levelSummary.VDC > 0 ? `${pkg.levelSummary.VDC} VDC` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-[8px] bg-[#F1F5F9] px-3 py-2.5 text-[13.5px] font-medium text-[#334155] transition group-hover:bg-[#136F63] group-hover:text-white dark:bg-slate-800 dark:text-slate-100">
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Chọn {pkg.packageLabel} &amp; Bắt đầu
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* BƯỚC 3: MÀN HÌNH LÀM BÀI & TỰ ĐỘNG CHẤM ĐIỂM VÀO SỔ ĐIỂM SMAS        */}
        {/* ===================================================================== */}
        {stage === 'solving' && activePackage && (
          <>
            {/* Top Toolbar (Target SMAS column + Back to Package Selector before submitting) */}
            {!submittedAttempt && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 sm:px-5 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setStage('choose_package')}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Chọn lại gói khác
                  </button>
                  <span className="font-medium text-[#64748B] dark:text-slate-300">
                    {effectiveMatrix.topicLabel}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#136F63] dark:text-teal-300">
                    Ghi vào cột SMAS:
                  </span>
                  <select
                    value={targetSemester}
                    onChange={(e) => setTargetSemester(Number(e.target.value) as 1 | 2)}
                    aria-label="Học kỳ lưu điểm SMAS"
                    className="rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 text-[12.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-teal-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value={1}>HK1</option>
                    <option value={2}>HK2</option>
                  </select>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value as GradeColumnTarget)}
                    aria-label="Cột điểm lưu SMAS"
                    className="rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 text-[12.5px] font-semibold text-[#136F63] focus:border-[#136F63] focus:outline-none dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300"
                  >
                    {SMAS_COLUMN_OPTIONS.map((opt) => {
                      const val = studentGradeEntry?.[opt.key];
                      const isSug = opt.key === suggestedColumn;
                      return (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                          {val !== null && val !== undefined
                            ? ` (${formatScoreValue(val, 2)})`
                            : isSug
                              ? ' (Trống · Gợi ý)'
                              : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            {/* Scrollable Question Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {/* Submitted Result Banner */}
              {submittedAttempt && (
                <div className="space-y-3 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7]/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[#15803D] text-white shadow-sm">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-[#15803D] dark:text-emerald-100">
                          Đã nộp bài &amp; Tự động cập nhật cột {targetColLabel} (HK{targetSemester}) trên Sổ điểm SMAS 4.0!
                        </div>
                        <div className="mt-0.5 text-[12px] font-medium text-[#334155] tabular-nums dark:text-emerald-300">
                          Học sinh: <strong>{student.fullName}</strong> ({classroom?.name}) ·{' '}
                          {activePackage.packageLabel} · Đạt{' '}
                          <strong>
                            {submittedAttempt.correctCount}/{submittedAttempt.totalQuestions}
                          </strong>{' '}
                          câu · Thời gian: {formatDuration(submittedAttempt.durationSeconds || 0)} · Điểm TBM đã được tính lại tự động
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-[#E2E8F0] bg-white px-4 py-2 text-center shadow-xs dark:border-emerald-700 dark:bg-slate-900">
                      <div className="text-[12px] font-semibold text-[#64748B] uppercase">
                        Điểm chốt SMAS
                      </div>
                      <div className="text-2xl font-bold text-[#B91C1C] tabular-nums">
                        {submittedAttempt.score.toFixed(2).replace('.', ',')}
                        <span className="text-[13.5px] font-medium text-[#64748B]"> / 10</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional extra bonus or score adjustment */}
                  <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1E293B] dark:text-slate-200">
                        <Award className="h-4 w-4 text-[#136F63]" />
                        Thưởng điểm cộng / Điều chỉnh điểm trực tiếp
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQuickMode('bonus')}
                          className={`rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium ${
                            quickMode === 'bonus'
                              ? 'bg-[#136F63] text-white'
                              : 'border border-[#CBD5E1] bg-white text-[#334155] dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          Điểm cộng phát biểu
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickMode('oral')}
                          className={`rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium ${
                            quickMode === 'oral'
                              ? 'bg-[#136F63] text-white'
                              : 'border border-[#CBD5E1] bg-white text-[#334155] dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          Điều chỉnh cột {targetColLabel}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <input
                        value={quickNote}
                        onChange={(e) => setQuickNote(e.target.value)}
                        placeholder="Nhận xét nhanh của giáo viên (tùy chọn)..."
                        className="h-9 min-w-[200px] flex-1 rounded-[8px] border border-[#CBD5E1] px-3 text-[13px] text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      {quickMode === 'bonus' ? (
                        <div className="flex items-center gap-1.5">
                          {[0.5, 1, 2].map((pts) => (
                            <button
                              key={pts}
                              type="button"
                              onClick={() => handleSaveBonusOrOral(pts)}
                              className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[12.5px] font-medium text-[#136F63] hover:bg-[#F8FAFC] tabular-nums"
                            >
                              <PlusCircle className="h-3.5 w-3.5" />+{pts}đ
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.25}
                            value={oralScoreInput}
                            onChange={(e) => setOralScoreInput(e.target.value)}
                            className="h-9 w-20 rounded-[8px] border border-[#CBD5E1] px-2.5 text-center text-[13.5px] font-semibold tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveBonusOrOral()}
                            className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[#136F63] px-3.5 text-[13px] font-medium text-white hover:bg-[#0F594F]"
                          >
                            Cập nhật SMAS
                          </button>
                        </div>
                      )}
                    </div>

                    {extraSavedMsg && (
                      <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#15803D] dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {extraSavedMsg}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Anti-cheat Notice */}
              {!submittedAttempt && tabSwitches > 0 && (
                <div className="flex items-center gap-2 rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] px-3.5 py-2 text-[12.5px] font-semibold text-[#B45309]">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-[#B45309]" />
                  Phát hiện {tabSwitches} lần chuyển rời màn hình làm bài — hệ thống sẽ ghi nhận vào lịch sử bài làm.
                </div>
              )}

              {/* PART I QUESTIONS */}
              {activeExam.part1.length > 0 && (
                <div className="space-y-3">
                  <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                    PHẦN I. Trắc nghiệm nhiều lựa chọn ({activeExam.part1.length} câu · Tự động chấm điểm)
                  </div>
                  {activeExam.part1.map((q, qIdx) => {
                    const pickedIdx = ansP1[q.id];
                    const isSubmitted = Boolean(submittedAttempt);
                    const isRight = isSubmitted && pickedIdx === q.correctIndex;
                    const solOpen = Boolean(expandedSolutions[q.id]);
                    const isFocused = !isSubmitted && focusedQIndex === qIdx;

                    return (
                      <div
                        key={q.id}
                        ref={(el) => {
                          questionCardRefs.current[q.id] = el;
                        }}
                        onClick={() => {
                          if (!isSubmitted) setFocusedQIndex(qIdx);
                        }}
                        className={`rounded-[8px] border p-3.5 transition-shadow ${
                          isSubmitted
                            ? isRight
                              ? 'border-[#86EFAC] bg-[#DCFCE7]/30 dark:border-emerald-800'
                              : 'border-[#FCA5A5] bg-[#FEE2E2]/30 dark:border-rose-800'
                            : isFocused
                              ? 'border-[#136F63] bg-white ring-2 ring-[#136F63]/20 dark:border-teal-400 dark:bg-slate-900/80'
                              : 'border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="text-[14px] leading-relaxed text-[#334155] dark:text-slate-100">
                          <span className="font-semibold text-[#0F172A] dark:text-white">
                            Câu {q.number}.{' '}
                          </span>
                          <span className="mr-1.5 text-[12px] font-semibold text-[#136F63]">{q.tag}</span>
                          <MathText text={q.stem} />
                        </div>

                        {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                          <div className="my-2">
                            <ExamDiagram kind={q.diagram} layer={isSubmitted ? 'sol' : 'stem'} />
                          </div>
                        )}

                        {q.image || q.imageUrl ? (
                          <div className="my-2 flex justify-center">
                            <img
                              src={q.image || q.imageUrl}
                              alt="Hình minh họa / Bảng biểu"
                              className="h-auto max-h-60 max-w-full rounded border border-slate-300 bg-white p-1 shadow-xs object-contain"
                            />
                          </div>
                        ) : q.tableData && q.tableData.length > 0 ? (
                          <div className="my-2 overflow-x-auto">
                            <table className="w-full border-collapse border border-slate-300 text-center text-xs">
                              <tbody>
                                {q.tableData.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="border border-slate-300 px-2.5 py-1.5 text-center">
                                        <MathText text={cell} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {q.options.map((opt, oIdx) => {
                            const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, oIdx);
                            const isPicked = pickedIdx === oIdx;
                            const isCorrectOpt = oIdx === q.correctIndex;

                            let btnClass =
                              'border-[#CBD5E1] bg-white text-[#334155] hover:border-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100';
                            if (isSubmitted) {
                              if (isCorrectOpt) {
                                btnClass =
                                  'border-[#86EFAC] bg-[#DCFCE7] font-semibold text-[#15803D] dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200';
                              } else if (isPicked && !isCorrectOpt) {
                                btnClass =
                                  'border-[#FCA5A5] bg-[#FEE2E2] font-semibold text-[#B91C1C] dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200';
                              }
                            } else if (isPicked) {
                              btnClass =
                                'border-[#136F63] bg-[#136F63]/10 font-semibold text-[#0F172A] shadow-xs dark:border-teal-400 dark:bg-teal-900/50 dark:text-white';
                            }

                            return (
                              <button
                                key={oIdx}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => setAnsP1((prev) => ({ ...prev, [q.id]: oIdx }))}
                                className={`flex min-h-[48px] items-center gap-2 rounded-[8px] border px-3.5 py-2.5 text-left text-[14px] transition-colors ${btnClass}`}
                              >
                                <span className="shrink-0 font-semibold">{letter}.</span>
                                <span className="min-w-0 flex-1">
                                  <MathText text={cleanOpt} />
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {isSubmitted && (q.solutionSteps.length > 0 || q.solutionImage) && (
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSolutions((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                              }
                              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#136F63] hover:underline"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${solOpen ? 'rotate-180' : ''}`}
                              />
                              {solOpen ? 'Ẩn lời giải' : 'Xem lời giải chi tiết'}
                            </button>
                            {solOpen && (
                              <div className="mt-2 space-y-1.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/40">
                                {q.solutionImage && (
                                  <div className="my-1.5 flex justify-center">
                                    <img
                                      src={q.solutionImage}
                                      alt="Hình minh họa lời giải"
                                      className="max-h-48 max-w-full rounded border border-slate-300 bg-white p-1"
                                    />
                                  </div>
                                )}
                                {normalizeSolutionSteps(q.solutionSteps).map((st, idx) => (
                                  <div key={idx} className="text-justify leading-relaxed">
                                    <span className="font-bold text-[#136F63] dark:text-teal-300">
                                      {st.label}
                                    </span>{' '}
                                    <MathText text={st.body} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PART II QUESTIONS */}
              {activeExam.part2.length > 0 && (
                <div className="space-y-3">
                  <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                    PHẦN II. Trắc nghiệm Đúng / Sai ({activeExam.part2.length} câu · Tự động chấm điểm)
                  </div>
                  {activeExam.part2.map((q, qIdx) => {
                    const isSubmitted = Boolean(submittedAttempt);
                    const flatIdx = activeExam.part1.length + qIdx;
                    const isFocused = !isSubmitted && focusedQIndex === flatIdx;
                    return (
                      <div
                        key={q.id}
                        ref={(el) => {
                          questionCardRefs.current[q.id] = el;
                        }}
                        onClick={() => {
                          if (!isSubmitted) setFocusedQIndex(flatIdx);
                        }}
                        className={`rounded-[8px] border p-3.5 transition-shadow ${
                          isFocused
                            ? 'border-[#136F63] bg-white ring-2 ring-[#136F63]/20 dark:border-teal-400 dark:bg-slate-900/80'
                            : 'border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="text-[14px] leading-relaxed text-[#334155] dark:text-slate-100">
                          <span className="font-semibold text-[#0F172A] dark:text-white">
                            Câu {q.number}.{' '}
                          </span>
                          <span className="mr-1.5 text-[12px] font-semibold text-[#136F63]">{q.tag}</span>
                          <MathText text={q.stem} />
                        </div>
                        {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                          <div className="my-2">
                            <ExamDiagram kind={q.diagram} layer={isSubmitted ? 'sol' : 'stem'} />
                          </div>
                        )}
                        {q.image || q.imageUrl ? (
                          <div className="my-2 flex justify-center">
                            <img
                              src={q.image || q.imageUrl}
                              alt="Hình minh họa / Bảng biểu"
                              className="h-auto max-h-60 max-w-full rounded border border-slate-300 bg-white p-1 shadow-xs object-contain"
                            />
                          </div>
                        ) : q.tableData && q.tableData.length > 0 ? (
                          <div className="my-2 overflow-x-auto">
                            <table className="w-full border-collapse border border-slate-300 text-center text-xs">
                              <tbody>
                                {q.tableData.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="border border-slate-300 px-2.5 py-1.5 text-center">
                                        <MathText text={cell} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        <div className="mt-2.5 space-y-2">
                          {q.statements.map((st) => {
                            const key = `${q.id}-${st.label}`;
                            const picked = ansP2[key];
                            return (
                              <div
                                key={st.label}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[13.5px] dark:border-slate-700 dark:bg-slate-800/50"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold">{st.label}) </span>
                                  <MathText text={st.text} />
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {[
                                    { label: 'Đúng', val: true },
                                    { label: 'Sai', val: false },
                                  ].map((opt) => (
                                    <button
                                      key={opt.label}
                                      type="button"
                                      disabled={isSubmitted}
                                      onClick={() => setAnsP2((prev) => ({ ...prev, [key]: opt.val }))}
                                      className={`min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium transition-colors ${
                                        picked === opt.val
                                          ? 'bg-[#136F63] text-white'
                                          : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                  {isSubmitted && (
                                    <span
                                      className={`ml-1 rounded-[8px] px-2 py-0.5 text-[12px] font-semibold ${
                                        picked === st.isTrue
                                          ? 'bg-[#DCFCE7] text-[#15803D]'
                                          : 'bg-[#FEE2E2] text-[#B91C1C]'
                                      }`}
                                    >
                                      Đáp án: {st.isTrue ? 'Đúng' : 'Sai'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PART III QUESTIONS */}
              {activeExam.part3.length > 0 && (
                <div className="space-y-3">
                  <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                    PHẦN III. Trả lời ngắn ({activeExam.part3.length} câu · Tự động chấm điểm)
                  </div>
                  {activeExam.part3.map((q, qIdx) => {
                    const isSubmitted = Boolean(submittedAttempt);
                    const flatIdx = activeExam.part1.length + activeExam.part2.length + qIdx;
                    const isFocused = !isSubmitted && focusedQIndex === flatIdx;
                    const val = ansP3[q.id] || '';
                    const isCorrect =
                      isSubmitted &&
                      val.trim().replace(/\s+/g, '').replace('.', ',').toLowerCase() ===
                        q.answer.trim().replace(/\s+/g, '').replace('.', ',').toLowerCase();
                    return (
                      <div
                        key={q.id}
                        ref={(el) => {
                          questionCardRefs.current[q.id] = el;
                        }}
                        onClick={() => {
                          if (!isSubmitted) setFocusedQIndex(flatIdx);
                        }}
                        className={`rounded-[8px] border p-3.5 transition-shadow ${
                          isFocused
                            ? 'border-[#136F63] bg-white ring-2 ring-[#136F63]/20 dark:border-teal-400 dark:bg-slate-900/80'
                            : 'border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="text-[14px] leading-relaxed text-[#334155] dark:text-slate-100">
                          <span className="font-semibold text-[#0F172A] dark:text-white">
                            Câu {q.number}.{' '}
                          </span>
                          <span className="mr-1.5 text-[12px] font-semibold text-[#136F63]">{q.tag}</span>
                          <MathText text={q.stem} />
                        </div>
                        {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                          <div className="my-2">
                            <ExamDiagram kind={q.diagram} layer={isSubmitted ? 'sol' : 'stem'} />
                          </div>
                        )}
                        {q.image || q.imageUrl ? (
                          <div className="my-2 flex justify-center">
                            <img
                              src={q.image || q.imageUrl}
                              alt="Hình minh họa / Bảng biểu"
                              className="h-auto max-h-60 max-w-full rounded border border-slate-300 bg-white p-1 shadow-xs object-contain"
                            />
                          </div>
                        ) : q.tableData && q.tableData.length > 0 ? (
                          <div className="my-2 overflow-x-auto">
                            <table className="w-full border-collapse border border-slate-300 text-center text-xs">
                              <tbody>
                                {q.tableData.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="border border-slate-300 px-2.5 py-1.5 text-center">
                                        <MathText text={cell} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                          <input
                            ref={(el) => {
                              p3InputRefs.current[q.id] = el;
                            }}
                            maxLength={SHORT_ANSWER_MAX_LEN}
                            disabled={isSubmitted}
                            value={val}
                            onFocus={() => {
                              if (!isSubmitted) {
                                setFocusedQIndex(flatIdx);
                                setActiveKeypadQId(q.id);
                              }
                            }}
                            onClick={() => {
                              if (!isSubmitted) {
                                setFocusedQIndex(flatIdx);
                                setActiveKeypadQId(q.id);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                e.preventDefault();
                                const nextQ = activeExam.part3[qIdx + 1];
                                if (nextQ) {
                                  setActiveKeypadQId(nextQ.id);
                                  setFocusedQIndex(flatIdx + 1);
                                  p3InputRefs.current[nextQ.id]?.focus();
                                } else {
                                  setActiveKeypadQId(null);
                                }
                              }
                            }}
                            onChange={(e) =>
                              setAnsP3((prev) => ({
                                ...prev,
                                [q.id]: sanitizeShortAnswerValue(e.target.value),
                              }))
                            }
                            placeholder="Nhập đáp số (tối đa 4 ký tự, VD: -2,4)"
                            className="h-10 w-56 rounded-[8px] border border-[#CBD5E1] px-3 font-mono text-[14px] font-bold tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                          />
                          {!isSubmitted && (
                            <span className="text-[11.5px] text-[#64748B] dark:text-slate-400">
                              Tối đa 4 ký tự · Chạm ô để mở bàn phím số ảo
                            </span>
                          )}
                          {isSubmitted && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[12px] font-semibold ${
                                isCorrect
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : 'bg-[#FEE2E2] text-[#B91C1C]'
                              }`}
                            >
                              {isCorrect ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              )}
                              <span>Đáp số chuẩn:</span>{' '}
                              <MathText text={stripAnswerPrefix(q.answer)} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* BOARD ESSAY QUESTIONS (GIÁO VIÊN CHẤM TRỰC TIẾP) */}
              {activeEssays.length > 0 && (
                <div className="space-y-3">
                  <div className="rounded-[8px] bg-[#136F63]/10 px-3 py-1.5 text-[13px] font-semibold text-[#136F63] dark:bg-teal-950/60 dark:text-teal-200">
                    TỰ LUẬN TRÌNH BÀY BẢNG ({activeEssays.length} câu · Giáo viên chấm trực tiếp)
                  </div>

                  {activeEssays.map((q) => {
                    const isSubmitted = Boolean(submittedAttempt);
                    const solOpen = Boolean(expandedSolutions[q.id]);
                    const scoreStr = essayScores[q.id] || '';
                    return (
                      <div
                        key={q.id}
                        className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-teal-800 dark:bg-slate-900/60"
                      >
                        <div className="text-[14px] leading-relaxed text-[#334155] dark:text-slate-100">
                          <span className="font-semibold text-[#136F63] dark:text-teal-300">
                            Bài Tự luận {q.number}.{' '}
                          </span>
                          <span className="mr-1.5 text-[12px] font-semibold text-[#0369A1]">{q.tag}</span>
                          <MathText text={q.stem} />
                        </div>

                        {q.diagram && !q.image && !q.tableData && (
                          <div className="my-2">
                            <ExamDiagram kind={q.diagram} layer={isSubmitted ? 'sol' : 'stem'} />
                          </div>
                        )}
                        {q.image ? (
                          <div className="my-2 flex justify-center">
                            <img
                              src={q.image}
                              alt="Hình minh họa / Bảng biểu"
                              className="h-auto max-h-60 max-w-full rounded border border-slate-300 bg-white p-1 shadow-xs object-contain"
                            />
                          </div>
                        ) : q.tableData && q.tableData.length > 0 ? (
                          <div className="my-2 overflow-x-auto">
                            <table className="w-full border-collapse border border-slate-300 text-center text-xs">
                              <tbody>
                                {q.tableData.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="border border-slate-300 px-2.5 py-1.5 text-center">
                                        <MathText text={cell} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {/* Optional student notes / draft */}
                        <textarea
                          rows={2}
                          disabled={isSubmitted}
                          value={essayNotes[q.id] || ''}
                          onChange={(e) =>
                            setEssayNotes((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Ghi chú tóm tắt phần học sinh trình bày trên bảng (tùy chọn)..."
                          className="mt-2.5 w-full rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#334155] focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />

                        {/* Teacher Direct Grading Box */}
                        <div className="mt-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-teal-800 dark:bg-teal-950/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#136F63] dark:text-teal-300">
                              <PenLine className="h-3.5 w-3.5" />
                              Giáo viên chấm điểm trình bày bảng (Thang 0 – 10):
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSolutions((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                              }
                              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#136F63] hover:underline"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${solOpen ? 'rotate-180' : ''}`}
                              />
                              {solOpen ? 'Ẩn gợi ý chấm' : 'Xem đáp án / gợi ý chấm (GV)'}
                            </button>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {['5', '6', '7', '7,5', '8', '8,5', '9', '9,5', '10'].map((pt) => {
                                const normalizedPt = pt.replace(',', '.');
                                const active = scoreStr.replace(',', '.') === normalizedPt;
                                return (
                                  <button
                                    key={pt}
                                    type="button"
                                    disabled={isSubmitted}
                                    onClick={() => {
                                      setEssayScoreError(null);
                                      setEssayScores((prev) => ({ ...prev, [q.id]: normalizedPt }));
                                    }}
                                    className={`h-8 rounded-[8px] px-2.5 text-[12.5px] font-semibold tabular-nums transition ${
                                      active
                                        ? 'bg-[#136F63] text-white'
                                        : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-teal-700 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    {pt}
                                  </button>
                                );
                              })}
                            </div>

                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={0.25}
                              disabled={isSubmitted}
                              value={scoreStr}
                              onChange={(e) => {
                                setEssayScoreError(null);
                                setEssayScores((prev) => ({ ...prev, [q.id]: e.target.value }));
                              }}
                              placeholder="Điểm..."
                              aria-label={`Điểm tự luận bài ${q.number}`}
                              className="h-8 w-20 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-center text-[13px] font-semibold text-[#136F63] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300"
                            />

                            <input
                              disabled={isSubmitted}
                              value={essayFeedbacks[q.id] || ''}
                              onChange={(e) =>
                                setEssayFeedbacks((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder="Nhận xét bài làm trên bảng..."
                              className="h-8 min-w-[180px] flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13px] text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>

                          {solOpen && (
                            <div className="mt-2.5 space-y-1.5 rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-[13px] leading-relaxed dark:border-slate-700 dark:bg-slate-900">
                              {normalizeSolutionSteps(q.solutionSteps).map((st, idx) => (
                                <div key={idx} className="text-justify leading-relaxed">
                                  <span className="font-bold text-[#136F63] dark:text-teal-300">
                                    {st.label}
                                  </span>{' '}
                                  <MathText text={st.body} />
                                </div>
                              ))}
                              {q.referenceAnswer && (
                                <div className="mt-2 rounded-[6px] border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 font-semibold text-[#B91C1C] dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                                  <span>Đáp số / Kết luận: </span>
                                  <MathText text={stripAnswerPrefix(q.referenceAnswer)} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {essayScoreError && (
                <div className="flex items-center gap-2 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-3.5 py-2.5 text-[13px] font-semibold text-[#B91C1C]">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#B91C1C]" />
                  {essayScoreError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[12px] text-[#64748B] dark:text-slate-300">
                <GraduationCap className="h-4 w-4 text-[#136F63]" />
                <span>
                  Khi nộp bài, điểm tự động ghi thẳng vào cột{' '}
                  <strong className="text-[#136F63] dark:text-teal-300">
                    {targetColLabel} (HK{targetSemester})
                  </strong>{' '}
                  trong Sổ điểm SMAS 4.0 &amp; tính lại TBM.
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!submittedAttempt ? (
                  <button
                    type="button"
                    onClick={handleGradeAndSubmit}
                    className="inline-flex min-h-[48px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#0F594F]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Nộp bài &amp; Chấm điểm
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPackageSeed((s) => s + 1)}
                      className="inline-flex min-h-[48px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Play className="h-3.5 w-3.5 text-[#136F63]" />
                      Chọn gói làm lượt mới
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex min-h-[48px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-medium text-white shadow-sm hover:bg-[#0F594F]"
                    >
                      Hoàn tất &amp; Quay lại
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Auto-popping Floating Math Keypad for Part III Short-Answer Questions */}
      {(() => {
        if (!activeKeypadQId || submittedAttempt || stage !== 'solving') return null;
        const p3Idx = activeExam.part3.findIndex((q) => q.id === activeKeypadQId);
        if (p3Idx < 0) return null;
        const curQ = activeExam.part3[p3Idx];
        const nextQ = activeExam.part3[p3Idx + 1];
        return (
          <FloatingMathKeypad
            open={true}
            label={`Câu ${curQ.number} (Phần III)`}
            value={ansP3[curQ.id] || ''}
            hasNext={Boolean(nextQ)}
            onChange={(nextVal) =>
              setAnsP3((prev) => ({ ...prev, [curQ.id]: sanitizeShortAnswerValue(nextVal) }))
            }
            onNext={() => {
              if (nextQ) {
                setActiveKeypadQId(nextQ.id);
                setFocusedQIndex(activeExam.part1.length + activeExam.part2.length + p3Idx + 1);
                p3InputRefs.current[nextQ.id]?.focus();
                questionCardRefs.current[nextQ.id]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                });
              } else {
                setActiveKeypadQId(null);
              }
            }}
            onClose={() => setActiveKeypadQId(null)}
          />
        );
      })()}
    </SmartboardViewport>
  );
};
