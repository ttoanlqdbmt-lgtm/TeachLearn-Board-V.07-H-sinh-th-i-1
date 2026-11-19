import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardList,
  Database,
  Dices,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  GraduationCap,
  Layers,
  Pencil,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  BankQuestion,
  ClassroomStoreData,
  ExamSubmission,
  LoginAuditLogRecord,
  ModuleId,
  OnlineExamRoom,
  ScheduleSession,
  SubjectGradeEntry,
  UserAccountRecord,
  WeeklyScheduleSlot,
} from '../types/eduplan';

interface HomeDashboardModuleProps {
  activeAccount: UserAccountRecord;
  teacherHonorific: string;
  departmentGroup: string;
  subjectName: string;
  schoolName: string;
  schoolYearLabel: string;
  classroomStore: ClassroomStoreData;
  bankItems: BankQuestion[];
  examRooms: OnlineExamRoom[];
  submissions: ExamSubmission[];
  gradebookMap: Record<string, SubjectGradeEntry>;
  userAccounts: UserAccountRecord[];
  loginLogs: LoginAuditLogRecord[];
  onNavigateModule: (moduleId: ModuleId) => void;
  onNavigateToClass: (classId: string) => void;
  onOpenStudentPicker: () => void;
}

const SCHEDULE_STORAGE_KEY = 'teachlearn_weekly_schedule_v1';
const WEEK_DAYS = [
  { key: 't2', label: 'Thứ 2' },
  { key: 't3', label: 'Thứ 3' },
  { key: 't4', label: 'Thứ 4' },
  { key: 't5', label: 'Thứ 5' },
  { key: 't6', label: 'Thứ 6' },
  { key: 't7', label: 'Thứ 7' },
] as const;

const PERIOD_NUMBERS = [1, 2, 3, 4, 5] as const;

type WeeklyScheduleGrid = Record<string, WeeklyScheduleSlot>;

function buildDefaultWeeklySchedule(
  classes: ClassroomStoreData['classes'],
  subjectName: string
): WeeklyScheduleGrid {
  const grid: WeeklyScheduleGrid = {};
  if (classes.length === 0) return grid;

  const shortSubject = subjectName.replace(/^Môn\s+/i, '').split(' ')[0] || 'Toán';

  // Smart default timetable distributed cleanly across morning & afternoon
  const morningPlacements: Array<[string, number, string]> = [
    ['t2_1', 0, 'Đại số'],
    ['t2_2', 0, 'Luyện tập'],
    ['t2_4', 1 % classes.length, 'Hình học'],
    ['t3_1', 2 % classes.length, 'Giải tích'],
    ['t3_3', 1 % classes.length, 'Bài tập'],
    ['t4_2', 0, 'Chuyên đề'],
    ['t4_4', 3 % classes.length, 'Đại số'],
    ['t5_1', 2 % classes.length, 'Hình học'],
    ['t5_3', 3 % classes.length, 'Trả bài TX'],
    ['t6_1', 1 % classes.length, 'Giải tích'],
    ['t6_2', 0, 'Kiểm tra'],
    ['t7_2', 2 % classes.length, 'Ôn tập'],
  ];

  const afternoonPlacements: Array<[string, number, string]> = [
    ['t2_1', 1 % classes.length, 'Phụ đạo'],
    ['t3_2', 0, 'Bồi dưỡng'],
    ['t4_1', 2 % classes.length, 'Ôn tập CĐ'],
    ['t5_2', 3 % classes.length, 'Thực hành'],
    ['t6_1', 0, 'Ôn thi'],
  ];

  morningPlacements.forEach(([slot, clsIdx, topicNote]) => {
    const cls = classes[clsIdx];
    if (cls) {
      grid[`morning__${slot}`] = {
        classId: cls.id,
        subjectLabel: shortSubject,
        topicNote,
      };
    }
  });

  afternoonPlacements.forEach(([slot, clsIdx, topicNote]) => {
    const cls = classes[clsIdx];
    if (cls) {
      grid[`afternoon__${slot}`] = {
        classId: cls.id,
        subjectLabel: shortSubject,
        topicNote,
      };
    }
  });

  return grid;
}

