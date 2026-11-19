import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  Award,
  BarChart3,
  BookUser,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Dices,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Pencil,
  Phone,
  Play,
  Plus,
  PlusCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AcademicRank,
  Classroom,
  ClassroomStoreData,
  ClassroomStudent,
  MasterDataStore,
  OralCheckMatrixConfig,
  StudentAttemptRecord,
  SubjectGradeEntry,
} from '../types/eduplan';
import { formatMatrixRequirementSummary } from '../utils/oralMatrixDb';
import {
  BulkImportValidationSummary,
  addStudentsBulkToStore,
  computeStudentStats,
  deleteClassInStore,
  deleteStudentInStore,
  deleteStudentsBulkInStore,
  downloadStudentImportTemplate,
  exportClassGradebookExcel,
  getStudentAvatarGradient,
  getStudentInitials,
  moveStudentsToClassInStore,
  normalizeStudentCode,
  parseQuickPasteStudents,
  parseStudentsFromExcelOrCsv,
  removeStudentAttemptInStore,
  suggestNextStudentCode,
  upsertClassInStore,
  upsertStudentInStore,
  validateBulkStudentsAgainstSystem,
} from '../utils/classroomDb';
import { CreateClassroomFromMasterModal } from '../components/CreateClassroomFromMasterModal';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { formatTeacherHonorific, resolveActiveTeachingContext } from '../utils/masterDataDb';
import { SubjectGradebookModule } from './SubjectGradebookModule';

interface ClassroomManagerModuleProps {
  storeData: ClassroomStoreData;
  onUpdateStore: (next: ClassroomStoreData) => void;
  activeClassId: string;
  onChangeActiveClassId: (id: string) => void;
  onOpenStudentPicker: (classId: string) => void;
  onStartQuizForStudent: (student: ClassroomStudent, classroom: Classroom) => void;
  onSaveAttempt: (studentId: string, attempt: StudentAttemptRecord) => Promise<void> | void;
  onStudentsDeleted?: (studentIds: string[]) => Promise<void> | void;
  onStudentsMoved?: (
    studentIds: string[],
    fromClassId: string,
    toClassId: string
  ) => Promise<void> | void;
  masterData?: MasterDataStore;
  gradebookMap: Record<string, SubjectGradeEntry>;
  onUpdateGradebookMap: (next: Record<string, SubjectGradeEntry>) => void;
  ownerUid?: string;
  oralMatrixConfig?: OralCheckMatrixConfig | null;
  onOpenMatrixConfig: (classId: string) => void;
  isOwnerAdmin?: boolean;
}

