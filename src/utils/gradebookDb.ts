import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AcademicRank,
  Classroom,
  ClassroomStudent,
  GradebookConfig,
  GradeColumnTarget,
  SubjectGradeEntry,
} from '../types/eduplan';

const DB_NAME = 'teachlearn_gradebook_db';
const DB_VERSION = 1;
const STORE_NAME = 'gradebookEntries';
const CONFIG_STORAGE_KEY = 'teachlearn_smas_gradebook_config_v1';

export const DEFAULT_GRADEBOOK_CONFIG: GradebookConfig = {
  txColumnCount: 5,
  remarkTemplates: {
    tot: 'Nắm vững kiến thức, tư duy tốt, tích cực phát biểu và giải thành thạo các dạng bài tập vận dụng.',
    kha: 'Nắm chắc kiến thức cơ bản, thái độ học tập nghiêm túc, cần rèn thêm tốc độ tính toán và câu vận dụng.',
    dat: 'Đạt chuẩn kiến thức trọng tâm, cần chăm chỉ làm thêm bài tập tự luyện và ôn kỹ lý thuyết.',
    chuaDat: 'Chưa nắm vững kiến thức nền tảng, cần tập trung nghe giảng và ôn tập lại các dạng bài cơ bản.',
    yearPrefix: 'Cả năm',
  },
};

export function loadGradebookConfig(): GradebookConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_GRADEBOOK_CONFIG;
    const parsed = JSON.parse(raw) as Partial<GradebookConfig>;
    return {
      txColumnCount:
        parsed.txColumnCount === 3 || parsed.txColumnCount === 4 || parsed.txColumnCount === 5
          ? parsed.txColumnCount
          : 5,
      remarkTemplates: {
        ...DEFAULT_GRADEBOOK_CONFIG.remarkTemplates,
        ...(parsed.remarkTemplates || {}),
      },
    };
  } catch {
    return DEFAULT_GRADEBOOK_CONFIG;
  }
}

export function saveGradebookConfig(config: GradebookConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

function openGradebookDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        const store = idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('classId', 'classId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không thể mở CSDL Sổ điểm IndexedDB.'));
  });
}

export function makeGradeEntryId(classId: string, semester: 1 | 2, studentId: string): string {
  return `${classId}__hk${semester}__${studentId}`;
}

function sanitizeFirestoreDocId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean.slice(0, 128) || 'entry_default';
}

export function parseScoreCell(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim().replace(',', '.');
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  const clamped = Math.max(0, Math.min(10, num));
  return Math.round(clamped * 100) / 100;
}

export function formatScoreValue(val: number | null | undefined, decimals: 1 | 2 = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '';
  if (decimals === 1) {
    return val.toFixed(1).replace('.', ',');
  }
  return Number.isInteger(val)
    ? String(val)
    : String(Math.round(val * 100) / 100).replace('.', ',');
}

export function computeCircular22TBM(
  entry: Pick<SubjectGradeEntry, 'tx1' | 'tx2' | 'tx3' | 'tx4' | 'gk' | 'ck'> & { tx5?: number | null },
  txCount: 3 | 4 | 5 = 5
): number | null {
  const allTx = [
    entry.tx1,
    entry.tx2,
    entry.tx3,
    txCount >= 4 ? entry.tx4 : null,
    txCount >= 5 ? entry.tx5 ?? null : null,
  ];
  const txList = allTx.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));

  let numerator = txList.reduce((sum, v) => sum + v, 0);
  let denominator = txList.length;

  if (entry.gk !== null && entry.gk !== undefined && !Number.isNaN(entry.gk)) {
    numerator += 2 * entry.gk;
    denominator += 2;
  }
  if (entry.ck !== null && entry.ck !== undefined && !Number.isNaN(entry.ck)) {
    numerator += 3 * entry.ck;
    denominator += 3;
  }

  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10 + 1e-9) / 10;
}

export function computeCircular22YearTBM(
  tbmHk1: number | null,
  tbmHk2: number | null
): number | null {
  if (tbmHk1 === null || tbmHk2 === null) return null;
  return Math.round(((tbmHk1 + 2 * tbmHk2) / 3) * 10 + 1e-9) / 10;
}

export function getCircular22Rank(tbm: number | null): AcademicRank | '—' {
  if (tbm === null) return '—';
  if (tbm >= 8.0) return 'Tốt';
  if (tbm >= 6.5) return 'Khá';
  if (tbm >= 5.0) return 'Đạt';
  return 'Chưa đạt';
}