export const HomeDashboardModule: React.FC<HomeDashboardModuleProps> = ({
  activeAccount,
  teacherHonorific,
  departmentGroup,
  subjectName,
  schoolName,
  schoolYearLabel,
  classroomStore,
  bankItems,
  examRooms,
  submissions,
  gradebookMap,
  userAccounts,
  loginLogs,
  onNavigateModule,
  onNavigateToClass,
  onOpenStudentPicker,
}) => {
  const [sessionTab, setSessionTab] = useState<ScheduleSession>('morning');
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [draftClassId, setDraftClassId] = useState<string>('');
  const [draftTopicNote, setDraftTopicNote] = useState<string>('');

  const [scheduleGrid, setScheduleGrid] = useState<WeeklyScheduleGrid>(() => {
    try {
      const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WeeklyScheduleGrid;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return buildDefaultWeeklySchedule(classroomStore.classes, subjectName);
  });

  // Ensure schedule populates if classes loaded asynchronously after mount
  useEffect(() => {
    if (classroomStore.classes.length === 0) return;
    setScheduleGrid((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return buildDefaultWeeklySchedule(classroomStore.classes, subjectName);
    });
  }, [classroomStore.classes, subjectName]);

  const persistSchedule = (next: WeeklyScheduleGrid) => {
    setScheduleGrid(next);
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleResetSchedule = () => {
    const fresh = buildDefaultWeeklySchedule(classroomStore.classes, subjectName);
    persistSchedule(fresh);
    setEditingSlotKey(null);
  };

  const activeRoomsCount = useMemo(
    () => examRooms.filter((r) => r.status === 'active').length,
    [examRooms]
  );

  // Compute SMAS gradebook completion rate across all students (Semester 1 / Semester 2 combined)
  const { gradedStudentsCount, totalStudentsCount, smasProgressPct } = useMemo(() => {
    const total = classroomStore.students.length;
    if (total === 0) {
      return { gradedStudentsCount: 0, totalStudentsCount: 0, smasProgressPct: 0 };
    }
    let graded = 0;
    for (const stu of classroomStore.students) {
      const hk1 = gradebookMap[`${stu.classId}__hk1__${stu.id}`];
      const hk2 = gradebookMap[`${stu.classId}__hk2__${stu.id}`];
      const hasAnyScore = (entry?: SubjectGradeEntry) =>
        Boolean(
          entry &&
            (entry.tx1 !== null ||
              entry.tx2 !== null ||
              entry.tx3 !== null ||
              entry.tx4 !== null ||
              entry.tx5 !== null ||
              entry.gk !== null ||
              entry.ck !== null ||
              entry.tbm !== null)
        );
      if (hasAnyScore(hk1) || hasAnyScore(hk2)) {
        graded += 1;
      }
    }
    return {
      gradedStudentsCount: graded,
      totalStudentsCount: total,
      smasProgressPct: Math.round((graded / total) * 100),
    };
  }, [classroomStore.students, gradebookMap]);

  const classById = useMemo(() => {
    const map = new Map<string, ClassroomStoreData['classes'][number]>();
    classroomStore.classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [classroomStore.classes]);

  const shortSubject = subjectName.replace(/^Môn\s+/i, '').split(' ')[0] || 'Toán';

  const initials = useMemo(() => {
    const name = (activeAccount.displayName || teacherHonorific || 'GV').trim();
    const parts = name.split(/\s+/);
    return (parts[parts.length - 1]?.[0] || 'G').toUpperCase();
  }, [activeAccount.displayName, teacherHonorific]);

  const openSlotEditor = (slotKey: string) => {
    const existing = scheduleGrid[slotKey];
    setEditingSlotKey(slotKey);
    setDraftClassId(existing?.classId || classroomStore.classes[0]?.id || '');
    setDraftTopicNote(existing?.topicNote || '');
  };

  const saveSlotEditor = () => {
    if (!editingSlotKey) return;
    const next = { ...scheduleGrid };
    if (!draftClassId) {
      delete next[editingSlotKey];
    } else {
      next[editingSlotKey] = {
        classId: draftClassId,
        subjectLabel: shortSubject,
        topicNote: draftTopicNote.trim() || undefined,
      };
    }
    persistSchedule(next);
    setEditingSlotKey(null);
  };

  const clearSlotEditor = () => {
    if (!editingSlotKey) return;
    const next = { ...scheduleGrid };
    delete next[editingSlotKey];
    persistSchedule(next);
    setEditingSlotKey(null);
  };

  const quickShortcuts: Array<{
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    onClick: () => void;
    tone: 'teal' | 'sky';
  }> = [
    {
      title: 'Bảng trắng tương tác (Smartboard)',
      subtitle: 'Bảng vẽ đa trang 65–86", Bút hình học, Đèn rọi, Rèm che, Bút AI & Câu hỏi QR',
      icon: Layers,
      onClick: () => onNavigateModule('teaching_smartboard'),
      tone: 'teal',
    },
    {
      title: 'Bài tập về nhà',
      subtitle: 'Giao bài online, phụ đạo < 5.0, nhắc nộp Zalo & chuyển SMAS',
      icon: ClipboardList,
      onClick: () => onNavigateModule('homework_assignments'),
      tone: 'sky',
    },
    {
      title: 'Sổ điểm SMAS 4.0',
      subtitle: 'Nhập ĐĐG TX, GK, CK & Tự động tính TBM',
      icon: FileSpreadsheet,
      onClick: () => onNavigateModule('subject_gradebook'),
      tone: 'teal',
    },
    {
      title: 'Ngân hàng đề gốc',
      subtitle: `${bankItems.length} câu hỏi chuẩn SGK Kết nối tri thức`,
      icon: Database,
      onClick: () => onNavigateModule('bank_repository'),
      tone: 'teal',
    },
    {
      title: 'Tạo phòng thi Online',
      subtitle: 'Phát đề PDF, mã PIN bảo mật & chống thoát tab',
      icon: Globe,
      onClick: () => onNavigateModule('online_pdf_exam'),
      tone: 'sky',
    },
    {
      title: 'Gọi học sinh trả bài',
      subtitle: 'Quy trình 3 bước Ma trận – Bốc gói – Lưu SMAS',
      icon: Dices,
      onClick: onOpenStudentPicker,
      tone: 'teal',
    },
    {
      title: 'Nhận xét & Xuất Excel SMAS',
      subtitle: 'Tự động sinh nhận xét TT22 & xuất nhiều sheet',
      icon: BookOpenCheck,
      onClick: () => onNavigateModule('gradebook_sync_smas'),
      tone: 'sky',
    },
    {
      title: 'Sinh đề đổi số AI',
      subtitle: 'Tạo đề đẳng cấu Zero-Clone từ Gemini AI',
      icon: Sparkles,
      onClick: () => onNavigateModule('similar_exam'),
      tone: 'teal',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ROW 1: Welcome Banner + Quick Teaching KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Welcome Card */}
        <section className="flex flex-col justify-between rounded-[6px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div>
            <div className="flex items-start gap-3.5">
              {activeAccount.photoURL ? (
                <img
                  src={activeAccount.photoURL}
                  alt={activeAccount.displayName}
                  className="h-12 w-12 shrink-0 rounded-[6px] border border-[#E2E8F0] object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] bg-[#136F63] text-lg font-bold text-white">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Chào mừng đến với hệ thống TeachLearn Edu
                </h2>
                <p className="mt-0.5 truncate text-[13.5px] font-medium text-[#136F63] dark:text-emerald-400">
                  {activeAccount.displayName || teacherHonorific}
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                  Tổ {departmentGroup} · Môn {subjectName} · {schoolName}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#E2E8F0] pt-3.5 text-[12.5px] dark:border-slate-800">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Năm học</div>
                <div className="mt-0.5 font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                  {schoolYearLabel}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Tài khoản hệ thống</div>
                <div className="mt-0.5 font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                  {userAccounts.length} người dùng
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Phiên truy cập</div>
                <div className="mt-0.5 font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                  {loginLogs.length} lượt ghi nhận
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] pt-3.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onNavigateModule('homework_assignments')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#136F63] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0F594F]"
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>Bài tập về nhà</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('subject_gradebook')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:border-[#136F63]/40 hover:bg-[#E0F2FE] hover:text-[#0369A1] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span>Sổ điểm SMAS</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('teaching_classroom')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:border-[#136F63]/40 hover:bg-[#E0F2FE] hover:text-[#0369A1] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Users className="h-4 w-4 shrink-0" />
              <span>Lớp học &amp; Gọi trả bài</span>
            </button>
          </div>
        </section>

        {/* Right: Quick Teaching Statistics */}
        <section className="flex flex-col justify-between rounded-[6px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              Thống kê nhanh giảng dạy
            </h2>
            <span className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
              Dữ liệu thời gian thực năm học {schoolYearLabel}
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* KPI 1 */}
            <button
              type="button"
              onClick={() => onNavigateModule('teaching_classroom')}
              className="group rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-left transition-colors hover:border-[#136F63] hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[12.5px] font-medium">Lớp phụ trách</span>
                <GraduationCap className="h-4 w-4 text-[#136F63] dark:text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                {classroomStore.classes.length}
              </div>
              <div className="mt-1 text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
                {totalStudentsCount} học sinh đang theo dõi
              </div>
            </button>

            {/* KPI 2 */}
            <button
              type="button"
              onClick={() => onNavigateModule('bank_repository')}
              className="group rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-left transition-colors hover:border-[#136F63] hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[12.5px] font-medium">Kho câu hỏi đề</span>
                <Layers className="h-4 w-4 text-[#0369A1] dark:text-[#BAE6FD]" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                {bankItems.length}
              </div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Câu chuẩn GDPT 2018
              </div>
            </button>

            {/* KPI 3 */}
            <button
              type="button"
              onClick={() => onNavigateModule('online_pdf_exam')}
              className="group rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-left transition-colors hover:border-[#136F63] hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[12.5px] font-medium">Bài thi đang mở</span>
                <ClipboardList className="h-4 w-4 text-[#136F63] dark:text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                {activeRoomsCount}
              </div>
              <div className="mt-1 text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
                {submissions.length} bài thi đã nộp
              </div>
            </button>

            {/* KPI 4 */}
            <button
              type="button"
              onClick={() => onNavigateModule('subject_gradebook')}
              className="group rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-left transition-colors hover:border-[#136F63] hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[12.5px] font-medium">Tiến độ điểm SMAS</span>
                <FileSpreadsheet className="h-4 w-4 text-[#0369A1] dark:text-[#BAE6FD]" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                  {smasProgressPct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-[#136F63] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, smasProgressPct))}%` }}
                />
              </div>
              <div className="mt-1 text-[11.5px] text-slate-500 tabular-nums dark:text-slate-400">
                {gradedStudentsCount}/{totalStudentsCount} học sinh đã nhập điểm
              </div>
            </button>
          </div>
        </section>
      </div>

      {/* ROW 2: Weekly Teaching Schedule (2/3) + Quick Shortcuts (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 2/3: Weekly Teaching Schedule */}
        <section className="rounded-[6px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#136F63] dark:text-emerald-400" />
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Lịch báo giảng tuần
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  {editingSchedule
                    ? 'Chế độ chỉnh sửa: Bấm vào từng ô tiết học để gán lớp hoặc xóa lịch'
                    : 'Bấm trực tiếp vào ô lớp học để mở danh sách lớp và gọi học sinh trả bài'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Morning / Afternoon Tabs */}
              <div className="inline-flex rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSessionTab('morning');
                    setEditingSlotKey(null);
                  }}
                  className={`whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    sessionTab === 'morning'
                      ? 'bg-[#136F63] text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  Buổi Sáng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSessionTab('afternoon');
                    setEditingSlotKey(null);
                  }}
                  className={`whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    sessionTab === 'afternoon'
                      ? 'bg-[#136F63] text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  Buổi Chiều
                </button>
              </div>

              {editingSchedule && (
                <button
                  type="button"
                  onClick={handleResetSchedule}
                  title="Khôi phục lịch giảng dạy mặc định"
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Mẫu chuẩn</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setEditingSchedule((v) => !v);
                  setEditingSlotKey(null);
                }}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  editingSchedule
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {editingSchedule ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Xong</span>
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Sửa lịch</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Inline Slot Editor Bar when editing a cell */}
          {editingSchedule && editingSlotKey && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[6px] border border-[#136F63]/30 bg-[#E0F2FE]/50 p-3 dark:border-emerald-700/50 dark:bg-slate-800">
              <span className="text-[12.5px] font-semibold text-[#136F63] dark:text-emerald-400">
                Gán tiết dạy:
              </span>
              <select
                value={draftClassId}
                onChange={(e) => setDraftClassId(e.target.value)}
                className="rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="">-- Trống tiết --</option>
                {classroomStore.classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {shortSubject} {cls.name} (Khối {cls.grade})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={draftTopicNote}
                onChange={(e) => setDraftTopicNote(e.target.value)}
                placeholder="Ghi chú ngắn (VD: Đại số, Hình học)..."
                maxLength={24}
                className="min-w-[180px] flex-1 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={saveSlotEditor}
                className="rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#0F594F]"
              >
                Lưu tiết
              </button>
              <button
                type="button"
                onClick={clearSlotEditor}
                className="rounded-[6px] border border-red-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900"
              >
                Xóa tiết
              </button>
              <button
                type="button"
                onClick={() => setEditingSlotKey(null)}
                className="rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-slate-500 hover:text-slate-800 dark:text-slate-400"
              >
                Hủy
              </button>
            </div>
          )}

          {/* Timetable Matrix */}
          <div className="mt-3.5 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-[#136F63] text-white">
                  <th className="w-20 border border-[#0F594F] px-2.5 py-2.5 text-center font-semibold">
                    Tiết
                  </th>
                  {WEEK_DAYS.map((day) => (
                    <th
                      key={day.key}
                      className="border border-[#0F594F] px-2.5 py-2.5 text-center font-semibold"
                    >
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIOD_NUMBERS.map((period) => (
                  <tr
                    key={period}
                    className="odd:bg-white even:bg-[#F8FAFC] dark:odd:bg-slate-900 dark:even:bg-slate-800/40"
                  >
                    <td className="border border-[#E2E8F0] px-2.5 py-2.5 text-center font-medium text-slate-700 tabular-nums dark:border-slate-700 dark:text-slate-200">
                      Tiết {period}
                    </td>
                    {WEEK_DAYS.map((day) => {
                      const slotKey = `${sessionTab}__${day.key}_${period}`;
                      const slot = scheduleGrid[slotKey];
                      const cls = slot ? classById.get(slot.classId) : undefined;
                      const isBeingEdited = editingSlotKey === slotKey;

                      return (
                        <td
                          key={day.key}
                          className={`border border-[#E2E8F0] p-1.5 text-center align-middle dark:border-slate-700 ${
                            isBeingEdited ? 'ring-2 ring-[#136F63] ring-inset' : ''
                          }`}
                        >
                          {cls ? (
                            <button
                              type="button"
                              onClick={() =>
                                editingSchedule
                                  ? openSlotEditor(slotKey)
                                  : onNavigateToClass(cls.id)
                              }
                              title={
                                editingSchedule
                                  ? `Bấm để sửa tiết ${period} (${day.label})`
                                  : `Mở lớp ${cls.name} · Gọi trả bài & theo dõi lớp`
                              }
                              className="flex w-full flex-col items-center justify-center rounded-[6px] bg-[#E0F2FE] px-2 py-1.5 text-[#0369A1] transition-colors hover:bg-[#BAE6FD] dark:bg-slate-800 dark:text-[#BAE6FD] dark:hover:bg-slate-700"
                            >
                              <span className="whitespace-nowrap text-[13px] font-semibold">
                                {slot?.subjectLabel || shortSubject} {cls.name}
                              </span>
                              {slot?.topicNote && (
                                <span className="mt-0.5 truncate text-[11px] font-normal text-[#0369A1]/80 dark:text-slate-300">
                                  {slot.topicNote}
                                </span>
                              )}
                            </button>
                          ) : editingSchedule ? (
                            <button
                              type="button"
                              onClick={() => openSlotEditor(slotKey)}
                              className="w-full rounded-[5px] border border-dashed border-slate-300 py-2 text-[12px] text-slate-400 transition-colors hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700"
                            >
                              + Gán lớp
                            </button>
                          ) : (
                            <span className="text-[12.5px] text-slate-300 dark:text-slate-600">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right 1/3: Quick Shortcuts & Ecosystem Links */}
        <section className="flex flex-col justify-between rounded-[6px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5 dark:border-slate-800">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Lối tắt nhanh &amp; Liên kết hệ sinh thái
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Truy cập trực tiếp nghiệp vụ thường dùng
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400" />
            </div>

            <div className="mt-3.5 space-y-2">
              {quickShortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.onClick}
                    className="group flex w-full items-center justify-between gap-3 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-left transition-colors hover:border-[#136F63] hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] ${
                          item.tone === 'teal'
                            ? 'bg-[#136F63] text-white'
                            : 'bg-[#E0F2FE] text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]'
                        }`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-slate-900 group-hover:text-[#136F63] dark:text-white dark:group-hover:text-emerald-400">
                          {item.title}
                        </div>
                        <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#136F63]" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[12.5px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            <div className="font-semibold text-[#136F63] dark:text-emerald-400">
              Chuẩn dữ liệu SMAS 4.0 &amp; Bộ GD&amp;ĐT
            </div>
            <p className="mt-0.5 leading-relaxed">
              Mọi điểm kiểm tra trực tiếp và bài thi online tự động đồng bộ về Sổ điểm cá nhân theo Thông tư 22.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
