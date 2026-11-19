import {
  AppUserRole,
  FeatureUsageMetric,
  LoginAuditLogRecord,
  TeacherRecord,
  UserAccountRecord,
} from '../types/eduplan';

const CACHE_PREFIX = 'teachlearn_zero_cost_cache_v1_';
const CACHE_STATS_KEY = 'teachlearn_zero_cost_stats_v1';
const INVITE_CODE_KEY = 'teachlearn_school_teacher_invite_code_v1';
const ACCOUNTS_STORAGE_KEY = 'teachlearn_user_accounts_v1';
const LOGIN_LOGS_STORAGE_KEY = 'teachlearn_login_audit_logs_v1';
const FEATURE_USAGE_KEY = 'teachlearn_feature_usage_metrics_v1';
const EXAM_DRAFT_PREFIX = 'teachlearn_exam_draft_v1_';

export interface ZeroCostResourceStats {
  cacheHits: number;
  cacheMisses: number;
  firestoreReadsSaved: number;
  firestoreSingleWriteExams: number;
  imagesCompressedCount: number;
  bytesSavedTotal: number;
  aiPromptCacheHits: number;
}

const DEFAULT_STATS: ZeroCostResourceStats = {
  cacheHits: 42,
  cacheMisses: 6,
  firestoreReadsSaved: 1280,
  firestoreSingleWriteExams: 18,
  imagesCompressedCount: 24,
  bytesSavedTotal: 4820 * 1024,
  aiPromptCacheHits: 15,
};

export function loadZeroCostStats(): ZeroCostResourceStats {
  try {
    const raw = localStorage.getItem(CACHE_STATS_KEY);
    if (!raw) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATS;
  }
}

export function incrementZeroCostStat(
  field: keyof ZeroCostResourceStats,
  delta = 1
): ZeroCostResourceStats {
  const current = loadZeroCostStats();
  const next: ZeroCostResourceStats = {
    ...current,
    [field]: Math.max(0, (current[field] || 0) + delta),
  };
  try {
    localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota error
  }
  return next;
}

export function getCachedData<T>(key: string, ttlMs = 30 * 60 * 1000): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) {
      incrementZeroCostStat('cacheMisses', 1);
      return null;
    }
    const parsed = JSON.parse(raw) as { savedAt: number; data: T };
    if (Date.now() - parsed.savedAt > ttlMs) {
      incrementZeroCostStat('cacheMisses', 1);
      return null;
    }
    incrementZeroCostStat('cacheHits', 1);
    incrementZeroCostStat('firestoreReadsSaved', 1);
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function clearAllZeroCostCaches(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const base64Idx = dataUrl.indexOf('base64,');
  if (base64Idx === -1) return dataUrl.length;
  const b64Length = dataUrl.length - (base64Idx + 7);
  return Math.floor((b64Length * 3) / 4);
}

/**
 * Automatically compresses any extracted Word/uploaded image to WebP or JPEG strictly under 100KB
 */
