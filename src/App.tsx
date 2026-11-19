import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Cloud,
  Database,
  Dices,
  ExternalLink,
  HelpCircle,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase';
import { Sidebar, TEACHLEARN_BOARD_TOOLS } from './components/Sidebar';
import { FloatingTools } from './components/FloatingTools';
import { ToolErrorBoundary } from './components/ToolErrorBoundary';
import { HelpModal, SystemConfigModal } from './components/Modals';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import {
  ConnectionStatusBadge,
  OfflineIndicator,
  PWAInstallButton,
} from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { GradeTargetSelection, StudentPickerModal } from './components/StudentPickerModal';
import { LiveStudentQuizModal } from './components/LiveStudentQuizModal';
import { OralMatrixConfigModal } from './components/OralMatrixConfigModal';
import { AuthPortalModalOrLanding } from './components/AuthPortalModalOrLanding';
import { MOCK_EXAM_0107 } from './data/mockExam0107';
import {
  INITIAL_EXAM_ROOMS,
  INITIAL_SUBMISSIONS,
  SUBJECTS_29,
} from './data/curriculumKNTT';
import {
  AppUserRole,
  BankQuestion,
  Classroom,
  ClassroomStoreData,
  ClassroomStudent,
  ExamPaper,
  ExamSubmission,
  HomeworkAssignment,
  HomeworkSubmission,
  LoginAuditLogRecord,
  MasterDataStore,
  ModuleId,
  OnlineExamRoom,
  OralCheckMatrixConfig,
  StudentAttemptRecord,
  SubjectDirectoryItem,
  SubjectGradeEntry,
  UserAccountRecord,
  ViewMode,
} from './types/eduplan';
import {
  appendStudentAttemptInStore,
  loadClassroomData,
} from './utils/classroomDb';
import {
  applyScoreToGradebookColumn,
  deleteGradebookEntriesForStudents,
  loadGradebookEntries,
  loadGradebookFromFirestore,
  migrateGradebookStudentsToClass,
} from './utils/gradebookDb';
import {
  createInitialMasterData,
  loadMasterData,
  resolveActiveTeachingContext,
} from './utils/masterDataDb';
import {
  examPaperToBankQuestions,
  exportBankToJsonFile,
  loadBankQuestions,
  parseBankFromJsonText,
  saveBankQuestionsBulk,
} from './utils/questionBankDb';
import { loadAllOralMatrixConfigs, saveOralMatrixConfig } from './utils/oralMatrixDb';
import {
  detectAutoRoleForEmail,
  getCachedData,
  getSchoolInviteCode,
  isOwnerAdminEmail,
  loadLocalLoginLogs,
  loadLocalUserAccounts,
  parseDeviceBrowser,
  recordFeatureUsage,
  saveLocalLoginLogs,
  saveLocalUserAccounts,
  setCachedData,
} from './utils/cloudCacheAndCompression';
import {
  loadLocalHomeworkAssignments,
  loadLocalHomeworkSubmissions,
  saveLocalHomeworkAssignments,
  saveLocalHomeworkSubmissions,
} from './utils/homeworkDb';
import { TeachingModule } from './modules/TeachingModule';
import { ClassroomManagerModule } from './modules/ClassroomManagerModule';
import { StudentPortalModule, StudentPortalTab } from './modules/StudentPortalModule';
import { StudentPopQuizResponderModal } from './components/SmartboardCanvasStudio';

const DEFAULT_MAIN_ADMIN_PORTAL_URL = 'https://teachlearn-edu.web.app';

