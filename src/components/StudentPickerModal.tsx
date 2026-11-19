import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Dices,
  ListChecks,
  Play,
  PlusCircle,
  Search,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Classroom,
  ClassroomStudent,
  GradeColumnTarget,
  OralCheckMatrixConfig,
  StudentAttemptRecord,
  SubjectGradeEntry,
} from '../types/eduplan';
import {
  computeStudentStats,
  getStudentAvatarGradient,
  getStudentInitials,
} from '../utils/classroomDb';
import {
  createEmptyGradeEntry,
  formatScoreValue,
  loadGradebookConfig,
  makeGradeEntryId,
  suggestNextTxColumn,
} from '../utils/gradebookDb';
import { formatMatrixRequirementSummary } from '../utils/oralMatrixDb';
import { SmartboardViewport } from './SmartboardViewport';

export type PickerMode = 'random' | 'ungraded' | 'manual';

export interface GradeTargetSelection {
  semester: 1 | 2;
  targetColumn: GradeColumnTarget;
}

const SMAS_COLUMN_OPTIONS: { key: GradeColumnTarget; label: string }[] = [
  { key: 'tx1', label: 'ĐĐG TX 1' },
  { key: 'tx2', label: 'ĐĐG TX 2' },
  { key: 'tx3', label: 'ĐĐG TX 3' },
  { key: 'tx4', label: 'ĐĐG TX 4' },
  { key: 'tx5', label: 'ĐĐG TX 5' },
  { key: 'gk', label: 'ĐĐG GK' },
  { key: 'ck', label: 'ĐĐG CK' },
];

interface StudentPickerModalProps {
  open: boolean;
  classes: Classroom[];
  students: ClassroomStudent[];
  gradebookMap?: Record<string, SubjectGradeEntry>;
  matrixConfig?: OralCheckMatrixConfig | null;
  onOpenMatrixConfig?: () => void;
  initialClassId?: string;
  onClose: () => void;
  onStartQuizForStudent: (
    student: ClassroomStudent,
    classroom: Classroom,
    gradeTarget?: GradeTargetSelection
  ) => void;
  onQuickSaveAttempt: (
    studentId: string,
    attempt: StudentAttemptRecord,
    gradeTarget?: GradeTargetSelection
  ) => Promise<void> | void;
}

