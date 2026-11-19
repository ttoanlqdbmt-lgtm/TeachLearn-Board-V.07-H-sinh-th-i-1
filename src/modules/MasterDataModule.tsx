import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FolderCog,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { SmartboardViewport } from '../components/SmartboardViewport';
import {
  ClassSubjectAssignment,
  MasterClassCatalogItem,
  MasterDataStore,
  ModuleId,
  SchoolYearRecord,
  TeacherRecord,
  TeacherRole,
} from '../types/eduplan';
import {
  ASSIGNMENT_SUBJECTS,
  DEPARTMENT_GROUPS,
  downloadTeacherTemplateExcel,
  exportAssignmentsExcel,
  exportClassCatalogExcel,
  exportTeachersExcel,
  formatTeacherHonorific,
  importClassCatalogExcel,
  parseTeachersFromExcel,
  parseTeachersQuickPaste,
  promoteClassesToNextYear,
  suggestNextTeacherCode,
} from '../utils/masterDataDb';

export type MasterDataTab = 'years_classes' | 'teachers' | 'assignments';

interface MasterDataModuleProps {
  activeTab: MasterDataTab;
  onSelectModule?: (id: ModuleId) => void;
  masterData: MasterDataStore;
  onUpdateMasterData: (next: MasterDataStore) => Promise<void> | void;
}

function normSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export const MasterDataModule: React.FC<MasterDataModuleProps> = ({
  activeTab,
  onSelectModule,
  masterData,
  onUpdateMasterData,
}) => {
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Profile editor state synced to masterData.profile
  const [deptName, setDeptName] = useState(masterData.profile.departmentName);
  const [schoolName, setSchoolName] = useState(masterData.profile.schoolName);
  const [activeYearId, setActiveYearId] = useState(masterData.profile.activeSchoolYearId);
  const [activeDeptGroup, setActiveDeptGroup] = useState(masterData.profile.activeDepartmentGroup);
  const [activeTeacherId, setActiveTeacherId] = useState(masterData.profile.activeTeacherId);
  const [defaultSubject, setDefaultSubject] = useState(masterData.profile.defaultSubject);

  // Sync local profile inputs if masterData changes externally
  React.useEffect(() => {
    setDeptName(masterData.profile.departmentName);
    setSchoolName(masterData.profile.schoolName);
    setActiveYearId(masterData.profile.activeSchoolYearId);
    setActiveDeptGroup(masterData.profile.activeDepartmentGroup);
    setActiveTeacherId(masterData.profile.activeTeacherId);
    setDefaultSubject(masterData.profile.defaultSubject);
  }, [masterData.profile]);

  // Tab A: School Years & Class Catalog
  const [selectedYearId, setSelectedYearId] = useState<string>(
    masterData.profile.activeSchoolYearId || masterData.schoolYears[0]?.id || ''
  );
  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [classSearch, setClassSearch] = useState('');

  // Year Modal
  const [showYearModal, setShowYearModal] = useState(false);
  const [editingYear, setEditingYear] = useState<SchoolYearRecord | null>(null);
  const [yearLabelInput, setYearLabelInput] = useState('');
  const [yearStartInput, setYearStartInput] = useState('05/09/2027');
  const [yearEndInput, setYearEndInput] = useState('25/05/2028');
  const [yearCurrentInput, setYearCurrentInput] = useState(false);

  // Promote Year Modal
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteSourceId, setPromoteSourceId] = useState(selectedYearId);
  const [promoteTargetId, setPromoteTargetId] = useState('');

  // Class Catalog Modal
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<MasterClassCatalogItem | null>(null);
  const [catGrade, setCatGrade] = useState<'10' | '11' | '12'>('12');
  const [catName, setCatName] = useState('');
  const [catSize, setCatSize] = useState('42');
  const [catRoom, setCatRoom] = useState('');
  const [catNotes, setCatNotes] = useState('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  // Tab B: Teachers
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherDeptFilter, setTeacherDeptFilter] = useState('all');
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherModalTab, setTeacherModalTab] = useState<'single' | 'paste'>('single');
  const [editingTeacher, setEditingTeacher] = useState<TeacherRecord | null>(null);
  const [gvCode, setGvCode] = useState('');
  const [gvName, setGvName] = useState('');
  const [gvGender, setGvGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [gvDept, setGvDept] = useState('Toán');
  const [gvSubject, setGvSubject] = useState('Toán');
  const [gvRole, setGvRole] = useState<TeacherRole>('Giáo viên');
  const [gvPhone, setGvPhone] = useState('');
  const [gvEmail, setGvEmail] = useState('');
  const [gvPasteRaw, setGvPasteRaw] = useState('');
  const [confirmDeleteTeacherId, setConfirmDeleteTeacherId] = useState<string | null>(null);

  // Tab C: Assignments
  const [asgGradeFilter, setAsgGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [asgSubjectFocus, setAsgSubjectFocus] = useState<string>('all');

  const classExcelInputRef = useRef<HTMLInputElement | null>(null);
  const teacherExcelInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (
      selectedYearId &&
      !masterData.schoolYears.some((y) => y.id === selectedYearId) &&
      masterData.schoolYears[0]
    ) {
      setSelectedYearId(masterData.schoolYears[0].id);
    }
  }, [masterData.schoolYears, selectedYearId]);

  const handleSaveProfile = async () => {
    const chosenTeacher = masterData.teachers.find((t) => t.id === activeTeacherId);
    const nextYears = masterData.schoolYears.map((y) => ({
      ...y,
      isCurrent: y.id === activeYearId,
    }));
    const nextStore: MasterDataStore = {
      ...masterData,
      schoolYears: nextYears,
      profile: {
        departmentName: deptName.trim() || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
        schoolName: schoolName.trim() || 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
        activeSchoolYearId: activeYearId,
        activeDepartmentGroup: activeDeptGroup,
        activeTeacherId,
        activeTeacherName: chosenTeacher?.fullName || masterData.profile.activeTeacherName,
        defaultSubject,
      },
    };
    await onUpdateMasterData(nextStore);
    setStatusBanner(
      `Đã lưu & đồng bộ cấu hình (${nextStore.profile.schoolName} · ${formatTeacherHonorific(
        chosenTeacher,
        nextStore.profile.activeTeacherName
      )} · Môn ${defaultSubject}) tới Đề thi, Word (.docx) và Sổ điểm.`
    );
  };

  // --- TAB A LOGIC ---
  const filteredCatalog = useMemo(() => {
    const q = normSearch(classSearch);
    return masterData.classCatalog
      .filter((c) => c.schoolYearId === selectedYearId)
      .filter((c) => (gradeFilter === 'all' ? true : c.grade === gradeFilter))
      .filter((c) => {
        if (!q) return true;
        return (
          normSearch(c.name).includes(q) ||
          normSearch(c.room || '').includes(q) ||
          normSearch(c.notes || '').includes(q)
        );
      })
      .sort((a, b) => a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name));
  }, [masterData.classCatalog, selectedYearId, gradeFilter, classSearch]);

  const handleOpenAddYear = () => {
    setEditingYear(null);
    setYearLabelInput('2027–2028');
    setYearStartInput('05/09/2027');
    setYearEndInput('25/05/2028');
    setYearCurrentInput(false);
    setShowYearModal(true);
  };

  const handleOpenEditYear = (sy: SchoolYearRecord) => {
    setEditingYear(sy);
    setYearLabelInput(sy.label);
    setYearStartInput(sy.startDate || '');
    setYearEndInput(sy.endDate || '');
    setYearCurrentInput(sy.isCurrent);
    setShowYearModal(true);
  };

  const handleSaveYear = async () => {
    const cleanLabel = yearLabelInput.trim();
    if (!cleanLabel) return;
    let nextYears: SchoolYearRecord[];
    let nextActiveYearId = masterData.profile.activeSchoolYearId;

    if (editingYear) {
      nextYears = masterData.schoolYears.map((y) => {
        if (y.id === editingYear.id) {
          return {
            ...y,
            label: cleanLabel,
            startDate: yearStartInput.trim(),
            endDate: yearEndInput.trim(),
            isCurrent: yearCurrentInput,
          };
        }
        return yearCurrentInput ? { ...y, isCurrent: false } : y;
      });
      if (yearCurrentInput) nextActiveYearId = editingYear.id;
    } else {
      const newId = `sy-${Date.now()}`;
      const newRec: SchoolYearRecord = {
        id: newId,
        label: cleanLabel,
        isCurrent: yearCurrentInput,
        startDate: yearStartInput.trim(),
        endDate: yearEndInput.trim(),
      };
      nextYears = yearCurrentInput
        ? [...masterData.schoolYears.map((y) => ({ ...y, isCurrent: false })), newRec]
        : [...masterData.schoolYears, newRec];
      if (yearCurrentInput) nextActiveYearId = newId;
      setSelectedYearId(newId);
    }

    await onUpdateMasterData({
      ...masterData,
      schoolYears: nextYears,
      profile: {
        ...masterData.profile,
        activeSchoolYearId: nextActiveYearId,
      },
    });
    setShowYearModal(false);
    setStatusBanner(`Đã lưu năm học ${cleanLabel}.`);
  };

  const handleSetCurrentYear = async (yearId: string) => {
    const nextYears = masterData.schoolYears.map((y) => ({
      ...y,
      isCurrent: y.id === yearId,
    }));
    const target = nextYears.find((y) => y.id === yearId);
    setSelectedYearId(yearId);
    await onUpdateMasterData({
      ...masterData,
      schoolYears: nextYears,
      profile: {
        ...masterData.profile,
        activeSchoolYearId: yearId,
      },
    });
    setStatusBanner(`Đã đặt năm học ${target?.label || ''} làm Năm học hiện hành.`);
  };

  const handleOpenPromoteModal = () => {
    setPromoteSourceId(selectedYearId);
    const otherYear = masterData.schoolYears.find((y) => y.id !== selectedYearId);
    setPromoteTargetId(otherYear?.id || '');
    setShowPromoteModal(true);
  };

  const handleRunPromote = async () => {
    if (!promoteSourceId || !promoteTargetId || promoteSourceId === promoteTargetId) return;
    const { nextStore, promotedCount, skippedCount } = promoteClassesToNextYear(
      masterData,
      promoteSourceId,
      promoteTargetId
    );
    if (promotedCount > 0) {
      await onUpdateMasterData(nextStore);
      setSelectedYearId(promoteTargetId);
    }
    setShowPromoteModal(false);
    const srcLabel = masterData.schoolYears.find((y) => y.id === promoteSourceId)?.label || '';
    const dstLabel = masterData.schoolYears.find((y) => y.id === promoteTargetId)?.label || '';
    setStatusBanner(
      promotedCount > 0
        ? `Đã đôn ${promotedCount} lớp (Khối 10→11, Khối 11→12) từ ${srcLabel} sang ${dstLabel}${
            skippedCount > 0 ? ` (bỏ qua ${skippedCount} lớp đã tồn tại)` : ''
          }.`
        : `Không có lớp Khối 10/11 mới nào cần đôn từ ${srcLabel} sang ${dstLabel}.`
    );
  };

  const handleOpenAddCatalog = () => {
    setEditingCatalog(null);
    setCatGrade('12');
    setCatName('');
    setCatSize('42');
    setCatRoom('');
    setCatNotes('');
    setShowCatalogModal(true);
  };

  const handleOpenEditCatalog = (item: MasterClassCatalogItem) => {
    setEditingCatalog(item);
    setCatGrade(item.grade);
    setCatName(item.name);
    setCatSize(String(item.plannedSize));
    setCatRoom(item.room || '');
    setCatNotes(item.notes || '');
    setShowCatalogModal(true);
  };

  const handleSaveCatalog = async () => {
    const cleanName = catName.trim().toUpperCase();
    if (!cleanName) return;
    const plannedSize = Math.max(1, parseInt(catSize, 10) || 42);

    let nextCatalog: MasterClassCatalogItem[];
    let nextAssignments = [...masterData.assignments];

    if (editingCatalog) {
      nextCatalog = masterData.classCatalog.map((c) =>
        c.id === editingCatalog.id
          ? {
              ...c,
              grade: catGrade,
              name: cleanName,
              plannedSize,
              room: catRoom.trim(),
              notes: catNotes.trim(),
            }
          : c
      );
      nextAssignments = nextAssignments.map((a) =>
        a.classCatalogId === editingCatalog.id
          ? { ...a, className: cleanName, grade: catGrade }
          : a
      );
    } else {
      const newId = `cat-${Date.now()}`;
      const newItem: MasterClassCatalogItem = {
        id: newId,
        schoolYearId: selectedYearId,
        grade: catGrade,
        name: cleanName,
        plannedSize,
        room: catRoom.trim(),
        notes: catNotes.trim(),
      };
      nextCatalog = [...masterData.classCatalog, newItem];
      nextAssignments.push({
        id: `asg-${Date.now()}`,
        schoolYearId: selectedYearId,
        classCatalogId: newId,
        className: cleanName,
        grade: catGrade,
        homeroomTeacherId: masterData.teachers[0]?.id || '',
        subjectTeachers: {},
      });
    }

    await onUpdateMasterData({
      ...masterData,
      classCatalog: nextCatalog,
      assignments: nextAssignments,
    });
    setShowCatalogModal(false);
    setStatusBanner(`Đã lưu lớp ${cleanName} (Khối ${catGrade}) vào Danh mục lớp.`);
  };

  const handleDeleteCatalog = async (catId: string) => {
    const target = masterData.classCatalog.find((c) => c.id === catId);
    await onUpdateMasterData({
      ...masterData,
      classCatalog: masterData.classCatalog.filter((c) => c.id !== catId),
      assignments: masterData.assignments.filter((a) => a.classCatalogId !== catId),
    });
    setConfirmDeleteCatId(null);
    if (target) setStatusBanner(`Đã xóa lớp ${target.name} khỏi danh mục.`);
  };

  const handleImportClassCatalogExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const imported = await importClassCatalogExcel(file, selectedYearId, masterData.classCatalog);
    if (imported.length === 0) {
      setStatusBanner('Không tìm thấy lớp mới hợp lệ trong file Excel (cần cột "Tên lớp", "Khối").');
      return;
    }
    const newAsgs: ClassSubjectAssignment[] = imported.map((item, idx) => ({
      id: `asg-xl-${Date.now()}-${idx}`,
      schoolYearId: selectedYearId,
      classCatalogId: item.id,
      className: item.name,
      grade: item.grade,
      homeroomTeacherId: '',
      subjectTeachers: {},
    }));
    await onUpdateMasterData({
      ...masterData,
      classCatalog: [...masterData.classCatalog, ...imported],
      assignments: [...masterData.assignments, ...newAsgs],
    });
    setStatusBanner(`Đã nhập ${imported.length} lớp học mới từ "${file.name}".`);
  };

  // --- TAB B LOGIC (TEACHERS) ---
  const filteredTeachers = useMemo(() => {
    const q = normSearch(teacherSearch);
    return masterData.teachers
      .filter((t) => (teacherDeptFilter === 'all' ? true : t.departmentGroup === teacherDeptFilter))
      .filter((t) => {
        if (!q) return true;
        return (
          normSearch(t.fullName).includes(q) ||
          normSearch(t.teacherCode).includes(q) ||
          normSearch(t.departmentGroup).includes(q) ||
          normSearch(t.phone).includes(q) ||
          normSearch(t.email).includes(q)
        );
      });
  }, [masterData.teachers, teacherSearch, teacherDeptFilter]);

  const parsedPasteTeachers = useMemo(() => {
    if (!gvPasteRaw.trim()) return [];
    return parseTeachersQuickPaste(gvPasteRaw, masterData.teachers);
  }, [gvPasteRaw, masterData.teachers]);

  const handleOpenAddTeacher = () => {
    setEditingTeacher(null);
    setTeacherModalTab('single');
    setGvCode(suggestNextTeacherCode(masterData.teachers));
    setGvName('');
    setGvGender('Nam');
    setGvDept(activeDeptGroup || 'Toán');
    setGvSubject(activeDeptGroup || 'Toán');
    setGvRole('Giáo viên');
    setGvPhone('');
    setGvEmail('');
    setGvPasteRaw('');
    setShowTeacherModal(true);
  };

  const handleOpenEditTeacher = (t: TeacherRecord) => {
    setEditingTeacher(t);
    setTeacherModalTab('single');
    setGvCode(t.teacherCode);
    setGvName(t.fullName);
    setGvGender(t.gender);
    setGvDept(t.departmentGroup);
    setGvSubject(t.mainSubject);
    setGvRole(t.role);
    setGvPhone(t.phone);
    setGvEmail(t.email);
    setShowTeacherModal(true);
  };

  const handleSaveTeacher = async () => {
    const cleanName = gvName.trim();
    if (!cleanName) return;
    let nextTeachers: TeacherRecord[];
    let nextProfile = { ...masterData.profile };

    if (editingTeacher) {
      nextTeachers = masterData.teachers.map((t) =>
        t.id === editingTeacher.id
          ? {
              ...t,
              teacherCode: gvCode.trim() || t.teacherCode,
              fullName: cleanName,
              gender: gvGender,
              departmentGroup: gvDept,
              mainSubject: gvSubject.trim() || gvDept,
              role: gvRole,
              phone: gvPhone.trim(),
              email: gvEmail.trim(),
            }
          : t
      );
      if (nextProfile.activeTeacherId === editingTeacher.id) {
        nextProfile.activeTeacherName = cleanName;
        nextProfile.activeDepartmentGroup = gvDept;
      }
    } else {
      const newTeacher: TeacherRecord = {
        id: `gv-${Date.now()}`,
        teacherCode: gvCode.trim() || suggestNextTeacherCode(masterData.teachers),
        fullName: cleanName,
        gender: gvGender,
        departmentGroup: gvDept,
        mainSubject: gvSubject.trim() || gvDept,
        role: gvRole,
        phone: gvPhone.trim(),
        email: gvEmail.trim(),
      };
      nextTeachers = [...masterData.teachers, newTeacher];
    }

    await onUpdateMasterData({
      ...masterData,
      teachers: nextTeachers,
      profile: nextProfile,
    });
    setShowTeacherModal(false);
    setStatusBanner(`Đã lưu thông tin giáo viên ${cleanName} (Tổ ${gvDept}).`);
  };

  const handleSavePasteTeachers = async () => {
    if (parsedPasteTeachers.length === 0) return;
    await onUpdateMasterData({
      ...masterData,
      teachers: [...masterData.teachers, ...parsedPasteTeachers],
    });
    setShowTeacherModal(false);
    setGvPasteRaw('');
    setStatusBanner(`Đã thêm nhanh ${parsedPasteTeachers.length} giáo viên vào danh sách.`);
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    const target = masterData.teachers.find((t) => t.id === teacherId);
    const nextTeachers = masterData.teachers.filter((t) => t.id !== teacherId);
    const nextAssignments = masterData.assignments.map((a) => {
      const cleanedSubs: Record<string, string> = {};
      Object.entries(a.subjectTeachers).forEach(([sub, tid]) => {
        if (tid !== teacherId) cleanedSubs[sub] = tid;
      });
      return {
        ...a,
        homeroomTeacherId: a.homeroomTeacherId === teacherId ? '' : a.homeroomTeacherId,
        subjectTeachers: cleanedSubs,
      };
    });
    await onUpdateMasterData({
      ...masterData,
      teachers: nextTeachers,
      assignments: nextAssignments,
    });
    setConfirmDeleteTeacherId(null);
    if (target) setStatusBanner(`Đã xóa giáo viên ${target.fullName}.`);
  };

  const handleImportTeachersExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const imported = await parseTeachersFromExcel(file, masterData.teachers);
    if (imported.length === 0) {
      setStatusBanner('Không tìm thấy cột "Họ và tên" hợp lệ trong file Excel.');
      return;
    }
    await onUpdateMasterData({
      ...masterData,
      teachers: [...masterData.teachers, ...imported],
    });
    setStatusBanner(`Đã nhập ${imported.length} giáo viên từ "${file.name}".`);
  };

  const handleSwitchActiveTeacher = async (t: TeacherRecord) => {
    const nextStore: MasterDataStore = {
      ...masterData,
      profile: {
        ...masterData.profile,
        activeTeacherId: t.id,
        activeTeacherName: t.fullName,
        activeDepartmentGroup: t.departmentGroup,
        defaultSubject: t.mainSubject || t.departmentGroup,
      },
    };
    await onUpdateMasterData(nextStore);
    setStatusBanner(
      `Đã chuyển giáo viên thao tác thành ${formatTeacherHonorific(t)} (Tổ ${t.departmentGroup} · Môn ${t.mainSubject}).`
    );
  };

  // --- TAB C LOGIC (ASSIGNMENTS) ---
  const yearCatalogForAssignments = useMemo(() => {
    return masterData.classCatalog
      .filter((c) => c.schoolYearId === selectedYearId)
      .filter((c) => (asgGradeFilter === 'all' ? true : c.grade === asgGradeFilter))
      .sort((a, b) => a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name));
  }, [masterData.classCatalog, selectedYearId, asgGradeFilter]);

  const visibleAssignmentSubjects = useMemo(() => {
    if (asgSubjectFocus === 'all') return ASSIGNMENT_SUBJECTS;
    return ASSIGNMENT_SUBJECTS.filter((s) => s === asgSubjectFocus);
  }, [asgSubjectFocus]);

  const getAssignmentForCatalog = (cat: MasterClassCatalogItem): ClassSubjectAssignment => {
    const existing = masterData.assignments.find(
      (a) => a.schoolYearId === selectedYearId && a.classCatalogId === cat.id
    );
    if (existing) return existing;
    return {
      id: `asg-${selectedYearId}-${cat.id}`,
      schoolYearId: selectedYearId,
      classCatalogId: cat.id,
      className: cat.name,
      grade: cat.grade,
      homeroomTeacherId: '',
      subjectTeachers: {},
    };
  };

  const handleUpdateAssignmentField = async (
    cat: MasterClassCatalogItem,
    field: { type: 'gvcn'; teacherId: string } | { type: 'subject'; subject: string; teacherId: string }
  ) => {
    const currentAsg = getAssignmentForCatalog(cat);
    const updatedAsg: ClassSubjectAssignment =
      field.type === 'gvcn'
        ? { ...currentAsg, homeroomTeacherId: field.teacherId }
        : {
            ...currentAsg,
            subjectTeachers: {
              ...currentAsg.subjectTeachers,
              [field.subject]: field.teacherId,
            },
          };

    const exists = masterData.assignments.some((a) => a.id === updatedAsg.id);
    const nextAssignments = exists
      ? masterData.assignments.map((a) => (a.id === updatedAsg.id ? updatedAsg : a))
      : [...masterData.assignments, updatedAsg];

    await onUpdateMasterData({
      ...masterData,
      assignments: nextAssignments,
    });
  };

  const activeTeacherRecord = masterData.teachers.find((t) => t.id === activeTeacherId);

  return (
    <div className="space-y-4">
      <input
        ref={classExcelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportClassCatalogExcel}
        className="hidden"
      />
      <input
        ref={teacherExcelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportTeachersExcel}
        className="hidden"
      />

      {/* 1. Hồ sơ Trường học & Giáo viên đang soạn giảng (Liên thông toàn app) */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="btn-glossy-3d-active flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-white">
              <Building2 className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-[#0F172A] dark:text-slate-100">
                Hồ sơ Trường học &amp; Ngữ cảnh Soạn giảng Mặc định
              </h2>
              <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                Tự động điền vào Tiêu đề Đề thi, Phiếu học tập, File Word (.docx) và Sổ điểm SMAS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            className="btn-glossy-3d-active inline-flex h-10 items-center gap-1.5 rounded-[8px] px-4 text-[13px] font-medium"
          >
            <CheckCircle2 className="h-4 w-4" />
            Lưu &amp; Đồng bộ toàn App
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Sở / Phòng GD&amp;ĐT
            </label>
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 text-[13.5px] font-medium text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Tên Trường
            </label>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 text-[13.5px] font-medium text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Năm học hiện hành
            </label>
            <select
              value={activeYearId}
              onChange={(e) => {
                setActiveYearId(e.target.value);
                setSelectedYearId(e.target.value);
              }}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[13.5px] font-semibold text-[#136F63] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-[#BAE6FD]"
            >
              {masterData.schoolYears.map((sy) => (
                <option key={sy.id} value={sy.id}>
                  {sy.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Tổ chuyên môn
            </label>
            <select
              value={activeDeptGroup}
              onChange={(e) => setActiveDeptGroup(e.target.value)}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 text-[13.5px] font-medium text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {DEPARTMENT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  Tổ {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Giáo viên soạn giảng
            </label>
            <select
              value={activeTeacherId}
              onChange={(e) => {
                const tid = e.target.value;
                setActiveTeacherId(tid);
                const found = masterData.teachers.find((t) => t.id === tid);
                if (found) {
                  setActiveDeptGroup(found.departmentGroup);
                  setDefaultSubject(found.mainSubject || found.departmentGroup);
                }
              }}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 text-[13.5px] font-semibold text-[#1E293B] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {masterData.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTeacherHonorific(t)} ({t.departmentGroup})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
              Môn mặc định
            </label>
            <select
              value={defaultSubject}
              onChange={(e) => setDefaultSubject(e.target.value)}
              className="h-9 w-full rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 text-[13.5px] font-medium text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {ASSIGNMENT_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub-module Switcher matching II.3.a / II.3.b / II.3.c */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                {
                  id: 'years_classes',
                  moduleId: 'master_years_classes' as ModuleId,
                  label: `II.3.a. Năm học, Khối & Lớp (${masterData.classCatalog.length})`,
                  icon: GraduationCap,
                },
                {
                  id: 'teachers',
                  moduleId: 'master_teachers' as ModuleId,
                  label: `II.3.b. Danh sách giáo viên (${masterData.teachers.length})`,
                  icon: Users,
                },
                {
                  id: 'assignments',
                  moduleId: 'master_assignments' as ModuleId,
                  label: 'II.3.c. Phân công Chuyên môn',
                  icon: FolderCog,
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectModule?.(tab.moduleId)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-all ${
                    isActive ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-300">
            Đang chọn:{' '}
            <strong className="text-[#136F63] dark:text-[#BAE6FD]">
              {formatTeacherHonorific(activeTeacherRecord, masterData.profile.activeTeacherName)}
            </strong>{' '}
            · Tổ {activeDeptGroup}
          </div>
        </div>

        {statusBanner && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] font-medium text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
              {statusBanner}
            </span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Đóng thông báo"
              className="rounded-[6px] p-1 text-[#15803D] hover:bg-emerald-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* TAB 1: NĂM HỌC, KHỐI & DANH MỤC LỚP (II.3.a)                */}
      {/* ============================================================ */}
      {activeTab === 'years_classes' && (
        <div className="space-y-4">
          {/* School Years Strip */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                1. Quản lý Năm học
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPromoteModal}
                  className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#136F63]" />
                  Đôn lớp lên năm học mới
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddYear}
                  className="btn-glossy-3d-active inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  + Thêm năm học
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {masterData.schoolYears.map((sy) => {
                const isSelected = sy.id === selectedYearId;
                const countInYear = masterData.classCatalog.filter(
                  (c) => c.schoolYearId === sy.id
                ).length;
                return (
                  <div
                    key={sy.id}
                    onClick={() => setSelectedYearId(sy.id)}
                    className={`cursor-pointer rounded-[8px] border p-3 transition-all ${
                      isSelected
                        ? 'border-[#136F63] bg-[#F8FAFC] ring-2 ring-[#136F63]/20 dark:border-[#136F63] dark:bg-slate-800/70'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#136F63] dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#0F172A] tabular-nums dark:text-slate-100">
                          {sy.label}
                        </span>
                        {sy.isCurrent && (
                          <span className="rounded-[6px] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-semibold text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300">
                            Hiện hành
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {!sy.isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleSetCurrentYear(sy.id)}
                            className="rounded-[6px] border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-medium text-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
                          >
                            Đặt hiện hành
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditYear(sy)}
                          title="Sửa năm học"
                          className="rounded-[6px] border border-[#CBD5E1] bg-white p-1.5 text-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[12px] text-[#64748B] tabular-nums dark:text-slate-400">
                      <span>{countInYear} lớp đã khai báo</span>
                      <span>
                        {sy.startDate || '—'} → {sy.endDate || '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Class Catalog Table */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                  2. Danh mục Khối &amp; Lớp học (
                  {masterData.schoolYears.find((y) => y.id === selectedYearId)?.label || ''})
                </h3>
                <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-slate-800 dark:bg-slate-900">
                  {(['all', '10', '11', '12'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeFilter(g)}
                      className={`h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-all ${
                        gradeFilter === g
                          ? 'btn-glossy-3d-active'
                          : 'text-[#334155] hover:text-[#136F63] dark:text-slate-300'
                      }`}
                    >
                      {g === 'all' ? 'Tất cả' : `Khối ${g}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
                  <input
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    placeholder="Tìm tên lớp, phòng..."
                    className="h-9 w-44 rounded-[8px] border border-[#E2E8F0] bg-white pr-3 pl-8 text-[13.5px] text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => classExcelInputRef.current?.click()}
                  className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
                >
                  <Upload className="h-3.5 w-3.5 text-[#136F63]" />
                  Nhập Excel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportClassCatalogExcel(
                      masterData.classCatalog.filter((c) => c.schoolYearId === selectedYearId),
                      masterData.schoolYears,
                      schoolName
                    )
                  }
                  className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
                >
                  <Download className="h-3.5 w-3.5 text-[#136F63]" />
                  Xuất Excel
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddCatalog}
                  className="btn-glossy-3d-active inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  + Thêm lớp
                </button>
              </div>
            </div>

            <div className="mt-3.5 overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
              <table className="w-full border-collapse text-[13.5px] tabular-nums">
                <thead className="bg-[#136F63] text-[12.5px] font-semibold text-white">
                  <tr>
                    <th className="w-12 border-b border-[#0F594F] px-2.5 py-2.5 text-center">
                      STT
                    </th>
                    <th className="border-b border-[#0F594F] px-3 py-2.5 text-center">
                      Khối
                    </th>
                    <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                      Tên lớp
                    </th>
                    <th className="border-b border-[#0F594F] px-3 py-2.5 text-center">
                      Sĩ số dự kiến
                    </th>
                    <th className="border-b border-[#0F594F] px-3 py-2.5 text-center">
                      Phòng học
                    </th>
                    <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                      Ghi chú
                    </th>
                    <th className="w-36 border-b border-[#0F594F] px-3 py-2.5 text-center">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-[13.5px] text-[#64748B] dark:text-slate-400"
                      >
                        Chưa có lớp học nào cho bộ lọc hiện tại. Nhấn <strong>+ Thêm lớp</strong> hoặc{' '}
                        <strong>Đôn lớp lên năm học mới</strong>.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((cat, idx) => (
                      <tr
                        key={cat.id}
                        className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                      >
                        <td className="px-2.5 py-2 text-center text-[12px] font-semibold text-[#64748B]">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded-[6px] bg-[#E0F2FE] px-2 py-0.5 text-[12px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                            Khối {cat.grade}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-[#0F172A] dark:text-slate-100">
                          Lớp {cat.name}
                        </td>
                        <td className="px-3 py-2 text-center font-medium text-[#334155] dark:text-slate-200">
                          {cat.plannedSize} HS
                        </td>
                        <td className="px-3 py-2 text-center text-[13px] font-medium text-[#64748B] dark:text-slate-300">
                          {cat.room || '—'}
                        </td>
                        <td className="px-3 py-2 text-[13px] text-[#64748B] dark:text-slate-300">
                          {cat.notes || '—'}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          {confirmDeleteCatId === cat.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteCatalog(cat.id)}
                                className="rounded-[6px] bg-[#FEE2E2] px-2 py-1 text-[11px] font-semibold text-[#B91C1C]"
                              >
                                Xóa
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCatId(null)}
                                className="rounded-[6px] border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-medium text-[#334155]"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditCatalog(cat)}
                                title="Sửa lớp"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCatId(cat.id)}
                                title="Xóa lớp"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: DANH SÁCH GIÁO VIÊN (II.3.b)                           */}
      {/* ============================================================ */}
      {activeTab === 'teachers' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Tìm tên GV, mã GV, tổ chuyên môn, SĐT..."
                  className="h-9 w-64 rounded-[8px] border border-[#E2E8F0] bg-white pr-8 pl-9 text-[13.5px] text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {teacherSearch && (
                  <button
                    type="button"
                    onClick={() => setTeacherSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#136F63]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <select
                value={teacherDeptFilter}
                onChange={(e) => setTeacherDeptFilter(e.target.value)}
                aria-label="Lọc theo tổ chuyên môn"
                className="h-9 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] font-semibold text-[#136F63] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-[#BAE6FD]"
              >
                <option value="all">Tất cả Tổ chuyên môn ({masterData.teachers.length})</option>
                {DEPARTMENT_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    Tổ {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAddTeacher}
                className="btn-glossy-3d-active inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium"
              >
                <UserPlus className="h-3.5 w-3.5" />
                + Thêm giáo viên
              </button>
              <button
                type="button"
                onClick={() => teacherExcelInputRef.current?.click()}
                className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
              >
                <Upload className="h-3.5 w-3.5 text-[#136F63]" />
                Nhập Excel
              </button>
              <button
                type="button"
                onClick={downloadTeacherTemplateExcel}
                className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
              >
                <Download className="h-3.5 w-3.5 text-[#136F63]" />
                Tải mẫu (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => exportTeachersExcel(masterData.teachers, schoolName)}
                className="btn-glossy-3d-inactive inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#136F63]" />
                Xuất Excel
              </button>
            </div>
          </div>

          <div className="mt-3.5 overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
            <table className="w-full border-collapse text-[13.5px] tabular-nums">
              <thead className="bg-[#136F63] text-[12.5px] font-semibold text-white">
                <tr>
                  <th className="w-11 border-b border-[#0F594F] px-2 py-2.5 text-center">
                    STT
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                    Mã GV
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                    Họ và tên
                  </th>
                  <th className="border-b border-[#0F594F] px-2.5 py-2.5 text-center">
                    GT
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                    Tổ chuyên môn
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                    Môn chính
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-center">
                    Chức vụ
                  </th>
                  <th className="border-b border-[#0F594F] px-3 py-2.5 text-left">
                    Liên hệ
                  </th>
                  <th className="w-40 border-b border-[#0F594F] px-2.5 py-2.5 text-center">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {filteredTeachers.map((t, idx) => {
                  const isCurrentUser = t.id === masterData.profile.activeTeacherId;
                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 ${
                        isCurrentUser ? 'bg-[#F8FAFC] dark:bg-slate-800/30' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center text-[12px] font-semibold text-[#64748B]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] font-semibold text-[#0369A1] dark:text-[#BAE6FD]">
                        {t.teacherCode}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#0F172A] dark:text-white">
                            {formatTeacherHonorific(t)}
                          </span>
                          {isCurrentUser && (
                            <span className="rounded-[6px] bg-[#E0F2FE] px-1.5 py-0.5 text-[11px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                              Đang chọn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-center text-[13px] text-[#334155] dark:text-slate-300">
                        {t.gender}
                      </td>
                      <td className="px-3 py-2 text-[13px] font-medium text-[#334155] dark:text-slate-200">
                        Tổ {t.departmentGroup}
                      </td>
                      <td className="px-3 py-2 text-[13px] font-semibold text-[#136F63] dark:text-[#BAE6FD]">
                        {t.mainSubject}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`rounded-[6px] px-2 py-0.5 text-[11px] font-semibold ${
                            t.role === 'Tổ trưởng'
                              ? 'bg-[#FEF3C7] text-[#B45309] ring-1 ring-[#FCD34D]'
                              : t.role === 'Tổ phó'
                              ? 'bg-[#E0F2FE] text-[#0369A1] ring-1 ring-[#BAE6FD]'
                              : 'bg-[#F1F5F9] text-[#334155]'
                          }`}
                        >
                          {t.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12.5px]">
                        <div className="font-medium text-[#334155] dark:text-slate-200">
                          {t.phone || '—'}
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                          {t.email || ''}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {confirmDeleteTeacherId === t.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteTeacher(t.id)}
                              className="rounded-[6px] bg-[#FEE2E2] px-2 py-1 text-[11px] font-semibold text-[#B91C1C]"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeacherId(null)}
                              className="rounded-[6px] border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-medium text-[#334155]"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSwitchActiveTeacher(t)}
                              title="Chọn làm giáo viên đang soạn giảng"
                              className={`inline-flex h-8 items-center gap-1 rounded-[8px] border px-2 text-[11px] font-medium transition-colors ${
                                isCurrentUser
                                  ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                                  : 'border-[#CBD5E1] bg-white text-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]'
                              }`}
                            >
                              <UserCheck className="h-3 w-3" />
                              Chọn
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditTeacher(t)}
                              title="Sửa giáo viên"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeacherId(t.id)}
                              title="Xóa giáo viên"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: PHÂN CÔNG CHUYÊN MÔN (II.3.c)                         */}
      {/* ============================================================ */}
      {activeTab === 'assignments' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                aria-label="Chọn năm học phân công"
                className="h-9 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] font-semibold text-[#136F63] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-[#BAE6FD]"
              >
                {masterData.schoolYears.map((sy) => (
                  <option key={sy.id} value={sy.id}>
                    Năm học {sy.label} {sy.isCurrent ? '(Hiện hành)' : ''}
                  </option>
                ))}
              </select>

              <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-slate-800 dark:bg-slate-900">
                {(['all', '10', '11', '12'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setAsgGradeFilter(g)}
                    className={`h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-all ${
                      asgGradeFilter === g
                        ? 'btn-glossy-3d-active'
                        : 'text-[#334155] hover:text-[#136F63] dark:text-slate-300'
                    }`}
                  >
                    {g === 'all' ? 'Tất cả khối' : `Khối ${g}`}
                  </button>
                ))}
              </div>

              <select
                value={asgSubjectFocus}
                onChange={(e) => setAsgSubjectFocus(e.target.value)}
                aria-label="Lọc môn học hiển thị"
                className="h-9 rounded-[8px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#334155] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">Hiển thị tất cả môn ({ASSIGNMENT_SUBJECTS.length} môn)</option>
                {ASSIGNMENT_SUBJECTS.map((sub) => (
                  <option key={sub} value={sub}>
                    Chỉ môn {sub}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => exportAssignmentsExcel(masterData, selectedYearId)}
              className="btn-glossy-3d-active inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất Phân công (.xlsx)
            </button>
          </div>

          <div className="mt-3.5 overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead className="bg-[#136F63] text-[12px] font-semibold text-white">
                <tr>
                  <th className="sticky left-0 z-10 w-24 border-b border-r border-[#0F594F] bg-[#136F63] px-3 py-2.5 text-left">
                    Lớp
                  </th>
                  <th className="min-w-[170px] border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left">
                    GV Chủ nhiệm (GVCN)
                  </th>
                  {visibleAssignmentSubjects.map((sub) => (
                    <th
                      key={sub}
                      className="min-w-[165px] border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left"
                    >
                      GV {sub}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {yearCatalogForAssignments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + visibleAssignmentSubjects.length}
                      className="px-4 py-8 text-center text-[13.5px] text-[#64748B]"
                    >
                      Năm học này chưa có lớp trong Danh mục. Hãy thêm lớp ở mục II.3.a.
                    </td>
                  </tr>
                ) : (
                  yearCatalogForAssignments.map((cat) => {
                    const asg = getAssignmentForCatalog(cat);
                    return (
                      <tr
                        key={cat.id}
                        className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                      >
                        <td className="sticky left-0 z-10 border-r border-[#E2E8F0] bg-white px-3 py-2 font-semibold text-[#0F172A] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                          <div>Lớp {cat.name}</div>
                          <div className="text-[11px] font-medium text-[#64748B]">
                            Khối {cat.grade}
                          </div>
                        </td>
                        <td className="border-r border-[#E2E8F0] px-2 py-2 dark:border-slate-800">
                          <select
                            value={asg.homeroomTeacherId}
                            onChange={(e) =>
                              handleUpdateAssignmentField(cat, {
                                type: 'gvcn',
                                teacherId: e.target.value,
                              })
                            }
                            className="h-8 w-full rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-[12.5px] font-medium text-[#0F172A] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="">— Chưa phân công —</option>
                            {masterData.teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {formatTeacherHonorific(t)} ({t.departmentGroup})
                              </option>
                            ))}
                          </select>
                        </td>
                        {visibleAssignmentSubjects.map((sub) => {
                          const assignedTid = asg.subjectTeachers[sub] || '';
                          const matchingTeachers = masterData.teachers.filter(
                            (t) => t.mainSubject === sub || t.departmentGroup === sub
                          );
                          const otherTeachers = masterData.teachers.filter(
                            (t) => t.mainSubject !== sub && t.departmentGroup !== sub
                          );
                          return (
                            <td
                              key={sub}
                              className="border-r border-[#E2E8F0] px-2 py-2 dark:border-slate-800"
                            >
                              <select
                                value={assignedTid}
                                onChange={(e) =>
                                  handleUpdateAssignmentField(cat, {
                                    type: 'subject',
                                    subject: sub,
                                    teacherId: e.target.value,
                                  })
                                }
                                className={`h-8 w-full rounded-[8px] border px-2 text-[12.5px] outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800 ${
                                  assignedTid
                                    ? 'border-[#E2E8F0] bg-white font-medium text-[#0F172A] dark:text-slate-100'
                                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]'
                                }`}
                              >
                                <option value="">— Chưa chọn —</option>
                                {matchingTeachers.length > 0 && (
                                  <optgroup label={`Tổ / Môn ${sub}`}>
                                    {matchingTeachers.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {formatTeacherHonorific(t)}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {otherTeachers.length > 0 && (
                                  <optgroup label="Giáo viên tổ khác">
                                    {otherTeachers.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {formatTeacherHonorific(t)} ({t.departmentGroup})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Thêm / Sửa Năm học */}
      {showYearModal && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setShowYearModal(false)}
          maxWidthClass="max-w-md"
          title={editingYear ? 'Chỉnh sửa năm học' : 'Thêm năm học mới'}
          bodyClassName="p-5"
        >
          <div className="space-y-3 text-[13.5px]">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Tên năm học *</label>
              <input
                value={yearLabelInput}
                onChange={(e) => setYearLabelInput(e.target.value)}
                placeholder="Ví dụ: 2027–2028"
                className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] font-medium focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Ngày khai giảng</label>
                <input
                  value={yearStartInput}
                  onChange={(e) => setYearStartInput(e.target.value)}
                  placeholder="05/09/2027"
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Ngày kết thúc</label>
                <input
                  value={yearEndInput}
                  onChange={(e) => setYearEndInput(e.target.value)}
                  placeholder="25/05/2028"
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-[13px] font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={yearCurrentInput}
                onChange={(e) => setYearCurrentInput(e.target.checked)}
                className="h-4 w-4 accent-[#136F63]"
              />
              Đặt làm Năm học hiện hành
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowYearModal(false)}
                className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveYear}
                disabled={!yearLabelInput.trim()}
                className="btn-glossy-3d-active min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
              >
                Lưu năm học
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL: Đôn lớp lên năm học mới */}
      {showPromoteModal && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setShowPromoteModal(false)}
          maxWidthClass="max-w-md"
          title="Đôn lớp lên năm học mới (Khối 10→11, 11→12)"
          bodyClassName="p-5"
        >
          <div className="space-y-3 text-[13.5px]">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Từ năm học nguồn</label>
              <select
                value={promoteSourceId}
                onChange={(e) => setPromoteSourceId(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] font-medium focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              >
                {masterData.schoolYears.map((sy) => (
                  <option key={sy.id} value={sy.id}>
                    {sy.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Sang năm học đích</label>
              <select
                value={promoteTargetId}
                onChange={(e) => setPromoteTargetId(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] font-medium focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              >
                {masterData.schoolYears
                  .filter((sy) => sy.id !== promoteSourceId)
                  .map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPromoteModal(false)}
                className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleRunPromote}
                disabled={!promoteTargetId || promoteTargetId === promoteSourceId}
                className="btn-glossy-3d-active inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" />
                Thực hiện đôn lớp
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL: Thêm / Sửa Lớp trong Danh mục */}
      {showCatalogModal && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setShowCatalogModal(false)}
          maxWidthClass="max-w-md"
          title={editingCatalog ? `Cập nhật lớp ${editingCatalog.name}` : 'Thêm lớp vào Danh mục'}
          bodyClassName="p-5"
        >
          <div className="space-y-3 text-[13.5px]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Khối lớp</label>
                <select
                  value={catGrade}
                  onChange={(e) => setCatGrade(e.target.value as '10' | '11' | '12')}
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] font-medium focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="10">Khối 10</option>
                  <option value="11">Khối 11</option>
                  <option value="12">Khối 12</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Tên lớp *</label>
                <input
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ví dụ: 12A4"
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] font-semibold uppercase focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Sĩ số dự kiến</label>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={catSize}
                  onChange={(e) => setCatSize(e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Phòng học</label>
                <input
                  value={catRoom}
                  onChange={(e) => setCatRoom(e.target.value)}
                  placeholder="P.304"
                  className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Ghi chú</label>
              <input
                value={catNotes}
                onChange={(e) => setCatNotes(e.target.value)}
                placeholder="Ban KHTN, chuyên Toán..."
                className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveCatalog}
                disabled={!catName.trim()}
                className="btn-glossy-3d-active min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
              >
                Lưu lớp học
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* MODAL: Thêm / Sửa Giáo viên */}
      {showTeacherModal && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setShowTeacherModal(false)}
          maxWidthClass="max-w-2xl"
          title={editingTeacher ? `Cập nhật hồ sơ ${editingTeacher.fullName}` : 'Thêm giáo viên mới'}
          bodyClassName="p-0"
        >
          <div>
            {!editingTeacher && (
              <div className="flex gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setTeacherModalTab('single')}
                  className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium ${
                    teacherModalTab === 'single' ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Nhập từng giáo viên
                </button>
                <button
                  type="button"
                  onClick={() => setTeacherModalTab('paste')}
                  className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium ${
                    teacherModalTab === 'paste' ? 'btn-glossy-3d-active' : 'btn-glossy-3d-inactive'
                  }`}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Dán nhanh từ Excel / Word
                </button>
              </div>
            )}

            <div className="p-5 text-[13.5px]">
              {teacherModalTab === 'single' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Mã giáo viên</label>
                      <input
                        value={gvCode}
                        onChange={(e) => setGvCode(e.target.value)}
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Họ và tên *</label>
                      <input
                        value={gvName}
                        onChange={(e) => setGvName(e.target.value)}
                        placeholder="Nguyễn Văn Minh"
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Giới tính</label>
                      <select
                        value={gvGender}
                        onChange={(e) => setGvGender(e.target.value as 'Nam' | 'Nữ')}
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="Nam">Nam (Thầy)</option>
                        <option value="Nữ">Nữ (Cô)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Tổ chuyên môn</label>
                      <select
                        value={gvDept}
                        onChange={(e) => {
                          setGvDept(e.target.value);
                          setGvSubject(e.target.value);
                        }}
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      >
                        {DEPARTMENT_GROUPS.map((g) => (
                          <option key={g} value={g}>
                            Tổ {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Môn giảng dạy chính</label>
                      <input
                        value={gvSubject}
                        onChange={(e) => setGvSubject(e.target.value)}
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Chức vụ</label>
                      <select
                        value={gvRole}
                        onChange={(e) => setGvRole(e.target.value as TeacherRole)}
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="Giáo viên">Giáo viên</option>
                        <option value="Tổ phó">Tổ phó</option>
                        <option value="Tổ trưởng">Tổ trưởng</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Số điện thoại</label>
                      <input
                        value={gvPhone}
                        onChange={(e) => setGvPhone(e.target.value)}
                        placeholder="0914..."
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155]">Email</label>
                      <input
                        value={gvEmail}
                        onChange={(e) => setGvEmail(e.target.value)}
                        placeholder="giaovien@truong.edu.vn"
                        className="h-10 w-full rounded-[8px] border border-[#E2E8F0] px-3 text-[13.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowTeacherModal(false)}
                      className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTeacher}
                      disabled={!gvName.trim()}
                      className="btn-glossy-3d-active min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
                    >
                      {editingTeacher ? 'Cập nhật hồ sơ' : 'Lưu giáo viên'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    value={gvPasteRaw}
                    onChange={(e) => setGvPasteRaw(e.target.value)}
                    placeholder={`Mỗi dòng 1 giáo viên (copy thẳng từ Excel/Word). Ví dụ:\n1\tLê Minh Tuấn\tNam\tToán\t0914555666\tTổ trưởng\n2\tTrần Thị Hạnh\tNữ\tNgữ văn\t0914777888`}
                    className="w-full rounded-[8px] border border-[#E2E8F0] p-3 text-[13px] leading-relaxed outline-none focus:border-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                  />
                  <div className="text-[12.5px] font-medium text-[#0369A1] dark:text-[#BAE6FD]">
                    Nhận diện sẵn sàng: <strong>{parsedPasteTeachers.length}</strong> giáo viên
                  </div>
                  {parsedPasteTeachers.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
                      <table className="w-full text-[12.5px]">
                        <thead className="bg-[#136F63] font-semibold text-white">
                          <tr>
                            <th className="px-2.5 py-1.5 text-left">Mã GV</th>
                            <th className="px-2.5 py-1.5 text-left">Họ tên</th>
                            <th className="px-2.5 py-1.5 text-left">Tổ CM</th>
                            <th className="px-2.5 py-1.5 text-left">SĐT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedPasteTeachers.map((pt) => (
                            <tr key={pt.id} className="border-t border-[#E2E8F0] dark:border-slate-800">
                              <td className="px-2.5 py-1.5 font-medium">{pt.teacherCode}</td>
                              <td className="px-2.5 py-1.5 font-semibold">{pt.fullName}</td>
                              <td className="px-2.5 py-1.5">Tổ {pt.departmentGroup}</td>
                              <td className="px-2.5 py-1.5">{pt.phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowTeacherModal(false)}
                      className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePasteTeachers}
                      disabled={parsedPasteTeachers.length === 0}
                      className="btn-glossy-3d-active min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
                    >
                      Thêm {parsedPasteTeachers.length} giáo viên
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SmartboardViewport>
      )}
    </div>
  );
};