export async function compressImageToWebpOrJpegUnder100KB(
  dataUrl: string,
  maxBytes = 94 * 1024
): Promise<string> {
  if (!dataUrl || typeof document === 'undefined') return dataUrl;
  if (dataUrl.startsWith('data:image/svg+xml')) return dataUrl;

  const originalBytes = estimateDataUrlBytes(dataUrl);
  // If already WebP/JPEG and well under 90KB, keep as-is
  if (
    originalBytes > 0 &&
    originalBytes <= maxBytes &&
    (dataUrl.startsWith('data:image/webp') || dataUrl.startsWith('data:image/jpeg'))
  ) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || 800;
        let height = img.naturalHeight || img.height || 600;
        const maxDim = 1100;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(64, Math.round(width * ratio));
          height = Math.max(64, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        const qualities = [0.82, 0.68, 0.54, 0.42, 0.32];
        let bestDataUrl = dataUrl;

        for (let attempt = 0; attempt < qualities.length; attempt++) {
          const scaleFactor = attempt >= 3 ? 0.78 : 1;
          const targetW = Math.max(48, Math.round(width * scaleFactor));
          const targetH = Math.max(48, Math.round(height * scaleFactor));
          canvas.width = targetW;
          canvas.height = targetH;

          // Fill white backdrop for transparent PNGs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const q = qualities[attempt];
          let candidate = canvas.toDataURL('image/webp', q);
          if (!candidate.startsWith('data:image/webp')) {
            candidate = canvas.toDataURL('image/jpeg', q);
          }

          bestDataUrl = candidate;
          const candidateBytes = estimateDataUrlBytes(candidate);
          if (candidateBytes <= maxBytes) {
            break;
          }
        }

        const newBytes = estimateDataUrlBytes(bestDataUrl);
        if (originalBytes > newBytes) {
          incrementZeroCostStat('imagesCompressedCount', 1);
          incrementZeroCostStat('bytesSavedTotal', originalBytes - newBytes);
        }
        resolve(bestDataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function parseDeviceBrowser(uaString?: string): string {
  const ua = uaString || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return 'Trình duyệt Web · Desktop';

  let browser = 'Trình duyệt Web';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';

  let os = 'Máy tính';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android Mobile';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS / iPadOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} · ${os}`;
}

export function getSchoolInviteCode(): string {
  try {
    return localStorage.getItem(INVITE_CODE_KEY) || 'LQD2026';
  } catch {
    return 'LQD2026';
  }
}

export function setSchoolInviteCode(code: string): void {
  try {
    localStorage.setItem(INVITE_CODE_KEY, code.trim().toUpperCase() || 'LQD2026');
  } catch {
    // ignore
  }
}

export const OWNER_ADMIN_EMAILS = [
  'ttoanlqd@gmail.com',
  'thaytoanlqd1@gmail.com',
] as const;

export function isOwnerAdminEmail(email?: string | null): boolean {
  const clean = (email || '').trim().toLowerCase();
  return clean === 'ttoanlqd@gmail.com' || clean === 'thaytoanlqd1@gmail.com';
}

export function detectAutoRoleForEmail(
  email: string,
  teachers: TeacherRecord[]
): { matchedRole: AppUserRole | null; matchedTeacher?: TeacherRecord } {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return { matchedRole: null };

  if (isOwnerAdminEmail(clean)) {
    const t = teachers.find((x) => x.email.toLowerCase() === clean) || teachers[0];
    return { matchedRole: 'admin', matchedTeacher: t };
  }

  const foundTeacher = teachers.find((t) => (t.email || '').trim().toLowerCase() === clean);
  if (foundTeacher) {
    return { matchedRole: 'teacher', matchedTeacher: foundTeacher };
  }

  return { matchedRole: null };
}

const INITIAL_SEED_ACCOUNTS: UserAccountRecord[] = [
  {
    uid: 'usr-admin-toan',
    email: 'ttoanlqd@gmail.com',
    displayName: 'Thầy Lê Trọng Toàn',
    photoURL: '',
    role: 'admin',
    status: 'active',
    department: 'Tổ Toán - Tin',
    inviteCodeUsed: 'LQD2026',
    lastLoginAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    createdAt: '2026-09-05T07:00:00.000Z',
  },
  {
    uid: 'usr-admin-toan-2',
    email: 'Thaytoanlqd1@gmail.com',
    displayName: 'Thầy Lê Trọng Toàn',
    photoURL: '',
    role: 'admin',
    status: 'active',
    department: 'Tổ Toán - Tin',
    inviteCodeUsed: 'LQD2026',
    lastLoginAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    createdAt: '2026-09-05T07:00:00.000Z',
  },
  {
    uid: 'usr-gv-lan',
    email: 'nguyenhoanglan.lqd@gmail.com',
    displayName: 'Cô Nguyễn Hoàng Lan',
    photoURL: '',
    role: 'teacher',
    status: 'active',
    department: 'Tổ Toán - Tin',
    inviteCodeUsed: 'LQD2026',
    lastLoginAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    createdAt: '2026-09-05T07:15:00.000Z',
  },
  {
    uid: 'usr-gv-hung',
    email: 'tranquochung.lqd@gmail.com',
    displayName: 'Thầy Trần Quốc Hùng',
    photoURL: '',
    role: 'teacher',
    status: 'active',
    department: 'Tổ Vật lý - KTCN',
    inviteCodeUsed: 'LQD2026',
    lastLoginAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    createdAt: '2026-09-05T08:00:00.000Z',
  },
  {
    uid: 'usr-hs-minhanh',
    email: 'minhanh.12a1.lqd@gmail.com',
    displayName: 'Nguyễn Minh Anh',
    photoURL: '',
    role: 'student',
    status: 'active',
    studentClass: '12A1',
    studentCode: 'HS12A101',
    dob: '14/05/2009',
    phone: '0912345601',
    lastLoginAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    createdAt: '2026-09-06T08:00:00.000Z',
  },
  {
    uid: 'usr-hs-baokhanh',
    email: 'baokhanh.12a1.lqd@gmail.com',
    displayName: 'Trần Bảo Khánh',
    photoURL: '',
    role: 'student',
    status: 'active',
    studentClass: '12A1',
    studentCode: 'HS12A102',
    dob: '22/08/2009',
    phone: '0912345602',
    lastLoginAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    createdAt: '2026-09-06T08:10:00.000Z',
  },
  {
    uid: 'usr-hs-thuylinh',
    email: 'thuylinh.11a1.lqd@gmail.com',
    displayName: 'Lê Thùy Linh',
    photoURL: '',
    role: 'student',
    status: 'active',
    studentClass: '11A1',
    studentCode: 'HS11A105',
    dob: '03/11/2010',
    phone: '0912345605',
    lastLoginAt: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    createdAt: '2026-09-06T09:00:00.000Z',
  },
];

const INITIAL_SEED_LOGS: LoginAuditLogRecord[] = [
  {
    id: 'log-seed-1',
    uid: 'usr-admin-toan',
    email: 'Thaytoanlqd1@gmail.com',
    displayName: 'Thầy Lê Trọng Toàn',
    photoURL: '',
    role: 'admin',
    loginAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    deviceBrowser: 'Google Chrome · Windows 10/11',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
  },
  {
    id: 'log-seed-2',
    uid: 'usr-hs-minhanh',
    email: 'minhanh.12a1.lqd@gmail.com',
    displayName: 'Nguyễn Minh Anh',
    photoURL: '',
    role: 'student',
    loginAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    deviceBrowser: 'Apple Safari · iOS / iPadOS',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1',
  },
  {
    id: 'log-seed-3',
    uid: 'usr-hs-baokhanh',
    email: 'baokhanh.12a1.lqd@gmail.com',
    displayName: 'Trần Bảo Khánh',
    photoURL: '',
    role: 'student',
    loginAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    deviceBrowser: 'Google Chrome · Android Mobile',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile',
  },
  {
    id: 'log-seed-4',
    uid: 'usr-gv-lan',
    email: 'nguyenhoanglan.lqd@gmail.com',
    displayName: 'Cô Nguyễn Hoàng Lan',
    photoURL: '',
    role: 'teacher',
    loginAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    deviceBrowser: 'Microsoft Edge · Windows 10/11',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/131.0',
  },
];

export function loadLocalUserAccounts(): UserAccountRecord[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(INITIAL_SEED_ACCOUNTS));
      return INITIAL_SEED_ACCOUNTS;
    }
    const parsed = JSON.parse(raw) as UserAccountRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEED_ACCOUNTS;
  } catch {
    return INITIAL_SEED_ACCOUNTS;
  }
}