export const StudentPickerModal: React.FC<StudentPickerModalProps> = ({
  open,
  classes,
  students,
  gradebookMap = {},
  matrixConfig,
  onOpenMatrixConfig,
  initialClassId,
  onClose,
  onStartQuizForStudent,
  onQuickSaveAttempt,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClassId || classes[0]?.id || ''
  );
  const [mode, setMode] = useState<PickerMode>('random');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [rollingStudent, setRollingStudent] = useState<ClassroomStudent | null>(null);
  const [chosenStudentId, setChosenStudentId] = useState<string | null>(null);

  const [oralInput, setOralInput] = useState('9');
  const [oralNote, setOralNote] = useState('');
  const [targetSemester, setTargetSemester] = useState<1 | 2>(1);
  const [targetColumn, setTargetColumn] = useState<GradeColumnTarget>('tx1');
  const [quickSavedBanner, setQuickSavedBanner] = useState<string | null>(null);
  const spinTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (initialClassId && classes.some((c) => c.id === initialClassId)) {
        setSelectedClassId(initialClassId);
      } else if (!classes.some((c) => c.id === selectedClassId) && classes[0]) {
        setSelectedClassId(classes[0].id);
      }
      setQuickSavedBanner(null);
    }
    return () => {
      if (spinTimerRef.current) {
        window.clearTimeout(spinTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClassId, classes]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || classes[0] || null,
    [classes, selectedClassId]
  );

  const classStudents = useMemo(
    () => students.filter((s) => s.classId === activeClass?.id),
    [students, activeClass?.id]
  );

  const ungradedPool = useMemo(() => {
    const zeroGraded = classStudents.filter(
      (s) => computeStudentStats(s).gradedAttempts.length === 0
    );
    if (zeroGraded.length > 0) return zeroGraded;
    if (classStudents.length === 0) return [];
    const minCount = Math.min(
      ...classStudents.map((s) => computeStudentStats(s).gradedAttempts.length)
    );
    return classStudents.filter(
      (s) => computeStudentStats(s).gradedAttempts.length === minCount
    );
  }, [classStudents]);

  const ungradedExactCount = useMemo(
    () =>
      classStudents.filter((s) => computeStudentStats(s).gradedAttempts.length === 0)
        .length,
    [classStudents]
  );

  const chosenStudent = useMemo(
    () => classStudents.find((s) => s.id === chosenStudentId) || null,
    [classStudents, chosenStudentId]
  );

  const chosenStudentGradeEntry = useMemo(() => {
    if (!chosenStudent || !activeClass) return undefined;
    const id = makeGradeEntryId(activeClass.id, targetSemester, chosenStudent.id);
    return gradebookMap[id] || createEmptyGradeEntry(activeClass.id, targetSemester, chosenStudent.id);
  }, [chosenStudent, activeClass, targetSemester, gradebookMap]);

  const suggestedColumn = useMemo(() => {
    const cfg = loadGradebookConfig();
    return suggestNextTxColumn(chosenStudentGradeEntry, cfg.txColumnCount);
  }, [chosenStudentGradeEntry]);

  useEffect(() => {
    if (matrixConfig?.isLocked) {
      setTargetSemester(matrixConfig.semester);
    }
  }, [open, matrixConfig?.semester, matrixConfig?.isLocked]);

  useEffect(() => {
    if (chosenStudent) {
      if (matrixConfig?.isLocked && matrixConfig.targetColumnMode !== 'auto') {
        setTargetColumn(matrixConfig.targetColumnMode);
      } else {
        setTargetColumn(suggestedColumn);
      }
    }
  }, [chosenStudent?.id, targetSemester, suggestedColumn, matrixConfig?.isLocked, matrixConfig?.targetColumnMode]);

  const filteredList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q)
    );
  }, [classStudents, searchTerm]);

  if (!open) return null;

  const startSpinAnimation = (pool: ClassroomStudent[]) => {
    if (pool.length === 0 || isSpinning) return;
    if (spinTimerRef.current) {
      window.clearTimeout(spinTimerRef.current);
    }
    setQuickSavedBanner(null);
    setChosenStudentId(null);
    setIsSpinning(true);

    const winner = pool[Math.floor(Math.random() * pool.length)];
    const totalSteps = 20;
    let step = 0;

    const tick = () => {
      step++;
      if (step < totalSteps) {
        const preview = pool[Math.floor(Math.random() * pool.length)];
        setRollingStudent(preview);
        // Smooth deceleration curve
        const delay = 45 + Math.round(Math.pow(step / totalSteps, 2.2) * 210);
        spinTimerRef.current = window.setTimeout(tick, delay);
      } else {
        setRollingStudent(winner);
        setChosenStudentId(winner.id);
        setIsSpinning(false);
      }
    };

    tick();
  };

  const handleQuickOralOrBonus = async (type: 'oral' | 'bonus', customPts?: number) => {
    if (!chosenStudent) return;
    const score =
      type === 'bonus'
        ? customPts ?? 1
        : Math.max(0, Math.min(10, Number(oralInput.replace(',', '.')) || 0));

    const attempt: StudentAttemptRecord = {
      id: `att-call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: chosenStudent.id,
      classId: chosenStudent.classId,
      type,
      title:
        type === 'bonus'
          ? `Điểm cộng phát biểu trên lớp (+${score})`
          : 'Trả bài miệng trên lớp',
      score,
      maxScore: type === 'bonus' ? 2 : 10,
      note:
        oralNote.trim() ||
        (type === 'bonus' ? 'Gọi tên phát biểu xây dựng bài' : 'Gọi tên kiểm tra bài cũ'),
      createdAt: new Date().toISOString(),
    };

    const gradeTarget: GradeTargetSelection | undefined =
      type === 'oral' ? { semester: targetSemester, targetColumn } : undefined;
    await onQuickSaveAttempt(chosenStudent.id, attempt, gradeTarget);
    setOralNote('');
    const colLabel = SMAS_COLUMN_OPTIONS.find((o) => o.key === targetColumn)?.label || targetColumn.toUpperCase();
    setQuickSavedBanner(
      type === 'bonus'
        ? `Đã cộng +${score}đ cho ${chosenStudent.fullName}.`
        : `Đã lưu điểm miệng ${score.toFixed(1).replace('.', ',')}đ cho ${chosenStudent.fullName} vào cột ${colLabel} (HK${targetSemester}) trên Sổ điểm SMAS.`
    );
  };

  const spotlightStudent = isSpinning ? rollingStudent : chosenStudent;
  const spotlightStats = spotlightStudent ? computeStudentStats(spotlightStudent) : null;

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-3xl"
      title={
        <div className="flex items-center gap-2">
          <Dices className="h-5 w-5 text-[#136F63]" />
          <span>Gọi học sinh trả bài &amp; Làm bài trực tiếp</span>
        </div>
      }
      subtitle="Chọn lớp học, quay số hoặc chọn trực tiếp để mời học sinh làm bài ngay trên lớp"
      bodyClassName="space-y-4 p-4 sm:p-5"
    >
      <div className="space-y-4">
          {/* Active Step 1 Matrix Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#136F63]/25 bg-[#136F63]/5 px-3.5 py-2.5 text-[12px] dark:border-teal-800 dark:bg-teal-950/40">
            <div className="min-w-0 flex-1 text-[#334155] dark:text-teal-100">
              <span className="font-semibold text-[#136F63] dark:text-teal-300">
                Bước 1 · Ma trận đã khóa:{' '}
              </span>
              <span className="font-medium">
                {matrixConfig?.isLocked
                  ? formatMatrixRequirementSummary(matrixConfig)
                  : 'Chưa thiết lập ma trận cho lớp này'}
              </span>
            </div>
            {onOpenMatrixConfig && (
              <button
                type="button"
                onClick={onOpenMatrixConfig}
                className="shrink-0 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#136F63] hover:bg-[#F8FAFC] dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300"
              >
                Điều chỉnh Ma trận
              </button>
            )}
          </div>

          {/* 1. Chọn lớp & 3 chế độ */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label
                htmlFor="picker-class-select"
                className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#1E293B] dark:text-slate-200"
              >
                1. CHỌN LỚP HỌC
              </label>
              <select
                id="picker-class-select"
                value={activeClass?.id || ''}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setChosenStudentId(null);
                  setRollingStudent(null);
                  setQuickSavedBanner(null);
                }}
                className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {classes.map((c) => {
                  const count = students.filter((s) => s.classId === c.id).length;
                  return (
                    <option key={c.id} value={c.id}>
                      Lớp {c.name} ({count} HS)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="md:col-span-8">
              <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-[#1E293B] dark:text-slate-200">
                2. CHẾ ĐỘ GỌI TÊN
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setMode('random')}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-all duration-150 ${
                    mode === 'random' ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <Dices className="h-3.5 w-3.5 shrink-0" />
                  Quay số ngẫu nhiên
                </button>
                <button
                  type="button"
                  onClick={() => setMode('ungraded')}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-all duration-150 ${
                    mode === 'ungraded' ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Ưu tiên chưa có điểm ({ungradedExactCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-all duration-150 ${
                    mode === 'manual' ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  Chọn theo danh sách
                </button>
              </div>
            </div>
          </div>

          {/* 2. Spin / Picker Controls */}
          {mode !== 'manual' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="text-[13.5px] text-[#334155] dark:text-slate-200">
                {mode === 'random' ? (
                  <>
                    Quay ngẫu nhiên trong toàn bộ <strong>{classStudents.length} học sinh</strong> lớp{' '}
                    <strong>{activeClass?.name}</strong>.
                  </>
                ) : (
                  <>
                    {ungradedExactCount > 0 ? (
                      <>
                        Còn <strong className="text-[#136F63]">{ungradedExactCount} học sinh</strong> chưa có cột điểm nào trong lớp{' '}
                        <strong>{activeClass?.name}</strong>.
                      </>
                    ) : (
                      <>
                        Tất cả học sinh lớp <strong>{activeClass?.name}</strong> đã có điểm — hệ thống ưu tiên nhóm ít lượt nhất ({ungradedPool.length} HS).
                      </>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={isSpinning || classStudents.length === 0}
                onClick={() =>
                  startSpinAnimation(mode === 'ungraded' ? ungradedPool : classStudents)
                }
                className="btn-glossy-3d-active inline-flex min-h-[48px] items-center gap-2 whitespace-nowrap rounded-[8px] px-5 py-2.5 text-[14px] font-medium disabled:opacity-60"
              >
                <Dices className={`h-4 w-4 ${isSpinning ? 'animate-spin' : ''}`} />
                {isSpinning
                  ? 'Đang quay số chọn học sinh...'
                  : mode === 'ungraded'
                  ? 'Quay ưu tiên em chưa có điểm'
                  : 'Quay số chọn học sinh'}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm nhanh theo tên hoặc mã học sinh..."
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white pr-3 pl-9 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredList.map((st) => {
                  const stStats = computeStudentStats(st);
                  const isSelected = chosenStudentId === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setChosenStudentId(st.id);
                        setQuickSavedBanner(null);
                      }}
                      className={`flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-left text-[13px] transition-colors ${
                        isSelected
                          ? 'border-[#136F63] bg-[#136F63]/10 font-semibold text-[#0F172A] dark:border-teal-500 dark:bg-teal-900/40 dark:text-white'
                          : 'border-[#E2E8F0] bg-white hover:border-[#136F63]/50 dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br text-[11px] font-semibold text-white ${getStudentAvatarGradient(
                            st.id
                          )}`}
                        >
                          {getStudentInitials(st.fullName)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#0F172A] dark:text-white">{st.fullName}</div>
                          <div className="text-[12px] text-[#64748B] tabular-nums dark:text-slate-400">
                            {st.studentCode} · {stStats.totalActivities} lượt
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold text-[#136F63] tabular-nums">
                        {stStats.finalAvgScore !== null
                          ? `${stStats.finalAvgScore.toFixed(1).replace('.', ',')}đ`
                          : 'Chưa có'}
                      </span>
                    </button>
                  );
                })}
                {filteredList.length === 0 && (
                  <div className="col-span-full py-4 text-center text-[12px] text-[#64748B]">
                    Không tìm thấy học sinh phù hợp trong lớp {activeClass?.name}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Spotlight Card for Selected / Spinning Student */}
          {spotlightStudent && spotlightStats ? (
            <div
              className={`rounded-[8px] border p-4 transition-all duration-150 ${
                isSpinning
                  ? 'border-[#136F63]/40 bg-[#F8FAFC] dark:border-teal-700 dark:bg-slate-900'
                  : 'border-[#136F63] bg-[#F8FAFC] shadow-sm dark:border-teal-500 dark:bg-slate-900'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br text-xl font-bold text-white shadow-sm ${getStudentAvatarGradient(
                      spotlightStudent.id
                    )}`}
                  >
                    {getStudentInitials(spotlightStudent.fullName)}
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold tracking-wide text-[#136F63] uppercase">
                      {isSpinning ? 'Đang chọn ngẫu nhiên...' : 'Học sinh được mời trả bài'}
                    </div>
                    <div className="mt-0.5 text-[18px] font-semibold text-[#0F172A] dark:text-white">
                      {spotlightStudent.fullName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#334155] tabular-nums dark:text-slate-300">
                      <span className="font-semibold text-[#136F63] dark:text-teal-300">
                        Lớp {activeClass?.name}
                      </span>
                      <span>·</span>
                      <span>Mã HS: {spotlightStudent.studentCode}</span>
                      <span>·</span>
                      <span>Học lực: {spotlightStudent.academicRank}</span>
                      <span>·</span>
                      <span>
                        Điểm TB:{' '}
                        <strong className="text-[#B91C1C]">
                          {spotlightStats.finalAvgScore !== null
                            ? spotlightStats.finalAvgScore.toFixed(2).replace('.', ',')
                            : 'Chưa có'}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>{spotlightStats.totalActivities} lượt trả bài/làm bài</span>
                    </div>
                  </div>
                </div>

                {!isSpinning && activeClass && (
                  <button
                    type="button"
                    onClick={() =>
                      onStartQuizForStudent(spotlightStudent, activeClass, {
                        semester: targetSemester,
                        targetColumn,
                      })
                    }
                    className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-[#136F63] px-5 py-3 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#0F594F]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Mời lên bảng · Chọn Gói Đề
                  </button>
                )}
              </div>

              {/* Target SMAS 4.0 Column Selector + Instant oral / bonus scoring */}
              {!isSpinning && (
                <div className="mt-4 space-y-3 border-t border-[#E2E8F0] pt-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#136F63]/25 bg-white px-3 py-2 dark:border-teal-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="font-semibold text-[#136F63] dark:text-teal-300">
                        Lưu vào cột Sổ điểm SMAS:
                      </span>
                      <select
                        value={targetSemester}
                        onChange={(e) => setTargetSemester(Number(e.target.value) as 1 | 2)}
                        aria-label="Chọn học kỳ lưu điểm"
                        className="h-8 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-teal-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value={1}>Học kỳ 1</option>
                        <option value={2}>Học kỳ 2</option>
                      </select>
                      <select
                        value={targetColumn}
                        onChange={(e) => setTargetColumn(e.target.value as GradeColumnTarget)}
                        aria-label="Chọn cột điểm SMAS"
                        className="h-8 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#136F63] focus:border-[#136F63] focus:outline-none dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300"
                      >
                        {SMAS_COLUMN_OPTIONS.map((opt) => {
                          const existingVal = chosenStudentGradeEntry?.[opt.key];
                          const isSuggested = opt.key === suggestedColumn;
                          const suffix =
                            existingVal !== null && existingVal !== undefined
                              ? ` (Đang có: ${formatScoreValue(existingVal, 2)})`
                              : isSuggested
                                ? ' (Trống · Gợi ý)'
                                : ' (Trống)';
                          return (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                              {suffix}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <span className="text-[12px] font-medium text-[#64748B] dark:text-teal-300">
                      Tự động gợi ý ô trống đầu tiên:{' '}
                      <strong className="text-[#136F63]">
                        {SMAS_COLUMN_OPTIONS.find((o) => o.key === suggestedColumn)?.label}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1E293B] dark:text-slate-200">
                      <Award className="h-3.5 w-3.5 text-[#136F63]" />
                      Chấm điểm miệng / cộng điểm phát biểu trực tiếp:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[0.5, 1, 2].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => handleQuickOralOrBonus('bonus', pts)}
                          className="btn-glossy-3d-inactive inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[12px] font-medium tabular-nums"
                        >
                          <PlusCircle className="h-3 w-3 text-[#136F63]" />+{pts}đ
                        </button>
                      ))}
                      <span className="mx-1 text-[#CBD5E1]">|</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.25}
                        value={oralInput}
                        onChange={(e) => setOralInput(e.target.value)}
                        aria-label="Điểm trả bài miệng"
                        className="h-8 w-16 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-center text-[13px] font-semibold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        value={oralNote}
                        onChange={(e) => setOralNote(e.target.value)}
                        placeholder="Nhận xét..."
                        className="h-8 w-36 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13px] text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickOralOrBonus('oral')}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[#136F63] px-3 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#0F594F]"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Lưu điểm vào {SMAS_COLUMN_OPTIONS.find((o) => o.key === targetColumn)?.label}
                      </button>
                    </div>
                  </div>
                  {quickSavedBanner && (
                    <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#15803D] dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {quickSavedBanner}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <Users className="mb-2 h-8 w-8 text-[#136F63]/70" />
              <div className="text-[14px] font-semibold text-[#1E293B] dark:text-slate-200">
                Chưa chọn học sinh nào
              </div>
              <div className="mt-0.5 text-[12px] text-[#64748B] dark:text-slate-400">
                Nhấn nút <strong>Quay số chọn học sinh</strong> hoặc chọn trực tiếp từ danh sách lớp để bắt đầu.
              </div>
            </div>
          )}
      </div>
    </SmartboardViewport>
  );
};