const createLocalTeachingAccount = (teacherName?: string): UserAccountRecord => {
  const nowIso = new Date().toISOString();
  return {
    uid: 'local-teaching-mode',
    email: 'local@teachlearn.board',
    displayName: teacherName || 'Giáo viên (Chế độ Cục bộ)',
    photoURL: '',
    role: 'teacher',
    status: 'active',
    department: 'Giảng dạy Cục bộ (Local Mode)',
    lastLoginAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

export default function App() {
  // Open Smartboard Canvas directly as the Main Screen (95% display area) in Local Mode
  const [activeModule, setActiveModule] = useState<ModuleId>('teaching_smartboard');
  const [viewMode, setViewMode] = useState<ViewMode>('teacher');
  const [studentPortalTab, setStudentPortalTab] = useState<StudentPortalTab>('exam_room');
  const [authPortalOpen, setAuthPortalOpen] = useState(false);
  const [needsRoleOnboarding, setNeedsRoleOnboarding] = useState(false);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [urlPopQuizId, setUrlPopQuizId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('popQuizId');
    }
    return null;
  });

  // Default compact sidebar (56px icon rail) to maximize 65-86 inch Smartboard canvas area
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [mainAdminPortalUrl, setMainAdminPortalUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tl_board_admin_url') || DEFAULT_MAIN_ADMIN_PORTAL_URL;
    }
    return DEFAULT_MAIN_ADMIN_PORTAL_URL;
  });

  const handleChangeMainAdminPortalUrl = (url: string) => {
    setMainAdminPortalUrl(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tl_board_admin_url', url);
    }
  };

  const isOnline = useOnlineStatus();

  const [user, setUser] = useState<User | null>(null);
  const [userAccounts, setUserAccounts] = useState<UserAccountRecord[]>(() =>
    loadLocalUserAccounts()
  );
  const [, setLoginLogs] = useState<LoginAuditLogRecord[]>(() => loadLocalLoginLogs());
  const [activeAccount, setActiveAccount] = useState<UserAccountRecord>(() =>
    createLocalTeachingAccount()
  );

  // Local Teaching Mode whenever no Google account is signed in (both online & offline)
  const isLocalMode = !user;

  // Strict Owner-Only Admin check (only unlocked after actively signing in with Google)
  const isOwnerAdmin = React.useMemo(
    () => Boolean(user && isOwnerAdminEmail(user.email)),
    [user]
  );

  // Local Mode & Owner Admin both have full access to local IndexedDB + .json question bank & roster
  // without ever writing to Cloud Firestore unless signed in as Owner Admin.
  const canManageLocalResources = isOwnerAdmin || isLocalMode;

  const [subjects, setSubjects] = useState<SubjectDirectoryItem[]>(SUBJECTS_29);
  const [defaultSubject, setDefaultSubject] = useState('Toán học');

  const [currentExam, setCurrentExam] = useState<ExamPaper>(MOCK_EXAM_0107);
  const [bankItems, setBankItems] = useState<BankQuestion[]>(() =>
    examPaperToBankQuestions(MOCK_EXAM_0107, `Đề chuẩn ${MOCK_EXAM_0107.examCode}`)
  );
  const bankItemsRef = useRef<BankQuestion[]>(bankItems);
  bankItemsRef.current = bankItems;
  const [cloudBankCount, setCloudBankCount] = useState<number>(0);

  const [masterData, setMasterData] = useState<MasterDataStore>(() => createInitialMasterData());
  const activeContext = React.useMemo(() => resolveActiveTeachingContext(masterData), [masterData]);

  const [classroomStore, setClassroomStore] = useState<ClassroomStoreData>({
    classes: [],
    students: [],
  });
  const [gradebookMap, setGradebookMap] = useState<Record<string, SubjectGradeEntry>>({});
  const gradebookMapRef = React.useRef<Record<string, SubjectGradeEntry>>(gradebookMap);
  gradebookMapRef.current = gradebookMap;
  const classroomStoreRef = React.useRef<ClassroomStoreData>(classroomStore);
  classroomStoreRef.current = classroomStore;

  const syncExamHeaderFromMaster = React.useCallback((store: MasterDataStore) => {
    const ctx = resolveActiveTeachingContext(store);
    setDefaultSubject(ctx.subjectName);
    setCurrentExam((prev) => ({
      ...prev,
      department: ctx.departmentName,
      schoolName: ctx.schoolName,
      author: `Biên soạn: ${ctx.teacherHonorific}`,
      sourceRepo: `Kho nguồn: Tài liệu ${ctx.subjectName.toLowerCase()} ${ctx.schoolYearLabel}`,
      subject: ctx.subjectName,
    }));
  }, []);

  const [activeClassId, setActiveClassId] = useState<string>('cls-12a1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quizTarget, setQuizTarget] = useState<{
    studentId: string;
    classId: string;
    gradeTarget?: GradeTargetSelection;
  } | null>(null);
  const [oralMatrixConfigs, setOralMatrixConfigs] = useState<
    Partial<Record<'10' | '11' | '12', OralCheckMatrixConfig>>
  >(() => loadAllOralMatrixConfigs());
  const [matrixModalState, setMatrixModalState] = useState<{
    open: boolean;
    classId: string;
    requiredReason?: string | null;
    pendingAction?:
      | { type: 'picker'; classId: string }
      | { type: 'student_quiz'; student: ClassroomStudent; classroom: Classroom }
      | null;
  } | null>(null);

  const activeClassroomObj = React.useMemo(
    () =>
      classroomStore.classes.find((c) => c.id === activeClassId) ||
      classroomStore.classes[0] ||
      null,
    [classroomStore.classes, activeClassId]
  );

  const handleOpenMatrixConfig = (classId: string) => {
    setMatrixModalState({
      open: true,
      classId,
      requiredReason: null,
      pendingAction: null,
    });
  };

  const handleRequestStudentPicker = (classId: string) => {
    const cls =
      classroomStore.classes.find((c) => c.id === classId) || activeClassroomObj;
    const mat = cls ? oralMatrixConfigs[cls.grade] : null;
    if (!mat || !mat.isLocked) {
      setMatrixModalState({
        open: true,
        classId: cls?.id || classId,
        requiredReason: `Lớp ${cls?.name || ''} (Khối ${cls?.grade || '12'}) chưa có Ma trận Yêu cầu Kiểm tra. Vui lòng thiết lập & Lưu cấu hình trước khi gọi học sinh.`,
        pendingAction: { type: 'picker', classId: cls?.id || classId },
      });
      return;
    }
    setActiveClassId(cls?.id || classId);
    setPickerOpen(true);
  };

  const handleRequestStudentQuiz = (
    student: ClassroomStudent,
    classroom: Classroom
  ) => {
    const mat = oralMatrixConfigs[classroom.grade];
    if (!mat || !mat.isLocked) {
      setMatrixModalState({
        open: true,
        classId: classroom.id,
        requiredReason: `Vui lòng thiết lập Ma trận Yêu cầu Kiểm tra (Bước 1) cho Khối ${classroom.grade} trước khi mời em ${student.fullName} chọn gói bài làm.`,
        pendingAction: { type: 'student_quiz', student, classroom },
      });
      return;
    }
    setQuizTarget({ studentId: student.id, classId: classroom.id });
  };

  const saveStudentAttemptAtomic = async (
    studentId: string,
    attempt: StudentAttemptRecord
  ): Promise<ClassroomStoreData> => {
    if (!canManageLocalResources) {
      // Guest teacher Read-Only mode: keep attempt strictly in temporary browser session state
      const tempNext: ClassroomStoreData = {
        ...classroomStoreRef.current,
        students: classroomStoreRef.current.students.map((st) =>
          st.id === studentId
            ? { ...st, attempts: [attempt, ...(st.attempts || [])] }
            : st
        ),
      };
      classroomStoreRef.current = tempNext;
      setClassroomStore(tempNext);
      return tempNext;
    }
    const next = await appendStudentAttemptInStore(
      classroomStoreRef.current,
      studentId,
      attempt
    );
    classroomStoreRef.current = next;
    setClassroomStore(next);
    return next;
  };

  const syncAttemptToGradebook = async (
    studentId: string,
    attempt: StudentAttemptRecord,
    gradeTarget?: GradeTargetSelection
  ) => {
    if (!gradeTarget || !isOwnerAdmin) return;
    const normalizedScore =
      attempt.maxScore > 0 && attempt.maxScore !== 10
        ? Math.round((attempt.score / attempt.maxScore) * 10 * 100) / 100
        : Math.max(0, Math.min(10, attempt.score));
    const res = await applyScoreToGradebookColumn(
      gradebookMapRef.current,
      attempt.classId,
      gradeTarget.semester,
      studentId,
      gradeTarget.targetColumn,
      normalizedScore,
      attempt.id,
      user?.uid
    );
    gradebookMapRef.current = res.nextMap;
    setGradebookMap(res.nextMap);
  };

  const [examRooms] = useState<OnlineExamRoom[]>(
    () => getCachedData<OnlineExamRoom[]>('exam_rooms_v1') || INITIAL_EXAM_ROOMS
  );
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(
    () => getCachedData<ExamSubmission[]>('exam_submissions_v1') || INITIAL_SUBMISSIONS
  );
  const [homeworkAssignments, setHomeworkAssignments] = useState<HomeworkAssignment[]>(() =>
    loadLocalHomeworkAssignments()
  );
  const [homeworkSubmissions, setHomeworkSubmissions] = useState<HomeworkSubmission[]>(() =>
    loadLocalHomeworkSubmissions()
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleTogglePresentationMode = () => {
    setFocusMode((prev) => {
      const next = !prev;
      try {
        if (next && document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (!next && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {
        // Ignore fullscreen errors inside restricted iframes
      }
      return next;
    });
  };

  // Global Keyboard Shortcuts: F11 / Alt+F (Fullscreen) and ? (Shortcuts Guide)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      // F11 or Alt+F -> Toggle Fullscreen Presentation Mode
      if (e.key === 'F11' || (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        handleTogglePresentationMode();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('assignmentId') || params.get('hw') || params.get('pin')) {
        setViewMode('student');
        setStudentPortalTab('homework_portal');
      }
    }

    loadMasterData()
      .then(async (mData) => {
        setMasterData(mData);
        syncExamHeaderFromMaster(mData);
        const cData = await loadClassroomData(mData);
        classroomStoreRef.current = cData;
        setClassroomStore(cData);
        setCachedData('class_roster_v1', cData);
        if (cData.classes.length > 0) {
          setActiveClassId((prev) =>
            cData.classes.some((c) => c.id === prev) ? prev : cData.classes[0].id
          );
        }
        setHomeworkAssignments((prev) =>
          prev.length > 0 ? prev : loadLocalHomeworkAssignments(cData)
        );
        setHomeworkSubmissions((prev) =>
          prev.length > 0 ? prev : loadLocalHomeworkSubmissions(cData)
        );
        const entries = await loadGradebookEntries(cData.students);
        if (entries) {
          gradebookMapRef.current = entries;
          setGradebookMap(entries);
        }
      })
      .catch(() => {});

    loadBankQuestions(MOCK_EXAM_0107)
      .then((items) => {
        if (items.length > 0) setBankItems(items);
      })
      .catch(() => {});

    if (typeof navigator === 'undefined' || navigator.onLine) {
      testFirestoreConnection();
      fetch('/api/health')
        .then((r) => r.json())
        .then((d) => setAiConfigured(Boolean(d.aiConfigured)))
        .catch(() => setAiConfigured(false));
    } else {
      setAiConfigured(false);
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setActiveAccount(createLocalTeachingAccount());
        setNeedsRoleOnboarding(false);
        setViewMode('teacher');
      } else {
        const isOwner = isOwnerAdminEmail(u.email);
        const found = userAccounts.find(
          (a) => a.email.toLowerCase() === (u.email || '').toLowerCase()
        );
        if (isOwner) {
          const ownerAcc: UserAccountRecord = {
            uid: u.uid,
            email: u.email || 'ttoanlqd@gmail.com',
            displayName: u.displayName || 'Thầy Lê Trọng Toàn (Admin)',
            photoURL: u.photoURL || '',
            role: 'admin',
            status: 'active',
            department: 'Tổ Toán - Tin (Admin Hệ thống)',
            lastLoginAt: new Date().toISOString(),
            createdAt: found?.createdAt || new Date().toISOString(),
          };
          setActiveAccount(ownerAcc);
          setNeedsRoleOnboarding(false);
          setAuthPortalOpen(false);
          setViewMode('teacher');
        } else if (found) {
          setActiveAccount(found);
          setNeedsRoleOnboarding(found.status === 'pending');
          setViewMode(found.role === 'student' ? 'student' : 'teacher');
          if (found.role === 'student' || found.status === 'pending') {
            setAuthPortalOpen(true);
          }
        } else {
          const autoCheck = detectAutoRoleForEmail(u.email || '', masterData.teachers);
          if (autoCheck.matchedRole === 'admin' || autoCheck.matchedRole === 'teacher') {
            const newAcc: UserAccountRecord = {
              uid: u.uid,
              email: u.email || 'teacher@gmail.com',
              displayName:
                u.displayName || autoCheck.matchedTeacher?.fullName || 'Giáo viên THPT',
              photoURL: u.photoURL || '',
              role: autoCheck.matchedRole,
              status: 'active',
              lastLoginAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            };
            setActiveAccount(newAcc);
            setNeedsRoleOnboarding(false);
            setAuthPortalOpen(false);
            setViewMode('teacher');
          } else {
            const pendingAcc: UserAccountRecord = {
              uid: u.uid,
              email: u.email || 'user@gmail.com',
              displayName: u.displayName || 'Người dùng Google',
              photoURL: u.photoURL || '',
              role: 'teacher',
              status: 'pending',
              lastLoginAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            };
            setActiveAccount(pendingAcc);
            setNeedsRoleOnboarding(true);
            setViewMode('teacher');
          }
        }
      }
    });
    return () => unsubAuth();
  }, [syncExamHeaderFromMaster]);

  // Sync shared Cloud Firestore collections (bankQuestions, homeworkAssignments, gradebookEntries)
  useEffect(() => {
    if (!user) return;

    // 1. Live sync Question Bank from shared Cloud Firestore (`bankQuestions`)
    const bankQ = query(collection(db, 'bankQuestions'));
    const unsubBank = onSnapshot(
      bankQ,
      (snap) => {
        if (!snap.empty) {
          const cloudQuestions = snap.docs
            .map((d) => d.data() as BankQuestion)
            .filter((q) => q && q.id && q.stem);
          setCloudBankCount(cloudQuestions.length);
          if (cloudQuestions.length > 0) {
            saveBankQuestionsBulk(bankItemsRef.current, cloudQuestions)
              .then((res) => {
                setBankItems(res.items);
              })
              .catch(() => {});
          }
        }
      },
      () => {}
    );

    // 2. Live sync Homework / Student Notebook entries
    const hwQ = query(collection(db, 'homeworkAssignments'));
    const unsubHw = onSnapshot(
      hwQ,
      (snap) => {
        if (!snap.empty) {
          const cloudHw = snap.docs.map((d) => d.data() as HomeworkAssignment);
          setHomeworkAssignments((prev) => {
            const map = new Map<string, HomeworkAssignment>();
            [...prev, ...cloudHw].forEach((h) => map.set(h.id, h));
            const merged = Array.from(map.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            saveLocalHomeworkAssignments(merged);
            return merged;
          });
        }
      },
      () => {}
    );

    const hwSubsQ = query(collection(db, 'homeworkSubmissions'));
    const unsubHwSubs = onSnapshot(
      hwSubsQ,
      (snap) => {
        if (!snap.empty) {
          const cloudSubs = snap.docs.map((d) => d.data() as HomeworkSubmission);
          setHomeworkSubmissions((prev) => {
            const map = new Map<string, HomeworkSubmission>();
            [...prev, ...cloudSubs].forEach((s) => map.set(s.id, s));
            const merged = Array.from(map.values());
            saveLocalHomeworkSubmissions(merged);
            return merged;
          });
        }
      },
      () => {}
    );

    // 3. Load SMAS Gradebook entries from shared Cloud Firestore
    let cancelled = false;
    loadGradebookFromFirestore(user.uid)
      .then((cloudMap) => {
        if (cancelled || Object.keys(cloudMap).length === 0) return;
        setGradebookMap((prev) => {
          const merged: Record<string, SubjectGradeEntry> = { ...prev };
          Object.entries(cloudMap).forEach(([key, cloudEntry]) => {
            const localEntry = merged[key];
            if (!localEntry || (cloudEntry.updatedAt || '') > (localEntry.updatedAt || '')) {
              merged[key] = cloudEntry;
            }
          });
          return merged;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubBank();
      unsubHw();
      unsubHwSubs();
    };
  }, [user]);

  // Manual 1-click JSON Question Bank Backup Loader (Owner Admin or Offline Bypass Local Mode)
  const handleImportJsonBankFile = async (
    file: File
  ): Promise<{ added: number; total: number }> => {
    if (!canManageLocalResources) {
      return { added: 0, total: bankItemsRef.current.length };
    }
    const text = await file.text();
    const parsed = parseBankFromJsonText(text);
    if (parsed.length > 0) {
      const res = await saveBankQuestionsBulk(bankItemsRef.current, parsed);
      setBankItems(res.items);
      return { added: res.added, total: res.items.length };
    }
    return { added: 0, total: bankItemsRef.current.length };
  };

  // Manual 1-click Cloud Firestore Bank Sync (requires active Google login)
  const handleSyncCloudBankNow = async (): Promise<number> => {
    if (!user) return bankItemsRef.current.length;
    const snap = await getDocs(collection(db, 'bankQuestions'));
    const cloudQuestions = snap.docs
      .map((d) => d.data() as BankQuestion)
      .filter((q) => q && q.id && q.stem);
    setCloudBankCount(cloudQuestions.length);
    if (cloudQuestions.length > 0) {
      setBankItems(cloudQuestions);
      return cloudQuestions.length;
    }
    return bankItemsRef.current.length;
  };

  // Publish Smartboard Pages & Lesson Notes directly to Student Portal Notebook (Strictly Owner Admin Only)
  const handlePublishToStudentNotebook = async (payload: {
    title: string;
    className: string;
    grade: '10' | '11' | '12';
    pageImages: string[];
    summaryText: string;
  }) => {
    if (!isOwnerAdmin) return;
    const nowIso = new Date().toISOString();
    const targetCls =
      classroomStore.classes.find((c) => c.name === payload.className) || activeClassroomObj;
    const docId = `sb-note-${Date.now()}`;

    const boardNoteAssignment: HomeworkAssignment = {
      id: docId,
      ownerId: user?.uid,
      pinCode: String(Math.floor(100000 + Math.random() * 899999)),
      title: `📌 [Sổ Ghi Chép Bảng Tương Tác] ${payload.title}`,
      subject: activeContext.subjectName || 'Toán học',
      grade: payload.grade,
      sourceType: 'essay_sgk',
      targetMode: 'classes',
      targetClassIds: [targetCls?.id || activeClassId],
      targetClassNames: [payload.className],
      targetStudentIds: [],
      targetStudentCodes: [],
      targetStudentNames: [],
      targetLabel: `Lớp ${payload.className}`,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      allowLateSubmission: true,
      allowReviewSolutions: true,
      requireEssayPhotos: false,
      essayPromptText: `${payload.summaryText}\n\n(Ghi chép bài giảng từ TeachLearn Board — ${payload.pageImages.length} trang bảng · Giáo viên: ${activeContext.teacherHonorific})`,
      essayPromptImages: payload.pageImages,
      objectiveWeightPoints: 0,
      essayWeightPoints: 10,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setHomeworkAssignments((prev) => {
      const next = [boardNoteAssignment, ...prev];
      saveLocalHomeworkAssignments(next);
      return next;
    });

    if (user) {
      try {
        const cleanHw = JSON.parse(
          JSON.stringify({ ...boardNoteAssignment, ownerId: user.uid })
        );
        await setDoc(doc(db, 'homeworkAssignments', boardNoteAssignment.id), cleanHw);
        await setDoc(doc(db, 'documents', docId), {
          id: docId,
          ownerId: user.uid,
          title: payload.title.slice(0, 240),
          docType: 'smartboard_notebook',
          grade: payload.grade,
          subject: activeContext.subjectName || 'Toán',
          examCode: payload.className,
          payload: {
            className: payload.className,
            summaryText: payload.summaryText,
            pageCount: payload.pageImages.length,
            coverImage: payload.pageImages[0] || '',
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Fallback to local storage if offline
      }
    }
  };

  const recordAccountAndAuditLog = async (
    u: { uid: string; email: string; displayName: string; photoURL: string },
    preferredRole?: 'teacher' | 'student',
    extra?: {
      inviteCode?: string;
      studentClass?: string;
      studentCode?: string;
      customName?: string;
    }
  ) => {
    const nowIso = new Date().toISOString();
    const autoCheck = detectAutoRoleForEmail(u.email, masterData.teachers);
    const schoolInvite = getSchoolInviteCode();
    const cleanInvite = (extra?.inviteCode || '').trim().toUpperCase();

    let resolvedRole: AppUserRole = 'student';
    let resolvedStatus: 'active' | 'pending' = 'active';
    if (autoCheck.matchedRole) {
      resolvedRole = autoCheck.matchedRole;
      resolvedStatus = 'active';
      setNeedsRoleOnboarding(false);
    } else if (preferredRole === 'teacher') {
      if (cleanInvite === schoolInvite || cleanInvite === 'LQD2026' || cleanInvite === 'TEACH2026') {
        resolvedRole = 'teacher';
        resolvedStatus = 'active';
        setNeedsRoleOnboarding(false);
      } else {
        resolvedRole = 'teacher';
        resolvedStatus = 'pending';
        setNeedsRoleOnboarding(true);
      }
    } else if (preferredRole === 'student') {
      resolvedRole = 'student';
      resolvedStatus = 'active';
      setNeedsRoleOnboarding(false);
    }

    const accountRec: UserAccountRecord = {
      uid: u.uid,
      email: u.email,
      displayName:
        extra?.customName ||
        u.displayName ||
        autoCheck.matchedTeacher?.fullName ||
        (resolvedRole === 'student' ? 'Học sinh THPT' : 'Giáo viên THPT'),
      photoURL: u.photoURL || '',
      role: resolvedRole,
      status: resolvedStatus,
      studentClass: resolvedRole === 'student' ? extra?.studentClass || '12A1' : undefined,
      studentCode: resolvedRole === 'student' ? extra?.studentCode || 'HS12A101' : undefined,
      department:
        resolvedRole !== 'student'
          ? autoCheck.matchedTeacher?.departmentGroup
            ? `Tổ ${autoCheck.matchedTeacher.departmentGroup}`
            : 'Tổ Toán - Tin'
          : undefined,
      inviteCodeUsed: cleanInvite || undefined,
      lastLoginAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const logRec: LoginAuditLogRecord = {
      id: `log-${Date.now()}`,
      uid: u.uid,
      email: u.email,
      displayName: accountRec.displayName,
      photoURL: accountRec.photoURL,
      role: resolvedRole,
      loginAt: nowIso,
      deviceBrowser: parseDeviceBrowser(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 480) : 'Web',
    };

    setActiveAccount(accountRec);
    setUserAccounts((prev) => {
      const next = [
        accountRec,
        ...prev.filter((a) => a.uid !== accountRec.uid && a.email !== accountRec.email),
      ];
      saveLocalUserAccounts(next);
      return next;
    });
    setLoginLogs((prev) => {
      const next = [logRec, ...prev];
      saveLocalLoginLogs(next);
      return next;
    });

    setViewMode(resolvedRole === 'student' ? 'student' : 'teacher');

    if (auth.currentUser) {
      try {
        const cleanAccount = Object.fromEntries(
          Object.entries(accountRec).filter(([, v]) => v !== undefined)
        );
        const cleanLog = Object.fromEntries(
          Object.entries(logRec).filter(([, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'userAccounts', u.uid), cleanAccount);
        await setDoc(doc(db, 'loginLogs', logRec.id), cleanLog);
      } catch {
        // Ignore if rules or network offline
      }
    }
  };

  const handleGooglePopupLogin = async (
    preferredRole?: 'teacher' | 'student',
    extraProfile?: {
      inviteCode?: string;
      studentClass?: string;
      studentCode?: string;
      customName?: string;
    }
  ) => {
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred.user) {
      await recordAccountAndAuditLog(
        {
          uid: cred.user.uid,
          email: cred.user.email || 'user@gmail.com',
          displayName: cred.user.displayName || 'Người dùng Google',
          photoURL: cred.user.photoURL || '',
        },
        preferredRole,
        extraProfile
      );
      setAuthPortalOpen(false);
    }
  };

  const handleEnterLocalMode = React.useCallback(() => {
    setActiveAccount(createLocalTeachingAccount(activeContext.teacherHonorific));
    setNeedsRoleOnboarding(false);
    setViewMode('teacher');
    setAuthPortalOpen(false);
  }, [activeContext.teacherHonorific]);

  // Direct 1-click Google Sign-In Popup from top-right header button
  const handleQuickGoogleCloudLogin = async () => {
    if (!isOnline) {
      setAuthPortalOpen(true);
      return;
    }
    setGoogleAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await recordAccountAndAuditLog(
          {
            uid: cred.user.uid,
            email: cred.user.email || 'user@gmail.com',
            displayName: cred.user.displayName || 'Người dùng Google',
            photoURL: cred.user.photoURL || '',
          },
          'teacher'
        );
        const isOwner = isOwnerAdminEmail(cred.user.email);
        const autoCheck = detectAutoRoleForEmail(
          cred.user.email || '',
          masterData.teachers
        );
        if (isOwner || autoCheck.matchedRole === 'admin' || autoCheck.matchedRole === 'teacher') {
          setAuthPortalOpen(false);
        } else {
          // Unknown account: show optional invite-code onboarding modal
          setAuthPortalOpen(true);
        }
      }
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      // If user intentionally closed the popup, quietly stay in Local Mode
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      // Otherwise open the Auth modal for clear feedback / retry
      setAuthPortalOpen(true);
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    void handleQuickGoogleCloudLogin();
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setActiveAccount(createLocalTeachingAccount(activeContext.teacherHonorific));
    setNeedsRoleOnboarding(false);
    setViewMode('teacher');
    setAuthPortalOpen(false);
  };

  const handleUpdateAccountRoleOrStatus = async (
    uid: string,
    updates: Partial<Pick<UserAccountRecord, 'role' | 'status' | 'studentClass' | 'department'>>
  ) => {
    setUserAccounts((prev) => {
      const next = prev.map((a) => (a.uid === uid ? { ...a, ...updates } : a));
      saveLocalUserAccounts(next);
      return next;
    });
    if (activeAccount && activeAccount.uid === uid) {
      setActiveAccount((prev) => ({ ...prev, ...updates } as UserAccountRecord));
    }
  };

  const handleAddSubmission = async (sub: ExamSubmission) => {
    setSubmissions((prev) => {
      const next = [sub, ...prev];
      setCachedData('exam_submissions_v1', next);
      return next;
    });
    if (user) {
      try {
        await setDoc(doc(db, 'examSubmissions', sub.id), {
          id: sub.id,
          ownerId: user.uid,
          studentUid: sub.studentUid || user.uid,
          studentEmail: sub.studentEmail || user.email || '',
          studentCode: sub.studentCode || 'HS12A101',
          roomId: sub.roomId,
          roomTitle: sub.roomTitle || '',
          studentName: sub.studentName,
          studentClass: sub.studentClass,
          grade: sub.grade || '12',
          examCode: sub.examCode || '0107',
          score: sub.score,
          part1Score: sub.part1Score ?? 3.0,
          part2Score: sub.part2Score ?? 3.5,
          part3Score: sub.part3Score ?? 2.0,
          durationSeconds: sub.durationSeconds ?? 1800,
          tabSwitches: sub.tabSwitches,
          answersPayload: sub.answersPayload || {},
          submittedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `examSubmissions/${sub.id}`);
      }
    }
  };

  const handleAddHomeworkSubmission = async (sub: HomeworkSubmission) => {
    setHomeworkSubmissions((prev) => {
      const next = [sub, ...prev.filter((item) => item.id !== sub.id)];
      saveLocalHomeworkSubmissions(next);
      return next;
    });
    if (user) {
      try {
        const cleanSub = JSON.parse(
          JSON.stringify({
            ...sub,
            ownerId: user.uid,
            studentUid: sub.studentUid || user.uid,
          })
        );
        await setDoc(doc(db, 'homeworkSubmissions', sub.id), cleanSub);
      } catch {
        // Keep local cache
      }
    }
  };

  const handleSelectTeacherModule = (id: ModuleId) => {
    setActiveModule(id);
    recordFeatureUsage(id, `TeachLearn Board · ${id}`, 'teacher');
  };

  const availableClassesList = React.useMemo(
    () =>
      classroomStore.classes.length > 0
        ? classroomStore.classes.map((c) => ({ id: c.id, name: c.name, grade: c.grade }))
        : [
            { id: 'cls-12a1', name: '12A1', grade: '12' as const },
            { id: 'cls-11b05', name: '11B05', grade: '11' as const },
            { id: 'cls-10c01', name: '10C01', grade: '10' as const },
          ],
    [classroomStore.classes]
  );

  // Render ONLY the 5 core classroom teaching tools of TeachLearn Board
  const renderModule = () => {
    switch (activeModule) {
      case 'teaching_function_plot':
        return (
          <TeachingModule
            activeTab="function_plot"
            bankItems={bankItems}
            schoolName={activeContext.schoolName}
            teacherName={activeContext.teacherHonorific}
            onSelectModule={handleSelectTeacherModule}
            onOpenJsonBankLoader={canManageLocalResources ? () => setConfigOpen(true) : undefined}
            onPublishToStudentNotebook={isOwnerAdmin ? handlePublishToStudentNotebook : undefined}
            availableClasses={availableClassesList}
            activeClassName={activeClassroomObj?.name || '12A1'}
            isOwnerAdmin={isOwnerAdmin}
          />
        );
      case 'teaching_geometry_3d':
        return (
          <TeachingModule
            activeTab="geometry_3d"
            bankItems={bankItems}
            schoolName={activeContext.schoolName}
            teacherName={activeContext.teacherHonorific}
            onSelectModule={handleSelectTeacherModule}
            onOpenJsonBankLoader={canManageLocalResources ? () => setConfigOpen(true) : undefined}
            onPublishToStudentNotebook={isOwnerAdmin ? handlePublishToStudentNotebook : undefined}
            availableClasses={availableClassesList}
            activeClassName={activeClassroomObj?.name || '12A1'}
            isOwnerAdmin={isOwnerAdmin}
          />
        );
      case 'teaching_classroom':
        return (
          <ClassroomManagerModule
            storeData={classroomStore}
            onUpdateStore={canManageLocalResources ? setClassroomStore : () => {}}
            activeClassId={activeClassId}
            onChangeActiveClassId={setActiveClassId}
            masterData={masterData}
            gradebookMap={gradebookMap}
            onUpdateGradebookMap={canManageLocalResources ? setGradebookMap : () => {}}
            ownerUid={isOwnerAdmin ? user?.uid : undefined}
            oralMatrixConfig={
              activeClassroomObj ? oralMatrixConfigs[activeClassroomObj.grade] || null : null
            }
            onOpenMatrixConfig={handleOpenMatrixConfig}
            onOpenStudentPicker={handleRequestStudentPicker}
            onStartQuizForStudent={handleRequestStudentQuiz}
            onSaveAttempt={async (studentId, attempt) => {
              await saveStudentAttemptAtomic(studentId, attempt);
            }}
            onStudentsDeleted={async (studentIds) => {
              if (!isOwnerAdmin) return;
              const nextMap = await deleteGradebookEntriesForStudents(gradebookMap, studentIds);
              setGradebookMap(nextMap);
            }}
            onStudentsMoved={async (studentIds, fromClassId, toClassId) => {
              if (!isOwnerAdmin) return;
              const nextMap = await migrateGradebookStudentsToClass(
                gradebookMap,
                studentIds,
                fromClassId,
                toClassId
              );
              setGradebookMap(nextMap);
            }}
            isOwnerAdmin={canManageLocalResources}
          />
        );
      case 'teaching_slides':
        return (
          <TeachingModule
            activeTab="slides"
            bankItems={bankItems}
            schoolName={activeContext.schoolName}
            teacherName={activeContext.teacherHonorific}
            onSelectModule={handleSelectTeacherModule}
            onOpenJsonBankLoader={canManageLocalResources ? () => setConfigOpen(true) : undefined}
            onPublishToStudentNotebook={isOwnerAdmin ? handlePublishToStudentNotebook : undefined}
            availableClasses={availableClassesList}
            activeClassName={activeClassroomObj?.name || '12A1'}
            isOwnerAdmin={isOwnerAdmin}
          />
        );
      case 'teaching_realworld':
        return (
          <TeachingModule
            activeTab="realworld"
            bankItems={bankItems}
            schoolName={activeContext.schoolName}
            teacherName={activeContext.teacherHonorific}
            onSelectModule={handleSelectTeacherModule}
            onOpenJsonBankLoader={canManageLocalResources ? () => setConfigOpen(true) : undefined}
            onPublishToStudentNotebook={isOwnerAdmin ? handlePublishToStudentNotebook : undefined}
            availableClasses={availableClassesList}
            activeClassName={activeClassroomObj?.name || '12A1'}
            isOwnerAdmin={isOwnerAdmin}
          />
        );
      case 'teaching_smartboard':
      default:
        return (
          <TeachingModule
            activeTab="smartboard"
            bankItems={bankItems}
            schoolName={activeContext.schoolName}
            teacherName={activeContext.teacherHonorific}
            onSelectModule={handleSelectTeacherModule}
            onOpenJsonBankLoader={canManageLocalResources ? () => setConfigOpen(true) : undefined}
            onPublishToStudentNotebook={isOwnerAdmin ? handlePublishToStudentNotebook : undefined}
            availableClasses={availableClassesList}
            activeClassName={activeClassroomObj?.name || '12A1'}
            isOwnerAdmin={isOwnerAdmin}
          />
        );
    }
  };

  // Direct QR Pop Quiz responder screen when a student scans the Smartboard QR code (?popQuizId=...)
  if (urlPopQuizId) {
    return (
      <StudentPopQuizResponderModal
        quizId={urlPopQuizId}
        defaultStudentName={activeAccount?.displayName || ''}
        defaultStudentClass={activeAccount?.studentClass || '11B05'}
        onClose={() => setUrlPopQuizId(null)}
      />
    );
  }

  // Direct entry into Interactive Smartboard (Local Teaching Mode by default — no mandatory login screen)
  const teacherPhotoUrl = user?.photoURL || activeAccount.photoURL;
  const teacherDisplayName =
    user?.displayName || activeAccount.displayName || activeContext.teacherHonorific;
  const teacherInitial = (teacherDisplayName.trim().split(/\s+/).pop()?.[0] || 'G').toUpperCase();
  const isSmartboardMain =
    activeModule === 'teaching_smartboard' ||
    ![
      'teaching_function_plot',
      'teaching_geometry_3d',
      'teaching_classroom',
      'teaching_slides',
      'teaching_realworld',
    ].includes(activeModule);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F1F5F9] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Ultra-compact 56px Left Rail (default compact = true) */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={handleSelectTeacherModule}
        collapsed={focusMode}
        compact={sidebarCompact}
        onToggleCompact={() => setSidebarCompact((v) => !v)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Ultra-Slim SMAS 4.0 Smartboard Top Header (52px) with 5-Tool Quick Switcher */}
        <header className="no-print flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-[#E2E8F0] bg-white px-2.5 sm:px-3.5 dark:border-slate-800 dark:bg-slate-900">
          {/* Left: Mobile Menu + Brand Badge */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileMenuOpen}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#E2E8F0] bg-white text-slate-700 hover:bg-[#F1F5F9] md:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" strokeWidth={1.9} />
            </button>

            <div className="flex min-w-0 flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-bold tracking-tight text-[#136F63] uppercase dark:text-emerald-400">
                  TEACHLEARN BOARD
                </span>
                <span className="hidden rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-[#136F63] lg:inline-block dark:bg-emerald-950/60 dark:text-emerald-300">
                  65–86&quot;
                </span>
              </div>
              <div className="hidden truncate text-[11px] text-slate-500 2xl:block dark:text-slate-400">
                {activeContext.schoolName} ·{' '}
                {user && isOnline
                  ? 'Cloud Firestore Đồng bộ'
                  : 'Giảng dạy Cục bộ (Local Mode)'}
              </div>
            </div>
          </div>

          {/* Center: Quick 5-Tool Switcher Bar on Header */}
          <nav
            aria-label="5 Công cụ giảng dạy"
            className="hidden items-center gap-1 rounded-[7px] border border-[#E2E8F0] bg-[#F8FAFC] p-1 md:flex dark:border-slate-800 dark:bg-slate-800/80"
          >
            {TEACHLEARN_BOARD_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive =
                tool.matchModules.includes(activeModule) ||
                (tool.moduleId === 'teaching_smartboard' && isSmartboardMain);
              return (
                <button
                  key={tool.key}
                  type="button"
                  onClick={() => handleSelectTeacherModule(tool.moduleId)}
                  title={`${tool.label} — ${tool.description}`}
                  className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-[12px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#136F63] text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white hover:text-[#136F63] dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tool.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Local JSON Bank, Fullscreen (F11), Shortcuts, Optional Google Cloud Sign-In / Account Menu */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* 1. Cấu hình API Key / Nạp kho đề dự phòng (.json) — Local Mode hoặc Owner Admin */}
            {canManageLocalResources ? (
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                title={
                  isLocalMode
                    ? 'Nạp Kho đề ngoại tuyến (.json) & Quản lý bộ nhớ IndexedDB cục bộ'
                    : 'Cấu hình API Key / Nạp kho đề dự phòng (.json) — Quản trị viên (Admin)'
                }
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 text-[12px] font-semibold text-slate-700 transition-colors hover:border-[#136F63] hover:bg-emerald-50/50 hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Database className="h-3.5 w-3.5 shrink-0 text-[#136F63] dark:text-emerald-400" />
                <span className="hidden xl:inline">
                  {isLocalMode ? 'Kho đề (.json)' : 'Nạp đề (.json)'}
                </span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-[#136F63] tabular-nums dark:bg-emerald-950 dark:text-emerald-300">
                  {bankItems.length}
                </span>
              </button>
            ) : (
              <span
                title="Chế độ Chỉ Xem & Giảng dạy (Read-Only): Mọi thao tác viết vẽ chỉ lưu tạm trên trình duyệt, không thay đổi dữ liệu gốc của thầy Lê Trọng Toàn"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-amber-300 bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="hidden xl:inline">Chỉ Xem (Read-Only)</span>
              </span>
            )}

            {/* 2. Chế độ Toàn màn hình (F11 / Alt+F) */}
            <button
              type="button"
              onClick={handleTogglePresentationMode}
              title={
                focusMode
                  ? 'Thoát chế độ toàn màn hình (F11 / Alt+F)'
                  : 'Chế độ Toàn màn hình (F11 / Alt+F) — Ẩn thanh bên để mở rộng tối đa diện tích viết bảng'
              }
              aria-label="Chế độ Toàn màn hình (F11)"
              className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2.5 text-[12px] font-semibold transition-colors ${
                focusMode
                  ? 'border-[#136F63] bg-[#136F63] text-white hover:bg-[#0F594F]'
                  : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {focusMode ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Thoát F11</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5 shrink-0 text-[#136F63] dark:text-emerald-400" />
                  <span className="hidden 2xl:inline">Toàn màn hình (F11)</span>
                </>
              )}
            </button>

            {/* 2B. Phím tắt (?) — Xem nhanh bảng hướng dẫn phím tắt */}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Phím tắt (?) — Xem nhanh bảng hướng dẫn phím tắt Bảng trắng & Làm bài thi"
              aria-label="Phím tắt (?)"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-slate-700 transition-colors hover:border-[#136F63] hover:bg-emerald-50/50 hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:text-teal-300"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[#136F63] dark:text-emerald-400" />
              <span className="hidden 2xl:inline">Phím tắt</span>
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10.5px] font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                ?
              </kbd>
            </button>

            {/* 3. Mở Hệ thống Quản trị Tổng (TeachLearn Edu) — Chỉ hiển thị cho Admin Độc quyền */}
            {isOwnerAdmin && (
              <a
                href={mainAdminPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Mở Hệ thống Quản trị Tổng (TeachLearn Edu) — Ngân hàng đề, Khảo thí, Sổ điểm SMAS & Giáo án AI"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#136F63] px-2.5 text-[12px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F]"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden 2xl:inline">Quản trị Tổng (TeachLearn Edu)</span>
                <span className="hidden sm:inline 2xl:hidden">Quản trị Tổng</span>
              </a>
            )}

            <PWAInstallButton />

            {/* 4. Đèn báo trạng thái kết nối (Cục bộ / Ngoại tuyến / Đồng bộ Cloud) */}
            <ConnectionStatusBadge
              isOfflineBypass={!isOnline}
              isLocalMode={isLocalMode}
              onClick={isLocalMode && isOnline ? handleQuickGoogleCloudLogin : undefined}
            />

            {/* 5. Nút tùy chọn Đăng nhập Google (Đồng bộ Cloud) khi ở Chế độ Cục bộ, hoặc Avatar khi đã đăng nhập */}
            {isLocalMode ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={googleAuthLoading}
                  onClick={handleQuickGoogleCloudLogin}
                  title="Đăng nhập Google (Đồng bộ Cloud) — Mở khóa quyền Quản trị viên (Admin) và đồng bộ dữ liệu Cloud Firestore"
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#136F63] px-2.5 text-[12px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F] disabled:opacity-60"
                >
                  {googleAuthLoading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="hidden xl:inline">Đăng nhập Google (Đồng bộ Cloud)</span>
                  <span className="hidden sm:inline xl:hidden">Đăng nhập Google</span>
                  <span className="sm:hidden">Cloud</span>
                </button>

                {/* Compact Local Utilities Dropdown (Dark Mode, Student Picker, Help, Auth Portal) */}
                <div ref={userMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    aria-label="Tùy chọn Chế độ Cục bộ"
                    title="Tùy chọn Chế độ Giảng dạy Cục bộ (Giao diện tối, Gọi trả bài, Hướng dẫn)"
                    className="flex h-9 items-center gap-1 rounded-[6px] border border-[#E2E8F0] bg-white px-2 text-slate-700 transition-colors hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Settings className="h-4 w-4 text-[#136F63] dark:text-emerald-400" />
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-64 rounded-[6px] border border-[#E2E8F0] bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <div className="border-b border-[#E2E8F0] px-3.5 py-2.5 dark:border-slate-800">
                        <div className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">
                          Giảng dạy Cục bộ (Local Mode)
                        </div>
                        <div className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                          Không cần đăng nhập · Hoạt động cả khi mất mạng
                        </div>
                      </div>

                      <div className="py-1 text-[13px]">
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            void handleQuickGoogleCloudLogin();
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-semibold text-[#136F63] hover:bg-emerald-50/70 dark:text-emerald-400 dark:hover:bg-slate-800"
                        >
                          <LogIn className="h-4 w-4" />
                          <span>Đăng nhập Google (Đồng bộ Cloud)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setAuthPortalOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <ShieldCheck className="h-4 w-4 text-slate-500" />
                          <span>Cổng phân quyền &amp; Mã mời GV</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleRequestStudentPicker(activeClassId);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Dices className="h-4 w-4 text-[#0369A1]" />
                          <span>Gọi học sinh trả bài nhanh</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setConfigOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Database className="h-4 w-4 text-slate-500" />
                          <span>Nạp Kho đề ngoại tuyến (.json)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDarkMode((v) => !v)}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <span className="flex items-center gap-2.5">
                            {darkMode ? (
                              <Sun className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Moon className="h-4 w-4 text-slate-500" />
                            )}
                            <span>{darkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}</span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setHelpOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <BookOpen className="h-4 w-4 text-slate-500" />
                          <span>Hướng dẫn Bảng tương tác</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Signed-in Google User Avatar + Account Dropdown */
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex h-9 items-center gap-1.5 rounded-[6px] border border-[#E2E8F0] bg-white pr-2 pl-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {teacherPhotoUrl ? (
                    <img
                      src={teacherPhotoUrl}
                      alt={teacherDisplayName}
                      className="h-6 w-6 rounded-[4px] object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#136F63] text-[11.5px] font-bold text-white">
                      {teacherInitial}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-[6px] border border-[#E2E8F0] bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <div className="border-b border-[#E2E8F0] px-3.5 py-2.5 dark:border-slate-800">
                      <div className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">
                        {teacherDisplayName}
                      </div>
                      <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                        {user?.email || activeAccount.email}
                      </div>
                      <div className="mt-1">
                        {isOwnerAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-[#136F63] dark:bg-emerald-950 dark:text-emerald-300">
                            <ShieldCheck className="h-3 w-3" />
                            Quản trị viên Độc quyền (Admin)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Lock className="h-3 w-3" />
                            Chế độ Chỉ Xem &amp; Giảng dạy
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="py-1 text-[13px]">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setAuthPortalOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <UserIcon className="h-4 w-4 text-[#136F63]" />
                        <span>Hồ sơ Giáo viên &amp; Vai trò</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleRequestStudentPicker(activeClassId);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Dices className="h-4 w-4 text-[#0369A1]" />
                        <span>Gọi học sinh trả bài nhanh</span>
                      </button>

                      {canManageLocalResources && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setConfigOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Settings className="h-4 w-4 text-slate-500" />
                          <span>Cấu hình API Key &amp; Nạp đề (.json)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDarkMode((v) => !v)}
                        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          {darkMode ? (
                            <Sun className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Moon className="h-4 w-4 text-slate-500" />
                          )}
                          <span>{darkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setHelpOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-[#F1F5F9] dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <BookOpen className="h-4 w-4 text-slate-500" />
                        <span>Hướng dẫn Bảng tương tác</span>
                      </button>
                    </div>

                    <div className="border-t border-[#E2E8F0] pt-1 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleGoogleLogout();
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Đăng xuất (Về Cục bộ)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <OfflineIndicator />

        {/* Main Workspace: 95% display area when on Smartboard Canvas */}
        <main
          className={
            isSmartboardMain
              ? 'flex-1 overflow-hidden p-1'
              : 'flex-1 overflow-y-auto p-2.5 sm:p-3.5'
          }
        >
          <div className={isSmartboardMain ? 'h-full w-full' : 'mx-auto max-w-[1440px]'}>
            {renderModule()}
          </div>
        </main>
      </div>

      <ToolErrorBoundary toolName="Bộ công cụ nổi (Máy tính & GeoGebra)" compact>
        <FloatingTools />
      </ToolErrorBoundary>

      <OralMatrixConfigModal
        open={Boolean(matrixModalState?.open)}
        activeClass={
          matrixModalState
            ? classroomStore.classes.find((c) => c.id === matrixModalState.classId) ||
              activeClassroomObj
            : activeClassroomObj
        }
        classStudents={
          matrixModalState
            ? classroomStore.students.filter(
                (s) =>
                  s.classId ===
                  (classroomStore.classes.find((c) => c.id === matrixModalState.classId)?.id ||
                    activeClassroomObj?.id)
              )
            : []
        }
        bankItems={bankItems}
        gradebookMap={gradebookMap}
        initialConfig={(() => {
          const cls = matrixModalState
            ? classroomStore.classes.find((c) => c.id === matrixModalState.classId) ||
              activeClassroomObj
            : activeClassroomObj;
          return cls ? oralMatrixConfigs[cls.grade] || null : null;
        })()}
        requiredPromptReason={matrixModalState?.requiredReason}
        onClose={() => setMatrixModalState(null)}
        onSaveMatrix={(savedConfig) => {
          saveOralMatrixConfig(savedConfig);
          setOralMatrixConfigs((prev) => ({
            ...prev,
            [savedConfig.grade]: savedConfig,
          }));
          const pending = matrixModalState?.pendingAction;
          setMatrixModalState(null);
          if (pending?.type === 'picker') {
            setActiveClassId(pending.classId);
            setPickerOpen(true);
          } else if (pending?.type === 'student_quiz') {
            setQuizTarget({
              studentId: pending.student.id,
              classId: pending.classroom.id,
            });
          }
        }}
      />

      <StudentPickerModal
        open={pickerOpen}
        classes={classroomStore.classes}
        students={classroomStore.students}
        gradebookMap={gradebookMap}
        matrixConfig={
          activeClassroomObj ? oralMatrixConfigs[activeClassroomObj.grade] || null : null
        }
        onOpenMatrixConfig={() => {
          setPickerOpen(false);
          handleOpenMatrixConfig(activeClassId);
        }}
        initialClassId={activeClassId}
        onClose={() => setPickerOpen(false)}
        onStartQuizForStudent={(
          student: ClassroomStudent,
          classroom: Classroom,
          gradeTarget?: GradeTargetSelection
        ) => {
          setPickerOpen(false);
          const mat = oralMatrixConfigs[classroom.grade];
          if (!mat || !mat.isLocked) {
            handleRequestStudentQuiz(student, classroom);
            return;
          }
          setQuizTarget({ studentId: student.id, classId: classroom.id, gradeTarget });
        }}
        onQuickSaveAttempt={async (
          studentId: string,
          attempt: StudentAttemptRecord,
          gradeTarget?: GradeTargetSelection
        ) => {
          await saveStudentAttemptAtomic(studentId, attempt);
          await syncAttemptToGradebook(studentId, attempt, gradeTarget);
        }}
      />

      <LiveStudentQuizModal
        open={Boolean(quizTarget)}
        student={
          quizTarget
            ? classroomStore.students.find((s) => s.id === quizTarget.studentId) || null
            : null
        }
        classroom={
          quizTarget
            ? classroomStore.classes.find((c) => c.id === quizTarget.classId) || null
            : null
        }
        currentExam={currentExam}
        bankItems={bankItems}
        gradebookMap={gradebookMap}
        matrixConfig={(() => {
          const cls = quizTarget
            ? classroomStore.classes.find((c) => c.id === quizTarget.classId)
            : null;
          return cls ? oralMatrixConfigs[cls.grade] || null : null;
        })()}
        initialGradeTarget={quizTarget?.gradeTarget}
        onEditMatrix={() => {
          const clsId = quizTarget?.classId || activeClassId;
          const stu = quizTarget
            ? classroomStore.students.find((s) => s.id === quizTarget.studentId)
            : null;
          const cls = classroomStore.classes.find((c) => c.id === clsId);
          setQuizTarget(null);
          if (stu && cls) {
            setMatrixModalState({
              open: true,
              classId: clsId,
              requiredReason: null,
              pendingAction: { type: 'student_quiz', student: stu, classroom: cls },
            });
          } else {
            handleOpenMatrixConfig(clsId);
          }
        }}
        onClose={() => setQuizTarget(null)}
        onSaveAttempt={async (studentId, attempt, syncGlobal, gradeTarget) => {
          const next = await saveStudentAttemptAtomic(studentId, attempt);
          await syncAttemptToGradebook(studentId, attempt, gradeTarget);
          if (syncGlobal) {
            const stu = next.students.find((s) => s.id === studentId);
            const cls = next.classes.find((c) => c.id === stu?.classId);
            if (stu) {
              handleAddSubmission({
                id: `sub-live-${Date.now()}`,
                roomId: examRooms[0]?.id || 'room-live-class',
                studentName: stu.fullName,
                studentClass: cls?.name || '12A1',
                score: syncGlobal.score,
                tabSwitches: syncGlobal.tabSwitches,
                submittedAt: attempt.createdAt,
              });
            }
          }
        }}
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {canManageLocalResources && (
        <SystemConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          aiConfigured={aiConfigured}
          subjects={subjects}
          onToggleSubject={(id) =>
            setSubjects((prev) =>
              prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
            )
          }
          defaultSubject={defaultSubject}
          onChangeDefaultSubject={setDefaultSubject}
          userEmail={user?.email || null}
          onGoogleLogin={handleGoogleLogin}
          onGoogleLogout={handleGoogleLogout}
          bankItemsCount={bankItems.length}
          cloudBankCount={cloudBankCount}
          onImportJsonBankFile={handleImportJsonBankFile}
          onExportJsonBankFile={() => exportBankToJsonFile(bankItems)}
          onSyncCloudBankNow={handleSyncCloudBankNow}
          mainAdminPortalUrl={mainAdminPortalUrl}
          onChangeMainAdminPortalUrl={handleChangeMainAdminPortalUrl}
          isOfflineMode={isLocalMode || !isOnline}
        />
      )}

      <AuthPortalModalOrLanding
        open={authPortalOpen}
        isFullScreenGate={false}
        onClose={() => setAuthPortalOpen(false)}
        currentAccount={user ? activeAccount : null}
        masterData={masterData}
        studentPortalRedirectUrl={mainAdminPortalUrl}
        onGooglePopupLogin={handleGooglePopupLogin}
        onEnterOfflineMode={handleEnterLocalMode}
        onCompleteRoleOnboarding={async (role, status, extra) => {
          await handleUpdateAccountRoleOrStatus(activeAccount.uid, {
            role,
            status,
            studentClass: extra.studentClass,
            department: extra.department,
          });
          setNeedsRoleOnboarding(false);
          setAuthPortalOpen(false);
          setViewMode(role === 'student' ? 'student' : 'teacher');
        }}
        onLogout={handleGoogleLogout}
        needsRoleSelection={Boolean(user && (needsRoleOnboarding || activeAccount.role === 'student'))}
      />
    </div>
  );
}