export function normalizeGradeEntry(entry: SubjectGradeEntry): SubjectGradeEntry {
  const normalized: SubjectGradeEntry = {
    ...entry,
    tx1: entry.tx1 ?? null,
    tx2: entry.tx2 ?? null,
    tx3: entry.tx3 ?? null,
    tx4: entry.tx4 ?? null,
    tx5: entry.tx5 ?? null,
    gk: entry.gk ?? null,
    ck: entry.ck ?? null,
    remark: entry.remark || '',
    yearRemark: entry.yearRemark || '',
    syncedAttemptIds: Array.isArray(entry.syncedAttemptIds) ? entry.syncedAttemptIds : [],
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
  normalized.tbm = computeCircular22TBM(normalized);
  return normalized;
}

export function createEmptyGradeEntry(
  classId: string,
  semester: 1 | 2,
  studentId: string
): SubjectGradeEntry {
  return {
    id: makeGradeEntryId(classId, semester, studentId),
    classId,
    semester,
    studentId,
    tx1: null,
    tx2: null,
    tx3: null,
    tx4: null,
    tx5: null,
    gk: null,
    ck: null,
    tbm: null,
    remark: '',
    yearRemark: '',
    syncedAttemptIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function suggestNextTxColumn(
  entry: SubjectGradeEntry | undefined,
  txCount: 3 | 4 | 5 = 5
): GradeColumnTarget {
  const cols: GradeColumnTarget[] =
    txCount === 3
      ? ['tx1', 'tx2', 'tx3']
      : txCount === 4
        ? ['tx1', 'tx2', 'tx3', 'tx4']
        : ['tx1', 'tx2', 'tx3', 'tx4', 'tx5'];
  if (!entry) return 'tx1';
  const firstEmpty = cols.find((c) => entry[c] === null || entry[c] === undefined);
  return firstEmpty || cols[cols.length - 1];
}

function buildSeededEntries(students: ClassroomStudent[]): SubjectGradeEntry[] {
  const now = '2026-11-14T09:00:00.000Z';
  const presetProfiles: Array<{
    tx1: number | null;
    tx2: number | null;
    tx3: number | null;
    tx4: number | null;
    tx5: number | null;
    gk: number | null;
    ck: number | null;
    remark: string;
  }> = [
    { tx1: 9.5, tx2: 9.0, tx3: null, tx4: null, tx5: null, gk: 9.2, ck: 9.5, remark: 'Nắm vững kiến thức, tư duy Toán sắc bén.' },
    { tx1: 8.5, tx2: 8.8, tx3: null, tx4: null, tx5: null, gk: 8.5, ck: 8.8, remark: 'Học tập nghiêm túc, trình bày lời giải rõ ràng.' },
    { tx1: 9.0, tx2: 9.0, tx3: 8.5, tx4: null, tx5: null, gk: 9.0, ck: 9.2, remark: 'Tích cực phát biểu, làm tốt các bài vận dụng.' },
    { tx1: 7.5, tx2: 7.0, tx3: null, tx4: null, tx5: null, gk: 7.5, ck: 7.8, remark: 'Có cố gắng, cần rèn thêm tốc độ tính toán.' },
    { tx1: 8.3, tx2: 8.0, tx3: null, tx4: null, tx5: null, gk: 8.0, ck: 8.5, remark: 'Chăm chỉ, nắm chắc kiến thức trọng tâm.' },
    { tx1: 4.5, tx2: 4.8, tx3: null, tx4: null, tx5: null, gk: 4.5, ck: 4.6, remark: 'Cần ôn tập lại kiến thức cơ bản và làm thêm bài tập phụ đạo.' },
    { tx1: 8.5, tx2: 8.0, tx3: null, tx4: null, tx5: null, gk: 8.2, ck: 8.6, remark: 'Tiếp thu nhanh, tích cực tham gia xây dựng bài.' },
    { tx1: 7.0, tx2: 6.5, tx3: null, tx4: null, tx5: null, gk: 7.0, ck: 7.2, remark: 'Nắm được kiến thức cơ bản, chú ý tránh sai sót dấu.' },
    { tx1: 8.0, tx2: null, tx3: null, tx4: null, tx5: null, gk: 7.8, ck: 8.0, remark: 'Thái độ học tập tốt, bài làm cẩn thận.' },
    { tx1: 7.8, tx2: 7.5, tx3: null, tx4: null, tx5: null, gk: 7.5, ck: 8.0, remark: 'Có tiến bộ qua các bài kiểm tra gần đây.' },
    { tx1: 6.5, tx2: 6.0, tx3: null, tx4: null, tx5: null, gk: 6.5, ck: 6.8, remark: 'Đạt yêu cầu môn học, nên luyện thêm dạng thực tế.' },
    { tx1: 4.0, tx2: 4.5, tx3: null, tx4: null, tx5: null, gk: 4.2, ck: 4.5, remark: 'Cần tập trung nghe giảng và hoàn thành bài tập phụ đạo về nhà.' },
    { tx1: 8.8, tx2: 8.5, tx3: null, tx4: null, tx5: null, gk: 8.5, ck: 9.0, remark: 'Nắm chắc lý thuyết, vận dụng linh hoạt.' },
    { tx1: 4.2, tx2: 4.5, tx3: null, tx4: null, tx5: null, gk: 4.4, ck: 4.6, remark: 'Chưa nắm vững kiến thức nền tảng, cần bồi dưỡng phụ đạo kịp thời.' },
    { tx1: 9.3, tx2: 9.5, tx3: 9.0, tx4: null, tx5: null, gk: 9.5, ck: 9.5, remark: 'Xuất sắc, giải tốt các câu hỏi vận dụng cao.' },
    { tx1: 7.5, tx2: null, tx3: null, tx4: null, tx5: null, gk: 7.2, ck: 7.5, remark: 'Học tập ổn định, tiếp tục phát huy.' },
  ];

  const remedialPresets = [presetProfiles[5], presetProfiles[11], presetProfiles[13]];

  // Group students by classId so each class gets a well-distributed set of TBM scores
  const byClass = new Map<string, ClassroomStudent[]>();
  students.forEach((st) => {
    const arr = byClass.get(st.classId) || [];
    arr.push(st);
    byClass.set(st.classId, arr);
  });

  const seeded: SubjectGradeEntry[] = [];
  byClass.forEach((classStudents, classId) => {
    classStudents.forEach((st, idx) => {
      let p = presetProfiles[idx % presetProfiles.length];
      if (classId !== 'cls-12a1' && st.academicRank === 'Chưa đạt') {
        p = remedialPresets[idx % remedialPresets.length];
      } else if (classId === 'cls-12a1' && idx === 13) {
        p = {
          tx1: 6.8,
          tx2: 7.0,
          tx3: null,
          tx4: null,
          tx5: null,
          gk: 6.5,
          ck: 7.0,
          remark: 'Có tinh thần học hỏi, cần rèn thêm phần hình học.',
        };
      }
      const base: SubjectGradeEntry = {
        id: makeGradeEntryId(classId, 1, st.id),
        classId,
        semester: 1,
        studentId: st.id,
        tx1: p.tx1,
        tx2: p.tx2,
        tx3: p.tx3,
        tx4: p.tx4,
        tx5: p.tx5,
        gk: p.gk,
        ck: p.ck,
        tbm: null,
        remark: p.remark,
        yearRemark: '',
        syncedAttemptIds: [],
        updatedAt: now,
      };
      base.tbm = computeCircular22TBM(base);
      seeded.push(base);
    });
  });

  return seeded;
}

export async function loadGradebookEntries(
  students: ClassroomStudent[]
): Promise<Record<string, SubjectGradeEntry>> {
  const defaultSeeded = buildSeededEntries(students);
  try {
    const idb = await openGradebookDb();
    const rows = await new Promise<SubjectGradeEntry[]>((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as SubjectGradeEntry[]) || []);
      req.onerror = () => reject(req.error);
    });

    if (rows.length > 0) {
      const map: Record<string, SubjectGradeEntry> = {};
      rows.forEach((r) => {
        const normalized = normalizeGradeEntry(r);
        map[normalized.id] = normalized;
      });
      // Backfill any newly added class students that do not yet have an entry in IndexedDB
      const missingEntries: SubjectGradeEntry[] = [];
      defaultSeeded.forEach((seedEntry) => {
        if (!map[seedEntry.id]) {
          map[seedEntry.id] = seedEntry;
          missingEntries.push(seedEntry);
        }
      });
      if (missingEntries.length > 0) {
        await saveGradebookEntriesBulk(missingEntries);
      }
      return map;
    }

    const map: Record<string, SubjectGradeEntry> = {};
    defaultSeeded.forEach((r) => {
      map[r.id] = r;
    });
    await saveGradebookEntriesBulk(defaultSeeded);
    return map;
  } catch {
    const map: Record<string, SubjectGradeEntry> = {};
    defaultSeeded.forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }
}

export async function saveGradebookEntriesBulk(entries: SubjectGradeEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const idb = await openGradebookDb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      entries.forEach((e) => store.put(normalizeGradeEntry(e)));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback in memory
  }
}