const RANK_STYLE: Record<AcademicRank, string> = {
  Tốt: 'border-[#BBF7D0] bg-[#DCFCE7] text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  Khá: 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  Đạt: 'border-[#FDE68A] bg-[#FEF3C7] text-[#B45309] dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  'Chưa đạt':
    'border-[#FECACA] bg-[#FEE2E2] text-[#B91C1C] dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
};

type SortKey = 'name' | 'dob_gender' | 'rank' | 'attempts' | 'avg';
type SortDir = 'asc' | 'desc';
type ScoreStatusFilter = 'all' | 'ungraded' | 'below5' | 'above8';

const VI_COLLATOR = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

function normalizeVietnameseSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compareVietnameseNames(aFull: string, bFull: string): number {
  const aParts = aFull.trim().split(/\s+/).filter(Boolean);
  const bParts = bFull.trim().split(/\s+/).filter(Boolean);
  const aFirst = aParts[aParts.length - 1] || '';
  const bFirst = bParts[bParts.length - 1] || '';
  const firstCmp = VI_COLLATOR.compare(aFirst, bFirst);
  if (firstCmp !== 0) return firstCmp;
  const aRest = aParts.slice(0, -1).join(' ');
  const bRest = bParts.slice(0, -1).join(' ');
  return VI_COLLATOR.compare(aRest, bRest);
}

function parseDobSortValue(dob: string): number {
  const m = dob.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return 0;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return year * 10000 + month * 100 + day;
}

const RANK_WEIGHT: Record<AcademicRank, number> = {
  Tốt: 4,
  Khá: 3,
  Đạt: 2,
  'Chưa đạt': 1,
};

export const ClassroomManagerModule: React.FC<ClassroomManagerModuleProps> = ({
  storeData,
  onUpdateStore,
  activeClassId,
  onChangeActiveClassId,
  onOpenStudentPicker,
  onStartQuizForStudent,
  onSaveAttempt,
  onStudentsDeleted,
  onStudentsMoved,
  masterData,
  gradebookMap,
  onUpdateGradebookMap,
  ownerUid,
  oralMatrixConfig,
  onOpenMatrixConfig,
  isOwnerAdmin = false,
}) => {
  const masterCtx = useMemo(() => resolveActiveTeachingContext(masterData), [masterData]);
  const [subTab, setSubTab] = useState<'roster' | 'gradebook' | 'stats'>('roster');
  const [searchQuery, setSearchQuery] = useState('');
  const [rankFilter, setRankFilter] = useState<'all' | AcademicRank>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'Nam' | 'Nữ'>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreStatusFilter>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Create (from Master Data) / Edit Class Modal
  const [showCreateFromMasterModal, setShowCreateFromMasterModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [classModalMode, setClassModalMode] = useState<'create' | 'edit'>('edit');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState<'10' | '11' | '12'>('12');
  const [newClassYear, setNewClassYear] = useState(masterCtx.schoolYearLabel);
  const [newClassTeacher, setNewClassTeacher] = useState(masterCtx.teacherHonorific);
  const [newClassSubjectTeacher, setNewClassSubjectTeacher] = useState(masterCtx.teacherHonorific);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false);

  // Add Student Modal (2 tabs: Single Form & Quick Paste)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addStudentTab, setAddStudentTab] = useState<'single' | 'paste'>('single');
  const [stFullName, setStFullName] = useState('');
  const [stCode, setStCode] = useState('');
  const [stDob, setStDob] = useState('01/01/2009');
  const [stGender, setStGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [stPhone, setStPhone] = useState('');
  const [stParentName, setStParentName] = useState('');
  const [stParentPhone, setStParentPhone] = useState('');
  const [stRank, setStRank] = useState<AcademicRank>('Khá');
  const [stNotes, setStNotes] = useState('');
  const [pasteRawText, setPasteRawText] = useState('');
  const [excludedPasteIds, setExcludedPasteIds] = useState<Record<string, boolean>>({});
  const [pasteCodeOverrides, setPasteCodeOverrides] = useState<Record<string, string>>({});
  const [excelImportReview, setExcelImportReview] = useState<{
    fileName: string;
    students: ClassroomStudent[];
    excludedIds: Record<string, boolean>;
    filterMode: 'all' | 'duplicates' | 'valid';
  } | null>(null);

  // Row Edit & Delete Modals + Inline Quick Edit
  const [editModalStudent, setEditModalStudent] = useState<ClassroomStudent | null>(null);
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<ClassroomStudent | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{
    studentId: string;
    field: 'fullName' | 'dob' | 'phone' | 'parentPhone';
    value: string;
  } | null>(null);

  // Multi-select & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetTransferClassId, setTargetTransferClassId] = useState<string>('');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Student Profile Detail Modal
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editDraft, setEditDraft] = useState<ClassroomStudent | null>(null);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);

  // Quick Score inside Profile Modal
  const [scoreMode, setScoreMode] = useState<'oral' | 'bonus'>('oral');
  const [scoreValue, setScoreValue] = useState('9');
  const [scoreNote, setScoreNote] = useState('');
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const nameClickTimerRef = useRef<number | null>(null);

  const activeClass = useMemo(
    () =>
      storeData.classes.find((c) => c.id === activeClassId) ||
      storeData.classes[0] ||
      null,
    [storeData.classes, activeClassId]
  );

  const classStudents = useMemo(
    () => storeData.students.filter((s) => s.classId === activeClass?.id),
    [storeData.students, activeClass?.id]
  );

  const filteredStudents = useMemo(() => {
    const qNorm = normalizeVietnameseSearch(searchQuery);
    const qTokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];

    const matched = classStudents.filter((s) => {
      const stats = computeStudentStats(s);

      if (rankFilter !== 'all' && s.academicRank !== rankFilter) {
        return false;
      }
      if (genderFilter !== 'all' && s.gender !== genderFilter) {
        return false;
      }
      if (scoreFilter === 'ungraded' && stats.finalAvgScore !== null) {
        return false;
      }
      if (
        scoreFilter === 'below5' &&
        (stats.finalAvgScore === null || stats.finalAvgScore >= 5.0)
      ) {
        return false;
      }
      if (
        scoreFilter === 'above8' &&
        (stats.finalAvgScore === null || stats.finalAvgScore < 8.0)
      ) {
        return false;
      }

      if (!qNorm) return true;

      const haystack = normalizeVietnameseSearch(
        `${s.fullName} ${s.studentCode} ${s.phone} ${s.parentName} ${s.parentPhone} ${s.teacherNotes}`
      );
      return haystack.includes(qNorm) || qTokens.every((t) => haystack.includes(t));
    });

    if (!sortConfig) return matched;

    const sorted = [...matched].sort((a, b) => {
      const aStats = computeStudentStats(a);
      const bStats = computeStudentStats(b);

      if (sortConfig.key === 'name') {
        const cmp = compareVietnameseNames(a.fullName, b.fullName);
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      }

      if (sortConfig.key === 'dob_gender') {
        const aDob = parseDobSortValue(a.dob);
        const bDob = parseDobSortValue(b.dob);
        const cmp = aDob !== bDob ? aDob - bDob : VI_COLLATOR.compare(a.gender, b.gender);
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      }

      if (sortConfig.key === 'rank') {
        const cmp = RANK_WEIGHT[a.academicRank] - RANK_WEIGHT[b.academicRank];
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      }

      if (sortConfig.key === 'attempts') {
        const cmp = aStats.totalActivities - bStats.totalActivities;
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      }

      // sortConfig.key === 'avg': always push ungraded (null) to bottom
      const aAvg = aStats.finalAvgScore;
      const bAvg = bStats.finalAvgScore;
      if (aAvg === null && bAvg === null) return compareVietnameseNames(a.fullName, b.fullName);
      if (aAvg === null) return 1;
      if (bAvg === null) return -1;
      return sortConfig.dir === 'desc' ? bAvg - aAvg : aAvg - bAvg;
    });

    return sorted;
  }, [classStudents, searchQuery, rankFilter, genderFilter, scoreFilter, sortConfig]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    rankFilter !== 'all' ||
    genderFilter !== 'all' ||
    scoreFilter !== 'all' ||
    sortConfig !== null;

  const handleToggleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDir: SortDir = key === 'avg' || key === 'rank' ? 'desc' : 'asc';
      return { key, dir: defaultDir };
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setRankFilter('all');
    setGenderFilter('all');
    setScoreFilter('all');
    setSortConfig(null);
  };

  const renderSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-55" />;
    }
    return sortConfig.dir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-white" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-white" />
    );
  };

  const classStats = useMemo(() => {
    const gradedScores: number[] = [];
    let totalQuizAndOral = 0;
    let totalBonusCount = 0;

    classStudents.forEach((s) => {
      const st = computeStudentStats(s);
      totalQuizAndOral += st.quizCount + st.oralCount;
      totalBonusCount += st.bonusCount;
      if (st.finalAvgScore !== null) {
        gradedScores.push(st.finalAvgScore);
      }
    });

    const avgClass =
      gradedScores.length > 0
        ? gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length
        : 0;
    const passCount = gradedScores.filter((v) => v >= 5).length;
    const passRate =
      gradedScores.length > 0
        ? Math.round((passCount / gradedScores.length) * 100)
        : 0;

    const bins = [
      { label: '0–4,9', count: gradedScores.filter((v) => v < 5).length, color: 'from-rose-600 to-rose-400' },
      { label: '5,0–6,4', count: gradedScores.filter((v) => v >= 5 && v < 6.5).length, color: 'from-amber-600 to-amber-400' },
      { label: '6,5–7,9', count: gradedScores.filter((v) => v >= 6.5 && v < 8).length, color: 'from-sky-600 to-cyan-400' },
      { label: '8,0–8,9', count: gradedScores.filter((v) => v >= 8 && v < 9).length, color: 'from-[#0369A1] to-[#38BDF8]' },
      { label: '9,0–10', count: gradedScores.filter((v) => v >= 9).length, color: 'from-emerald-600 to-emerald-400' },
    ];
    const maxBin = Math.max(1, ...bins.map((b) => b.count));

    const rankCounts: { rank: AcademicRank; count: number; barColor: string }[] = [
      { rank: 'Tốt', count: classStudents.filter((s) => s.academicRank === 'Tốt').length, barColor: 'bg-emerald-500' },
      { rank: 'Khá', count: classStudents.filter((s) => s.academicRank === 'Khá').length, barColor: 'bg-[#0369A1]' },
      { rank: 'Đạt', count: classStudents.filter((s) => s.academicRank === 'Đạt').length, barColor: 'bg-amber-400' },
      { rank: 'Chưa đạt', count: classStudents.filter((s) => s.academicRank === 'Chưa đạt').length, barColor: 'bg-rose-500' },
    ];

    return {
      totalStudents: classStudents.length,
      gradedStudentsCount: gradedScores.length,
      ungradedCount: classStudents.length - gradedScores.length,
      avgClass,
      passRate,
      totalActivities: totalQuizAndOral + totalBonusCount,
      totalQuizAndOral,
      totalBonusCount,
      bins,
      maxBin,
      rankCounts,
    };
  }, [classStudents]);

  const profileStudent = useMemo(
    () => storeData.students.find((s) => s.id === profileStudentId) || null,
    [storeData.students, profileStudentId]
  );

  const otherClasses = useMemo(
    () => storeData.classes.filter((c) => c.id !== activeClass?.id),
    [storeData.classes, activeClass?.id]
  );

  const visibleSelectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => visibleSelectedSet.has(s.id));
  const someFilteredSelected =
    filteredStudents.some((s) => visibleSelectedSet.has(s.id)) && !allFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  useEffect(() => {
    setSelectedIds([]);
    setInlineEdit(null);
  }, [activeClass?.id]);

  useEffect(() => {
    if (otherClasses.length > 0) {
      setTargetTransferClassId((prev) =>
        otherClasses.some((c) => c.id === prev) ? prev : otherClasses[0].id
      );
    } else {
      setTargetTransferClassId('');
    }
  }, [otherClasses]);

  const singleCodeConflict = useMemo(() => {
    const norm = normalizeStudentCode(stCode);
    if (!norm) return null;
    const matched = storeData.students.find(
      (s) => normalizeStudentCode(s.studentCode) === norm
    );
    if (!matched) return null;
    const clsName =
      storeData.classes.find((c) => c.id === matched.classId)?.name || 'Chưa phân lớp';
    return {
      fullName: matched.fullName,
      className: clsName,
      studentCode: matched.studentCode,
    };
  }, [stCode, storeData.students, storeData.classes]);

  const parsedPasteStudents = useMemo(() => {
    if (!activeClass || !pasteRawText.trim()) return [];
    return parseQuickPasteStudents(
      pasteRawText,
      activeClass.id,
      activeClass.name,
      classStudents,
      activeClass.grade,
      storeData.students
    );
  }, [pasteRawText, activeClass, classStudents, storeData.students]);

  const activePasteStudents = useMemo(
    () =>
      parsedPasteStudents
        .filter((s) => !excludedPasteIds[s.id])
        .map((s) =>
          pasteCodeOverrides[s.id] !== undefined
            ? { ...s, studentCode: pasteCodeOverrides[s.id] }
            : s
        ),
    [parsedPasteStudents, excludedPasteIds, pasteCodeOverrides]
  );

  const pasteValidation: BulkImportValidationSummary = useMemo(
    () => validateBulkStudentsAgainstSystem(activePasteStudents, storeData),
    [activePasteStudents, storeData]
  );

  const activeExcelStudents = useMemo(() => {
    if (!excelImportReview) return [];
    return excelImportReview.students.filter((s) => !excelImportReview.excludedIds[s.id]);
  }, [excelImportReview]);

  const excelValidation: BulkImportValidationSummary | null = useMemo(() => {
    if (!excelImportReview) return null;
    return validateBulkStudentsAgainstSystem(activeExcelStudents, storeData);
  }, [excelImportReview, activeExcelStudents, storeData]);

  const openStudentProfile = (student: ClassroomStudent) => {
    setProfileStudentId(student.id);
    setEditDraft({ ...student });
    setEditingProfile(false);
    setConfirmDeleteStudent(false);
    setExpandedAttemptId(null);
    setScoreNote('');
  };

  const handleOpenCreateClassModal = () => {
    setShowCreateFromMasterModal(true);
  };

  const handleOpenEditClassModal = () => {
    if (!activeClass) return;
    setClassModalMode('edit');
    setEditingClassId(activeClass.id);
    setNewClassName(activeClass.name);
    setNewClassGrade(activeClass.grade);
    setNewClassYear(activeClass.schoolYear);
    setNewClassTeacher(activeClass.homeroomTeacher);
    setNewClassSubjectTeacher(activeClass.subjectTeacher || masterCtx.teacherHonorific);
    setShowClassModal(true);
  };

  const handleSaveClassModal = async () => {
    const cleanName = newClassName.trim().toUpperCase();
    if (!cleanName) return;

    if (classModalMode === 'edit' && editingClassId) {
      const existing = storeData.classes.find((c) => c.id === editingClassId);
      if (!existing) return;
      const updatedCls: Classroom = {
        ...existing,
        name: cleanName,
        grade: newClassGrade,
        schoolYear: newClassYear.trim() || masterCtx.schoolYearLabel,
        homeroomTeacher: newClassTeacher.trim() || masterCtx.teacherHonorific,
        subjectTeacher: newClassSubjectTeacher.trim() || masterCtx.teacherHonorific,
      };
      const next = await upsertClassInStore(storeData, updatedCls);
      onUpdateStore(next);
      setShowClassModal(false);
      setStatusBanner(
        `Đã cập nhật thông tin lớp ${updatedCls.name} (Khối ${updatedCls.grade} · GVCN: ${updatedCls.homeroomTeacher}).`
      );
      return;
    }

    const newCls: Classroom = {
      id: `cls-${Date.now()}`,
      name: cleanName,
      grade: newClassGrade,
      schoolYear: newClassYear.trim() || '2026–2027',
      homeroomTeacher: newClassTeacher.trim() || 'Giáo viên bộ môn',
      createdAt: new Date().toISOString(),
    };
    const next = await upsertClassInStore(storeData, newCls);
    onUpdateStore(next);
    onChangeActiveClassId(newCls.id);
    setShowClassModal(false);
    setNewClassName('');
    setStatusBanner(`Đã tạo lớp ${newCls.name} (Khối ${newCls.grade}) và lưu vào IndexedDB.`);
  };

  const handleDeleteActiveClass = async () => {
    if (!activeClass || storeData.classes.length <= 1) return;
    const deletedName = activeClass.name;
    const removedStudentIds = classStudents.map((s) => s.id);
    const next = await deleteClassInStore(storeData, activeClass.id);
    onUpdateStore(next);
    if (removedStudentIds.length > 0) {
      await onStudentsDeleted?.(removedStudentIds);
    }
    if (next.classes[0]) {
      onChangeActiveClassId(next.classes[0].id);
    }
    setConfirmDeleteClass(false);
    setStatusBanner(`Đã xóa lớp ${deletedName} và toàn bộ danh sách học sinh của lớp đó.`);
  };

  const handleOpenAddStudentModal = (initialTab: 'single' | 'paste' = 'single') => {
    if (!activeClass) return;
    setAddStudentTab(initialTab);
    setStFullName('');
    setStCode(suggestNextStudentCode(activeClass.name, storeData.students));
    setStDob(activeClass.grade === '12' ? '15/05/2009' : activeClass.grade === '11' ? '15/05/2010' : '15/05/2011');
    setStGender('Nam');
    setStPhone('');
    setStParentName('');
    setStParentPhone('');
    setStRank('Khá');
    setStNotes('');
    setPasteRawText('');
    setExcludedPasteIds({});
    setPasteCodeOverrides({});
    setShowAddStudentModal(true);
  };

  const handleAddStudent = async () => {
    if (!activeClass || !stFullName.trim() || singleCodeConflict) return;
    const newStudent: ClassroomStudent = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      classId: activeClass.id,
      studentCode:
        stCode.trim() || suggestNextStudentCode(activeClass.name, storeData.students),
      fullName: stFullName.trim(),
      dob: stDob.trim() || '01/01/2009',
      gender: stGender,
      phone: stPhone.trim(),
      parentName: stParentName.trim() || 'Phụ huynh',
      parentPhone: stParentPhone.trim() || stPhone.trim(),
      academicRank: stRank,
      teacherNotes: stNotes.trim(),
      attempts: [],
      createdAt: new Date().toISOString(),
    };
    const next = await upsertStudentInStore(storeData, newStudent);
    onUpdateStore(next);
    setShowAddStudentModal(false);
    setStatusBanner(`Đã thêm học sinh ${newStudent.fullName} vào lớp ${activeClass.name}.`);
  };

  const handleQuickPasteImport = async () => {
    if (!activeClass || pasteValidation.validItems.length === 0) return;
    const validStudents = pasteValidation.validItems.map((item) => ({
      ...item.student,
      studentCode: item.student.studentCode.trim(),
    }));
    const res = await addStudentsBulkToStore(storeData, validStudents);
    onUpdateStore(res.data);
    const totalSkipped = pasteValidation.duplicateItems.length + res.skipped;
    setShowAddStudentModal(false);
    setPasteRawText('');
    setExcludedPasteIds({});
    setPasteCodeOverrides({});
    setStatusBanner(
      `Đã thêm nhanh ${res.added} học sinh vào lớp ${activeClass.name}${
        totalSkipped > 0 ? ` (đã loại bỏ ${totalSkipped} dòng trùng Mã HS)` : ''
      } và đồng bộ sang Sổ điểm II.2.`
    );
  };

  const handleSaveRowEditModal = async () => {
    if (!editModalStudent || !editModalStudent.fullName.trim()) return;
    const updated: ClassroomStudent = {
      ...editModalStudent,
      fullName: editModalStudent.fullName.trim(),
      studentCode: editModalStudent.studentCode.trim() || editModalStudent.studentCode,
      dob: editModalStudent.dob.trim() || '01/01/2009',
      phone: editModalStudent.phone.trim(),
      parentName: editModalStudent.parentName.trim() || 'Phụ huynh',
      parentPhone: editModalStudent.parentPhone.trim(),
      teacherNotes: editModalStudent.teacherNotes.trim(),
    };
    const next = await upsertStudentInStore(storeData, updated);
    onUpdateStore(next);
    setEditModalStudent(null);
    setStatusBanner(`Đã cập nhật thông tin học sinh ${updated.fullName}.`);
  };

  const handleConfirmDeleteSingleStudent = async () => {
    if (!deleteTargetStudent) return;
    const target = deleteTargetStudent;
    const next = await deleteStudentInStore(storeData, target.id);
    onUpdateStore(next);
    await onStudentsDeleted?.([target.id]);
    setSelectedIds((prev) => prev.filter((id) => id !== target.id));
    if (profileStudentId === target.id) {
      setProfileStudentId(null);
    }
    setDeleteTargetStudent(null);
    setStatusBanner(`Đã xóa học sinh ${target.fullName} và tự động đánh lại STT.`);
  };

  const startInlineEdit = (
    student: ClassroomStudent,
    field: 'fullName' | 'dob' | 'phone' | 'parentPhone'
  ) => {
    if (!isOwnerAdmin) return;
    if (nameClickTimerRef.current) {
      window.clearTimeout(nameClickTimerRef.current);
      nameClickTimerRef.current = null;
    }
    setInlineEdit({
      studentId: student.id,
      field,
      value: student[field] || '',
    });
  };

  const commitInlineEdit = async () => {
    if (!inlineEdit) return;
    const currentEdit = inlineEdit;
    setInlineEdit(null);
    const target = storeData.students.find((s) => s.id === currentEdit.studentId);
    if (!target) return;
    const trimmed = currentEdit.value.trim();
    if (currentEdit.field === 'fullName' && !trimmed) return;
    if ((target[currentEdit.field] || '') === trimmed) return;

    const updated: ClassroomStudent = {
      ...target,
      [currentEdit.field]: trimmed,
    };
    const next = await upsertStudentInStore(storeData, updated);
    onUpdateStore(next);
    setStatusBanner(`Đã cập nhật nhanh thông tin cho ${updated.fullName}.`);
  };

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const visibleIds = new Set(filteredStudents.map((s) => s.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const merged = new Set(selectedIds);
      filteredStudents.forEach((s) => merged.add(s.id));
      setSelectedIds(Array.from(merged));
    }
  };

  const handleToggleSelectRow = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleBulkMoveToClass = async () => {
    if (!activeClass || selectedIds.length === 0 || !targetTransferClassId) return;
    const targetCls = storeData.classes.find((c) => c.id === targetTransferClassId);
    if (!targetCls || targetCls.id === activeClass.id) return;

    const movedIds = [...selectedIds];
    const next = await moveStudentsToClassInStore(storeData, movedIds, targetCls.id);
    onUpdateStore(next);
    await onStudentsMoved?.(movedIds, activeClass.id, targetCls.id);
    setSelectedIds([]);
    setStatusBanner(
      `Đã chuyển ${movedIds.length} học sinh từ lớp ${activeClass.name} sang lớp ${targetCls.name} và đồng bộ sổ điểm.`
    );
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const deletedIds = [...selectedIds];
    const next = await deleteStudentsBulkInStore(storeData, deletedIds);
    onUpdateStore(next);
    await onStudentsDeleted?.(deletedIds);
    setSelectedIds([]);
    setShowBulkDeleteModal(false);
    setStatusBanner(`Đã xóa ${deletedIds.length} học sinh đã chọn và tự động sắp xếp lại STT.`);
  };

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeClass) return;
    try {
      const parsed = await parseStudentsFromExcelOrCsv(
        file,
        activeClass.id,
        activeClass.name,
        classStudents.length,
        storeData.students
      );
      if (parsed.length === 0) {
        setStatusBanner(
          'Không tìm thấy cột "Họ và tên" hợp lệ trong file. Hãy tải file mẫu (.xlsx) để đối chiếu cấu trúc cột.'
        );
        return;
      }

      const validation = validateBulkStudentsAgainstSystem(parsed, storeData);
      if (validation.duplicateItems.length > 0) {
        setExcelImportReview({
          fileName: file.name,
          students: parsed,
          excludedIds: {},
          filterMode: 'all',
        });
        return;
      }

      const res = await addStudentsBulkToStore(storeData, parsed);
      onUpdateStore(res.data);
      setStatusBanner(
        `Đã kiểm tra ${parsed.length} Mã HS (không trùng lặp) và nhập ${res.added} học sinh vào lớp ${activeClass.name}, lưu bền vững vào IndexedDB.`
      );
    } catch {
      setStatusBanner('Không đọc được tệp Excel/CSV. Vui lòng kiểm tra lại định dạng tệp.');
    }
  };

  const handleConfirmExcelReviewImport = async () => {
    if (!activeClass || !excelImportReview || !excelValidation) return;
    const validStudents = excelValidation.validItems.map((item) => ({
      ...item.student,
      studentCode: item.student.studentCode.trim(),
    }));
    if (validStudents.length === 0) return;

    const res = await addStudentsBulkToStore(storeData, validStudents);
    onUpdateStore(res.data);
    const totalSkipped = excelValidation.duplicateItems.length + res.skipped;
    setExcelImportReview(null);
    setStatusBanner(
      `Đã nhập ${res.added} học sinh hợp lệ vào lớp ${activeClass.name}${
        totalSkipped > 0 ? ` (đã tự động bỏ qua ${totalSkipped} dòng trùng Mã HS)` : ''
      } và lưu bền vững vào IndexedDB.`
    );
  };

  const handleSaveProfileEdits = async () => {
    if (!editDraft || !editDraft.fullName.trim()) return;
    const next = await upsertStudentInStore(storeData, editDraft);
    onUpdateStore(next);
    setEditingProfile(false);
    setStatusBanner(`Đã cập nhật sơ yếu lý lịch của ${editDraft.fullName}.`);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editDraft) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const updated = { ...editDraft, avatarUrl: reader.result };
        setEditDraft(updated);
        const next = await upsertStudentInStore(storeData, updated);
        onUpdateStore(next);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteProfileStudent = async () => {
    if (!profileStudent) return;
    const id = profileStudent.id;
    const name = profileStudent.fullName;
    const next = await deleteStudentInStore(storeData, id);
    onUpdateStore(next);
    await onStudentsDeleted?.([id]);
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    setProfileStudentId(null);
    setConfirmDeleteStudent(false);
    setStatusBanner(`Đã xóa học sinh ${name} khỏi danh sách lớp.`);
  };

  const handleAddScoreInProfile = async (bonusOverride?: number) => {
    if (!profileStudent) return;
    const isBonus = scoreMode === 'bonus' || bonusOverride !== undefined;
    const score =
      bonusOverride !== undefined
        ? bonusOverride
        : Math.max(0, Math.min(10, Number(scoreValue.replace(',', '.')) || 0));

    const attempt: StudentAttemptRecord = {
      id: `att-prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: profileStudent.id,
      classId: profileStudent.classId,
      type: isBonus ? 'bonus' : 'oral',
      title: isBonus
        ? `Điểm cộng phát biểu (+${score})`
        : 'Chấm điểm trả bài miệng trên lớp',
      score,
      maxScore: isBonus ? 2 : 10,
      note:
        scoreNote.trim() ||
        (isBonus ? 'Phát biểu xây dựng bài' : 'Trả bài miệng trực tiếp'),
      createdAt: new Date().toISOString(),
    };

    await onSaveAttempt(profileStudent.id, attempt);
    setScoreNote('');
    setStatusBanner(
      isBonus
        ? `Đã cộng +${score}đ cho ${profileStudent.fullName}.`
        : `Đã lưu điểm miệng ${score.toFixed(1).replace('.', ',')}đ cho ${profileStudent.fullName}.`
    );
  };

  const handleRemoveAttempt = async (attemptId: string) => {
    if (!profileStudent) return;
    const next = await removeStudentAttemptInStore(storeData, profileStudent.id, attemptId);
    onUpdateStore(next);
  };

  const profileStats = profileStudent ? computeStudentStats(profileStudent) : null;

  return (
    <div className="space-y-4">
      {/* 1. Header Control & Class Switcher */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#136F63] dark:text-teal-300">
              Kho Offline IndexedDB · {storeData.classes.length} lớp học ·{' '}
              {storeData.students.length} học sinh đã lưu
            </div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-[#0F172A] sm:text-[20px] dark:text-white">
              Quản lý Lớp học, Gọi tên trả bài &amp; Thống kê điểm
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeClass && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenMatrixConfig(activeClass.id)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-3.5 py-2 text-[13px] font-semibold transition ${
                    oralMatrixConfig?.isLocked && oralMatrixConfig.grade === activeClass.grade
                      ? 'border-[#136F63]/40 bg-[#F0FDF9] text-[#136F63] hover:bg-[#CCFBF1]/70 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                      : 'border-[#FDE68A] bg-[#FEF3C7] text-[#B45309] hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  <span>Cấu hình Yêu cầu Trả bài (Ma trận)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStudentPicker(activeClass.id)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
                >
                  <Dices className="h-4 w-4" />
                  Gọi học sinh trả bài
                </button>
              </>
            )}
            {isOwnerAdmin && (
              <button
                type="button"
                onClick={handleOpenCreateClassModal}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Plus className="h-4 w-4 text-[#136F63]" />
                Tạo lớp mới
              </button>
            )}
          </div>
        </div>

        {!isOwnerAdmin && (
          <div className="mt-3 rounded-[8px] border border-amber-300 bg-amber-50/90 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            Chế độ Chỉ Xem &amp; Giảng dạy (Read-Only): Bạn có thể xem danh sách lớp và gọi học sinh lên bảng trả bài trong phiên dạy học; các nút Thêm/Sửa/Xóa lớp học, học sinh và ghi đè Sổ điểm chuẩn SMAS trên Cloud Firestore đã được khóa bảo vệ độc quyền cho Quản trị viên.
          </div>
        )}

        {activeClass && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-slate-300">
            <div>
              <span className="font-semibold text-[#136F63] dark:text-teal-300">
                Ma trận Trả bài (Bước 1):{' '}
              </span>
              {oralMatrixConfig?.isLocked && oralMatrixConfig.grade === activeClass.grade ? (
                <span>{formatMatrixRequirementSummary(oralMatrixConfig)}</span>
              ) : (
                <span className="text-[#B45309] dark:text-amber-300">
                  Chưa thiết lập ma trận cho Khối {activeClass.grade} — Hệ thống sẽ mở Bước 1 khi gọi học sinh hoặc bấm Làm bài.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Class Tabs */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3.5 dark:border-slate-700">
          <div className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
            {storeData.classes.map((cls) => {
              const count = storeData.students.filter((s) => s.classId === cls.id).length;
              const isActive = cls.id === activeClass?.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => {
                    onChangeActiveClassId(cls.id);
                    setConfirmDeleteClass(false);
                  }}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-3.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                    isActive
                      ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:border-[#136F63]/40 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>Lớp {cls.name}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E2E8F0] text-[#0F172A] dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeClass && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-300">
              <span>
                Khối <strong className="text-[#0F172A] dark:text-white">{activeClass.grade}</strong> · Năm học{' '}
                <strong className="text-[#0F172A] dark:text-white">{activeClass.schoolYear}</strong> · GVCN:{' '}
                <strong className="text-[#0F172A] dark:text-white">{activeClass.homeroomTeacher}</strong>
                {activeClass.subjectTeacher ? (
                  <>
                    {' '}
                    · GVBM ({masterCtx.subjectName}): <strong className="text-[#0F172A] dark:text-white">{activeClass.subjectTeacher}</strong>
                  </>
                ) : null}
              </span>
              {isOwnerAdmin && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditClassModal}
                    title={`Chỉnh sửa thông tin lớp ${activeClass.name}`}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#136F63] transition-colors hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300"
                  >
                    <Pencil className="h-3 w-3" />
                    Sửa lớp
                  </button>
                  {storeData.classes.length > 1 && (
                    <>
                      {!confirmDeleteClass ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClass(true)}
                          title={`Xóa lớp ${activeClass.name}`}
                          className="min-h-[32px] rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#B91C1C] hover:bg-rose-200/70 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          Xóa lớp
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#B91C1C]">
                          Xác nhận xóa {activeClass.name}?
                          <button
                            type="button"
                            onClick={handleDeleteActiveClass}
                            className="rounded bg-[#B91C1C] px-2 py-0.5 text-white hover:bg-red-800"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteClass(false)}
                            className="rounded border border-[#CBD5E1] bg-white px-2 py-0.5 text-[#334155]"
                          >
                            Hủy
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sub-view Switcher + Import / Export Actions */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('roster')}
              className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-4 py-2 text-[13px] font-semibold transition ${
                subTab === 'roster'
                  ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                  : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <BookUser className="h-4 w-4" />
              Danh sách lớp &amp; Lý lịch ({classStudents.length})
            </button>
            {isOwnerAdmin && (
              <button
                type="button"
                onClick={() => setSubTab('gradebook')}
                className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-4 py-2 text-[13px] font-semibold transition ${
                  subTab === 'gradebook'
                    ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Sổ điểm riêng (Sổ đánh giá môn học)
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubTab('stats')}
              className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-4 py-2 text-[13px] font-semibold transition ${
                subTab === 'stats'
                  ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                  : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Thống kê lớp học &amp; Bảng điểm
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwnerAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenAddStudentModal('single')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <UserPlus className="h-4 w-4 text-[#136F63]" />
                  + Thêm học sinh
                </button>

                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Upload className="h-4 w-4 text-[#136F63]" />
                  Nhập Excel / CSV
                </button>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportSpreadsheet}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => downloadStudentImportTemplate(activeClass?.name || '12A1')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-4 w-4 text-[#136F63]" />
                  Tải mẫu (.xlsx)
                </button>
              </>
            )}

            {activeClass && (
              <button
                type="button"
                onClick={() =>
                  exportClassGradebookExcel(activeClass, classStudents, {
                    departmentName: masterCtx.departmentName,
                    schoolName: masterCtx.schoolName,
                    subjectName: masterCtx.subjectName,
                    teacherName: masterCtx.teacherHonorific,
                  })
                }
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Xuất bảng điểm Excel (.xlsx)
              </button>
            )}
          </div>
        </div>

        {statusBanner && (
          <div className="mt-3.5 flex items-center justify-between gap-2 rounded-[8px] border border-[#BBF7D0] bg-[#DCFCE7] px-3.5 py-2.5 text-xs font-semibold text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
              {statusBanner}
            </span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Đóng thông báo"
              className="rounded p-1 text-[#15803D] hover:bg-emerald-200/50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. TAB 1: DANH SÁCH LỚP & SƠ YẾU LÝ LỊCH */}
      {subTab === 'roster' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
          {/* Search & Multi-Criteria Filter Row */}
          <div className="mb-3 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm thông minh không dấu theo Tên, Mã HS, SĐT, Phụ huynh hoặc Ghi chú (vd: minh anh, nguyen hung)..."
                className="h-11 w-full rounded-[8px] border border-[#CBD5E1] bg-white pr-10 pl-10 text-sm text-[#0F172A] transition focus:border-[#136F63] focus:outline-none focus:ring-2 focus:ring-[#136F63]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Xóa nhanh từ khóa"
                  aria-label="Xóa nhanh từ khóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#136F63]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Quick Academic Rank Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'Tốt', label: 'Tốt' },
                  { id: 'Khá', label: 'Khá' },
                  { id: 'Đạt', label: 'Đạt' },
                  { id: 'Chưa đạt', label: 'Chưa đạt' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRankFilter(f.id as 'all' | AcademicRank)}
                    className={`min-h-[36px] whitespace-nowrap rounded-[8px] border px-3 py-1.5 text-xs font-semibold transition ${
                      rankFilter === f.id
                        ? 'border-[#136F63] bg-[#136F63] text-white'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Compact Multi-Criteria Dropdowns & Reset */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as 'all' | 'Nam' | 'Nữ')}
                  aria-label="Lọc giới tính"
                  className="h-9 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 text-xs font-semibold text-[#334155] outline-none transition focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">Giới tính: Tất cả</option>
                  <option value="Nam">Giới tính: Nam</option>
                  <option value="Nữ">Giới tính: Nữ</option>
                </select>

                <select
                  value={scoreFilter}
                  onChange={(e) => setScoreFilter(e.target.value as ScoreStatusFilter)}
                  aria-label="Lọc trạng thái điểm"
                  className="h-9 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 text-xs font-semibold text-[#334155] outline-none transition focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">Điểm TB: Tất cả</option>
                  <option value="ungraded">Chưa có điểm ({classStats.ungradedCount})</option>
                  <option value="below5">Điểm &lt; 5,0</option>
                  <option value="above8">Điểm ≥ 8,0</option>
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#136F63] hover:bg-[#F8FAFC]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Đặt lại bộ lọc
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-slate-400">
            <span>
              Nhấn vào <strong>Họ và tên</strong> để xem Lý lịch · <strong>Nhấp đúp</strong> trực tiếp vào Tên, Ngày sinh hoặc SĐT để sửa nhanh tại chỗ.
            </span>
            <span className="tabular-nums font-semibold text-[#136F63] dark:text-teal-300">
              Đang hiển thị <strong>{filteredStudents.length}</strong> /{' '}
              <strong>{classStudents.length}</strong> học sinh
            </span>
          </div>

          {/* Bulk Action Bar when >= 1 student checked */}
          {selectedIds.length > 0 && activeClass && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] border border-[#136F63]/30 bg-[#F0FDF9] px-3.5 py-2.5 shadow-xs dark:border-teal-800 dark:bg-teal-950/40">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                <span className="tabular-nums">
                  Đã chọn {selectedIds.length} học sinh
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs font-semibold text-[#136F63] underline hover:text-[#0F594F] dark:text-teal-300"
                >
                  Bỏ chọn
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {otherClasses.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={targetTransferClassId}
                      onChange={(e) => setTargetTransferClassId(e.target.value)}
                      aria-label="Chọn lớp chuyển đến"
                      className="h-9 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-xs font-semibold text-[#0F172A] outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {otherClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          Lớp {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkMoveToClass}
                      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 text-[#136F63]" />
                      Chuyển sang lớp khác
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#B91C1C] px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa {selectedIds.length} học sinh đã chọn
                </button>
              </div>
            </div>
          )}

          {/* Roster Table */}
          <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
            <table className="w-full border-collapse text-[13.5px] tabular-nums">
              <thead className="bg-[#136F63] text-xs font-semibold text-white">
                <tr>
                  <th className="w-10 border-b border-r border-[#0F594F] px-2 py-2.5 text-center">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Chọn tất cả học sinh đang hiển thị"
                      className="h-4 w-4 cursor-pointer rounded border-white/50 accent-[#0F594F]"
                    />
                  </th>
                  <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">STT</th>
                  <th className="border-b border-r border-[#0F594F] p-0 text-left">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('name')}
                      title="Sắp xếp theo Tên chính (A–Z / Z–A) chuẩn Việt Nam"
                      className="flex w-full items-center justify-between gap-1.5 px-3 py-2.5 text-left font-semibold transition-colors hover:bg-[#0F594F]"
                    >
                      <span>Học sinh</span>
                      {renderSortIcon('name')}
                    </button>
                  </th>
                  <th className="border-b border-r border-[#0F594F] p-0 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('dob_gender')}
                      title="Sắp xếp theo Ngày sinh / Giới tính"
                      className="flex w-full items-center justify-center gap-1 px-2.5 py-2.5 font-semibold transition-colors hover:bg-[#0F594F]"
                    >
                      <span>Ngày sinh / GT</span>
                      {renderSortIcon('dob_gender')}
                    </button>
                  </th>
                  <th className="border-b border-r border-[#0F594F] px-3 py-2.5 text-left">Liên hệ / PH</th>
                  <th className="border-b border-r border-[#0F594F] p-0 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('rank')}
                      title="Sắp xếp theo Học lực"
                      className="flex w-full items-center justify-center gap-1 px-2.5 py-2.5 font-semibold transition-colors hover:bg-[#0F594F]"
                    >
                      <span>Học lực</span>
                      {renderSortIcon('rank')}
                    </button>
                  </th>
                  <th className="border-b border-r border-[#0F594F] p-0 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('attempts')}
                      title="Sắp xếp theo số lượt trả bài (ưu tiên ít lượt nhất)"
                      className="flex w-full items-center justify-center gap-1 px-2.5 py-2.5 font-semibold transition-colors hover:bg-[#0F594F]"
                    >
                      <span>Lượt trả bài</span>
                      {renderSortIcon('attempts')}
                    </button>
                  </th>
                  <th className="border-b border-r border-[#0F594F] p-0 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('avg')}
                      title="Sắp xếp theo Điểm trung bình"
                      className="flex w-full items-center justify-center gap-1 px-2.5 py-2.5 font-semibold transition-colors hover:bg-[#0F594F]"
                    >
                      <span>Điểm TB</span>
                      {renderSortIcon('avg')}
                    </button>
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => {
                  const stats = computeStudentStats(st);
                  const isChecked = visibleSelectedSet.has(st.id);
                  const isEditingName =
                    inlineEdit?.studentId === st.id && inlineEdit.field === 'fullName';
                  const isEditingDob =
                    inlineEdit?.studentId === st.id && inlineEdit.field === 'dob';
                  const isEditingPhone =
                    inlineEdit?.studentId === st.id && inlineEdit.field === 'phone';
                  const isEditingParentPhone =
                    inlineEdit?.studentId === st.id && inlineEdit.field === 'parentPhone';

                  return (
                    <tr
                      key={st.id}
                      className={`border-b border-[#E2E8F0] transition-colors dark:border-slate-700 ${
                        isChecked
                          ? 'bg-[#F0FDF9] dark:bg-teal-950/30'
                          : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="border-r border-[#E2E8F0] px-2 py-2.5 text-center dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectRow(st.id)}
                          aria-label={`Chọn học sinh ${st.fullName}`}
                          className="h-4 w-4 cursor-pointer rounded border-[#CBD5E1] accent-[#136F63]"
                        />
                      </td>
                      <td className="border-r border-[#E2E8F0] px-2.5 py-2.5 text-center font-semibold text-[#64748B] dark:border-slate-700 dark:text-slate-300">
                        {idx + 1}
                      </td>
                      <td className="border-r border-[#E2E8F0] px-3 py-2.5 dark:border-slate-700">
                        <div className="flex items-center gap-2.5 text-left">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(st)}
                            title="Xem thẻ sơ yếu lý lịch"
                            className="shrink-0"
                          >
                            {st.avatarUrl ? (
                              <img
                                src={st.avatarUrl}
                                alt={st.fullName}
                                referrerPolicy="no-referrer"
                                className="h-9 w-9 rounded-[8px] border border-[#E2E8F0] object-cover"
                              />
                            ) : (
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-[8px] bg-gradient-to-br text-xs font-bold text-white shadow-xs ${getStudentAvatarGradient(
                                  st.id
                                )}`}
                              >
                                {getStudentInitials(st.fullName)}
                              </span>
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            {isEditingName ? (
                              <input
                                autoFocus
                                value={inlineEdit.value}
                                onChange={(e) =>
                                  setInlineEdit({ ...inlineEdit, value: e.target.value })
                                }
                                onBlur={commitInlineEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitInlineEdit();
                                  if (e.key === 'Escape') setInlineEdit(null);
                                }}
                                className="h-8 w-full min-w-[150px] rounded-[8px] border border-[#136F63] bg-white px-2 text-xs font-bold text-[#0F172A] outline-none ring-2 ring-[#136F63]/20 dark:bg-slate-800 dark:text-white"
                              />
                            ) : (
                              <div
                                onClick={() => {
                                  if (nameClickTimerRef.current) {
                                    window.clearTimeout(nameClickTimerRef.current);
                                  }
                                  nameClickTimerRef.current = window.setTimeout(() => {
                                    openStudentProfile(st);
                                    nameClickTimerRef.current = null;
                                  }, 220);
                                }}
                                onDoubleClick={() => startInlineEdit(st, 'fullName')}
                                title="Nhấn để xem lý lịch · Nhấp đúp để sửa nhanh họ tên"
                                className="cursor-pointer font-semibold text-[#0F172A] hover:text-[#136F63] hover:underline dark:text-slate-100"
                              >
                                {st.fullName}
                              </div>
                            )}
                            <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                              {st.studentCode}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border-r border-[#E2E8F0] px-2.5 py-2.5 text-center text-xs dark:border-slate-700">
                        {isEditingDob ? (
                          <input
                            autoFocus
                            value={inlineEdit.value}
                            onChange={(e) =>
                              setInlineEdit({ ...inlineEdit, value: e.target.value })
                            }
                            onBlur={commitInlineEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInlineEdit();
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            className="mx-auto h-7 w-24 rounded-[8px] border border-[#136F63] bg-white px-1.5 text-center text-xs font-medium outline-none ring-2 ring-[#136F63]/20 dark:bg-slate-800"
                          />
                        ) : (
                          <div
                            onDoubleClick={() => startInlineEdit(st, 'dob')}
                            title="Nhấp đúp để sửa nhanh ngày sinh"
                            className="cursor-text rounded px-1 font-medium text-[#334155] hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {st.dob}
                          </div>
                        )}
                        <div className="text-[#64748B] dark:text-slate-400">{st.gender}</div>
                      </td>
                      <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-xs dark:border-slate-700">
                        {isEditingPhone ? (
                          <input
                            autoFocus
                            value={inlineEdit.value}
                            onChange={(e) =>
                              setInlineEdit({ ...inlineEdit, value: e.target.value })
                            }
                            onBlur={commitInlineEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInlineEdit();
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            placeholder="SĐT học sinh..."
                            className="h-7 w-32 rounded-[8px] border border-[#136F63] bg-white px-2 text-xs font-medium outline-none ring-2 ring-[#136F63]/20 dark:bg-slate-800"
                          />
                        ) : (
                          <div
                            onDoubleClick={() => startInlineEdit(st, 'phone')}
                            title="Nhấp đúp để sửa nhanh SĐT học sinh"
                            className="cursor-text rounded px-1 font-medium text-[#334155] hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {st.phone || st.parentPhone || 'Nhấp đúp thêm SĐT'}
                          </div>
                        )}
                        {isEditingParentPhone ? (
                          <input
                            autoFocus
                            value={inlineEdit.value}
                            onChange={(e) =>
                              setInlineEdit({ ...inlineEdit, value: e.target.value })
                            }
                            onBlur={commitInlineEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInlineEdit();
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            placeholder="SĐT phụ huynh..."
                            className="mt-0.5 h-6 w-32 rounded-[8px] border border-[#136F63] bg-white px-2 text-[11px] outline-none ring-2 ring-[#136F63]/20 dark:bg-slate-800"
                          />
                        ) : (
                          <div
                            onDoubleClick={() => startInlineEdit(st, 'parentPhone')}
                            title="Nhấp đúp để sửa nhanh SĐT phụ huynh"
                            className="cursor-text rounded px-1 text-[11px] text-[#64748B] hover:bg-[#F1F5F9] dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            PH: {st.parentName || '—'} · {st.parentPhone || '—'}
                          </div>
                        )}
                      </td>
                      <td className="border-r border-[#E2E8F0] px-2.5 py-2.5 text-center dark:border-slate-700">
                        <span
                          className={`inline-block rounded-[8px] border px-2 py-0.5 text-xs font-semibold ${RANK_STYLE[st.academicRank]}`}
                        >
                          {st.academicRank}
                        </span>
                      </td>
                      <td className="border-r border-[#E2E8F0] px-2.5 py-2.5 text-center text-xs dark:border-slate-700">
                        <div className="font-semibold text-[#136F63] dark:text-teal-300">{stats.totalActivities} lượt</div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                          {stats.quizCount} App · {stats.oralCount} miệng · +{stats.bonusTotal}đ
                        </div>
                      </td>
                      <td className="border-r border-[#E2E8F0] px-2.5 py-2.5 text-center dark:border-slate-700">
                        {stats.finalAvgScore !== null ? (
                          <span
                            className={`text-sm font-bold ${
                              stats.finalAvgScore >= 8
                                ? 'text-[#15803D]'
                                : stats.finalAvgScore >= 5
                                ? 'text-[#136F63]'
                                : 'text-[#B91C1C]'
                            }`}
                          >
                            {stats.finalAvgScore.toFixed(2).replace('.', ',')}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[#64748B]">Chưa có</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(st)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <BookUser className="h-3.5 w-3.5 text-[#136F63]" />
                            Lý lịch
                          </button>
                          {activeClass && (
                            <button
                              type="button"
                              onClick={() => onStartQuizForStudent(st, activeClass)}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-[8px] bg-[#136F63] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F594F]"
                            >
                              <Play className="h-3 w-3 fill-current" />
                              Làm bài
                            </button>
                          )}
                          {isOwnerAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditModalStudent({ ...st })}
                                title={`Sửa thông tin ${st.fullName}`}
                                aria-label={`Sửa ${st.fullName}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#136F63] transition-colors hover:border-[#136F63] hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTargetStudent(st)}
                                title={`Xóa ${st.fullName}`}
                                aria-label={`Xóa ${st.fullName}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] text-[#B91C1C] transition-colors hover:border-red-400 hover:bg-red-200/70 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm text-[#64748B]"
                    >
                      Chưa có học sinh nào khớp với bộ lọc hiện tại. Hãy thêm học sinh thủ công, dán nhanh hoặc nhập từ file Excel/CSV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2B. TAB SỔ ĐIỂM RIÊNG (SỔ ĐÁNH GIÁ MÔN HỌC CHUẨN SMAS 4.0) */}
      {subTab === 'gradebook' && (
        <SubjectGradebookModule
          mode="gradebook"
          embedded={true}
          ownerUid={ownerUid}
          classroomStore={storeData}
          onUpdateClassroomStore={onUpdateStore}
          activeClassId={activeClassId}
          onChangeActiveClassId={onChangeActiveClassId}
          gradebookMap={gradebookMap}
          onUpdateGradebookMap={onUpdateGradebookMap}
          masterData={masterData}
        />
      )}

      {/* 3. TAB 2: THỐNG KÊ LỚP HỌC & BẢNG ĐIỂM + BIỂU ĐỒ */}
      {subTab === 'stats' && activeClass && (
        <div className="space-y-4">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                Sĩ số lớp {activeClass.name}
              </div>
              <div className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums dark:text-white">
                {classStats.totalStudents} học sinh
              </div>
              <div className="mt-1 text-xs text-[#64748B] tabular-nums dark:text-slate-400">
                Đã có điểm: {classStats.gradedStudentsCount} · Chưa có: {classStats.ungradedCount}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                Điểm trung bình lớp
              </div>
              <div className="mt-1 text-2xl font-bold text-[#136F63] tabular-nums dark:text-teal-300">
                {classStats.gradedStudentsCount > 0
                  ? classStats.avgClass.toFixed(2).replace('.', ',')
                  : '—'}
              </div>
              <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                Thang điểm 10 (đã cộng điểm thưởng)
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                Tỷ lệ Đạt (≥ 5,0 điểm)
              </div>
              <div className="mt-1 text-2xl font-bold text-[#15803D] tabular-nums dark:text-emerald-400">
                {classStats.gradedStudentsCount > 0 ? `${classStats.passRate}%` : '—'}
              </div>
              <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                Tính trên các học sinh đã chấm điểm
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                Tổng lượt làm bài &amp; phát biểu
              </div>
              <div className="mt-1 text-2xl font-bold text-[#B45309] tabular-nums dark:text-amber-400">
                {classStats.totalActivities} lượt
              </div>
              <div className="mt-1 text-xs text-[#64748B] tabular-nums dark:text-slate-400">
                {classStats.totalQuizAndOral} bài chấm điểm · {classStats.totalBonusCount} lượt điểm cộng
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-[15px] font-semibold text-[#0F172A] dark:text-slate-100">
                <BarChart3 className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
                Biểu đồ Phân bố Điểm số Lớp {activeClass.name}
              </h3>
              <div className="flex h-52 items-end gap-4 border-b border-[#E2E8F0] pb-2 dark:border-slate-700">
                {classStats.bins.map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-xs font-bold text-[#136F63] tabular-nums dark:text-teal-300">
                      {b.count} HS
                    </span>
                    <div
                      style={{
                        height: `${b.count === 0 ? 6 : Math.max(16, (b.count / classStats.maxBin) * 145)}px`,
                      }}
                      className={`w-full max-w-[58px] rounded-t-[8px] bg-gradient-to-t ${b.color} transition-all duration-200`}
                    />
                    <span className="text-[11px] font-semibold text-[#334155] tabular-nums dark:text-slate-300">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-5 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-[15px] font-semibold text-[#0F172A] dark:text-slate-100">
                <GraduationCap className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
                Cơ cấu Phân loại Học lực ({classStats.totalStudents} HS)
              </h3>
              <div className="space-y-3.5">
                {classStats.rankCounts.map((item) => {
                  const pct = classStats.totalStudents
                    ? Math.round((item.count / classStats.totalStudents) * 100)
                    : 0;
                  return (
                    <div key={item.rank}>
                      <div className="mb-1 flex justify-between text-xs font-semibold text-[#334155] tabular-nums dark:text-slate-200">
                        <span>{item.rank}</span>
                        <span>
                          {item.count} HS ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9] dark:bg-slate-800">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full transition-all duration-200 ${item.barColor}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comprehensive Gradebook Table */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-slate-100">
                Bảng Tổng hợp Điểm &amp; Phát biểu Lớp {activeClass.name}
              </h3>
              <button
                type="button"
                onClick={() => exportClassGradebookExcel(activeClass, classStudents)}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Xuất bảng điểm Excel (.xlsx)
              </button>
            </div>

            <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
              <table className="w-full border-collapse text-[13.5px] tabular-nums">
                <thead className="bg-[#136F63] text-xs font-semibold text-white">
                  <tr>
                    <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">STT</th>
                    <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">Mã HS</th>
                    <th className="border-b border-r border-[#0F594F] px-3 py-2.5 text-left">Họ và tên</th>
                    <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">Làm bài App</th>
                    <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">Trả bài miệng</th>
                    <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-center">Điểm cộng</th>
                    <th className="border-b border-r border-[#0F594F] px-3 py-2.5 text-left">Các cột điểm</th>
                    <th className="border-b border-[#0F594F] px-2.5 py-2.5 text-center">Điểm TB</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map((st, idx) => {
                    const stats = computeStudentStats(st);
                    return (
                      <tr
                        key={st.id}
                        className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC] dark:border-slate-700 dark:hover:bg-slate-800/60"
                      >
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center text-[#64748B] dark:border-slate-700">
                          {idx + 1}
                        </td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center text-xs font-semibold text-[#64748B] dark:border-slate-700 dark:text-slate-300">
                          {st.studentCode}
                        </td>
                        <td className="border-r border-[#E2E8F0] px-3 py-2 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(st)}
                            className="font-semibold text-[#0F172A] hover:text-[#136F63] hover:underline dark:text-slate-100"
                          >
                            {st.fullName}
                          </button>
                        </td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-700">
                          {stats.quizCount}
                        </td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-700">
                          {stats.oralCount}
                        </td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-[#15803D] dark:border-slate-700">
                          {stats.bonusTotal > 0 ? `+${stats.bonusTotal}` : '0'}
                        </td>
                        <td className="border-r border-[#E2E8F0] px-3 py-2 text-xs dark:border-slate-700">
                          {stats.gradedAttempts.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {stats.gradedAttempts.slice(0, 6).map((att) => (
                                <span
                                  key={att.id}
                                  className="rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-1.5 py-0.5 font-semibold text-[#0369A1] dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                                >
                                  {att.score.toFixed(1).replace('.', ',')}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#64748B]">Chưa có điểm</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-center font-bold text-[#136F63] dark:text-teal-300">
                          {stats.finalAvgScore !== null
                            ? stats.finalAvgScore.toFixed(2).replace('.', ',')
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL A: Tạo mới / Chỉnh sửa thông tin lớp học */}
      {showClassModal && (
        <SmartboardViewport
          isModal
          title={classModalMode === 'edit' ? 'Chỉnh sửa thông tin lớp học' : 'Tạo lớp học mới'}
          onCloseModal={() => setShowClassModal(false)}
          maxWidthClass="max-w-md"
        >
          <div className="space-y-3 text-sm text-[#334155] dark:text-slate-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Tên lớp *</label>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Ví dụ: 12A3, 10C2..."
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Khối lớp</label>
                <select
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value as '10' | '11' | '12')}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="12">Khối 12</option>
                  <option value="11">Khối 11</option>
                  <option value="10">Khối 10</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Năm học</label>
                {masterData?.schoolYears.length ? (
                  <select
                    value={newClassYear}
                    onChange={(e) => setNewClassYear(e.target.value)}
                    className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  >
                    {!masterData.schoolYears.some((y) => y.label === newClassYear) && (
                      <option value={newClassYear}>{newClassYear}</option>
                    )}
                    {masterData.schoolYears.map((sy) => (
                      <option key={sy.id} value={sy.label}>
                        {sy.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={newClassYear}
                    onChange={(e) => setNewClassYear(e.target.value)}
                    className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">GV Chủ nhiệm (GVCN)</label>
                {masterData?.teachers.length ? (
                  <select
                    value={newClassTeacher}
                    onChange={(e) => setNewClassTeacher(e.target.value)}
                    className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  >
                    {!masterData.teachers.some(
                      (t) => formatTeacherHonorific(t) === newClassTeacher
                    ) &&
                      newClassTeacher && (
                        <option value={newClassTeacher}>{newClassTeacher}</option>
                      )}
                    {masterData.teachers.map((t) => (
                      <option key={t.id} value={formatTeacherHonorific(t)}>
                        {formatTeacherHonorific(t)} ({t.departmentGroup})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={newClassTeacher}
                    onChange={(e) => setNewClassTeacher(e.target.value)}
                    className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                GV Bộ môn ({masterCtx.subjectName})
              </label>
              {masterData?.teachers.length ? (
                <select
                  value={newClassSubjectTeacher}
                  onChange={(e) => setNewClassSubjectTeacher(e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                >
                  {!masterData.teachers.some(
                    (t) => formatTeacherHonorific(t) === newClassSubjectTeacher
                  ) &&
                    newClassSubjectTeacher && (
                      <option value={newClassSubjectTeacher}>{newClassSubjectTeacher}</option>
                    )}
                  {masterData.teachers.map((t) => (
                    <option key={t.id} value={formatTeacherHonorific(t)}>
                      {formatTeacherHonorific(t)} ({t.departmentGroup})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={newClassSubjectTeacher}
                  onChange={(e) => setNewClassSubjectTeacher(e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!newClassName.trim()}
                onClick={handleSaveClassModal}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
              >
                Cập nhật lớp
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      <CreateClassroomFromMasterModal
        open={showCreateFromMasterModal}
        onClose={() => setShowCreateFromMasterModal(false)}
        masterData={masterData}
        existingClasses={storeData.classes}
        onSelectExistingClass={(cid) => onChangeActiveClassId(cid)}
        onCreateClass={async (newCls) => {
          const next = await upsertClassInStore(storeData, newCls);
          onUpdateStore(next);
          onChangeActiveClassId(newCls.id);
          setStatusBanner(
            `Đã mở lớp ${newCls.name} (Khối ${newCls.grade} · Năm học ${newCls.schoolYear} · GVCN: ${newCls.homeroomTeacher}) từ Khai báo Đầu năm.`
          );
        }}
      />

      {/* MODAL B: Thêm học sinh (Tab 1: Từng học sinh · Tab 2: Dán danh sách nhanh) */}
      {showAddStudentModal && activeClass && (
        <SmartboardViewport
          isModal
          title={`Thêm học sinh vào lớp ${activeClass.name}`}
          onCloseModal={() => setShowAddStudentModal(false)}
          maxWidthClass="max-w-2xl"
          bodyClassName="p-0"
        >
          {/* 2-Tab Switcher */}
          <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setAddStudentTab('single')}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border px-4 py-2 text-xs font-semibold transition-all ${
                addStudentTab === 'single'
                  ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                  : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Thêm từng học sinh
            </button>
            <button
              type="button"
              onClick={() => setAddStudentTab('paste')}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border px-4 py-2 text-xs font-semibold transition-all ${
                addStudentTab === 'paste'
                  ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                  : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Dán danh sách nhanh (Excel / Word)
            </button>
          </div>

          <div className="p-5 text-sm text-[#334155] dark:text-slate-200">
            {addStudentTab === 'single' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Họ và tên *</label>
                    <input
                      value={stFullName}
                      onChange={(e) => setStFullName(e.target.value)}
                      placeholder="Nguyễn Minh Khang"
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                      Mã học sinh (gợi ý tự động)
                    </label>
                    <input
                      value={stCode}
                      onChange={(e) => setStCode(e.target.value)}
                      className={`h-10 w-full rounded-[8px] border px-3 text-sm tabular-nums outline-none dark:bg-slate-800 ${
                        singleCodeConflict
                          ? 'border-[#FECACA] bg-[#FEE2E2]/50 text-[#B91C1C] dark:border-rose-600 dark:text-rose-100'
                          : 'border-[#CBD5E1] focus:border-[#136F63] dark:border-slate-700'
                      }`}
                    />
                    {singleCodeConflict && (
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-[#B91C1C] dark:text-rose-300">
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Trùng với {singleCodeConflict.fullName} (Lớp {singleCodeConflict.className})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setStCode(suggestNextStudentCode(activeClass.name, storeData.students))
                          }
                          className="shrink-0 text-[#136F63] underline hover:text-[#0F594F]"
                        >
                          Lấy mã mới
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Ngày sinh</label>
                    <input
                      value={stDob}
                      onChange={(e) => setStDob(e.target.value)}
                      placeholder="15/05/2009"
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Giới tính</label>
                    <select
                      value={stGender}
                      onChange={(e) => setStGender(e.target.value as 'Nam' | 'Nữ')}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">SĐT học sinh</label>
                    <input
                      value={stPhone}
                      onChange={(e) => setStPhone(e.target.value)}
                      placeholder="0912..."
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Phân loại học lực</label>
                    <select
                      value={stRank}
                      onChange={(e) => setStRank(e.target.value as AcademicRank)}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="Tốt">Tốt</option>
                      <option value="Khá">Khá</option>
                      <option value="Đạt">Đạt</option>
                      <option value="Chưa đạt">Chưa đạt</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Họ tên Phụ huynh</label>
                    <input
                      value={stParentName}
                      onChange={(e) => setStParentName(e.target.value)}
                      placeholder="Nguyễn Văn..."
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">SĐT Phụ huynh</label>
                    <input
                      value={stParentPhone}
                      onChange={(e) => setStParentPhone(e.target.value)}
                      placeholder="0987..."
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Ghi chú nhận xét của GV</label>
                  <textarea
                    rows={2}
                    value={stNotes}
                    onChange={(e) => setStNotes(e.target.value)}
                    placeholder="Nhận xét về thái độ học tập, điểm mạnh hoặc phần cần bồi dưỡng..."
                    className="w-full rounded-[8px] border border-[#CBD5E1] p-2.5 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddStudentModal(false)}
                    className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={!stFullName.trim() || Boolean(singleCodeConflict)}
                    onClick={handleAddStudent}
                    className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
                  >
                    Lưu học sinh
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[#64748B] dark:text-slate-300">
                  Copy các dòng từ bảng <strong>Excel hoặc Word</strong> (gồm <em>Mã HS (nếu có), Họ tên, Ngày sinh, Giới tính, SĐT</em> — hỗ trợ cả cột STT đầu dòng) rồi dán vào khung bên dưới:
                </div>
                <textarea
                  rows={5}
                  value={pasteRawText}
                  onChange={(e) => {
                    setPasteRawText(e.target.value);
                    setExcludedPasteIds({});
                    setPasteCodeOverrides({});
                  }}
                  placeholder={`HS12A1-21\tNguyễn Minh Khang\t15/05/2009\tNam\t0912345678\nHS12A1-22\tTrần Thị Ngọc Hà\t22/08/2009\tNữ\t0987654321`}
                  className="w-full rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-xs leading-relaxed text-[#0F172A] outline-none focus:border-[#136F63] focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />

                {/* Duplicate Student Code Warning / Validation Status */}
                {activePasteStudents.length > 0 && pasteValidation.duplicateItems.length > 0 && (
                  <div className="rounded-[8px] border border-[#FDE68A] bg-[#FEF3C7] p-3 text-xs text-[#B45309] dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309] dark:text-amber-400" />
                        <div>
                          <div className="font-bold tabular-nums">
                            Cảnh báo trùng Mã HS: Phát hiện {pasteValidation.duplicateItems.length} dòng bị trùng mã học sinh
                            {pasteValidation.systemDuplicateCount > 0 &&
                              ` (${pasteValidation.systemDuplicateCount} mã đã tồn tại trong hệ thống`}
                            {pasteValidation.systemDuplicateCount > 0 &&
                              pasteValidation.batchDuplicateCount > 0 &&
                              `, ${pasteValidation.batchDuplicateCount} mã lặp trong danh sách dán`}
                            {pasteValidation.systemDuplicateCount > 0 && ')'}
                            {pasteValidation.systemDuplicateCount === 0 &&
                              pasteValidation.batchDuplicateCount > 0 &&
                              ` (${pasteValidation.batchDuplicateCount} mã lặp ngay trong danh sách dán)`}
                            .
                          </div>
                          <div className="mt-0.5 text-[11px] opacity-90">
                            Các dòng trùng sẽ tự động bị bỏ qua khi lưu để tránh dữ liệu dư thừa. Thầy/cô có thể sửa trực tiếp Mã HS trong bảng hoặc bấm loại bỏ nhanh.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextExcluded = { ...excludedPasteIds };
                          pasteValidation.duplicateItems.forEach((d) => {
                            nextExcluded[d.student.id] = true;
                          });
                          setExcludedPasteIds(nextExcluded);
                        }}
                        className="shrink-0 rounded-[8px] border border-[#F59E0B] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#B45309] transition hover:bg-amber-50 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200"
                      >
                        Loại bỏ {pasteValidation.duplicateItems.length} dòng trùng
                      </button>
                    </div>
                  </div>
                )}

                {activePasteStudents.length > 0 && pasteValidation.duplicateItems.length === 0 && (
                  <div className="flex items-center gap-1.5 rounded-[8px] border border-[#BBF7D0] bg-[#DCFCE7] px-3 py-2 text-xs font-semibold text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
                    <span className="tabular-nums">
                      Đã kiểm tra {pasteValidation.validItems.length} Mã HS — không phát hiện mã trùng lặp trong hệ thống.
                    </span>
                  </div>
                )}

                {/* Preview Table */}
                {activePasteStudents.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                      <span className="tabular-nums">
                        Xem trước: {pasteValidation.validItems.length} hợp lệ
                        {pasteValidation.duplicateItems.length > 0
                          ? ` · ${pasteValidation.duplicateItems.length} trùng Mã HS`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPasteRawText('');
                          setExcludedPasteIds({});
                          setPasteCodeOverrides({});
                        }}
                        className="text-xs font-semibold text-[#64748B] underline hover:text-[#B91C1C]"
                      >
                        Xóa nội dung dán
                      </button>
                    </div>
                    <div className="max-h-56 overflow-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
                      <table className="w-full border-collapse text-xs tabular-nums">
                        <thead className="sticky top-0 z-10 bg-[#136F63] text-white">
                          <tr>
                            <th className="px-2 py-2 text-center">STT</th>
                            <th className="px-2 py-2 text-left">Mã HS</th>
                            <th className="px-2 py-2 text-left">Họ và tên</th>
                            <th className="px-2 py-2 text-center">Ngày sinh</th>
                            <th className="px-2 py-2 text-center">GT</th>
                            <th className="px-2 py-2 text-left">Kiểm tra</th>
                            <th className="px-2 py-2 text-center">Bỏ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                          {pasteValidation.items.map((item, pIdx) => {
                            const ps = item.student;
                            const isDup = Boolean(item.conflict);
                            return (
                              <tr
                                key={ps.id}
                                className={
                                  isDup
                                    ? 'bg-[#FEE2E2]/60 dark:bg-rose-950/30'
                                    : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40'
                                }
                              >
                                <td className="px-2 py-1.5 text-center text-[#64748B]">{pIdx + 1}</td>
                                <td className="px-2 py-1">
                                  <input
                                    value={ps.studentCode}
                                    onChange={(e) =>
                                      setPasteCodeOverrides((prev) => ({
                                        ...prev,
                                        [ps.id]: e.target.value,
                                      }))
                                    }
                                    className={`h-7 w-24 rounded-[6px] border px-1.5 text-xs font-semibold tabular-nums outline-none ${
                                      isDup
                                        ? 'border-[#FECACA] bg-white text-[#B91C1C] focus:border-[#B91C1C] dark:border-rose-600 dark:bg-slate-900 dark:text-rose-200'
                                        : 'border-[#CBD5E1] bg-white text-[#136F63] focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-teal-300'
                                    }`}
                                  />
                                </td>
                                <td className="px-2 py-1.5 font-semibold text-[#0F172A] dark:text-white">
                                  {ps.fullName}
                                </td>
                                <td className="px-2 py-1.5 text-center">{ps.dob}</td>
                                <td className="px-2 py-1.5 text-center">{ps.gender}</td>
                                <td className="px-2 py-1.5">
                                  {item.conflict ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B91C1C] dark:text-rose-300">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                      {item.conflict.source === 'system' && item.conflict.existingStudent
                                        ? `Đã có: ${item.conflict.existingStudent.fullName} (${item.conflict.existingStudent.className})`
                                        : `Lặp với dòng #${item.conflict.firstBatchRow}`}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] dark:text-emerald-300">
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      Hợp lệ
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExcludedPasteIds((prev) => ({ ...prev, [ps.id]: true }))
                                    }
                                    className="rounded p-1 text-[#64748B] hover:text-[#B91C1C]"
                                    title="Bỏ dòng này"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddStudentModal(false)}
                    className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={pasteValidation.validItems.length === 0}
                    onClick={handleQuickPasteImport}
                    className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
                  >
                    {pasteValidation.duplicateItems.length > 0
                      ? `Bỏ qua trùng & Thêm ${pasteValidation.validItems.length} HS hợp lệ`
                      : `Thêm ${pasteValidation.validItems.length} học sinh vào lớp ${activeClass.name}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL B1: Kiểm tra & Cảnh báo trùng Mã HS khi nhập từ tệp Excel / CSV */}
      {excelImportReview && excelValidation && activeClass && (
        <SmartboardViewport
          isModal
          title={`Kiểm tra dữ liệu nhập Excel / CSV · ${excelImportReview.fileName}`}
          subtitle={`Lớp đích: ${activeClass.name} · Tự động đối chiếu Mã HS trên toàn hệ thống`}
          onCloseModal={() => setExcelImportReview(null)}
          maxWidthClass="max-w-4xl"
          bodyClassName="p-0"
        >
          <div className="space-y-3.5 p-5 text-sm text-[#334155] dark:text-slate-200">
            {/* Alert Banner */}
            {excelValidation.duplicateItems.length > 0 ? (
              <div className="rounded-[8px] border border-[#FDE68A] bg-[#FEF3C7] p-3.5 text-xs text-[#B45309] dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309] dark:text-amber-400" />
                    <div>
                      <div className="text-[13px] font-bold tabular-nums">
                        Cảnh báo: Phát hiện {excelValidation.duplicateItems.length} mã học sinh (Mã HS) đã tồn tại hoặc bị trùng lặp
                      </div>
                      <div className="mt-1 leading-relaxed opacity-90">
                        {excelValidation.systemDuplicateCount > 0 && (
                          <span>
                            Có <strong className="tabular-nums">{excelValidation.systemDuplicateCount}</strong> Mã HS đã tồn tại trong danh sách hệ thống.{' '}
                          </span>
                        )}
                        {excelValidation.batchDuplicateCount > 0 && (
                          <span>
                            Có <strong className="tabular-nums">{excelValidation.batchDuplicateCount}</strong> Mã HS bị lặp lại ngay trong tệp tải lên.{' '}
                          </span>
                        )}
                        Các dòng trùng sẽ tự động bị bỏ qua để tránh nhập dữ liệu dư thừa. Thầy/cô có thể sửa trực tiếp Mã HS trong bảng bên dưới nếu bị gõ nhầm, hoặc loại bỏ nhanh các dòng trùng.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExcelImportReview((prev) => {
                        if (!prev) return prev;
                        const nextExcluded = { ...prev.excludedIds };
                        excelValidation.duplicateItems.forEach((d) => {
                          nextExcluded[d.student.id] = true;
                        });
                        return {
                          ...prev,
                          excludedIds: nextExcluded,
                          filterMode: 'all',
                        };
                      })
                    }
                    className="shrink-0 rounded-[8px] border border-[#F59E0B] bg-white px-3 py-1.5 text-xs font-bold text-[#B45309] transition hover:bg-amber-50 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200"
                  >
                    Loại bỏ {excelValidation.duplicateItems.length} dòng trùng
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-[8px] border border-[#BBF7D0] bg-[#DCFCE7] p-3 text-xs font-semibold text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
                <span className="tabular-nums">
                  Tất cả {excelValidation.validItems.length} mã học sinh hiện tại đều hợp lệ và sẵn sàng nhập vào lớp {activeClass.name}.
                </span>
              </div>
            )}

            {/* Filter & Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  {
                    id: 'all' as const,
                    label: `Tất cả (${excelValidation.items.length})`,
                  },
                  {
                    id: 'duplicates' as const,
                    label: `Trùng Mã HS (${excelValidation.duplicateItems.length})`,
                  },
                  {
                    id: 'valid' as const,
                    label: `Hợp lệ (${excelValidation.validItems.length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setExcelImportReview((prev) =>
                        prev ? { ...prev, filterMode: tab.id } : prev
                      )
                    }
                    className={`min-h-[36px] rounded-[8px] border px-3 py-1.5 text-xs font-semibold tabular-nums transition ${
                      excelImportReview.filterMode === tab.id
                        ? 'border-[#136F63] bg-[#136F63] text-white'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-[#64748B] tabular-nums dark:text-slate-400">
                Đã đọc {excelImportReview.students.length} dòng · Hợp lệ:{' '}
                <strong className="text-[#15803D] dark:text-emerald-300">
                  {excelValidation.validItems.length}
                </strong>{' '}
                · Trùng:{' '}
                <strong className="text-[#B91C1C] dark:text-rose-300">
                  {excelValidation.duplicateItems.length}
                </strong>
              </div>
            </div>

            {/* Table */}
            <div className="max-h-72 overflow-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead className="sticky top-0 z-10 bg-[#136F63] text-white">
                  <tr>
                    <th className="px-2.5 py-2 text-center">STT</th>
                    <th className="px-2.5 py-2 text-left">Mã HS (có thể sửa)</th>
                    <th className="px-2.5 py-2 text-left">Họ và tên</th>
                    <th className="px-2.5 py-2 text-center">Ngày sinh</th>
                    <th className="px-2.5 py-2 text-center">GT</th>
                    <th className="px-2.5 py-2 text-left">SĐT</th>
                    <th className="px-2.5 py-2 text-left">Trạng thái kiểm tra</th>
                    <th className="px-2.5 py-2 text-center">Bỏ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                  {(excelImportReview.filterMode === 'duplicates'
                    ? excelValidation.duplicateItems
                    : excelImportReview.filterMode === 'valid'
                    ? excelValidation.validItems
                    : excelValidation.items
                  ).map((item) => {
                    const st = item.student;
                    const isDup = Boolean(item.conflict);
                    return (
                      <tr
                        key={st.id}
                        className={
                          isDup
                            ? 'bg-[#FEE2E2]/60 dark:bg-rose-950/30'
                            : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="px-2.5 py-1.5 text-center text-[#64748B]">
                          {item.rowIndex}
                        </td>
                        <td className="px-2.5 py-1">
                          <input
                            value={st.studentCode}
                            onChange={(e) => {
                              const nextCode = e.target.value;
                              setExcelImportReview((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      students: prev.students.map((s) =>
                                        s.id === st.id ? { ...s, studentCode: nextCode } : s
                                      ),
                                    }
                                  : prev
                              );
                            }}
                            className={`h-7 w-28 rounded-[6px] border px-2 text-xs font-semibold tabular-nums outline-none ${
                              isDup
                                ? 'border-[#FECACA] bg-white text-[#B91C1C] focus:border-[#B91C1C] dark:border-rose-600 dark:bg-slate-900 dark:text-rose-200'
                                : 'border-[#CBD5E1] bg-white text-[#136F63] focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-teal-300'
                            }`}
                          />
                        </td>
                        <td className="px-2.5 py-1.5 font-semibold text-[#0F172A] dark:text-white">
                          {st.fullName}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">{st.dob}</td>
                        <td className="px-2.5 py-1.5 text-center">{st.gender}</td>
                        <td className="px-2.5 py-1.5">{st.phone || '—'}</td>
                        <td className="px-2.5 py-1.5">
                          {item.conflict ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B91C1C] dark:text-rose-300">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              {item.conflict.source === 'system' && item.conflict.existingStudent
                                ? `Trùng với ${item.conflict.existingStudent.fullName} (Lớp ${item.conflict.existingStudent.className})`
                                : `Lặp Mã HS với dòng #${item.conflict.firstBatchRow} trong file`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              Hợp lệ
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setExcelImportReview((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      excludedIds: { ...prev.excludedIds, [st.id]: true },
                                    }
                                  : prev
                              )
                            }
                            title="Loại bỏ dòng này khỏi danh sách nhập"
                            className="rounded p-1 text-[#64748B] hover:text-[#B91C1C]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-[#64748B] dark:text-slate-300">
              {excelValidation.validItems.length === 0
                ? 'Chưa có dòng hợp lệ nào để nhập. Hãy sửa Mã HS hoặc hủy nhập.'
                : excelValidation.duplicateItems.length > 0
                ? `Chỉ nhập ${excelValidation.validItems.length} học sinh hợp lệ (tự động bỏ qua ${excelValidation.duplicateItems.length} dòng trùng).`
                : `Sẵn sàng nhập ${excelValidation.validItems.length} học sinh vào lớp ${activeClass.name}.`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExcelImportReview(null)}
                className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Hủy nhập
              </button>
              <button
                type="button"
                disabled={excelValidation.validItems.length === 0}
                onClick={handleConfirmExcelReviewImport}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
              >
                {excelValidation.duplicateItems.length > 0
                  ? `Bỏ qua trùng & Nhập ${excelValidation.validItems.length} HS hợp lệ`
                  : `Nhập ${excelValidation.validItems.length} học sinh vào lớp ${activeClass.name}`}
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL B2: Chỉnh sửa nhanh toàn bộ thông tin học sinh (Từ nút Sửa trên dòng) */}
      {editModalStudent && (
        <SmartboardViewport
          isModal
          title="Cập nhật thông tin học sinh"
          onCloseModal={() => setEditModalStudent(null)}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-3 text-sm text-[#334155] dark:text-slate-200">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Họ và tên *</label>
                <input
                  value={editModalStudent.fullName}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, fullName: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Mã học sinh</label>
                <input
                  value={editModalStudent.studentCode}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, studentCode: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Ngày sinh</label>
                <input
                  value={editModalStudent.dob}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, dob: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Giới tính</label>
                <select
                  value={editModalStudent.gender}
                  onChange={(e) =>
                    setEditModalStudent({
                      ...editModalStudent,
                      gender: e.target.value as 'Nam' | 'Nữ',
                    })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">SĐT học sinh</label>
                <input
                  value={editModalStudent.phone}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, phone: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Phân loại học lực</label>
                <select
                  value={editModalStudent.academicRank}
                  onChange={(e) =>
                    setEditModalStudent({
                      ...editModalStudent,
                      academicRank: e.target.value as AcademicRank,
                    })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Tốt">Tốt</option>
                  <option value="Khá">Khá</option>
                  <option value="Đạt">Đạt</option>
                  <option value="Chưa đạt">Chưa đạt</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Họ tên Phụ huynh</label>
                <input
                  value={editModalStudent.parentName}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, parentName: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">SĐT Phụ huynh</label>
                <input
                  value={editModalStudent.parentPhone}
                  onChange={(e) =>
                    setEditModalStudent({ ...editModalStudent, parentPhone: e.target.value })
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] px-3 text-sm tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0F172A] dark:text-slate-200">Ghi chú nhận xét của GV</label>
              <textarea
                rows={2}
                value={editModalStudent.teacherNotes}
                onChange={(e) =>
                  setEditModalStudent({ ...editModalStudent, teacherNotes: e.target.value })
                }
                className="w-full rounded-[8px] border border-[#CBD5E1] p-2.5 text-sm outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditModalStudent(null)}
                className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!editModalStudent.fullName.trim()}
                onClick={handleSaveRowEditModal}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0F594F] disabled:opacity-50"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL B3: Xác nhận xóa 1 học sinh từ nút Thùng rác */}
      {deleteTargetStudent && (
        <SmartboardViewport
          isModal
          title="Xác nhận xóa học sinh"
          onCloseModal={() => setDeleteTargetStudent(null)}
          maxWidthClass="max-w-sm"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#FEE2E2] text-[#B91C1C]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-[#334155] dark:text-slate-300">
              Bạn có chắc chắn muốn xóa học sinh{' '}
              <strong className="text-[#0F172A] dark:text-white">{deleteTargetStudent.fullName}</strong> (Mã{' '}
              <strong className="tabular-nums text-[#0F172A] dark:text-white">{deleteTargetStudent.studentCode}</strong>) khỏi lớp và sổ điểm không?
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTargetStudent(null)}
              className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteSingleStudent}
              className="min-h-[48px] rounded-[8px] bg-[#B91C1C] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-xs hover:bg-red-800"
            >
              Xóa học sinh
            </button>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL B4: Xác nhận xóa nhiều học sinh đã chọn */}
      {showBulkDeleteModal && selectedIds.length > 0 && (
        <SmartboardViewport
          isModal
          title={`Xác nhận xóa ${selectedIds.length} học sinh đã chọn`}
          onCloseModal={() => setShowBulkDeleteModal(false)}
          maxWidthClass="max-w-md"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#FEE2E2] text-[#B91C1C]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-[#334155] dark:text-slate-300">
              Thao tác này sẽ xóa toàn bộ {selectedIds.length} học sinh đang chọn khỏi lớp{' '}
              <strong className="text-[#0F172A] dark:text-white">{activeClass?.name}</strong> (đồng thời dọn dữ liệu trong Sổ điểm II.2) và tự động đánh lại STT.
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(false)}
              className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkDelete}
              className="min-h-[48px] rounded-[8px] bg-[#B91C1C] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-xs hover:bg-red-800"
            >
              Xác nhận xóa ({selectedIds.length})
            </button>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL C: THẺ SƠ YẾU LÝ LỊCH HỌC SINH CHI TIẾT */}
      {profileStudent && profileStats && editDraft && activeClass && (
        <SmartboardViewport
          isModal
          title={profileStudent.fullName}
          subtitle={`Lớp ${activeClass.name} · Mã HS: ${profileStudent.studentCode} · Học lực: ${profileStudent.academicRank}`}
          onCloseModal={() => setProfileStudentId(null)}
          maxWidthClass="max-w-3xl"
          headerActions={
            <button
              type="button"
              onClick={() => {
                setProfileStudentId(null);
                onStartQuizForStudent(profileStudent, activeClass);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0F594F]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Vào làm bài ngay
            </button>
          }
        >
          <div className="space-y-4">
            {/* Student Summary Banner */}
            <div className="flex flex-wrap items-center gap-4 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="relative">
                {editDraft.avatarUrl ? (
                  <img
                    src={editDraft.avatarUrl}
                    alt={profileStudent.fullName}
                    referrerPolicy="no-referrer"
                    className="h-16 w-16 rounded-[8px] border-2 border-[#136F63]/40 object-cover shadow-xs"
                  />
                ) : (
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-[8px] bg-gradient-to-br text-xl font-bold text-white shadow-xs ${getStudentAvatarGradient(
                      profileStudent.id
                    )}`}
                  >
                    {getStudentInitials(profileStudent.fullName)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  title="Đổi ảnh đại diện học sinh"
                  className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#136F63] shadow-xs hover:bg-[#F8FAFC]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[6px] bg-[#136F63] px-2 py-0.5 text-[11px] font-semibold text-white">
                    Lớp {activeClass.name}
                  </span>
                  <span
                    className={`rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold ${RANK_STYLE[profileStudent.academicRank]}`}
                  >
                    Học lực: {profileStudent.academicRank}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-[#64748B] tabular-nums dark:text-slate-300">
                  <span>Mã HS: <strong className="text-[#0F172A] dark:text-white">{profileStudent.studentCode}</strong></span>
                  <span>·</span>
                  <span>Điểm TB: <strong className="text-[#B91C1C]">{profileStats.finalAvgScore !== null ? profileStats.finalAvgScore.toFixed(2).replace('.', ',') : 'Chưa có'}</strong></span>
                  <span>·</span>
                  <span>Điểm cộng: <strong className="text-[#15803D]">+{profileStats.bonusTotal}</strong></span>
                  <span>·</span>
                  <span>{profileStats.totalActivities} lượt trả bài</span>
                </div>
              </div>
            </div>

            {/* Sơ yếu lý lịch Block */}
            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold tracking-wide text-[#136F63] uppercase dark:text-teal-300">
                  Thông tin Sơ yếu lý lịch &amp; Nhận xét Giáo viên
                </div>
                <div className="flex items-center gap-1.5">
                  {!editingProfile ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDraft({ ...profileStudent });
                        setEditingProfile(true);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Pencil className="h-3 w-3 text-[#136F63]" />
                      Sửa thông tin
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingProfile(false)}
                        className="min-h-[36px] rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155]"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfileEdits}
                        className="min-h-[36px] rounded-[8px] bg-[#136F63] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F594F]"
                      >
                        Lưu hồ sơ
                      </button>
                    </>
                  )}
                  {!confirmDeleteStudent ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteStudent(true)}
                      title="Xóa học sinh khỏi lớp"
                      className="inline-flex min-h-[36px] items-center justify-center rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-200/70"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-[8px] border border-[#FECACA] bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-bold text-[#B91C1C]">
                      Xóa em này?
                      <button
                        type="button"
                        onClick={handleDeleteProfileStudent}
                        className="rounded bg-[#B91C1C] px-2 py-0.5 text-white"
                      >
                        Xác nhận
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStudent(false)}
                        className="rounded border border-[#CBD5E1] bg-white px-2 py-0.5 text-[#334155]"
                      >
                        Không
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {!editingProfile ? (
                <div className="grid grid-cols-1 gap-3 text-xs text-[#334155] sm:grid-cols-2 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-[#136F63]" />
                    <span>
                      Ngày sinh: <strong>{profileStudent.dob}</strong> · Giới tính:{' '}
                      <strong>{profileStudent.gender}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-[#136F63]" />
                    <span>
                      SĐT Học sinh: <strong>{profileStudent.phone || 'Chưa cập nhật'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 shrink-0 text-[#136F63]" />
                    <span>
                      Phụ huynh: <strong>{profileStudent.parentName || '—'}</strong> (
                      <strong>{profileStudent.parentPhone || '—'}</strong>)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-[#136F63]" />
                    <span>
                      Phân loại học lực: <strong>{profileStudent.academicRank}</strong>
                    </span>
                  </div>
                  <div className="sm:col-span-2 rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-xs leading-relaxed text-[#334155] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <span className="font-semibold text-[#0F172A] dark:text-white">
                      Ghi chú nhận xét của GV:{' '}
                    </span>
                    {profileStudent.teacherNotes || 'Chưa có ghi chú nhận xét.'}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-semibold">Họ và tên</label>
                    <input
                      value={editDraft.fullName}
                      onChange={(e) => setEditDraft({ ...editDraft, fullName: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">Mã học sinh</label>
                    <input
                      value={editDraft.studentCode}
                      onChange={(e) => setEditDraft({ ...editDraft, studentCode: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">Ngày sinh</label>
                    <input
                      value={editDraft.dob}
                      onChange={(e) => setEditDraft({ ...editDraft, dob: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">Giới tính</label>
                    <select
                      value={editDraft.gender}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, gender: e.target.value as 'Nam' | 'Nữ' })
                      }
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">SĐT Học sinh</label>
                    <input
                      value={editDraft.phone}
                      onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">Học lực</label>
                    <select
                      value={editDraft.academicRank}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          academicRank: e.target.value as AcademicRank,
                        })
                      }
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="Tốt">Tốt</option>
                      <option value="Khá">Khá</option>
                      <option value="Đạt">Đạt</option>
                      <option value="Chưa đạt">Chưa đạt</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">Họ tên Phụ huynh</label>
                    <input
                      value={editDraft.parentName}
                      onChange={(e) => setEditDraft({ ...editDraft, parentName: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold">SĐT Phụ huynh</label>
                    <input
                      value={editDraft.parentPhone}
                      onChange={(e) => setEditDraft({ ...editDraft, parentPhone: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block font-semibold">Ghi chú nhận xét của GV</label>
                    <textarea
                      rows={2}
                      value={editDraft.teacherNotes}
                      onChange={(e) => setEditDraft({ ...editDraft, teacherNotes: e.target.value })}
                      className="w-full rounded-[8px] border border-[#CBD5E1] bg-white p-2.5 outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Oral / Bonus Entry */}
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  <Award className="h-4 w-4 text-[#136F63]" />
                  Nhập điểm miệng / Điểm cộng phát biểu trực tiếp
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScoreMode('oral')}
                    className={`min-h-[36px] rounded-[8px] px-3 py-1.5 text-xs font-semibold ${
                      scoreMode === 'oral'
                        ? 'bg-[#136F63] text-white'
                        : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Điểm miệng (0–10)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoreMode('bonus')}
                    className={`min-h-[36px] rounded-[8px] px-3 py-1.5 text-xs font-semibold ${
                      scoreMode === 'bonus'
                        ? 'bg-[#136F63] text-white'
                        : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Điểm cộng phát biểu
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={scoreNote}
                  onChange={(e) => setScoreNote(e.target.value)}
                  placeholder="Nội dung / Nhận xét (tùy chọn)..."
                  className="h-12 min-w-[200px] flex-1 rounded-[8px] border border-[#CBD5E1] px-3 text-xs outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                />
                {scoreMode === 'oral' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.25}
                      value={scoreValue}
                      onChange={(e) => setScoreValue(e.target.value)}
                      className="h-12 w-20 rounded-[8px] border border-[#CBD5E1] px-2.5 text-center text-sm font-bold tabular-nums outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddScoreInProfile()}
                      className="min-h-[48px] rounded-[8px] bg-[#136F63] px-4 text-xs font-semibold text-white hover:bg-[#0F594F]"
                    >
                      Lưu điểm miệng
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {[0.5, 1, 2].map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => handleAddScoreInProfile(pts)}
                        className="inline-flex min-h-[48px] items-center gap-1 rounded-[8px] bg-[#136F63] px-3.5 text-xs font-semibold text-white tabular-nums hover:bg-[#0F594F]"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />+{pts}đ
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lịch sử các lần lên bảng / làm bài */}
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 text-xs font-semibold tracking-wide text-[#136F63] uppercase dark:text-teal-300">
                Bảng lịch sử các lần lên bảng &amp; làm bài ({profileStudent.attempts.length} lượt)
              </div>

              {profileStudent.attempts.length > 0 ? (
                <div className="space-y-2">
                  {profileStudent.attempts.map((att) => {
                    const isExpanded = expandedAttemptId === att.id;
                    return (
                      <div
                        key={att.id}
                        className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs dark:border-slate-800 dark:bg-slate-900/70"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-[6px] px-2 py-0.5 text-[11px] font-semibold ${
                                  att.type === 'quiz'
                                    ? 'bg-[#E0F2FE] text-[#0369A1]'
                                    : att.type === 'oral'
                                    ? 'bg-[#FEF3C7] text-[#B45309]'
                                    : 'bg-[#DCFCE7] text-[#15803D]'
                                }`}
                              >
                                {att.type === 'quiz'
                                  ? 'Làm bài trên App'
                                  : att.type === 'oral'
                                  ? 'Trả bài miệng'
                                  : 'Điểm cộng'}
                              </span>
                              <span className="font-semibold text-[#0F172A] dark:text-white">
                                {att.title}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-[#64748B] tabular-nums dark:text-slate-400">
                              {new Date(att.createdAt).toLocaleString('vi-VN')}
                              {att.correctCount !== undefined && att.totalQuestions !== undefined && (
                                <> · Đúng {att.correctCount}/{att.totalQuestions} câu</>
                              )}
                              {att.note && <> · {att.note}</>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-base font-bold tabular-nums ${
                                att.type === 'bonus'
                                  ? 'text-[#15803D]'
                                  : att.score >= 8
                                  ? 'text-[#15803D]'
                                  : att.score >= 5
                                  ? 'text-[#136F63]'
                                  : 'text-[#B91C1C]'
                              }`}
                            >
                              {att.type === 'bonus'
                                ? `+${att.score}đ`
                                : `${att.score.toFixed(2).replace('.', ',')}đ`}
                            </span>

                            {att.details && att.details.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAttemptId(isExpanded ? null : att.id)
                                }
                                className="inline-flex items-center gap-0.5 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#136F63]"
                              >
                                Chi tiết
                                <ChevronDown
                                  className={`h-3 w-3 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveAttempt(att.id)}
                              title="Xóa lượt ghi nhận này"
                              className="rounded-[8px] p-1.5 text-[#64748B] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {isExpanded && att.details && (
                          <div className="mt-2.5 grid grid-cols-1 gap-1.5 border-t border-[#E2E8F0] pt-2.5 sm:grid-cols-2 dark:border-slate-700">
                            {att.details.map((d, i) => (
                              <div
                                key={i}
                                className={`flex items-center justify-between rounded-[8px] border px-2.5 py-1.5 text-[11px] ${
                                  d.isCorrect
                                    ? 'border-[#BBF7D0] bg-[#DCFCE7]/70 text-[#15803D]'
                                    : 'border-[#FECACA] bg-[#FEE2E2]/70 text-[#B91C1C]'
                                }`}
                              >
                                <span>
                                  <strong>
                                    {d.partLabel} - C{d.questionNumber}
                                  </strong>{' '}
                                  {d.tag}
                                </span>
                                <span className="font-semibold tabular-nums">
                                  HS: {d.studentAnswer} | ĐA: {d.correctAnswer}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-[#CBD5E1] py-6 text-center text-xs text-[#64748B]">
                  Học sinh này chưa có lịch sử làm bài hoặc phát biểu. Nhấn <strong>Vào làm bài ngay</strong> để kiểm tra trực tiếp!
                </div>
              )}
            </div>
          </div>
        </SmartboardViewport>
      )}
    </div>
  );
};
