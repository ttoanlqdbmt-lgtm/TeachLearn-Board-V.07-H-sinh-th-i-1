import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  AcademicRank,
  Classroom,
  ClassroomStoreData,
  ClassroomStudent,
  MasterDataStore,
  StudentAttemptRecord,
} from '../types/eduplan';
import { INITIAL_STUDENTS_12A1 } from '../data/curriculumKNTT';

const DB_NAME = 'teachlearn_classroom_db';
const DB_VERSION = 1;
const STORE_CLASSES = 'classes';
const STORE_STUDENTS = 'students';

function openClassroomDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng trong trình duyệt này.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CLASSES)) {
        db.createObjectStore(STORE_CLASSES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
        const sStore = db.createObjectStore(STORE_STUDENTS, { keyPath: 'id' });
        sStore.createIndex('classId', 'classId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không thể mở CSDL Lớp học IndexedDB.'));
  });
}

function inferGender(fullName: string, idx: number): 'Nam' | 'Nữ' {
  const lower = fullName.toLowerCase();
  if (
    lower.includes('thị') ||
    lower.includes('anh') ||
    lower.includes('tú') ||
    lower.includes('diệp') ||
    lower.includes('hà') ||
    lower.includes('linh') ||
    lower.includes('nghi') ||
    lower.includes('như') ||
    lower.includes('thảo') ||
    lower.includes('vy') ||
    lower.includes('ngọc') ||
    lower.includes('uyền') ||
    lower.includes('oanh') ||
    lower.includes('châu') ||
    lower.includes('mai') ||
    lower.includes('trâm')
  ) {
    return 'Nữ';
  }
  return idx % 2 === 0 ? 'Nữ' : 'Nam';
}

const VIETNAMESE_ROSTER_POOL: ReadonlyArray<readonly [string, 'Nam' | 'Nữ', AcademicRank]> = [
  ['Nguyễn Minh Khang', 'Nam', 'Tốt'],
  ['Trần Bảo Ngọc', 'Nữ', 'Tốt'],
  ['Lê Hoàng Nam', 'Nam', 'Khá'],
  ['Phạm Khánh Linh', 'Nữ', 'Tốt'],
  ['Hoàng Gia Bảo', 'Nam', 'Khá'],
  ['Đặng Thảo Vy', 'Nữ', 'Chưa đạt'],
  ['Võ Quốc Huy', 'Nam', 'Tốt'],
  ['Bùi Ngọc Hân', 'Nữ', 'Khá'],
  ['Đỗ Tuấn Kiệt', 'Nam', 'Đạt'],
  ['Ngô Phương Thảo', 'Nữ', 'Khá'],
  ['Dương Minh Quân', 'Nam', 'Chưa đạt'],
  ['Lý Thanh Trúc', 'Nữ', 'Tốt'],
  ['Trương Đức Anh', 'Nam', 'Khá'],
  ['Phan Hà My', 'Nữ', 'Chưa đạt'],
  ['Huỳnh Tấn Phát', 'Nam', 'Tốt'],
  ['Mai Kiều Trinh', 'Nữ', 'Khá'],
  ['Đinh Hải Đăng', 'Nam', 'Đạt'],
  ['Vương Tuyết Nhi', 'Nữ', 'Tốt'],
];

export function buildDefaultRosterForClass(
  classId: string,
  className: string,
  grade: '10' | '11' | '12',
  count = 16
): ClassroomStudent[] {
  const cleanCodePrefix = className.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanIdSlug = className.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const birthYear = grade === '12' ? '2009' : grade === '11' ? '2010' : '2011';
  const now = '2026-11-14T08:00:00.000Z';

  // Rotate pool slightly based on class name hash so each class has a distinct ordered roster
  const hashOffset = cleanCodePrefix
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % VIETNAMESE_ROSTER_POOL.length;

  const list: ClassroomStudent[] = [];
  for (let idx = 0; idx < count; idx++) {
    const [fullName, gender, rank] =
      VIETNAMESE_ROSTER_POOL[(idx + hashOffset) % VIETNAMESE_ROSTER_POOL.length];
    const day = String(((idx * 3 + 5) % 27) + 1).padStart(2, '0');
    const month = String(((idx * 2 + 1) % 12) + 1).padStart(2, '0');
    const stuId = `stu-${cleanIdSlug}-${idx + 1}`;
    const sampleScore =
      rank === 'Tốt' ? 8.8 : rank === 'Khá' ? 7.4 : rank === 'Đạt' ? 6.0 : 4.3;

    list.push({
      id: stuId,
      classId,
      studentCode: `HS${cleanCodePrefix}-${String(idx + 1).padStart(2, '0')}`,
      fullName,
      dob: `${day}/${month}/${birthYear}`,
      gender,
      phone: `091${String((hashOffset + idx + 10) % 90 + 10)}${String(10000 + idx * 37).slice(-5)}`,
      parentName: `Phụ huynh ${fullName.split(' ').slice(-1)[0]}`,
      parentPhone: `098${String((hashOffset + idx + 20) % 80 + 10)}${String(20000 + idx * 53).slice(-5)}`,
      academicRank: rank,
      teacherNotes:
        rank === 'Chưa đạt'
          ? 'Cần giao bài tập phụ đạo củng cố kiến thức cơ bản (< 5.0).'
          : 'Theo dõi tiến độ học tập thường xuyên.',
      attempts:
        idx < 4
          ? [
              {
                id: `att-seed-${cleanIdSlug}-${idx}`,
                studentId: stuId,
                classId,
                type: idx % 2 === 0 ? 'quiz' : 'oral',
                title: 'Kiểm tra thường xuyên chuyên đề Toán',
                score: sampleScore,
                maxScore: 10,
                correctCount: idx % 2 === 0 ? 4 : undefined,
                totalQuestions: idx % 2 === 0 ? 5 : undefined,
                createdAt: '2026-11-12T08:30:00.000Z',
              },
            ]
          : [],
      createdAt: now,
    });
  }
  return list;
}