export async function syncGradebookEntriesToFirestore(
  entries: SubjectGradeEntry[],
  ownerUid: string
): Promise<number> {
  if (!ownerUid || entries.length === 0) return 0;
  let savedCount = 0;
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((raw) => {
        const entry = normalizeGradeEntry(raw);
        const docId = sanitizeFirestoreDocId(entry.id);
        const payload = {
          id: docId,
          ownerId: ownerUid,
          classId: entry.classId.slice(0, 80),
          semester: entry.semester,
          studentId: entry.studentId.slice(0, 128),
          tx1: entry.tx1,
          tx2: entry.tx2,
          tx3: entry.tx3,
          tx4: entry.tx4,
          tx5: entry.tx5,
          gk: entry.gk,
          ck: entry.ck,
          tbm: entry.tbm,
          remark: (entry.remark || '').slice(0, 600),
          yearRemark: (entry.yearRemark || '').slice(0, 600),
          syncedAttemptIds: (entry.syncedAttemptIds || []).slice(0, 100),
          updatedAt: entry.updatedAt || new Date().toISOString(),
        };
        batch.set(doc(db, 'gradebookEntries', docId), payload);
        savedCount++;
      });
      await batch.commit();
    }
    return savedCount;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'gradebookEntries');
    return 0;
  }
}

export async function loadGradebookFromFirestore(
  ownerUid: string
): Promise<Record<string, SubjectGradeEntry>> {
  if (!ownerUid) return {};
  try {
    const q = query(collection(db, 'gradebookEntries'), where('ownerId', '==', ownerUid));
    const snap = await getDocs(q);
    const map: Record<string, SubjectGradeEntry> = {};
    snap.docs.forEach((d) => {
      const raw = d.data() as SubjectGradeEntry & { ownerId?: string };
      const canonicalId = makeGradeEntryId(raw.classId, raw.semester, raw.studentId);
      map[canonicalId] = normalizeGradeEntry({
        ...raw,
        id: canonicalId,
      });
    });
    return map;
  } catch {
    return {};
  }
}