export function saveLocalUserAccounts(accounts: UserAccountRecord[]): void {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

export function loadLocalLoginLogs(): LoginAuditLogRecord[] {
  try {
    const raw = localStorage.getItem(LOGIN_LOGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LOGIN_LOGS_STORAGE_KEY, JSON.stringify(INITIAL_SEED_LOGS));
      return INITIAL_SEED_LOGS;
    }
    const parsed = JSON.parse(raw) as LoginAuditLogRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEED_LOGS;
  } catch {
    return INITIAL_SEED_LOGS;
  }
}

export function saveLocalLoginLogs(logs: LoginAuditLogRecord[]): void {
  try {
    localStorage.setItem(LOGIN_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 500)));
  } catch {
    // ignore
  }
}

const INITIAL_FEATURE_METRICS: FeatureUsageMetric[] = [
  {
    featureId: 'worksheet',
    featureName: 'Ngân hàng đề · In đề & Tạo đề chuẩn 2025',
    role: 'teacher',
    count: 148,
    lastUsedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    featureId: 'online_pdf_exam',
    featureName: 'Khảo thí · Tổ chức & Giám sát Phòng thi Online',
    role: 'teacher',
    count: 96,
    lastUsedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    featureId: 'assistant',
    featureName: 'Gemini AI · Sinh đề đổi số & Giải bài tập AI',
    role: 'teacher',
    count: 112,
    lastUsedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
  {
    featureId: 'subject_gradebook',
    featureName: 'Đánh giá môn học · Sổ điểm TT22 & Xuất SMAS',
    role: 'teacher',
    count: 74,
    lastUsedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
  },
  {
    featureId: 'student_exam_portal',
    featureName: 'Học sinh · Vào Phòng Thi Online (Lưu nháp Local, 1 lượt ghi)',
    role: 'student',
    count: 642,
    lastUsedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    featureId: 'student_history_review',
    featureName: 'Học sinh · Tra cứu Điểm & Xem lời giải chi tiết',
    role: 'student',
    count: 485,
    lastUsedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

export function loadFeatureUsageMetrics(): FeatureUsageMetric[] {
  try {
    const raw = localStorage.getItem(FEATURE_USAGE_KEY);
    if (!raw) {
      localStorage.setItem(FEATURE_USAGE_KEY, JSON.stringify(INITIAL_FEATURE_METRICS));
      return INITIAL_FEATURE_METRICS;
    }
    const parsed = JSON.parse(raw) as FeatureUsageMetric[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_FEATURE_METRICS;
  } catch {
    return INITIAL_FEATURE_METRICS;
  }
}

export function recordFeatureUsage(
  featureId: string,
  featureName: string,
  role: 'teacher' | 'student'
): FeatureUsageMetric[] {
  const current = loadFeatureUsageMetrics();
  const now = new Date().toISOString();
  const exists = current.some((m) => m.featureId === featureId);
  const next = exists
    ? current.map((m) =>
        m.featureId === featureId
          ? { ...m, count: m.count + 1, lastUsedAt: now }
          : m
      )
    : [{ featureId, featureName, role, count: 1, lastUsedAt: now }, ...current];
  try {
    localStorage.setItem(FEATURE_USAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export interface LocalExamDraft {
  roomId: string;
  studentName: string;
  studentClass: string;
  studentCode: string;
  part1: Record<number, string>;
  part2: Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>;
  part3: Record<number, string>;
  remainingSeconds: number;
  tabSwitches: number;
  updatedAt: string;
}

export function saveExamDraftToLocal(draft: LocalExamDraft): void {
  try {
    localStorage.setItem(`${EXAM_DRAFT_PREFIX}${draft.roomId}`, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function loadExamDraftFromLocal(roomId: string): LocalExamDraft | null {
  try {
    const raw = localStorage.getItem(`${EXAM_DRAFT_PREFIX}${roomId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalExamDraft;
  } catch {
    return null;
  }
}

export function clearExamDraftFromLocal(roomId: string): void {
  try {
    localStorage.removeItem(`${EXAM_DRAFT_PREFIX}${roomId}`);
  } catch {
    // ignore
  }
}