function createInitialClassroomData(): ClassroomStoreData {
  const now = '2026-11-14T08:00:00.000Z';
  const classes: Classroom[] = [
    {
      id: 'cls-11b05',
      name: '11B05',
      grade: '11',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Lê Trọng Toàn',
      createdAt: now,
    },
    {
      id: 'cls-11b10',
      name: '11B10',
      grade: '11',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Cô Nguyễn Thu Hà',
      createdAt: now,
    },
    {
      id: 'cls-11b13',
      name: '11B13',
      grade: '11',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Lê Trọng Toàn',
      createdAt: now,
    },
    {
      id: 'cls-12a1',
      name: '12A1',
      grade: '12',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Lê Trọng Toàn',
      createdAt: now,
    },
    {
      id: 'cls-12a2',
      name: '12A2',
      grade: '12',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Lê Trọng Toàn',
      createdAt: now,
    },
    {
      id: 'cls-12a3',
      name: '12A3',
      grade: '12',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Cô Lê Thị Minh Châu',
      createdAt: now,
    },
    {
      id: 'cls-11b1',
      name: '11B1',
      grade: '11',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Cô Nguyễn Thu Hà',
      createdAt: now,
    },
    {
      id: 'cls-11b2',
      name: '11B2',
      grade: '11',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Cô Huỳnh Ngọc Mai',
      createdAt: now,
    },
    {
      id: 'cls-10a1',
      name: '10A1',
      grade: '10',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Trần Minh Đức',
      createdAt: now,
    },
    {
      id: 'cls-10a2',
      name: '10A2',
      grade: '10',
      schoolYear: '2026–2027',
      homeroomTeacher: 'Thầy Phạm Quốc Hùng',
      createdAt: now,
    },
  ];

  const sampleScores12A1: Record<number, { score: number; type: 'quiz' | 'oral'; title: string; bonus?: number }> = {
    0: { score: 9.5, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm', bonus: 1 },
    1: { score: 8.75, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm' },
    2: { score: 9.0, type: 'oral', title: 'Trả bài miệng: Tiệm cận đồ thị', bonus: 0.5 },
    3: { score: 7.5, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm' },
    4: { score: 8.25, type: 'oral', title: 'Trả bài miệng: Cực trị hàm số' },
    5: { score: 6.0, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm' },
    6: { score: 8.5, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm', bonus: 1 },
    7: { score: 7.0, type: 'oral', title: 'Trả bài miệng: Bảng biến thiên' },
    9: { score: 7.75, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm' },
    11: { score: 5.5, type: 'oral', title: 'Trả bài miệng: GTLN - GTNN' },
    12: { score: 8.8, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm' },
    14: { score: 9.25, type: 'quiz', title: 'Kiểm tra nhanh Ứng dụng đạo hàm', bonus: 1 },
  };

  const students12A1: ClassroomStudent[] = INITIAL_STUDENTS_12A1.map((s, idx) => {
    const sample = sampleScores12A1[idx];
    const attempts: StudentAttemptRecord[] = [];
    if (sample) {
      attempts.push({
        id: `att-seed-12a1-${idx}`,
        studentId: `stu-12a1-${idx + 1}`,
        classId: 'cls-12a1',
        type: sample.type,
        title: sample.title,
        score: sample.score,
        maxScore: 10,
        correctCount: sample.type === 'quiz' ? Math.round((sample.score / 10) * 5) : undefined,
        totalQuestions: sample.type === 'quiz' ? 5 : undefined,
        createdAt: `2026-11-${String(10 + (idx % 5)).padStart(2, '0')}T09:00:00.000Z`,
      });
      if (sample.bonus) {
        attempts.push({
          id: `att-seed-bonus-${idx}`,
          studentId: `stu-12a1-${idx + 1}`,
          classId: 'cls-12a1',
          type: 'bonus',
          title: 'Điểm cộng phát biểu xây dựng bài',
          score: sample.bonus,
          maxScore: 2,
          note: 'Tích cực giơ tay giải bài trên bảng',
          createdAt: `2026-11-${String(11 + (idx % 4)).padStart(2, '0')}T10:15:00.000Z`,
        });
      }
    }

    const rank: AcademicRank = sample
      ? sample.score >= 8
        ? 'Tốt'
        : sample.score >= 6.5
        ? 'Khá'
        : sample.score >= 5
        ? 'Đạt'
        : 'Chưa đạt'
      : idx % 3 === 0
      ? 'Khá'
      : 'Tốt';

    return {
      id: `stu-12a1-${idx + 1}`,
      classId: 'cls-12a1',
      studentCode: `HS12A1-${String(idx + 1).padStart(2, '0')}`,
      fullName: s.fullName,
      dob: s.dob,
      gender: inferGender(s.fullName, idx),
      phone: s.studentPhone,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      academicRank: rank,
      teacherNotes: sample
        ? 'Chăm chỉ, nắm vững kiến thức trọng tâm.'
        : 'Chưa kiểm tra trực tiếp trong tuần này.',
      attempts,
      createdAt: now,
    };
  });

  const otherClassesStudents = classes
    .filter((c) => c.id !== 'cls-12a1')
    .flatMap((c) => buildDefaultRosterForClass(c.id, c.name, c.grade, 16));

  return {
    classes,
    students: [...students12A1, ...otherClassesStudents],
  };
}

/**
 * Synchronizes MasterData.classCatalog (Khai báo & Hồ sơ -> Năm học & Danh mục lớp)
 * with ClassroomStoreData so every declared class exists in classroomStore.classes
 * and has a populated student roster.
 */
export function syncMasterCatalogWithClassroomStore(
  masterData: MasterDataStore | null | undefined,
  currentStore: ClassroomStoreData
): { store: ClassroomStoreData; changed: boolean } {
  const initialDefault = createInitialClassroomData();
  let changed = false;
  const nextClasses = [...currentStore.classes];
  const nextStudents = [...currentStore.students];

  const existingByName = new Map<string, Classroom>();
  const existingById = new Map<string, Classroom>();
  nextClasses.forEach((c) => {
    existingByName.set(c.name.trim().toUpperCase(), c);
    existingById.set(c.id, c);
  });

  // 1. Ensure default core classes (11B05, 11B10, 11B13, 12A1, 12A2, etc.) exist
  for (const defCls of initialDefault.classes) {
    const key = defCls.name.trim().toUpperCase();
    if (!existingByName.has(key) && !existingById.has(defCls.id)) {
      nextClasses.push(defCls);
      existingByName.set(key, defCls);
      existingById.set(defCls.id, defCls);
      changed = true;
    }
  }

  // 2. Sync any classes declared in MasterData.classCatalog
  if (masterData && Array.isArray(masterData.classCatalog)) {
    const activeSy =
      masterData.schoolYears?.find((y) => y.id === masterData.profile?.activeSchoolYearId) ||
      masterData.schoolYears?.find((y) => y.isCurrent) ||
      masterData.schoolYears?.[0];
    const syLabel = activeSy?.label || '2026–2027';

    for (const catItem of masterData.classCatalog) {
      const cleanName = catItem.name.trim();
      if (!cleanName) continue;
      const upperKey = cleanName.toUpperCase();
      if (!existingByName.has(upperKey)) {
        const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const newClsId = existingById.has(`cls-${slug}`)
          ? `cls-${slug}-${catItem.id.slice(-4)}`
          : `cls-${slug}`;
        const asg = masterData.assignments?.find(
          (a) =>
            a.classCatalogId === catItem.id ||
            a.className.trim().toUpperCase() === upperKey
        );
        const hrTeacher = asg?.homeroomTeacherId
          ? masterData.teachers?.find((t) => t.id === asg.homeroomTeacherId)
          : undefined;
        const hrName = hrTeacher
          ? `${hrTeacher.gender === 'Nữ' ? 'Cô' : 'Thầy'} ${hrTeacher.fullName}`
          : 'Thầy Lê Trọng Toàn';

        const newCls: Classroom = {
          id: newClsId,
          name: cleanName,
          grade: catItem.grade || '11',
          schoolYear: syLabel,
          homeroomTeacher: hrName,
          createdAt: new Date().toISOString(),
        };
        nextClasses.push(newCls);
        existingByName.set(upperKey, newCls);
        existingById.set(newCls.id, newCls);
        changed = true;
      }
    }
  }

  // 3. Ensure every class in nextClasses has a populated student roster (no empty 0-student classes)
  for (const cls of nextClasses) {
    const currentRoster = nextStudents.filter((s) => s.classId === cls.id);
    if (currentRoster.length === 0) {
      const generated = buildDefaultRosterForClass(cls.id, cls.name, cls.grade, 16);
      nextStudents.push(...generated);
      changed = true;
    }
  }

  // Sort classes nicely: 11B05, 11B10, 11B13, 11B1, 11B2, 12A1, 12A2, 12A3, 10A1, 10A2...
  const sortedClasses = [...nextClasses].sort((a, b) =>
    a.name.localeCompare(b.name, 'vi', { numeric: true })
  );

  return {
    store: {
      classes: sortedClasses,
      students: nextStudents,
    },
    changed,
  };
}

export async function loadClassroomData(
  masterData?: MasterDataStore | null
): Promise<ClassroomStoreData> {
  try {
    const db = await openClassroomDb();
    const [classes, students] = await Promise.all([
      new Promise<Classroom[]>((resolve, reject) => {
        const tx = db.transaction(STORE_CLASSES, 'readonly');
        const req = tx.objectStore(STORE_CLASSES).getAll();
        req.onsuccess = () => resolve((req.result as Classroom[]) || []);
        req.onerror = () => reject(req.error);
      }),
      new Promise<ClassroomStudent[]>((resolve, reject) => {
        const tx = db.transaction(STORE_STUDENTS, 'readonly');
        const req = tx.objectStore(STORE_STUDENTS).getAll();
        req.onsuccess = () => resolve((req.result as ClassroomStudent[]) || []);
        req.onerror = () => reject(req.error);
      }),
    ]);

    if (classes.length > 0) {
      const { store, changed } = syncMasterCatalogWithClassroomStore(masterData, {
        classes,
        students,
      });
      if (changed) {
        await saveClassroomData(store);
      }
      return store;
    }
    const seeded = createInitialClassroomData();
    const { store } = syncMasterCatalogWithClassroomStore(masterData, seeded);
    await saveClassroomData(store);
    return store;
  } catch {
    const seeded = createInitialClassroomData();
    return syncMasterCatalogWithClassroomStore(masterData, seeded).store;
  }
}

export async function saveClassroomData(data: ClassroomStoreData): Promise<ClassroomStoreData> {
  try {
    const db = await openClassroomDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_CLASSES, STORE_STUDENTS], 'readwrite');
      const cStore = tx.objectStore(STORE_CLASSES);
      const sStore = tx.objectStore(STORE_STUDENTS);
      cStore.clear();
      sStore.clear();
      data.classes.forEach((c) => cStore.put(c));
      data.students.forEach((s) => sStore.put(s));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback in-memory when IndexedDB is unavailable
  }
  return data;
}

export async function upsertClassInStore(
  current: ClassroomStoreData,
  classroom: Classroom
): Promise<ClassroomStoreData> {
  const exists = current.classes.some((c) => c.id === classroom.id);
  const nextClasses = exists
    ? current.classes.map((c) => (c.id === classroom.id ? classroom : c))
    : [...current.classes, classroom];
  return saveClassroomData({ ...current, classes: nextClasses });
}

export async function deleteClassInStore(
  current: ClassroomStoreData,
  classId: string
): Promise<ClassroomStoreData> {
  const next: ClassroomStoreData = {
    classes: current.classes.filter((c) => c.id !== classId),
    students: current.students.filter((s) => s.classId !== classId),
  };
  return saveClassroomData(next);
}

export async function upsertStudentInStore(
  current: ClassroomStoreData,
  student: ClassroomStudent
): Promise<ClassroomStoreData> {
  const exists = current.students.some((s) => s.id === student.id);
  const nextStudents = exists
    ? current.students.map((s) => (s.id === student.id ? student : s))
    : [...current.students, student];
  return saveClassroomData({ ...current, students: nextStudents });
}

export function normalizeStudentCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toLowerCase();
}

export interface DuplicateCodeMatch {
  studentCode: string;
  source: 'system' | 'batch';
  existingStudent?: {
    id: string;
    fullName: string;
    classId: string;
    className: string;
  };
  firstBatchRow?: number;
}

export interface BulkImportValidationItem {
  student: ClassroomStudent;
  rowIndex: number;
  conflict: DuplicateCodeMatch | null;
}

export interface BulkImportValidationSummary {
  items: BulkImportValidationItem[];
  validItems: BulkImportValidationItem[];
  duplicateItems: BulkImportValidationItem[];
  systemDuplicateCount: number;
  batchDuplicateCount: number;
}

export function validateBulkStudentsAgainstSystem(
  incoming: ClassroomStudent[],
  storeData: ClassroomStoreData
): BulkImportValidationSummary {
  const classNameMap = new Map(storeData.classes.map((c) => [c.id, c.name]));
  const systemCodeMap = new Map<string, { student: ClassroomStudent; className: string }>();
  storeData.students.forEach((s) => {
    const norm = normalizeStudentCode(s.studentCode);
    if (norm && !systemCodeMap.has(norm)) {
      systemCodeMap.set(norm, {
        student: s,
        className: classNameMap.get(s.classId) || 'Chưa phân lớp',
      });
    }
  });

  const seenBatchMap = new Map<string, number>();
  const items: BulkImportValidationItem[] = [];
  const validItems: BulkImportValidationItem[] = [];
  const duplicateItems: BulkImportValidationItem[] = [];
  let systemDuplicateCount = 0;
  let batchDuplicateCount = 0;

  incoming.forEach((student, idx) => {
    const rowIndex = idx + 1;
    const normCode = normalizeStudentCode(student.studentCode);
    let conflict: DuplicateCodeMatch | null = null;

    if (normCode) {
      const systemMatch = systemCodeMap.get(normCode);
      if (systemMatch) {
        conflict = {
          studentCode: student.studentCode.trim(),
          source: 'system',
          existingStudent: {
            id: systemMatch.student.id,
            fullName: systemMatch.student.fullName,
            classId: systemMatch.student.classId,
            className: systemMatch.className,
          },
        };
        systemDuplicateCount++;
      } else if (seenBatchMap.has(normCode)) {
        conflict = {
          studentCode: student.studentCode.trim(),
          source: 'batch',
          firstBatchRow: seenBatchMap.get(normCode),
        };
        batchDuplicateCount++;
      } else {
        seenBatchMap.set(normCode, rowIndex);
      }
    }

    const item: BulkImportValidationItem = {
      student,
      rowIndex,
      conflict,
    };
    items.push(item);
    if (conflict) {
      duplicateItems.push(item);
    } else {
      validItems.push(item);
    }
  });

  return {
    items,
    validItems,
    duplicateItems,
    systemDuplicateCount,
    batchDuplicateCount,
  };
}

export async function addStudentsBulkToStore(
  current: ClassroomStoreData,
  incoming: ClassroomStudent[]
): Promise<{
  data: ClassroomStoreData;
  added: number;
  skipped: number;
  duplicateCodes: string[];
}> {
  const existingCodes = new Set(
    current.students.map((s) => normalizeStudentCode(s.studentCode)).filter(Boolean)
  );
  const existingNameKeys = new Set(
    current.students.map(
      (s) => `${s.classId}:${s.fullName.trim().toLowerCase()}:${normalizeStudentCode(s.studentCode)}`
    )
  );
  const nextStudents = [...current.students];
  let added = 0;
  let skipped = 0;
  const duplicateCodes: string[] = [];

  incoming.forEach((st) => {
    const normCode = normalizeStudentCode(st.studentCode);
    const nameKey = `${st.classId}:${st.fullName.trim().toLowerCase()}:${normCode}`;
    if (!st.fullName.trim()) {
      skipped++;
      return;
    }
    if ((normCode && existingCodes.has(normCode)) || existingNameKeys.has(nameKey)) {
      skipped++;
      if (st.studentCode.trim()) {
        duplicateCodes.push(st.studentCode.trim());
      }
      return;
    }
    if (normCode) {
      existingCodes.add(normCode);
    }
    existingNameKeys.add(nameKey);
    nextStudents.push(st);
    added++;
  });

  const saved = await saveClassroomData({ ...current, students: nextStudents });
  return { data: saved, added, skipped, duplicateCodes };
}

export async function deleteStudentInStore(
  current: ClassroomStoreData,
  studentId: string
): Promise<ClassroomStoreData> {
  return saveClassroomData({
    ...current,
    students: current.students.filter((s) => s.id !== studentId),
  });
}

export async function deleteStudentsBulkInStore(
  current: ClassroomStoreData,
  studentIds: string[]
): Promise<ClassroomStoreData> {
  const idSet = new Set(studentIds);
  return saveClassroomData({
    ...current,
    students: current.students.filter((s) => !idSet.has(s.id)),
  });
}

export async function moveStudentsToClassInStore(
  current: ClassroomStoreData,
  studentIds: string[],
  targetClassId: string
): Promise<ClassroomStoreData> {
  const idSet = new Set(studentIds);
  const nextStudents = current.students.map((s) => {
    if (!idSet.has(s.id)) return s;
    return {
      ...s,
      classId: targetClassId,
    };
  });
  return saveClassroomData({
    ...current,
    students: nextStudents,
  });
}

export function suggestNextStudentCode(
  className: string,
  classStudents: ClassroomStudent[],
  offset = 0,
  extraUsedCodes?: Set<string>
): string {
  const cleanTag = className.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'LOP';
  const usedCodes = new Set(
    classStudents.map((s) => normalizeStudentCode(s.studentCode)).filter(Boolean)
  );
  if (extraUsedCodes) {
    extraUsedCodes.forEach((c) => usedCodes.add(normalizeStudentCode(c)));
  }
  let maxNum = classStudents.length;
  classStudents.forEach((s) => {
    const m = s.studentCode.match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });
  let candidateNum = maxNum + 1 + offset;
  let candidate = `HS${cleanTag}-${String(candidateNum).padStart(2, '0')}`;
  while (usedCodes.has(normalizeStudentCode(candidate))) {
    candidateNum++;
    candidate = `HS${cleanTag}-${String(candidateNum).padStart(2, '0')}`;
  }
  return candidate;
}

export function parseQuickPasteStudents(
  rawText: string,
  classId: string,
  className: string,
  existingClassStudents: ClassroomStudent[],
  defaultGrade: '10' | '11' | '12' = '12',
  allSystemStudents: ClassroomStudent[] = existingClassStudents
): ClassroomStudent[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const defaultDob =
    defaultGrade === '12'
      ? '15/05/2009'
      : defaultGrade === '11'
      ? '15/05/2010'
      : '15/05/2011';
  const now = new Date().toISOString();
  const parsed: ClassroomStudent[] = [];

  const dateRegex = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})$/;
  const phoneRegex = /^(\+?84|0)[\d\s.-]{7,12}$/;

  lines.forEach((line, idx) => {
    let parts: string[];
    if (line.includes('\t')) {
      parts = line.split('\t').map((p) => p.trim());
    } else if (line.includes('|')) {
      parts = line.split('|').map((p) => p.trim());
    } else if (line.includes(';')) {
      parts = line.split(';').map((p) => p.trim());
    } else if (line.includes(',')) {
      parts = line.split(',').map((p) => p.trim());
    } else {
      parts = line.split(/\s{2,}/).map((p) => p.trim());
    }

    parts = parts.filter((p) => p.length > 0);
    if (parts.length === 0) return;

    // Strip leading numeric STT column (e.g., "1", "02", "1.")
    if (parts.length >= 2 && /^\d{1,3}\.?$/.test(parts[0])) {
      parts = parts.slice(1);
    }

    // Skip header lines pasted from Excel/Word
    const firstNorm = normalizeHeaderKey(parts[0] || '');
    const secondNorm = normalizeHeaderKey(parts[1] || '');
    if (
      firstNorm === 'stt' ||
      firstNorm === 'hovaten' ||
      firstNorm === 'hoten' ||
      firstNorm === 'fullname' ||
      secondNorm === 'hovaten' ||
      secondNorm === 'hoten'
    ) {
      return;
    }

    let studentCode = '';
    let fullName = '';
    let dob = '';
    let genderRaw = '';
    let phone = '';
    let parentPhone = '';

    // Check if first col looks like student code (e.g., HS12A1-01, HS-01, 12A1-01, 2026001) and second col is text name
    if (
      parts.length >= 2 &&
      (/^[A-Za-z]{1,6}[-_]?\d/.test(parts[0]) ||
        /^\d{1,2}[A-Za-z]+\d*[-_]?\d+$/i.test(parts[0]) ||
        /^\d{4,}$/.test(parts[0])) &&
      !/^\d+$/.test(parts[1]) &&
      !dateRegex.test(parts[1])
    ) {
      studentCode = parts[0];
      fullName = parts[1];
      parts = parts.slice(2);
    } else {
      fullName = parts[0];
      parts = parts.slice(1);
    }

    if (!fullName || /^\d+$/.test(fullName)) return;

    parts.forEach((cell) => {
      const cleanCell = cell.trim();
      const normCell = normalizeHeaderKey(cleanCell);
      if (!dob && dateRegex.test(cleanCell)) {
        dob = cleanCell.replace(/-/g, '/');
      } else if (
        !genderRaw &&
        (normCell === 'nam' ||
          normCell === 'nu' ||
          normCell === 'male' ||
          normCell === 'female' ||
          normCell === 'm' ||
          normCell === 'f')
      ) {
        genderRaw = normCell;
      } else if (phoneRegex.test(cleanCell)) {
        const compactPhone = cleanCell.replace(/[\s.-]/g, '');
        if (!phone) phone = compactPhone;
        else if (!parentPhone) parentPhone = compactPhone;
      }
    });

    const gender: 'Nam' | 'Nữ' =
      genderRaw === 'nu' || genderRaw === 'female' || genderRaw === 'f'
        ? 'Nữ'
        : genderRaw === 'nam' || genderRaw === 'male' || genderRaw === 'm'
        ? 'Nam'
        : inferGender(fullName, idx);

    const usedSystemCodes = new Set(
      allSystemStudents.map((s) => normalizeStudentCode(s.studentCode)).filter(Boolean)
    );
    parsed.forEach((p) => {
      const norm = normalizeStudentCode(p.studentCode);
      if (norm) usedSystemCodes.add(norm);
    });

    const assignedCode =
      studentCode ||
      suggestNextStudentCode(className, existingClassStudents, 0, usedSystemCodes);

    parsed.push({
      id: `stu-paste-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      classId,
      studentCode: assignedCode,
      fullName,
      dob: dob || defaultDob,
      gender,
      phone,
      parentName: 'Phụ huynh',
      parentPhone: parentPhone || phone,
      academicRank: 'Khá',
      teacherNotes: '',
      attempts: [],
      createdAt: now,
    });
  });

  return parsed;
}

export async function appendStudentAttemptInStore(
  current: ClassroomStoreData,
  studentId: string,
  attempt: StudentAttemptRecord
): Promise<ClassroomStoreData> {
  const nextStudents = current.students.map((s) => {
    if (s.id !== studentId) return s;
    const updatedAttempts = [attempt, ...s.attempts];
    return {
      ...s,
      attempts: updatedAttempts,
    };
  });
  return saveClassroomData({ ...current, students: nextStudents });
}

export async function removeStudentAttemptInStore(
  current: ClassroomStoreData,
  studentId: string,
  attemptId: string
): Promise<ClassroomStoreData> {
  const nextStudents = current.students.map((s) => {
    if (s.id !== studentId) return s;
    return {
      ...s,
      attempts: s.attempts.filter((a) => a.id !== attemptId),
    };
  });
  return saveClassroomData({ ...current, students: nextStudents });
}

export interface StudentComputedStats {
  gradedAttempts: StudentAttemptRecord[];
  bonusAttempts: StudentAttemptRecord[];
  quizCount: number;
  oralCount: number;
  bonusCount: number;
  totalActivities: number;
  avgRawScore: number | null;
  bonusTotal: number;
  finalAvgScore: number | null;
  latestAttempt: StudentAttemptRecord | null;
}

export function computeStudentStats(student: ClassroomStudent): StudentComputedStats {
  const gradedAttempts = student.attempts.filter((a) => a.type === 'quiz' || a.type === 'oral');
  const bonusAttempts = student.attempts.filter((a) => a.type === 'bonus');
  const quizCount = student.attempts.filter((a) => a.type === 'quiz').length;
  const oralCount = student.attempts.filter((a) => a.type === 'oral').length;
  const bonusCount = bonusAttempts.length;
  const bonusTotal = Math.round(bonusAttempts.reduce((sum, a) => sum + a.score, 0) * 100) / 100;

  let avgRawScore: number | null = null;
  let finalAvgScore: number | null = null;
  if (gradedAttempts.length > 0) {
    const raw =
      gradedAttempts.reduce((sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 10 : a.score), 0) /
      gradedAttempts.length;
    avgRawScore = Math.round(raw * 100) / 100;
    // Cộng tối đa 1.0 điểm thưởng khuyến khích vào điểm trung bình quy đổi (không vượt quá 10)
    finalAvgScore = Math.min(10, Math.round((raw + Math.min(1, bonusTotal * 0.25)) * 100) / 100);
  }

  const latestAttempt = student.attempts.length > 0 ? student.attempts[0] : null;
  return {
    gradedAttempts,
    bonusAttempts,
    quizCount,
    oralCount,
    bonusCount,
    totalActivities: student.attempts.length,
    avgRawScore,
    bonusTotal,
    finalAvgScore,
    latestAttempt,
  };
}

export function getStudentInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_TONES = [
  'from-sky-500 to-cyan-600',
  'from-blue-600 to-sky-700',
  'from-teal-500 to-emerald-600',
  'from-cyan-600 to-blue-700',
  'from-indigo-500 to-sky-600',
  'from-sky-600 to-teal-600',
];

export function getStudentAvatarGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeAcademicRank(raw: string): AcademicRank {
  const n = normalizeHeaderKey(raw);
  if (n.includes('tot') || n.includes('gioi')) return 'Tốt';
  if (n.includes('kha')) return 'Khá';
  if (n.includes('chuadat') || n.includes('yeu') || n.includes('kem')) return 'Chưa đạt';
  return 'Đạt';
}

export async function parseStudentsFromExcelOrCsv(
  file: File,
  classId: string,
  className: string,
  startingIndex: number,
  allSystemStudents: ClassroomStudent[] = []
): Promise<ClassroomStudent[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const now = new Date().toISOString();
  const classStudentsOnly = allSystemStudents.filter((s) => s.classId === classId);
  const usedAutoCodes = new Set(
    allSystemStudents.map((s) => normalizeStudentCode(s.studentCode)).filter(Boolean)
  );

  const result: ClassroomStudent[] = [];
  rows.forEach((row, idx) => {
    const map: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      map[normalizeHeaderKey(k)] = String(v ?? '').trim();
    });

    const fullName =
      map['hovaten'] ||
      map['hoten'] ||
      map['tenhocsinh'] ||
      map['fullname'] ||
      map['name'] ||
      map['ten'] ||
      '';
    if (!fullName) return;

    const explicitCode =
      map['mahs'] ||
      map['mahocsinh'] ||
      map['mshs'] ||
      map['maso'] ||
      map['studentcode'] ||
      map['code'] ||
      '';

    const studentCode =
      explicitCode ||
      suggestNextStudentCode(
        className,
        classStudentsOnly.length > 0 ? classStudentsOnly : result,
        classStudentsOnly.length > 0 ? 0 : startingIndex + result.length,
        usedAutoCodes
      );
    if (!explicitCode) {
      usedAutoCodes.add(normalizeStudentCode(studentCode));
    }
    const dob = map['ngaysinh'] || map['dob'] || map['namsinh'] || '01/01/2009';
    const rawGender = normalizeHeaderKey(map['gioitinh'] || map['gender'] || '');
    const gender: 'Nam' | 'Nữ' = rawGender.includes('nu')
      ? 'Nữ'
      : rawGender.includes('nam')
      ? 'Nam'
      : inferGender(fullName, idx);
    const phone = map['sdt'] || map['sodienthoai'] || map['sdthocsinh'] || map['phone'] || '';
    const parentName = map['phuhuynh'] || map['hotenphuhuynh'] || map['parentname'] || 'Phụ huynh';
    const parentPhone =
      map['sdtphuhuynh'] || map['sdtph'] || map['sodienthoaiphuhuynh'] || map['parentphone'] || phone;
    const rank = map['hocluc'] || map['xeploai'] || map['rank']
      ? normalizeAcademicRank(map['hocluc'] || map['xeploai'] || map['rank'])
      : 'Khá';
    const teacherNotes = map['ghichu'] || map['nhanxet'] || map['notes'] || '';

    result.push({
      id: `stu-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      classId,
      studentCode,
      fullName,
      dob,
      gender,
      phone,
      parentName,
      parentPhone,
      academicRank: rank,
      teacherNotes,
      attempts: [],
      createdAt: now,
    });
  });

  return result;
}

export function downloadStudentImportTemplate(className = '12A1'): void {
  const sampleRows = [
    {
      'Mã HS': `HS${className}-01`,
      'Họ và tên': 'Nguyễn Văn An',
      'Ngày sinh': '15/04/2009',
      'Giới tính': 'Nam',
      'SĐT': '0912345678',
      'Phụ huynh': 'Nguyễn Văn Bình',
      'SĐT Phụ huynh': '0987654321',
      'Học lực': 'Tốt',
      'Ghi chú': 'Học tốt môn Toán',
    },
    {
      'Mã HS': `HS${className}-02`,
      'Họ và tên': 'Trần Thị Bích Ngọc',
      'Ngày sinh': '22/08/2009',
      'Giới tính': 'Nữ',
      'SĐT': '0912345679',
      'Phụ huynh': 'Trần Văn Cường',
      'SĐT Phụ huynh': '0987654322',
      'Học lực': 'Khá',
      'Ghi chú': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 11 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachMau');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Mau_DanhSach_Lop_${className}.xlsx`
  );
}

export function exportClassGradebookExcel(
  classroom: Classroom,
  students: ClassroomStudent[],
  masterContext?: {
    departmentName?: string;
    schoolName?: string;
    subjectName?: string;
    teacherName?: string;
  }
): void {
  const summaryRows = students.map((st, idx) => {
    const stats = computeStudentStats(st);
    const scoreList = stats.gradedAttempts
      .map((a) => `${a.score.toFixed(2).replace('.', ',')} (${a.type === 'quiz' ? 'App' : 'Miệng'})`)
      .join('; ');
    return {
      STT: idx + 1,
      'Mã học sinh': st.studentCode,
      'Họ và tên': st.fullName,
      'Giới tính': st.gender,
      'Ngày sinh': st.dob,
      'Học lực': st.academicRank,
      'Số lần làm bài App': stats.quizCount,
      'Số lần trả bài miệng': stats.oralCount,
      'Lượt điểm cộng': stats.bonusCount,
      'Tổng điểm cộng': stats.bonusTotal,
      'Điểm TB (thang 10)': stats.finalAvgScore !== null ? Number(stats.finalAvgScore.toFixed(2)) : '',
      'Chi tiết điểm các lần': scoreList || 'Chưa có điểm',
      'SĐT Phụ huynh': st.parentPhone,
      'Ghi chú GV': st.teacherNotes,
    };
  });

  const detailRows: Record<string, string | number>[] = [];
  students.forEach((st) => {
    st.attempts.forEach((att) => {
      detailRows.push({
        'Mã học sinh': st.studentCode,
        'Họ và tên': st.fullName,
        Lớp: classroom.name,
        'Thời gian': new Date(att.createdAt).toLocaleString('vi-VN'),
        'Hình thức':
          att.type === 'quiz'
            ? 'Làm bài trực tiếp trên App'
            : att.type === 'oral'
            ? 'Trả bài miệng trên lớp'
            : 'Điểm cộng phát biểu',
        'Nội dung': att.title,
        'Điểm số': att.type === 'bonus' ? `+${att.score}` : Number(att.score.toFixed(2)),
        'Số câu đúng':
          att.correctCount !== undefined && att.totalQuestions !== undefined
            ? `${att.correctCount}/${att.totalQuestions}`
            : '',
        'Nhận xét': att.note || '',
      });
    });
  });

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet([
    [
      `${masterContext?.departmentName || 'SỞ GD&ĐT'} — ${
        masterContext?.schoolName || 'TRƯỜNG THPT LÊ QUÝ ĐÔN'
      }`,
    ],
    [
      `BẢNG ĐIỂM LỚP ${classroom.name} | Khối ${classroom.grade} | Năm học ${classroom.schoolYear} | Môn: ${
        masterContext?.subjectName || 'Toán'
      } | GVCN: ${classroom.homeroomTeacher} | GVBM: ${
        classroom.subjectTeacher || masterContext?.teacherName || classroom.homeroomTeacher
      }`,
    ],
    [],
  ]);
  XLSX.utils.sheet_add_json(
    wsSummary,
    summaryRows.length > 0
      ? summaryRows
      : [{ Thông_báo: `Lớp ${classroom.name} chưa có học sinh nào.` }],
    { origin: 'A4' }
  );
  wsSummary['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 24 },
    { wch: 10 },
    { wch: 13 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 34 },
    { wch: 15 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, `BangDiem_${classroom.name}`);

  const wsDetails = XLSX.utils.json_to_sheet(
    detailRows.length > 0
      ? detailRows
      : [{ Thông_báo: 'Chưa có lịch sử làm bài hoặc phát biểu.' }]
  );
  wsDetails['!cols'] = [
    { wch: 15 },
    { wch: 24 },
    { wch: 10 },
    { wch: 20 },
    { wch: 26 },
    { wch: 36 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetails, 'LichSuTraBai');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const dateTag = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `BangDiem_${classroom.name}_TeachLearnEdu_${dateTag}.xlsx`
  );
}