export async function applyScoreToGradebookColumn(
  entriesMap: Record<string, SubjectGradeEntry>,
  classId: string,
  semester: 1 | 2,
  studentId: string,
  targetColumn: GradeColumnTarget,
  score: number,
  attemptId?: string,
  ownerUid?: string
): Promise<{ nextMap: Record<string, SubjectGradeEntry>; updatedEntry: SubjectGradeEntry }> {
  const id = makeGradeEntryId(classId, semester, studentId);
  const prev = normalizeGradeEntry(entriesMap[id] || createEmptyGradeEntry(classId, semester, studentId));
  const clamped = Math.max(0, Math.min(10, Math.round(score * 100) / 100));
  const syncedSet = new Set(prev.syncedAttemptIds || []);
  if (attemptId) syncedSet.add(attemptId);

  const updated: SubjectGradeEntry = {
    ...prev,
    [targetColumn]: clamped,
    syncedAttemptIds: Array.from(syncedSet),
    updatedAt: new Date().toISOString(),
  };
  updated.tbm = computeCircular22TBM(updated);

  const nextMap = {
    ...entriesMap,
    [id]: updated,
  };

  await saveGradebookEntriesBulk([updated]);
  if (ownerUid) {
    try {
      const docId = sanitizeFirestoreDocId(updated.id);
      await setDoc(doc(db, 'gradebookEntries', docId), {
        id: docId,
        ownerId: ownerUid,
        classId: updated.classId.slice(0, 80),
        semester: updated.semester,
        studentId: updated.studentId.slice(0, 128),
        tx1: updated.tx1,
        tx2: updated.tx2,
        tx3: updated.tx3,
        tx4: updated.tx4,
        tx5: updated.tx5,
        gk: updated.gk,
        ck: updated.ck,
        tbm: updated.tbm,
        remark: (updated.remark || '').slice(0, 600),
        yearRemark: (updated.yearRemark || '').slice(0, 600),
        syncedAttemptIds: (updated.syncedAttemptIds || []).slice(0, 100),
        updatedAt: updated.updatedAt,
      });
    } catch {
      // Fallback safely to IndexedDB
    }
  }

  return { nextMap, updatedEntry: updated };
}

