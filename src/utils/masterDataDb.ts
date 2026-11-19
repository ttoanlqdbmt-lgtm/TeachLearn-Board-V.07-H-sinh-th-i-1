import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  ClassSubjectAssignment,
  MasterClassCatalogItem,
  MasterDataStore,
  SchoolYearRecord,
  TeacherRecord,
  TeacherRole,
} from '../types/eduplan';

const DB_NAME = 'teachlearn_master_data_db';
const DB_VERSION = 1;
const STORE_NAME = 'masterStore';
const RECORD_KEY = 'singleton';

export const DEPARTMENT_GROUPS = [
  'Toán',
  'Vật lý',
  'Hóa học',
  'Sinh học',
  'Tin học',
  'Ngữ văn',
  'Tiếng Anh',
  'Lịch sử',
  'Địa lý',
  'GDKT&PL',
  'Thể dục - QP',
];

export const ASSIGNMENT_SUBJECTS = [
  'Toán',
  'Vật lý',
  'Hóa học',
  'Sinh học',
  'Tin học',
  'Ngữ văn',
  'Tiếng Anh',
  'Lịch sử',
  'Địa lý',
];

function openMasterDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không thể mở CSDL Dữ liệu Đầu năm.'));
  });
}

export function createInitialMasterData(): MasterDataStore {
  const schoolYears: SchoolYearRecord[] = [
    {
      id: 'sy-2025-2026',
      label: '2025–2026',
      isCurrent: false,
      startDate: '05/09/2025',
      endDate: '25/05/2026',
    },
    {
      id: 'sy-2026-2027',
      label: '2026–2027',
      isCurrent: true,
      startDate: '05/09/2026',
      endDate: '25/05/2027',
    },
    {
      id: 'sy-2027-2028',
      label: '2027–2028',
      isCurrent: false,
      startDate: '05/09/2027',
      endDate: '25/05/2028',
    },
  ];

  const teachers: TeacherRecord[] = [
    {
      id: 'gv-01',
      teacherCode: 'GV-TOAN-01',
      fullName: 'Lê Trọng Toàn',
      gender: 'Nam',
      departmentGroup: 'Toán',
      mainSubject: 'Toán',
      phone: '0914123456',
      email: 'letrongtoan@lqd-daklak.edu.vn',
      role: 'Tổ trưởng',
    },
    {
      id: 'gv-02',
      teacherCode: 'GV-TOAN-02',
      fullName: 'Nguyễn Thu Hà',
      gender: 'Nữ',
      departmentGroup: 'Toán',
      mainSubject: 'Toán',
      phone: '0914222333',
      email: 'nguyenthuha@lqd-daklak.edu.vn',
      role: 'Tổ phó',
    },
    {
      id: 'gv-03',
      teacherCode: 'GV-TOAN-03',
      fullName: 'Phạm Quốc Bảo',
      gender: 'Nam',
      departmentGroup: 'Toán',
      mainSubject: 'Toán',
      phone: '0914333444',
      email: 'phamquocbao@lqd-daklak.edu.vn',
      role: 'Giáo viên',
    },
    {
      id: 'gv-04',
      teacherCode: 'GV-LY-01',
      fullName: 'Trần Minh Đức',
      gender: 'Nam',
      departmentGroup: 'Vật lý',
      mainSubject: 'Vật lý',
      phone: '0915111222',
      email: 'tranminhduc@lqd-daklak.edu.vn',
      role: 'Tổ trưởng',
    },
    {
      id: 'gv-05',
      teacherCode: 'GV-HOA-01',
      fullName: 'Võ Thị Lan Anh',
      gender: 'Nữ',
      departmentGroup: 'Hóa học',
      mainSubject: 'Hóa học',
      phone: '0915333555',
      email: 'vothilananh@lqd-daklak.edu.vn',
      role: 'Tổ trưởng',
    },
    {
      id: 'gv-06',
      teacherCode: 'GV-SINH-01',
      fullName: 'Đặng Hoàng Yến',
      gender: 'Nữ',
      departmentGroup: 'Sinh học',
      mainSubject: 'Sinh học',
      phone: '0915444666',
      email: 'danghoangyen@lqd-daklak.edu.vn',
      role: 'Giáo viên',
    },
    {
      id: 'gv-07',
      teacherCode: 'GV-VAN-01',
      fullName: 'Huỳnh Ngọc Mai',
      gender: 'Nữ',
      departmentGroup: 'Ngữ văn',
      mainSubject: 'Ngữ văn',
      phone: '0916111777',
      email: 'huynhngocmai@lqd-daklak.edu.vn',
      role: 'Tổ trưởng',
    },
    {
      id: 'gv-08',
      teacherCode: 'GV-ANH-01',
      fullName: 'Nguyễn Bảo Trâm',
      gender: 'Nữ',
      departmentGroup: 'Tiếng Anh',
      mainSubject: 'Tiếng Anh',
      phone: '0916222888',
      email: 'nguyenbaotram@lqd-daklak.edu.vn',
      role: 'Tổ trưởng',
    },
    {
      id: 'gv-09',
      teacherCode: 'GV-TIN-01',
      fullName: 'Bùi Văn Hải',
      gender: 'Nam',
      departmentGroup: 'Tin học',
      mainSubject: 'Tin học',
      phone: '0917111999',
      email: 'buivanhai@lqd-daklak.edu.vn',
      role: 'Giáo viên',
    },
    {
      id: 'gv-10',
      teacherCode: 'GV-SU-01',
      fullName: 'Phan Thanh Tùng',
      gender: 'Nam',
      departmentGroup: 'Lịch sử',
      mainSubject: 'Lịch sử',
      phone: '0917333000',
      email: 'phanthanhtung@lqd-daklak.edu.vn',
      role: 'Tổ phó',
    },
  ];

  const classCatalog: MasterClassCatalogItem[] = [
    { id: 'cat-26-10a1', schoolYearId: 'sy-2026-2027', grade: '10', name: '10A1', plannedSize: 42, room: 'P.101', notes: 'Lớp chuyên Toán - Tin' },
    { id: 'cat-26-10a2', schoolYearId: 'sy-2026-2027', grade: '10', name: '10A2', plannedSize: 44, room: 'P.102', notes: 'Ban KHTN' },
    { id: 'cat-26-11b05', schoolYearId: 'sy-2026-2027', grade: '11', name: '11B05', plannedSize: 42, room: 'P.205', notes: 'Khối 11 KHTN - Toán Lý Hóa' },
    { id: 'cat-26-11b10', schoolYearId: 'sy-2026-2027', grade: '11', name: '11B10', plannedSize: 40, room: 'P.210', notes: 'Khối 11 KHTN - Toán Hóa Sinh' },
    { id: 'cat-26-11b13', schoolYearId: 'sy-2026-2027', grade: '11', name: '11B13', plannedSize: 44, room: 'P.213', notes: 'Lớp mũi nhọn Khối 11 Toán - Anh' },
    { id: 'cat-26-11b1', schoolYearId: 'sy-2026-2027', grade: '11', name: '11B1', plannedSize: 43, room: 'P.201', notes: 'Ban KHTN' },
    { id: 'cat-26-11b2', schoolYearId: 'sy-2026-2027', grade: '11', name: '11B2', plannedSize: 41, room: 'P.202', notes: 'Ban KHXH' },
    { id: 'cat-26-12a1', schoolYearId: 'sy-2026-2027', grade: '12', name: '12A1', plannedSize: 44, room: 'P.301', notes: 'Lớp mũi nhọn khối 12' },
    { id: 'cat-26-12a2', schoolYearId: 'sy-2026-2027', grade: '12', name: '12A2', plannedSize: 42, room: 'P.302', notes: 'Khối 12 Toán - Lý - Anh' },
    { id: 'cat-26-12a3', schoolYearId: 'sy-2026-2027', grade: '12', name: '12A3', plannedSize: 40, room: 'P.303', notes: 'Khối 12 Toán - Hóa - Sinh' },
  ];

  const assignments: ClassSubjectAssignment[] = [
    {
      id: 'asg-26-10a1',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-10a1',
      className: '10A1',
      grade: '10',
      homeroomTeacherId: 'gv-03',
      subjectTeachers: {
        Toán: 'gv-03',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Tin học': 'gv-09',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
        'Lịch sử': 'gv-10',
      },
    },
    {
      id: 'asg-26-10a2',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-10a2',
      className: '10A2',
      grade: '10',
      homeroomTeacherId: 'gv-04',
      subjectTeachers: {
        Toán: 'gv-02',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Tin học': 'gv-09',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
    {
      id: 'asg-26-11b05',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-11b05',
      className: '11B05',
      grade: '11',
      homeroomTeacherId: 'gv-01',
      subjectTeachers: {
        Toán: 'gv-01',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
    {
      id: 'asg-26-11b10',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-11b10',
      className: '11B10',
      grade: '11',
      homeroomTeacherId: 'gv-02',
      subjectTeachers: {
        Toán: 'gv-01',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
    {
      id: 'asg-26-11b13',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-11b13',
      className: '11B13',
      grade: '11',
      homeroomTeacherId: 'gv-01',
      subjectTeachers: {
        Toán: 'gv-01',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Tin học': 'gv-09',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
    {
      id: 'asg-26-11b1',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-11b1',
      className: '11B1',
      grade: '11',
      homeroomTeacherId: 'gv-02',
      subjectTeachers: {
        Toán: 'gv-02',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
        'Lịch sử': 'gv-10',
      },
    },
    {
      id: 'asg-26-11b2',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-11b2',
      className: '11B2',
      grade: '11',
      homeroomTeacherId: 'gv-07',
      subjectTeachers: {
        Toán: 'gv-03',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
        'Lịch sử': 'gv-10',
      },
    },
    {
      id: 'asg-26-12a1',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-12a1',
      className: '12A1',
      grade: '12',
      homeroomTeacherId: 'gv-01',
      subjectTeachers: {
        Toán: 'gv-01',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Tin học': 'gv-09',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
        'Lịch sử': 'gv-10',
      },
    },
    {
      id: 'asg-26-12a2',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-12a2',
      className: '12A2',
      grade: '12',
      homeroomTeacherId: 'gv-08',
      subjectTeachers: {
        Toán: 'gv-01',
        'Vật lý': 'gv-04',
        'Hóa học': 'gv-05',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
    {
      id: 'asg-26-12a3',
      schoolYearId: 'sy-2026-2027',
      classCatalogId: 'cat-26-12a3',
      className: '12A3',
      grade: '12',
      homeroomTeacherId: 'gv-05',
      subjectTeachers: {
        Toán: 'gv-02',
        'Hóa học': 'gv-05',
        'Sinh học': 'gv-06',
        'Ngữ văn': 'gv-07',
        'Tiếng Anh': 'gv-08',
      },
    },
  ];

  return {
    profile: {
      departmentName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
      schoolName: 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
      activeSchoolYearId: 'sy-2026-2027',
      activeDepartmentGroup: 'Toán',
      activeTeacherId: 'gv-01',
      activeTeacherName: 'Lê Trọng Toàn',
      defaultSubject: 'Toán',
    },
    schoolYears,
    classCatalog,
    teachers,
    assignments,
  };
}

export async function loadMasterData(): Promise<MasterDataStore> {
  try {
    const db = await openMasterDb();
    const record = await new Promise<{ id: string; data: MasterDataStore } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
        req.onsuccess = () =>
          resolve(req.result as { id: string; data: MasterDataStore } | undefined);
        req.onerror = () => reject(req.error);
      }
    );

    if (record?.data && record.data.schoolYears?.length > 0) {
      const existing = record.data;
      const initial = createInitialMasterData();
      const existingNames = new Set(
        (existing.classCatalog || []).map((c) => c.name.trim().toUpperCase())
      );
      const missingCatalog = initial.classCatalog.filter(
        (c) => !existingNames.has(c.name.trim().toUpperCase())
      );
      if (missingCatalog.length > 0) {
        const existingAsgNames = new Set(
          (existing.assignments || []).map((a) => a.className.trim().toUpperCase())
        );
        const missingAsg = initial.assignments.filter(
          (a) => !existingAsgNames.has(a.className.trim().toUpperCase())
        );
        const upgraded: MasterDataStore = {
          ...existing,
          classCatalog: [...(existing.classCatalog || []), ...missingCatalog],
          assignments: [...(existing.assignments || []), ...missingAsg],
        };
        await saveMasterData(upgraded);
        return upgraded;
      }
      return existing;
    }

    const seeded = createInitialMasterData();
    await saveMasterData(seeded);
    return seeded;
  } catch {
    return createInitialMasterData();
  }
}

export async function saveMasterData(data: MasterDataStore): Promise<MasterDataStore> {
  try {
    const db = await openMasterDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: RECORD_KEY, data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback in-memory when IndexedDB is unavailable
  }
  return data;
}

export function formatTeacherHonorific(teacher?: Pick<TeacherRecord, 'fullName' | 'gender'> | null, fallbackName?: string): string {
  if (!teacher) {
    const clean = (fallbackName || 'Lê Trọng Toàn').trim();
    if (/^(Thầy|Cô)\s/i.test(clean)) return clean;
    return `Thầy ${clean}`;
  }
  const clean = teacher.fullName.trim();
  if (/^(Thầy|Cô)\s/i.test(clean)) return clean;
  return `${teacher.gender === 'Nữ' ? 'Cô' : 'Thầy'} ${clean}`;
}

export interface ActiveTeachingContext {
  departmentName: string;
  schoolName: string;
  schoolYearLabel: string;
  departmentGroup: string;
  teacherRawName: string;
  teacherHonorific: string;
  subjectName: string;
}

export function resolveActiveTeachingContext(masterData?: MasterDataStore | null): ActiveTeachingContext {
  if (!masterData) {
    return {
      departmentName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
      schoolName: 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
      schoolYearLabel: '2026–2027',
      departmentGroup: 'Toán',
      teacherRawName: 'Lê Trọng Toàn',
      teacherHonorific: 'Thầy Lê Trọng Toàn',
      subjectName: 'Toán',
    };
  }

  const { profile, schoolYears, teachers } = masterData;
  const activeSy =
    schoolYears.find((y) => y.id === profile.activeSchoolYearId) ||
    schoolYears.find((y) => y.isCurrent) ||
    schoolYears[0];
  const activeTeacher =
    teachers.find((t) => t.id === profile.activeTeacherId) ||
    teachers.find((t) => t.fullName.toLowerCase() === profile.activeTeacherName.toLowerCase());

  const teacherRawName = activeTeacher?.fullName || profile.activeTeacherName || 'Lê Trọng Toàn';
  const teacherHonorific = formatTeacherHonorific(activeTeacher, teacherRawName);

  return {
    departmentName: profile.departmentName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
    schoolName: profile.schoolName || 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
    schoolYearLabel: activeSy?.label || '2026–2027',
    departmentGroup: activeTeacher?.departmentGroup || profile.activeDepartmentGroup || 'Toán',
    teacherRawName,
    teacherHonorific,
    subjectName: profile.defaultSubject || activeTeacher?.mainSubject || 'Toán',
  };
}

export function promoteClassesToNextYear(
  store: MasterDataStore,
  sourceYearId: string,
  targetYearId: string
): { nextStore: MasterDataStore; promotedCount: number; skippedCount: number } {
  if (!sourceYearId || !targetYearId || sourceYearId === targetYearId) {
    return { nextStore: store, promotedCount: 0, skippedCount: 0 };
  }

  const sourceClasses = store.classCatalog.filter(
    (c) => c.schoolYearId === sourceYearId && (c.grade === '10' || c.grade === '11')
  );
  const existingTargetNames = new Set(
    store.classCatalog
      .filter((c) => c.schoolYearId === targetYearId)
      .map((c) => c.name.trim().toUpperCase())
  );

  const newCatalogItems: MasterClassCatalogItem[] = [];
  const newAssignments: ClassSubjectAssignment[] = [];
  let promotedCount = 0;
  let skippedCount = 0;

  sourceClasses.forEach((cls, idx) => {
    const nextGrade: '11' | '12' = cls.grade === '10' ? '11' : '12';
    const nextName = cls.name.trim().startsWith(cls.grade)
      ? `${nextGrade}${cls.name.trim().slice(cls.grade.length)}`
      : `${nextGrade}${cls.name.trim()}`;

    if (existingTargetNames.has(nextName.toUpperCase())) {
      skippedCount++;
      return;
    }

    existingTargetNames.add(nextName.toUpperCase());
    const newId = `cat-${targetYearId}-${nextName.toLowerCase()}-${Date.now()}-${idx}`;
    newCatalogItems.push({
      id: newId,
      schoolYearId: targetYearId,
      grade: nextGrade,
      name: nextName,
      plannedSize: cls.plannedSize,
      room: cls.room || '',
      notes: `Đôn từ lớp ${cls.name}`,
    });

    const prevAssignment = store.assignments.find(
      (a) => a.schoolYearId === sourceYearId && a.classCatalogId === cls.id
    );
    if (prevAssignment) {
      newAssignments.push({
        id: `asg-${targetYearId}-${nextName.toLowerCase()}-${Date.now()}-${idx}`,
        schoolYearId: targetYearId,
        classCatalogId: newId,
        className: nextName,
        grade: nextGrade,
        homeroomTeacherId: prevAssignment.homeroomTeacherId,
        subjectTeachers: { ...prevAssignment.subjectTeachers },
      });
    }
    promotedCount++;
  });

  if (promotedCount === 0) {
    return { nextStore: store, promotedCount: 0, skippedCount };
  }

  return {
    nextStore: {
      ...store,
      classCatalog: [...store.classCatalog, ...newCatalogItems],
      assignments: [...store.assignments, ...newAssignments],
    },
    promotedCount,
    skippedCount,
  };
}

function normKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeRole(raw: string): TeacherRole {
  const n = normKey(raw);
  if (n.includes('totruong')) return 'Tổ trưởng';
  if (n.includes('topho')) return 'Tổ phó';
  return 'Giáo viên';
}

function inferTeacherGender(fullName: string): 'Nam' | 'Nữ' {
  const n = normKey(fullName);
  if (
    n.includes('thi') ||
    n.includes('ha') ||
    n.includes('lan') ||
    n.includes('mai') ||
    n.includes('tram') ||
    n.includes('yen') ||
    n.includes('ngoc') ||
    n.includes('linh') ||
    n.includes('anh') ||
    n.includes('thao')
  ) {
    return 'Nữ';
  }
  return 'Nam';
}

export function suggestNextTeacherCode(existing: TeacherRecord[], offset = 0): string {
  let maxNum = existing.length;
  existing.forEach((t) => {
    const m = t.teacherCode.match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `GV-${String(maxNum + 1 + offset).padStart(3, '0')}`;
}

export function parseTeachersQuickPaste(
  rawText: string,
  existingTeachers: TeacherRecord[]
): TeacherRecord[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const phoneRegex = /^(\+?84|0)[\d\s.-]{7,12}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parsed: TeacherRecord[] = [];

  lines.forEach((line, idx) => {
    let parts: string[];
    if (line.includes('\t')) parts = line.split('\t').map((p) => p.trim());
    else if (line.includes('|')) parts = line.split('|').map((p) => p.trim());
    else if (line.includes(';')) parts = line.split(';').map((p) => p.trim());
    else if (line.includes(',')) parts = line.split(',').map((p) => p.trim());
    else parts = line.split(/\s{2,}/).map((p) => p.trim());

    parts = parts.filter(Boolean);
    if (parts.length === 0) return;

    if (parts.length >= 2 && /^\d{1,3}\.?$/.test(parts[0])) {
      parts = parts.slice(1);
    }

    const k0 = normKey(parts[0] || '');
    const k1 = normKey(parts[1] || '');
    if (k0 === 'stt' || k0 === 'hovaten' || k0 === 'hoten' || k1 === 'hovaten' || k1 === 'hoten') {
      return;
    }

    let teacherCode = '';
    let fullName = '';
    if (parts.length >= 2 && (/^GV/i.test(parts[0]) || /^[A-Za-z]{1,4}-?\d+/.test(parts[0]))) {
      teacherCode = parts[0];
      fullName = parts[1];
      parts = parts.slice(2);
    } else {
      fullName = parts[0];
      parts = parts.slice(1);
    }

    if (!fullName || /^\d+$/.test(fullName)) return;

    let gender: 'Nam' | 'Nữ' | '' = '';
    let departmentGroup = '';
    let phone = '';
    let email = '';
    let role: TeacherRole = 'Giáo viên';

    parts.forEach((cell) => {
      const nc = normKey(cell);
      if (!gender && (nc === 'nam' || nc === 'nu' || nc === 'male' || nc === 'female')) {
        gender = nc === 'nu' || nc === 'female' ? 'Nữ' : 'Nam';
      } else if (emailRegex.test(cell)) {
        email = cell;
      } else if (phoneRegex.test(cell)) {
        phone = cell.replace(/[\s.-]/g, '');
      } else if (nc.includes('totruong') || nc.includes('topho') || nc === 'giaovien') {
        role = normalizeRole(cell);
      } else if (!departmentGroup) {
        const matchedDept = DEPARTMENT_GROUPS.find((d) => normKey(d) === nc || nc.includes(normKey(d)));
        departmentGroup = matchedDept || cell;
      }
    });

    const dept = departmentGroup || 'Toán';
    parsed.push({
      id: `gv-paste-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      teacherCode: teacherCode || suggestNextTeacherCode(existingTeachers, parsed.length),
      fullName,
      gender: gender || inferTeacherGender(fullName),
      departmentGroup: dept,
      mainSubject: dept,
      phone,
      email,
      role,
    });
  });

  return parsed;
}

export async function parseTeachersFromExcel(
  file: File,
  existingTeachers: TeacherRecord[]
): Promise<TeacherRecord[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
    defval: '',
  });

  const out: TeacherRecord[] = [];
  rows.forEach((row, idx) => {
    const map: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      map[normKey(k)] = String(v ?? '').trim();
    });

    const fullName =
      map['hovaten'] || map['hoten'] || map['tengiaovien'] || map['giaovien'] || map['name'] || '';
    if (!fullName) return;

    const dept =
      map['tochuyenmon'] || map['to'] || map['bomon'] || map['mongiangday'] || map['mon'] || 'Toán';
    const mainSubject = map['monchinh'] || map['mongiangday'] || map['mon'] || dept;
    const rawGender = normKey(map['gioitinh'] || map['gender'] || '');

    out.push({
      id: `gv-xl-${Date.now()}-${idx}`,
      teacherCode:
        map['magv'] || map['magiaovien'] || suggestNextTeacherCode(existingTeachers, out.length),
      fullName,
      gender: rawGender.includes('nu')
        ? 'Nữ'
        : rawGender.includes('nam')
        ? 'Nam'
        : inferTeacherGender(fullName),
      departmentGroup: dept,
      mainSubject,
      phone: map['sdt'] || map['sodienthoai'] || map['phone'] || '',
      email: map['email'] || '',
      role: normalizeRole(map['chucvu'] || map['vaitro'] || ''),
    });
  });

  return out;
}

export function exportTeachersExcel(teachers: TeacherRecord[], schoolName: string): void {
  const rows = teachers.map((t, idx) => ({
    STT: idx + 1,
    'Mã GV': t.teacherCode,
    'Họ và tên': t.fullName,
    'Giới tính': t.gender,
    'Tổ chuyên môn': t.departmentGroup,
    'Môn giảng dạy': t.mainSubject,
    'Chức vụ': t.role,
    'Số điện thoại': t.phone,
    Email: t.email,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 11 },
    { wch: 16 },
    { wch: 16 },
    { wch: 13 },
    { wch: 15 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachGiaoVien');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `DanhSach_GiaoVien_${schoolName.replace(/\s+/g, '_')}.xlsx`
  );
}

export function downloadTeacherTemplateExcel(): void {
  const sample = [
    {
      'Mã GV': 'GV-TOAN-01',
      'Họ và tên': 'Lê Trọng Toàn',
      'Giới tính': 'Nam',
      'Tổ chuyên môn': 'Toán',
      'Môn giảng dạy': 'Toán',
      'Chức vụ': 'Tổ trưởng',
      'Số điện thoại': '0914123456',
      Email: 'letrongtoan@truong.edu.vn',
    },
    {
      'Mã GV': 'GV-VAN-01',
      'Họ và tên': 'Huỳnh Ngọc Mai',
      'Giới tính': 'Nữ',
      'Tổ chuyên môn': 'Ngữ văn',
      'Môn giảng dạy': 'Ngữ văn',
      'Chức vụ': 'Giáo viên',
      'Số điện thoại': '0916111777',
      Email: 'huynhngocmai@truong.edu.vn',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 11 },
    { wch: 16 },
    { wch: 16 },
    { wch: 13 },
    { wch: 15 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MauGiaoVien');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Mau_DanhSach_GiaoVien.xlsx'
  );
}

export function exportClassCatalogExcel(
  catalog: MasterClassCatalogItem[],
  schoolYears: SchoolYearRecord[],
  schoolName: string
): void {
  const yearMap = new Map(schoolYears.map((y) => [y.id, y.label]));
  const rows = catalog.map((c, idx) => ({
    STT: idx + 1,
    'Năm học': yearMap.get(c.schoolYearId) || '',
    Khối: `Khối ${c.grade}`,
    'Tên lớp': c.name,
    'Sĩ số dự kiến': c.plannedSize,
    'Phòng học': c.room || '',
    'Ghi chú': c.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 14 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhMucLop');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `DanhMuc_LopHoc_${schoolName.replace(/\s+/g, '_')}.xlsx`
  );
}

export async function importClassCatalogExcel(
  file: File,
  targetYearId: string,
  existingCatalog: MasterClassCatalogItem[]
): Promise<MasterClassCatalogItem[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
    defval: '',
  });
  const existingNames = new Set(
    existingCatalog
      .filter((c) => c.schoolYearId === targetYearId)
      .map((c) => c.name.trim().toUpperCase())
  );
  const out: MasterClassCatalogItem[] = [];

  rows.forEach((row, idx) => {
    const map: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      map[normKey(k)] = String(v ?? '').trim();
    });
    const name = (map['tenlop'] || map['lop'] || map['class'] || '').toUpperCase();
    if (!name || existingNames.has(name)) return;
    existingNames.add(name);

    const rawGrade = map['khoi'] || map['khoilop'] || name;
    const grade: '10' | '11' | '12' = rawGrade.includes('10')
      ? '10'
      : rawGrade.includes('11')
      ? '11'
      : '12';
    const plannedSize = Math.max(1, parseInt(map['sisodukien'] || map['siso'] || '42', 10) || 42);

    out.push({
      id: `cat-xl-${Date.now()}-${idx}`,
      schoolYearId: targetYearId,
      grade,
      name,
      plannedSize,
      room: map['phonghoc'] || map['phong'] || '',
      notes: map['ghichu'] || '',
    });
  });

  return out;
}

export function exportAssignmentsExcel(store: MasterDataStore, schoolYearId: string): void {
  const sy = store.schoolYears.find((y) => y.id === schoolYearId);
  const yearLabel = sy?.label || '';
  const teacherMap = new Map(store.teachers.map((t) => [t.id, formatTeacherHonorific(t)]));
  const yearClasses = store.classCatalog.filter((c) => c.schoolYearId === schoolYearId);

  const rows = yearClasses.map((cls, idx) => {
    const asg = store.assignments.find(
      (a) => a.schoolYearId === schoolYearId && a.classCatalogId === cls.id
    );
    const row: Record<string, string | number> = {
      STT: idx + 1,
      'Năm học': yearLabel,
      Khối: `Khối ${cls.grade}`,
      Lớp: cls.name,
      'GV Chủ nhiệm': asg?.homeroomTeacherId ? teacherMap.get(asg.homeroomTeacherId) || '' : '',
    };
    ASSIGNMENT_SUBJECTS.forEach((sub) => {
      const tid = asg?.subjectTeachers?.[sub];
      row[`GV ${sub}`] = tid ? teacherMap.get(tid) || '' : '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 },
    ...ASSIGNMENT_SUBJECTS.map(() => ({ wch: 20 })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PhanCongChuyenMon');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `PhanCong_ChuyenMon_${yearLabel.replace(/[^\d-]/g, '_')}.xlsx`
  );
}