export async function deleteGradebookEntriesForStudents(
  entriesMap: Record<string, SubjectGradeEntry>,
  studentIds: string[]
): Promise<Record<string, SubjectGradeEntry>> {
  const idSet = new Set(studentIds);
  const removedIds: string[] = [];
  const nextMap: Record<string, SubjectGradeEntry> = {};

  Object.entries(entriesMap).forEach(([key, entry]) => {
    if (idSet.has(entry.studentId)) {
      removedIds.push(key);
    } else {
      nextMap[key] = entry;
    }
  });

  if (removedIds.length > 0) {
    try {
      const idb = await openGradebookDb();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        removedIds.forEach((k) => store.delete(k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // fallback in memory
    }
  }

  return nextMap;
}

export async function migrateGradebookStudentsToClass(
  entriesMap: Record<string, SubjectGradeEntry>,
  studentIds: string[],
  fromClassId: string,
  toClassId: string
): Promise<Record<string, SubjectGradeEntry>> {
  if (fromClassId === toClassId || studentIds.length === 0) return entriesMap;
  const idSet = new Set(studentIds);
  const nextMap: Record<string, SubjectGradeEntry> = { ...entriesMap };
  const oldKeysToDelete: string[] = [];
  const entriesToSave: SubjectGradeEntry[] = [];

  Object.entries(entriesMap).forEach(([key, entry]) => {
    if (idSet.has(entry.studentId) && entry.classId === fromClassId) {
      const newId = makeGradeEntryId(toClassId, entry.semester, entry.studentId);
      const migrated: SubjectGradeEntry = {
        ...entry,
        id: newId,
        classId: toClassId,
        updatedAt: new Date().toISOString(),
      };
      delete nextMap[key];
      nextMap[newId] = migrated;
      oldKeysToDelete.push(key);
      entriesToSave.push(migrated);
    }
  });

  if (oldKeysToDelete.length > 0 || entriesToSave.length > 0) {
    try {
      const idb = await openGradebookDb();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        oldKeysToDelete.forEach((k) => store.delete(k));
        entriesToSave.forEach((e) => store.put(e));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // fallback in memory
    }
  }

  return nextMap;
}

export interface AppSyncPreviewItem {
  studentId: string;
  studentName: string;
  studentCode: string;
  pendingScores: { attemptId: string; score: number; label: string; createdAt: string }[];
  availableSlots: number;
}

export function previewAppSyncForClass(
  students: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>,
  classId: string,
  semester: 1 | 2,
  txCount: 3 | 4 | 5 = 5
): AppSyncPreviewItem[] {
  return students
    .filter((s) => s.classId === classId)
    .map((st) => {
      const entry =
        entriesMap[makeGradeEntryId(classId, semester, st.id)] ||
        createEmptyGradeEntry(classId, semester, st.id);
      const alreadySynced = new Set(entry.syncedAttemptIds || []);
      const pending = st.attempts
        .filter((a) => (a.type === 'quiz' || a.type === 'oral') && !alreadySynced.has(a.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((a) => ({
          attemptId: a.id,
          score: Math.round((a.maxScore > 0 ? (a.score / a.maxScore) * 10 : a.score) * 10) / 10,
          label: `${a.type === 'quiz' ? 'App' : 'Miệng'}: ${a.title}`,
          createdAt: a.createdAt,
        }));

      const txArray = [
        entry.tx1,
        entry.tx2,
        entry.tx3,
        txCount >= 4 ? entry.tx4 : 0,
        txCount >= 5 ? entry.tx5 ?? null : 0,
      ].slice(0, txCount);
      const slots = txArray.filter((v) => v === null || v === undefined).length;

      return {
        studentId: st.id,
        studentName: st.fullName,
        studentCode: st.studentCode,
        pendingScores: pending,
        availableSlots: slots,
      };
    });
}

export async function syncAppScoresToGradebook(
  students: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>,
  classId: string,
  semester: 1 | 2,
  txCount: 3 | 4 | 5 = 5
): Promise<{
  nextMap: Record<string, SubjectGradeEntry>;
  syncedSlotsCount: number;
  affectedStudentsCount: number;
}> {
  const nextMap: Record<string, SubjectGradeEntry> = { ...entriesMap };
  const changed: SubjectGradeEntry[] = [];
  let syncedSlotsCount = 0;
  let affectedStudentsCount = 0;

  const classStudents = students.filter((s) => s.classId === classId);
  const now = new Date().toISOString();

  classStudents.forEach((st) => {
    const id = makeGradeEntryId(classId, semester, st.id);
    const prev = normalizeGradeEntry(nextMap[id] || createEmptyGradeEntry(classId, semester, st.id));
    const alreadySynced = new Set(prev.syncedAttemptIds || []);

    const candidateAttempts = st.attempts
      .filter((a) => (a.type === 'quiz' || a.type === 'oral') && !alreadySynced.has(a.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (candidateAttempts.length === 0) return;

    const txValues: (number | null)[] = [
      prev.tx1,
      prev.tx2,
      prev.tx3,
      prev.tx4,
      prev.tx5 ?? null,
    ];
    const newlySyncedIds = [...alreadySynced];
    let filledForStudent = 0;

    for (const att of candidateAttempts) {
      const emptySlotIdx = txValues.slice(0, txCount).findIndex((v) => v === null || v === undefined);
      if (emptySlotIdx === -1) break;
      const normalizedScore =
        Math.round((att.maxScore > 0 ? (att.score / att.maxScore) * 10 : att.score) * 10) / 10;
      txValues[emptySlotIdx] = Math.max(0, Math.min(10, normalizedScore));
      newlySyncedIds.push(att.id);
      filledForStudent++;
      syncedSlotsCount++;
    }

    if (filledForStudent > 0) {
      affectedStudentsCount++;
      const updated: SubjectGradeEntry = {
        ...prev,
        tx1: txValues[0],
        tx2: txValues[1],
        tx3: txValues[2],
        tx4: txValues[3],
        tx5: txValues[4],
        syncedAttemptIds: newlySyncedIds,
        updatedAt: now,
      };
      updated.tbm = computeCircular22TBM(updated, txCount);
      nextMap[id] = updated;
      changed.push(updated);
    }
  });

  if (changed.length > 0) {
    await saveGradebookEntriesBulk(changed);
  }

  return { nextMap, syncedSlotsCount, affectedStudentsCount };
}

export function generateFallbackRemark(
  student: ClassroomStudent,
  entry: SubjectGradeEntry,
  index: number,
  config: GradebookConfig = DEFAULT_GRADEBOOK_CONFIG
): string {
  const tbm = computeCircular22TBM(entry, config.txColumnCount);
  const noteHint = student.teacherNotes?.trim();

  if (tbm === null) {
    return noteHint
      ? `${noteHint} Cần hoàn thành đầy đủ các cột điểm kiểm tra.`
      : 'Chưa đủ cột điểm đánh giá, cần tham gia kiểm tra bổ sung đầy đủ.';
  }

  if (tbm >= 8.0) return config.remarkTemplates.tot;
  if (tbm >= 6.5) return config.remarkTemplates.kha;
  if (tbm >= 5.0) return config.remarkTemplates.dat;
  return config.remarkTemplates.chuaDat;
}

export async function generateAiRemarksBatch(
  classroom: Classroom,
  semester: 1 | 2,
  students: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>,
  subjectName = 'Toán',
  config: GradebookConfig = DEFAULT_GRADEBOOK_CONFIG
): Promise<{ remarksByStudentId: Record<string, string>; usedAi: boolean }> {
  const payloadRows = students.map((st) => {
    const entry =
      entriesMap[makeGradeEntryId(classroom.id, semester, st.id)] ||
      createEmptyGradeEntry(classroom.id, semester, st.id);
    const txCount = [entry.tx1, entry.tx2, entry.tx3, entry.tx4, entry.tx5].filter(
      (v) => v !== null && v !== undefined
    ).length;
    return {
      studentId: st.id,
      fullName: st.fullName,
      tbm: computeCircular22TBM(entry, config.txColumnCount),
      txCount,
      gk: entry.gk,
      ck: entry.ck,
      teacherNotes: st.teacherNotes,
    };
  });

  try {
    const res = await fetch('/api/ai/gradebook-remarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        className: classroom.name,
        semester,
        subject: subjectName,
        rows: payloadRows,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        remarks?: { studentId: string; remark: string }[];
      };
      if (Array.isArray(data.remarks) && data.remarks.length > 0) {
        const out: Record<string, string> = {};
        data.remarks.forEach((item) => {
          if (item.studentId && item.remark) {
            out[item.studentId] = item.remark.trim();
          }
        });
        if (Object.keys(out).length > 0) {
          return { remarksByStudentId: out, usedAi: true };
        }
      }
    }
  } catch {
    // Fallback to configured template remarks
  }

  const fallbackMap: Record<string, string> = {};
  students.forEach((st, idx) => {
    const entry =
      entriesMap[makeGradeEntryId(classroom.id, semester, st.id)] ||
      createEmptyGradeEntry(classroom.id, semester, st.id);
    fallbackMap[st.id] = generateFallbackRemark(st, entry, idx, config);
  });
  return { remarksByStudentId: fallbackMap, usedAi: false };
}

function buildSmasSheetForClass(
  classroom: Classroom,
  semester: 1 | 2,
  classStudents: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>,
  masterContext?: {
    departmentName?: string;
    schoolName?: string;
    subjectName?: string;
    teacherName?: string;
  }
) {
  const deptLabel = masterContext?.departmentName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO';
  const schoolLabel = masterContext?.schoolName || 'TRƯỜNG THPT LÊ QUÝ ĐÔN';
  const subjectLabel = masterContext?.subjectName || 'Toán';
  const teacherLabel =
    classroom.subjectTeacher || masterContext?.teacherName || classroom.homeroomTeacher;

  const isSem2 = semester === 2;
  const headerRow1 = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Ngày sinh',
    'ĐĐG TX 1',
    'ĐĐG TX 2',
    'ĐĐG TX 3',
    'ĐĐG TX 4',
    'ĐĐG TX 5',
    'ĐĐG GK',
    'ĐĐG CK',
    isSem2 ? 'TBM HKII' : 'TBM HKI',
    ...(isSem2 ? ['TBM CN'] : []),
    'Xếp loại TT22',
    isSem2 ? 'Nhận xét HKII' : 'Nhận xét HKI',
    ...(isSem2 ? ['Nhận xét CN'] : []),
  ];

  const aoa: (string | number)[][] = [
    [`${deptLabel} — ${schoolLabel}`],
    [`SỔ ĐÁNH GIÁ MÔN HỌC CHUẨN SMAS 4.0 & THÔNG TƯ 22 (HỌC KỲ ${semester})`],
    [`Lớp: ${classroom.name} | Khối: ${classroom.grade} | Môn: ${subjectLabel} | Năm học: ${classroom.schoolYear} | GVBM: ${teacherLabel} | GVCN: ${classroom.homeroomTeacher}`],
    [],
    headerRow1,
  ];

  let countTot = 0;
  let countKha = 0;
  let countDat = 0;
  let countChuaDat = 0;

  classStudents.forEach((st, idx) => {
    const e1 =
      entriesMap[makeGradeEntryId(classroom.id, 1, st.id)] ||
      createEmptyGradeEntry(classroom.id, 1, st.id);
    const e2 =
      entriesMap[makeGradeEntryId(classroom.id, 2, st.id)] ||
      createEmptyGradeEntry(classroom.id, 2, st.id);
    const active = semester === 1 ? e1 : e2;

    const tbm1 = computeCircular22TBM(e1);
    const tbm2 = computeCircular22TBM(e2);
    const tbmActive = semester === 1 ? tbm1 : tbm2;
    const tbmYear = computeCircular22YearTBM(tbm1, tbm2);
    const rank = getCircular22Rank(isSem2 && tbmYear !== null ? tbmYear : tbmActive);

    if (rank === 'Tốt') countTot++;
    else if (rank === 'Khá') countKha++;
    else if (rank === 'Đạt') countDat++;
    else if (rank === 'Chưa đạt') countChuaDat++;

    const row: (string | number)[] = [
      idx + 1,
      st.studentCode,
      st.fullName,
      st.dob,
      active.tx1 !== null ? active.tx1 : '',
      active.tx2 !== null ? active.tx2 : '',
      active.tx3 !== null ? active.tx3 : '',
      active.tx4 !== null ? active.tx4 : '',
      active.tx5 !== null && active.tx5 !== undefined ? active.tx5 : '',
      active.gk !== null ? active.gk : '',
      active.ck !== null ? active.ck : '',
      tbmActive !== null ? tbmActive : '',
      ...(isSem2 ? [tbmYear !== null ? tbmYear : ''] : []),
      rank,
      active.remark || '',
      ...(isSem2 ? [active.yearRemark || ''] : []),
    ];
    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 24 },
    { wch: 13 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 10 },
    { wch: 10 },
    { wch: 11 },
    ...(isSem2 ? [{ wch: 11 }] : []),
    { wch: 13 },
    { wch: 42 },
    ...(isSem2 ? [{ wch: 42 }] : []),
  ];

  return { ws, countTot, countKha, countDat, countChuaDat };
}

function sanitizeSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Lop';
  let candidate = cleaned;
  let counter = 2;
  while (used.has(candidate)) {
    const suffix = `_${counter++}`;
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

export function exportSmasGradebookExcel(
  classesToExport: Classroom | Classroom[],
  semester: 1 | 2,
  allStudents: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>,
  masterContext?: {
    departmentName?: string;
    schoolName?: string;
    subjectName?: string;
    teacherName?: string;
  }
): void {
  const classList = Array.isArray(classesToExport) ? classesToExport : [classesToExport];
  const subjectLabel = masterContext?.subjectName || 'Toán';
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const summaryRows: {
    Lớp: string;
    'Sĩ số': number;
    'Tốt (≥ 8,0)': number;
    'Khá (6,5 – 7,9)': number;
    'Đạt (5,0 – 6,4)': number;
    'Chưa đạt (< 5,0)': number;
  }[] = [];

  classList.forEach((cls) => {
    const classStudents = allStudents.filter((s) => s.classId === cls.id);
    const { ws, countTot, countKha, countDat, countChuaDat } = buildSmasSheetForClass(
      cls,
      semester,
      classStudents,
      entriesMap,
      masterContext
    );
    const sheetTitle = sanitizeSheetName(`${subjectLabel} ${cls.name}`, usedSheetNames);
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    summaryRows.push({
      Lớp: cls.name,
      'Sĩ số': classStudents.length,
      'Tốt (≥ 8,0)': countTot,
      'Khá (6,5 – 7,9)': countKha,
      'Đạt (5,0 – 6,4)': countDat,
      'Chưa đạt (< 5,0)': countChuaDat,
    });
  });

  const wsStats = XLSX.utils.json_to_sheet(summaryRows);
  wsStats['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStats, 'ThongKe_TT22');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileLabel =
    classList.length === 1
      ? `SoDiem_SMAS_${classList[0].name}_HK${semester}_${dateStr}.xlsx`
      : `SoDiem_SMAS_TatCaLop_HK${semester}_${dateStr}.xlsx`;

  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileLabel
  );
}

function normKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export async function importSmasGradebookExcel(
  file: File,
  classroom: Classroom,
  semester: 1 | 2,
  classStudents: ClassroomStudent[],
  entriesMap: Record<string, SubjectGradeEntry>
): Promise<{
  updatedEntries: SubjectGradeEntry[];
  matchedCount: number;
  newStudents: ClassroomStudent[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) {
    return { updatedEntries: [], matchedCount: 0, newStudents: [] };
  }
  const sheet = wb.Sheets[firstSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  // Locate header row (supports SMAS 4.0 2-row merged headers or flat table)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(12, matrix.length); i++) {
    const row = matrix[i] || [];
    const joined = row.map((c) => normKey(String(c ?? ''))).join(' ');
    if (
      joined.includes('hovaten') ||
      joined.includes('hoten') ||
      joined.includes('mahocsinh') ||
      joined.includes('mahs')
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const rowMain = matrix[headerRowIdx] || [];
  const rowSub = matrix[headerRowIdx + 1] || [];
  const subJoined = rowSub.map((c) => normKey(String(c ?? ''))).join(' ');
  const hasTwoRowHeader =
    subJoined.includes('1') && subJoined.includes('2') && !subJoined.includes('ngay');

  const combinedHeaderCells: string[] = [];
  const maxCols = Math.max(rowMain.length, rowSub.length);
  for (let c = 0; c < maxCols; c++) {
    const mainNorm = normKey(String(rowMain[c] ?? ''));
    const subNorm = hasTwoRowHeader ? normKey(String(rowSub[c] ?? '')) : '';
    combinedHeaderCells.push(subNorm || mainNorm);
  }

  const dataRows = matrix.slice(hasTwoRowHeader ? headerRowIdx + 2 : headerRowIdx + 1);

  const findCol = (predicates: string[]): number =>
    combinedHeaderCells.findIndex((h) => predicates.some((p) => h === p || h.includes(p)));

  const colCode = findCol(['mahocsinh', 'mahs', 'studentcode']);
  const colName = findCol(['hovaten', 'hoten', 'fullname', 'tenhocsinh']);
  const colDob = findCol(['ngaysinh', 'dob']);

  // Support either explicit "ddgtx1..5" OR sub-header "1,2,3,4,5"
  let colTx1 = combinedHeaderCells.findIndex((h) => h === 'ddgtx1' || h === 'tx1' || h === '1');
  let colTx2 = combinedHeaderCells.findIndex((h) => h === 'ddgtx2' || h === 'tx2' || h === '2');
  let colTx3 = combinedHeaderCells.findIndex((h) => h === 'ddgtx3' || h === 'tx3' || h === '3');
  let colTx4 = combinedHeaderCells.findIndex((h) => h === 'ddgtx4' || h === 'tx4' || h === '4');
  let colTx5 = combinedHeaderCells.findIndex((h) => h === 'ddgtx5' || h === 'tx5' || h === '5');

  if (colTx1 === -1) {
    const ddgtxIdx = rowMain.findIndex((c) => normKey(String(c ?? '')).includes('ddgtx'));
    if (ddgtxIdx >= 0) {
      colTx1 = ddgtxIdx;
      colTx2 = ddgtxIdx + 1;
      colTx3 = ddgtxIdx + 2;
      colTx4 = ddgtxIdx + 3;
      colTx5 = ddgtxIdx + 4;
    }
  }

  const colGk = findCol(['ddggk', 'giuaky', 'giuaki', 'gk']);
  const colCk = findCol(['ddgck', 'cuoiky', 'cuoiki', 'ck']);
  const colRemark = findCol(['nhanxethk', 'nhanxet', 'remark', 'ghichu']);
  const colYearRemark = findCol(['nhanxetcn', 'nhanxetcanam']);

  const updatedEntries: SubjectGradeEntry[] = [];
  const newStudents: ClassroomStudent[] = [];
  let matchedCount = 0;
  const now = new Date().toISOString();

  dataRows.forEach((rawRow, rIdx) => {
    const row = rawRow || [];
    const code = colCode >= 0 ? String(row[colCode] ?? '').trim() : '';
    const rawName = colName >= 0 ? String(row[colName] ?? '').trim() : '';
    if (!code && !rawName) return;
    if (normKey(rawName) === 'hovaten' || normKey(rawName) === 'stt') return;

    let fullName = rawName;
    let extractedDob = colDob >= 0 && row[colDob] ? String(row[colDob]).trim() : '';
    let extractedCode = code;

    // Handle SMAS copy/export where fullName cell might have "Nguyễn Văn A\n04/01/2010 - 66000719-00-10133"
    if (rawName.includes('\n')) {
      const parts = rawName.split('\n').map((s) => s.trim()).filter(Boolean);
      fullName = parts[0] || rawName;
      if (parts[1] && parts[1].includes('-')) {
        const sub = parts[1].split(' - ').map((s) => s.trim());
        if (!extractedDob && sub[0]) extractedDob = sub[0];
        if (!extractedCode && sub[1]) extractedCode = sub[1];
      }
    }

    let student = classStudents.find(
      (s) =>
        (extractedCode && s.studentCode.toLowerCase() === extractedCode.toLowerCase()) ||
        (fullName && s.fullName.toLowerCase() === fullName.toLowerCase())
    );

    if (!student && fullName) {
      student = {
        id: `stu-xl-${Date.now()}-${rIdx}`,
        classId: classroom.id,
        studentCode:
          extractedCode ||
          `HS${classroom.name}-${String(classStudents.length + newStudents.length + 1).padStart(2, '0')}`,
        fullName,
        dob: extractedDob || '01/01/2010',
        gender: 'Nam',
        phone: '',
        parentName: 'Phụ huynh',
        parentPhone: '',
        academicRank: 'Khá',
        teacherNotes: '',
        attempts: [],
        createdAt: now,
      };
      newStudents.push(student);
    }

    if (!student) return;
    matchedCount++;

    const entryId = makeGradeEntryId(classroom.id, semester, student.id);
    const prev = normalizeGradeEntry(
      entriesMap[entryId] || createEmptyGradeEntry(classroom.id, semester, student.id)
    );

    const tx1 = colTx1 >= 0 ? parseScoreCell(row[colTx1] as string | number) ?? prev.tx1 : prev.tx1;
    const tx2 = colTx2 >= 0 ? parseScoreCell(row[colTx2] as string | number) ?? prev.tx2 : prev.tx2;
    const tx3 = colTx3 >= 0 ? parseScoreCell(row[colTx3] as string | number) ?? prev.tx3 : prev.tx3;
    const tx4 = colTx4 >= 0 ? parseScoreCell(row[colTx4] as string | number) ?? prev.tx4 : prev.tx4;
    const tx5 = colTx5 >= 0 ? parseScoreCell(row[colTx5] as string | number) ?? prev.tx5 : prev.tx5;
    const gk = colGk >= 0 ? parseScoreCell(row[colGk] as string | number) ?? prev.gk : prev.gk;
    const ck = colCk >= 0 ? parseScoreCell(row[colCk] as string | number) ?? prev.ck : prev.ck;
    const remark =
      colRemark >= 0 && String(row[colRemark] ?? '').trim()
        ? String(row[colRemark]).trim()
        : prev.remark;
    const yearRemark =
      colYearRemark >= 0 && String(row[colYearRemark] ?? '').trim()
        ? String(row[colYearRemark]).trim()
        : prev.yearRemark;

    const nextEntry: SubjectGradeEntry = {
      ...prev,
      tx1,
      tx2,
      tx3,
      tx4,
      tx5,
      gk,
      ck,
      tbm: null,
      remark,
      yearRemark,
      updatedAt: now,
    };
    nextEntry.tbm = computeCircular22TBM(nextEntry);
    updatedEntries.push(nextEntry);
  });

  return { updatedEntries, matchedCount, newStudents };
}
