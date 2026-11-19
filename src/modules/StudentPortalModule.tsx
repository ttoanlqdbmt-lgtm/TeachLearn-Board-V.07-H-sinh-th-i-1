import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  HelpCircle,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Play,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  ExamPaper,
  ExamSubmission,
  HomeworkAssignment,
  HomeworkSubmission,
  MasterDataStore,
  OnlineExamRoom,
  UserAccountRecord,
} from '../types/eduplan';
import { MathText } from '../components/MathText';
import { ExamDiagram } from '../components/ExamDiagrams';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { formatMcqOptionDisplay, normalizeSolutionSteps } from '../utils/solutionFormat';
import {
  FloatingMathKeypad,
  sanitizeShortAnswerValue,
  SHORT_ANSWER_MAX_LEN,
} from '../components/FloatingMathKeypad';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import {
  clearExamDraftFromLocal,
  compressImageToWebpOrJpegUnder100KB,
  incrementZeroCostStat,
  loadExamDraftFromLocal,
  recordFeatureUsage,
  saveExamDraftToLocal,
} from '../utils/cloudCacheAndCompression';
import {
  calculateHomeworkObjectiveScore,
  clearHomeworkDraftFromLocal,
  formatCountdownRemaining,
  getStudentHomeworkAlerts,
  isHomeworkAssignedToStudent,
  loadHomeworkDraftFromLocal,
  saveHomeworkDraftToLocal,
} from '../utils/homeworkDb';

export type StudentPortalTab =
  | 'exam_room'
  | 'homework_portal'
  | 'history_results'
  | 'student_profile';

interface StudentPortalModuleProps {
  activeTab: StudentPortalTab;
  onChangeTab: (tab: StudentPortalTab) => void;
  studentAccount: UserAccountRecord;
  onUpdateStudentProfile: (updated: Partial<UserAccountRecord>) => Promise<void>;
  rooms: OnlineExamRoom[];
  submissions: ExamSubmission[];
  homeworkAssignments: HomeworkAssignment[];
  homeworkSubmissions: HomeworkSubmission[];
  onAddHomeworkSubmission: (sub: HomeworkSubmission) => Promise<void>;
  defaultExam: ExamPaper;
  masterData: MasterDataStore;
  onAddSubmission: (sub: ExamSubmission) => Promise<void>;
  onSwitchToTeacherDemo?: () => void;
  onLogout: () => void;
}

const DEFAULT_CLASSES = [
  '11B05',
  '11B10',
  '11B13',
  '11B1',
  '11B2',
  '12A1',
  '12A2',
  '12A3',
  '12A4',
  '12A5',
  '10A1',
  '10A2',
  '10A3',
];

export const StudentPortalModule: React.FC<StudentPortalModuleProps> = ({
  activeTab,
  onChangeTab,
  studentAccount,
  onUpdateStudentProfile,
  rooms,
  submissions,
  homeworkAssignments,
  homeworkSubmissions,
  onAddHomeworkSubmission,
  defaultExam,
  masterData,
  onAddSubmission,
  onSwitchToTeacherDemo,
  onLogout,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<OnlineExamRoom | null>(null);

  // Active exam state (saved to localStorage on every click, 0 Firestore writes until submit)
  const [part1Ans, setPart1Ans] = useState<Record<number, string>>({});
  const [part2Ans, setPart2Ans] = useState<
    Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>
  >({});
  const [part3Ans, setPart3Ans] = useState<Record<number, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(5400);
  const [tabSwitches, setTabSwitches] = useState<number>(0);
  const [tabWarningBanner, setTabWarningBanner] = useState<string | null>(null);
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string>('');
  const [submittingExam, setSubmittingExam] = useState(false);
  const [completedSubmission, setCompletedSubmission] = useState<ExamSubmission | null>(null);

  // Solution review modal in History tab
  const [reviewingSubmission, setReviewingSubmission] = useState<ExamSubmission | null>(null);

  // Profile form state
  const [profName, setProfName] = useState(studentAccount.displayName || 'Nguyễn Minh Anh');
  const [profClass, setProfClass] = useState(studentAccount.studentClass || '12A1');
  const [profCode, setProfCode] = useState(studentAccount.studentCode || 'HS12A101');
  const [profDob, setProfDob] = useState(studentAccount.dob || '14/05/2009');
  const [profPhone, setProfPhone] = useState(studentAccount.phone || '0912345601');
  const [profileSavedToast, setProfileSavedToast] = useState(false);

  // Homework state (Azota-style)
  const [hwPinInput, setHwPinInput] = useState('');
  const [hwPinError, setHwPinError] = useState<string | null>(null);
  const [activeHomework, setActiveHomework] = useState<HomeworkAssignment | null>(null);
  const [hwPart1Ans, setHwPart1Ans] = useState<Record<number, string>>({});
  const [hwPart2Ans, setHwPart2Ans] = useState<
    Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>
  >({});
  const [hwPart3Ans, setHwPart3Ans] = useState<Record<number, string>>({});
  const [hwEssayText, setHwEssayText] = useState<string>('');
  const [hwImages, setHwImages] = useState<string[]>([]);
  const [hwCompressingImg, setHwCompressingImg] = useState(false);
  const [hwLastDraftSavedAt, setHwLastDraftSavedAt] = useState<string>('');
  const [submittingHw, setSubmittingHw] = useState(false);
  const [completedHwSub, setCompletedHwSub] = useState<HomeworkSubmission | null>(null);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const hwFileInputRef = useRef<HTMLInputElement | null>(null);

  // Floating Math Keypad (Part III) & Keyboard Shortcuts state
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<{
    mode: 'exam' | 'homework';
    index: number;
  } | null>(null);
  const [examFocusIdx, setExamFocusIdx] = useState<number>(0);
  const [hwFocusIdx, setHwFocusIdx] = useState<number>(0);

  const examP3InputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const hwP3InputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const examCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hwCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const submitHwRef = useRef<() => void>(() => {});

  useEffect(() => {
    setProfName(studentAccount.displayName || 'Nguyễn Minh Anh');
    setProfClass(studentAccount.studentClass || '12A1');
    setProfCode(studentAccount.studentCode || 'HS12A101');
    setProfDob(studentAccount.dob || '14/05/2009');
    setProfPhone(studentAccount.phone || '0912345601');
  }, [studentAccount]);

  // Live 30s ticker for homework 24-hour countdown timer
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Personalized homework assignments visible ONLY to this student
  const currentStudentIdentity = useMemo(
    () => ({
      studentCode: studentAccount.studentCode || profCode || 'HS12A101',
      studentName: studentAccount.displayName || profName || 'Nguyễn Minh Anh',
      studentClass: studentAccount.studentClass || profClass || '12A1',
      studentEmail: studentAccount.email,
      studentUid: studentAccount.uid,
    }),
    [studentAccount, profCode, profName, profClass]
  );

  const visibleHomeworks = useMemo(() => {
    return homeworkAssignments.filter((hw) =>
      isHomeworkAssignedToStudent(hw, currentStudentIdentity)
    );
  }, [homeworkAssignments, currentStudentIdentity]);

  const myHomeworkSubmissionsMap = useMemo(() => {
    const map: Record<string, HomeworkSubmission> = {};
    const myCode = currentStudentIdentity.studentCode.trim().toUpperCase();
    const myName = currentStudentIdentity.studentName.trim().toLowerCase();
    const myEmail = (currentStudentIdentity.studentEmail || '').trim().toLowerCase();

    homeworkSubmissions.forEach((sub) => {
      const matchCode = sub.studentCode.trim().toUpperCase() === myCode;
      const matchName =
        sub.studentName.trim().toLowerCase() === myName &&
        sub.studentClass.trim().toUpperCase() ===
          currentStudentIdentity.studentClass.trim().toUpperCase();
      const matchEmail = myEmail && (sub.studentEmail || '').trim().toLowerCase() === myEmail;
      if (matchCode || matchName || matchEmail || sub.studentUid === currentStudentIdentity.studentUid) {
        map[sub.homeworkId] = sub;
      }
    });
    return map;
  }, [homeworkSubmissions, currentStudentIdentity]);

  // Homework alerts (unsubmitted or due within 24h)
  const homeworkAlerts = useMemo(() => {
    // Include nowTick dependency so countdown labels refresh live
    void nowTick;
    const summary = getStudentHomeworkAlerts(
      homeworkAssignments,
      homeworkSubmissions,
      {
        ...studentAccount,
        displayName: currentStudentIdentity.studentName,
        studentClass: currentStudentIdentity.studentClass,
        studentCode: currentStudentIdentity.studentCode,
      }
    );
    return summary.unsubmittedList.map((assignment) => {
      const cd = formatCountdownRemaining(assignment.dueDate);
      return {
        assignment,
        countdownText: cd.label,
        isOverdue: cd.isOverdue,
        isDueWithin24h: cd.isDueWithin24h,
      };
    });
  }, [homeworkAssignments, homeworkSubmissions, studentAccount, currentStudentIdentity, nowTick]);

  const handleOpenHomeworkWorkspace = (hw: HomeworkAssignment) => {
    const existingSub = myHomeworkSubmissionsMap[hw.id];
    const draft = loadHomeworkDraftFromLocal(hw.id);
    if (draft) {
      setHwPart1Ans(draft.part1 || {});
      setHwPart2Ans(draft.part2 || {});
      setHwPart3Ans(draft.part3 || {});
      setHwEssayText(draft.essayTextAnswer || '');
      setHwImages(draft.essayImages || []);
      setHwLastDraftSavedAt(new Date(draft.updatedAt).toLocaleTimeString('vi-VN'));
    } else if (existingSub) {
      setHwPart1Ans(existingSub.answersPayload?.part1 || {});
      setHwPart2Ans(existingSub.answersPayload?.part2 || {});
      setHwPart3Ans(existingSub.answersPayload?.part3 || {});
      setHwEssayText(existingSub.essayTextAnswer || '');
      setHwImages(existingSub.essayImages || []);
      setHwLastDraftSavedAt('');
    } else {
      setHwPart1Ans({});
      setHwPart2Ans({});
      setHwPart3Ans({});
      setHwEssayText('');
      setHwImages([]);
      setHwLastDraftSavedAt('');
    }
    setCompletedHwSub(existingSub || null);
    setActiveHomework(hw);
    setShowNotifDropdown(false);
    if (activeTab !== 'homework_portal') {
      onChangeTab('homework_portal');
    }
  };

  // Auto-open homework and pre-fill student identity if URL contains ?assignmentId=...&pin=...&studentCode=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlStuCode = (params.get('studentCode') || '').trim();
    const urlStuName = (params.get('studentName') || '').trim();
    const urlStuClass = (params.get('studentClass') || '').trim();

    if (urlStuCode || urlStuName || urlStuClass) {
      if (urlStuCode) setProfCode(urlStuCode);
      if (urlStuName) setProfName(urlStuName);
      if (urlStuClass) setProfClass(urlStuClass);
      void onUpdateStudentProfile({
        ...(urlStuCode ? { studentCode: urlStuCode } : {}),
        ...(urlStuName ? { displayName: urlStuName } : {}),
        ...(urlStuClass ? { studentClass: urlStuClass } : {}),
      });
    }

    if (homeworkAssignments.length === 0) return;
    const assignmentId = (params.get('assignmentId') || '').trim();
    const hwPin = (params.get('pin') || params.get('hw') || '').trim();
    if (assignmentId || hwPin) {
      const found = homeworkAssignments.find(
        (h) =>
          (assignmentId && h.id === assignmentId) ||
          (hwPin && (h.pinCode.trim() === hwPin || h.id === hwPin))
      );
      if (found) {
        if (hwPin) setHwPinInput(hwPin);
        handleOpenHomeworkWorkspace(found);
      }
    }
  }, [homeworkAssignments.length]);

  const persistHwDraft = (
    hwId: string,
    nextP1: Record<number, string>,
    nextP2: Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>,
    nextP3: Record<number, string>,
    nextText: string,
    nextImgs: string[]
  ) => {
    saveHomeworkDraftToLocal({
      homeworkId: hwId,
      studentName: currentStudentIdentity.studentName,
      studentClass: currentStudentIdentity.studentClass,
      studentCode: currentStudentIdentity.studentCode,
      part1: nextP1,
      part2: nextP2,
      part3: nextP3,
      essayTextAnswer: nextText,
      essayImages: nextImgs,
      updatedAt: new Date().toISOString(),
    });
    setHwLastDraftSavedAt(new Date().toLocaleTimeString('vi-VN'));
  };

  const handleUploadHomeworkPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeHomework) return;
    setHwCompressingImg(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rawDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Không đọc được ảnh'));
          reader.readAsDataURL(file);
        });
        // Compress strictly under 150KB (140 * 1024 bytes) before saving to Firebase
        const compressed = await compressImageToWebpOrJpegUnder100KB(rawDataUrl, 140 * 1024);
        compressedList.push(compressed);
      }
      const nextImgs = [...hwImages, ...compressedList].slice(0, 6);
      setHwImages(nextImgs);
      persistHwDraft(
        activeHomework.id,
        hwPart1Ans,
        hwPart2Ans,
        hwPart3Ans,
        hwEssayText,
        nextImgs
      );
    } finally {
      setHwCompressingImg(false);
      if (hwFileInputRef.current) hwFileInputRef.current.value = '';
    }
  };

  const handleSubmitHomework = async () => {
    if (!activeHomework || submittingHw) return;
    setSubmittingHw(true);
    try {
      const hasObj = Boolean(
        activeHomework.examPaperSnapshot &&
          (activeHomework.examPaperSnapshot.part1.length > 0 ||
            activeHomework.examPaperSnapshot.part2.length > 0 ||
            activeHomework.examPaperSnapshot.part3.length > 0)
      );
      const hasEssay =
        activeHomework.sourceType === 'essay_sgk' ||
        Boolean(activeHomework.essayPromptText?.trim()) ||
        Boolean(activeHomework.essayPromptImages && activeHomework.essayPromptImages.length > 0) ||
        hwImages.length > 0 ||
        Boolean(hwEssayText.trim());

      const { objectiveScore } = calculateHomeworkObjectiveScore(activeHomework, {
        part1: hwPart1Ans,
        part2: hwPart2Ans,
        part3: hwPart3Ans,
      });

      const existingSub = myHomeworkSubmissionsMap[activeHomework.id];
      const existingEssayScore = existingSub?.essayScore ?? null;
      const totalScore =
        hasObj && !hasEssay
          ? objectiveScore
          : Number(((hasObj ? objectiveScore : 0) + (existingEssayScore ?? 0)).toFixed(2));

      const submission: HomeworkSubmission = {
        id: existingSub?.id || `hwsub-${activeHomework.id}-${currentStudentIdentity.studentCode}`,
        homeworkId: activeHomework.id,
        homeworkTitle: activeHomework.title,
        studentUid: studentAccount.uid,
        studentEmail: studentAccount.email,
        studentCode: currentStudentIdentity.studentCode,
        studentName: currentStudentIdentity.studentName,
        studentClass: currentStudentIdentity.studentClass,
        answersPayload: {
          part1: hwPart1Ans,
          part2: hwPart2Ans,
          part3: hwPart3Ans,
        },
        essayImages: hwImages,
        essayTextAnswer: hwEssayText.trim() || undefined,
        objectiveScore: hasObj ? objectiveScore : 0,
        essayScore: existingEssayScore,
        totalScore,
        gradingStatus:
          hasObj && !hasEssay
            ? 'auto_graded'
            : existingSub?.gradingStatus === 'graded'
              ? 'graded'
              : 'pending_essay_review',
        teacherFeedback: existingSub?.teacherFeedback || '',
        syncedToSmas: Boolean(existingSub?.syncedToSmas),
        syncedColumn: existingSub?.syncedColumn,
        submittedAt: new Date().toISOString(),
      };

      await onAddHomeworkSubmission(submission);
      clearHomeworkDraftFromLocal(activeHomework.id);
      setCompletedHwSub(submission);
    } finally {
      setSubmittingHw(false);
    }
  };

  const activeExamPaper: ExamPaper = useMemo(() => {
    return activeRoom?.examPaperSnapshot || defaultExam;
  }, [activeRoom, defaultExam]);

  // Countdown timer when in active room
  useEffect(() => {
    if (!activeRoom || completedSubmission) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRoom, completedSubmission]);

  // Auto-submit if timer hits 0
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (activeRoom && !completedSubmission && remainingSeconds === 0) {
      submitRef.current();
    }
  }, [remainingSeconds, activeRoom, completedSubmission]);

  // Anti-cheat tab switch detection
  useEffect(() => {
    if (!activeRoom || !activeRoom.antiCheat || completedSubmission) return;

    const handleVisibilityOrBlur = () => {
      if (document.hidden) {
        setTabSwitches((prev) => {
          const next = prev + 1;
          setTabWarningBanner(
            `Cảnh báo giám sát: Phát hiện rời khỏi màn hình thi (${next} lần). Hệ thống đã ghi nhận vào biên bản bài làm.`
          );
          return next;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur);
    };
  }, [activeRoom, completedSubmission]);

  // Save draft to localStorage on every answer change (Zero Firestore Writes while taking exam)
  useEffect(() => {
    if (!activeRoom || completedSubmission) return;
    const nowTime = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    saveExamDraftToLocal({
      roomId: activeRoom.id,
      studentName: studentAccount.displayName || profName,
      studentClass: studentAccount.studentClass || profClass,
      studentCode: studentAccount.studentCode || profCode,
      part1: part1Ans,
      part2: part2Ans,
      part3: part3Ans,
      remainingSeconds,
      tabSwitches,
      updatedAt: new Date().toISOString(),
    });
    setLastLocalSavedAt(nowTime);
  }, [
    activeRoom,
    completedSubmission,
    part1Ans,
    part2Ans,
    part3Ans,
    tabSwitches,
    remainingSeconds,
    studentAccount,
    profName,
    profClass,
    profCode,
  ]);

  const enterExamRoom = (room: OnlineExamRoom) => {
    setPinError(null);
    setCompletedSubmission(null);
    setTabWarningBanner(null);
    recordFeatureUsage(
      'student_exam_portal',
      'Học sinh · Vào Phòng Thi Online (Lưu nháp Local, 1 lượt ghi)',
      'student'
    );

    const existingDraft = loadExamDraftFromLocal(room.id);
    if (existingDraft) {
      setPart1Ans(existingDraft.part1 || {});
      setPart2Ans(existingDraft.part2 || {});
      setPart3Ans(existingDraft.part3 || {});
      setRemainingSeconds(
        existingDraft.remainingSeconds > 30
          ? existingDraft.remainingSeconds
          : room.durationMinutes * 60
      );
      setTabSwitches(existingDraft.tabSwitches || 0);
    } else {
      setPart1Ans({});
      setPart2Ans({});
      setPart3Ans({});
      setRemainingSeconds(room.durationMinutes * 60);
      setTabSwitches(0);
    }
    setActiveRoom(room);
  };

  const handleJoinByPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setPinError('Vui lòng nhập Mã PIN phòng thi do Giáo viên cung cấp.');
      return;
    }
    const found = rooms.find((r) => r.pinCode.trim() === cleanPin);
    if (!found) {
      setPinError(`Không tìm thấy phòng thi có Mã PIN "${cleanPin}". Hãy kiểm tra lại bên dưới.`);
      return;
    }
    if (found.status === 'closed') {
      setPinError(`Phòng thi "${found.title}" đã đóng nhận bài.`);
      return;
    }
    enterExamRoom(found);
  };

  const calculateExamScores = (room: OnlineExamRoom) => {
    const keyP1 = room.answerKey?.part1 || [];
    const keyP2 = room.answerKey?.part2 || [];
    const keyP3 = room.answerKey?.part3 || [];

    // Standard 2025 BGD grading:
    // Part I: 12 questions x 0.25 = 3.0 pts
    let p1Correct = 0;
    const p1Count = Math.max(keyP1.length, activeExamPaper.part1.length, 12);
    for (let i = 0; i < p1Count; i++) {
      const expected = (
        keyP1[i] ||
        ['A', 'B', 'C', 'D'][activeExamPaper.part1[i]?.correctIndex ?? 0] ||
        'A'
      ).toUpperCase();
      if ((part1Ans[i] || '').toUpperCase() === expected) {
        p1Correct++;
      }
    }
    const part1Score = Number((p1Correct * 0.25).toFixed(2));

    // Part II: 4 questions, each up to 1.0 pt (1 match: 0.1, 2 matches: 0.25, 3 matches: 0.5, 4 matches: 1.0)
    let part2Score = 0;
    const p2Count = Math.max(keyP2.length, activeExamPaper.part2.length, 4);
    for (let i = 0; i < p2Count; i++) {
      const expectedObj = keyP2[i] || {
        a: activeExamPaper.part2[i]?.statements[0]?.isTrue ?? true,
        b: activeExamPaper.part2[i]?.statements[1]?.isTrue ?? true,
        c: activeExamPaper.part2[i]?.statements[2]?.isTrue ?? false,
        d: activeExamPaper.part2[i]?.statements[3]?.isTrue ?? false,
      };
      const stuObj = part2Ans[i] || {};
      let subMatches = 0;
      (['a', 'b', 'c', 'd'] as const).forEach((subKey) => {
        if (typeof stuObj[subKey] === 'boolean' && stuObj[subKey] === expectedObj[subKey]) {
          subMatches++;
        }
      });
      if (subMatches === 1) part2Score += 0.1;
      else if (subMatches === 2) part2Score += 0.25;
      else if (subMatches === 3) part2Score += 0.5;
      else if (subMatches === 4) part2Score += 1.0;
    }
    part2Score = Number(part2Score.toFixed(2));

    // Part III: 6 questions x 0.5 = 3.0 pts
    let p3Correct = 0;
    const p3Count = Math.max(keyP3.length, activeExamPaper.part3.length, 6);
    for (let i = 0; i < p3Count; i++) {
      const expectedRaw = (keyP3[i] || activeExamPaper.part3[i]?.answer || '').trim();
      const stuRaw = (part3Ans[i] || '').trim();
      if (
        stuRaw &&
        expectedRaw &&
        stuRaw.replace('.', ',') === expectedRaw.replace('.', ',')
      ) {
        p3Correct++;
      }
    }
    const part3Score = Number((p3Correct * 0.5).toFixed(2));
    const totalScore = Number(Math.min(10, part1Score + part2Score + part3Score).toFixed(2));

    return { part1Score, part2Score, part3Score, totalScore };
  };

  const handleSubmitExamSingleWrite = async () => {
    if (!activeRoom || submittingExam) return;
    setSubmittingExam(true);
    try {
      const { part1Score, part2Score, part3Score, totalScore } =
        calculateExamScores(activeRoom);
      const totalDuration = Math.max(
        10,
        activeRoom.durationMinutes * 60 - remainingSeconds
      );
      const clsName = studentAccount.studentClass || profClass || '12A1';
      const gradeMatch = clsName.match(/^(10|11|12)/);
      const detectedGrade = (gradeMatch ? gradeMatch[1] : '12') as '10' | '11' | '12';

      const submission: ExamSubmission = {
        id: `sub-${Date.now()}`,
        roomId: activeRoom.id,
        roomTitle: activeRoom.title,
        studentUid: studentAccount.uid,
        studentEmail: studentAccount.email,
        studentCode: studentAccount.studentCode || profCode || 'HS12A101',
        studentName: studentAccount.displayName || profName || 'Học sinh',
        studentClass: clsName,
        grade: detectedGrade,
        examCode: activeExamPaper.examCode || '0107',
        score: totalScore,
        part1Score,
        part2Score,
        part3Score,
        durationSeconds: totalDuration,
        tabSwitches,
        answersPayload: {
          part1: part1Ans,
          part2: part2Ans,
          part3: part3Ans,
        },
        submittedAt: new Date().toISOString(),
      };

      // Execute SINGLE write to Cloud Firestore & clear local draft
      await onAddSubmission(submission);
      incrementZeroCostStat('firestoreSingleWriteExams', 1);
      clearExamDraftFromLocal(activeRoom.id);
      setCompletedSubmission(submission);
    } finally {
      setSubmittingExam(false);
    }
  };
  submitRef.current = handleSubmitExamSingleWrite;
  submitHwRef.current = () => {
    void handleSubmitHomework();
  };

  // Comprehensive Keyboard Shortcuts for Online Exam Room & Homework Workspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      // Global '?' shortcut to toggle Keyboard Shortcuts cheat-sheet
      if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // 1. ONLINE EXAM ROOM SHORTCUTS
      if (activeTab === 'exam_room' && activeRoom && !completedSubmission) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          setKeypadTarget(null);
          submitRef.current();
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const p1Count = Math.max(activeExamPaper.part1.length, 12);
        const p2Count = Math.max(activeExamPaper.part2.length, 4);
        const p3Count = Math.max(activeExamPaper.part3.length, 6);
        const totalNav = p1Count + p2Count + p3Count;

        if (!isTextInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          setExamFocusIdx((prev) => {
            const next = (prev + delta + totalNav) % totalNav;
            if (next < p1Count) {
              setKeypadTarget(null);
              examCardRefs.current[`p1-${next}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (next < p1Count + p2Count) {
              setKeypadTarget(null);
              examCardRefs.current[`p2-${next - p1Count}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
              const p3Idx = next - p1Count - p2Count;
              setKeypadTarget({ mode: 'exam', index: p3Idx });
              examP3InputRefs.current[p3Idx]?.focus();
              examCardRefs.current[`p3-${p3Idx}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return next;
          });
          return;
        }

        if (isTextInput) return;

        const keyLower = e.key.toLowerCase();
        const letterMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          '1': 'A',
          a: 'A',
          '2': 'B',
          b: 'B',
          '3': 'C',
          c: 'C',
          '4': 'D',
          d: 'D',
        };
        if (keyLower in letterMap) {
          const idx = Math.min(examFocusIdx, totalNav - 1);
          if (idx < p1Count) {
            e.preventDefault();
            setPart1Ans((prev) => ({ ...prev, [idx]: letterMap[keyLower] }));
          } else if (idx < p1Count + p2Count) {
            e.preventDefault();
            const qIdx = idx - p1Count;
            const subMap: Record<string, 'a' | 'b' | 'c' | 'd'> = {
              '1': 'a',
              a: 'a',
              '2': 'b',
              b: 'b',
              '3': 'c',
              c: 'c',
              '4': 'd',
              d: 'd',
            };
            const subKey = subMap[keyLower];
            setPart2Ans((prev) => ({
              ...prev,
              [qIdx]: {
                ...(prev[qIdx] || {}),
                [subKey]: prev[qIdx]?.[subKey] === true ? false : true,
              },
            }));
          }
        }
        return;
      }

      // 2. HOMEWORK WORKSPACE SHORTCUTS
      if (activeTab === 'homework_portal' && activeHomework && !completedHwSub) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          setKeypadTarget(null);
          submitHwRef.current();
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const snap = activeHomework.examPaperSnapshot;
        if (!snap) return;
        const p1Count = snap.part1.length;
        const p2Count = snap.part2.length;
        const p3Count = snap.part3.length;
        const totalNav = p1Count + p2Count + p3Count;
        if (totalNav === 0) return;

        if (!isTextInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          setHwFocusIdx((prev) => {
            const next = (prev + delta + totalNav) % totalNav;
            if (next < p1Count) {
              setKeypadTarget(null);
              hwCardRefs.current[`p1-${next}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (next < p1Count + p2Count) {
              setKeypadTarget(null);
              hwCardRefs.current[`p2-${next - p1Count}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
              const p3Idx = next - p1Count - p2Count;
              setKeypadTarget({ mode: 'homework', index: p3Idx });
              hwP3InputRefs.current[p3Idx]?.focus();
              hwCardRefs.current[`p3-${p3Idx}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return next;
          });
          return;
        }

        if (isTextInput) return;

        const keyLower = e.key.toLowerCase();
        const letterMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          '1': 'A',
          a: 'A',
          '2': 'B',
          b: 'B',
          '3': 'C',
          c: 'C',
          '4': 'D',
          d: 'D',
        };
        if (keyLower in letterMap) {
          const idx = Math.min(hwFocusIdx, totalNav - 1);
          if (idx < p1Count) {
            e.preventDefault();
            const nextP1 = { ...hwPart1Ans, [idx]: letterMap[keyLower] };
            setHwPart1Ans(nextP1);
            persistHwDraft(
              activeHomework.id,
              nextP1,
              hwPart2Ans,
              hwPart3Ans,
              hwEssayText,
              hwImages
            );
          } else if (idx < p1Count + p2Count) {
            e.preventDefault();
            const qIdx = idx - p1Count;
            const subMap: Record<string, 'a' | 'b' | 'c' | 'd'> = {
              '1': 'a',
              a: 'a',
              '2': 'b',
              b: 'b',
              '3': 'c',
              c: 'c',
              '4': 'd',
              d: 'd',
            };
            const subKey = subMap[keyLower];
            const nextP2 = {
              ...hwPart2Ans,
              [qIdx]: {
                ...(hwPart2Ans[qIdx] || {}),
                [subKey]: hwPart2Ans[qIdx]?.[subKey] === true ? false : true,
              },
            };
            setHwPart2Ans(nextP2);
            persistHwDraft(
              activeHomework.id,
              hwPart1Ans,
              nextP2,
              hwPart3Ans,
              hwEssayText,
              hwImages
            );
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    activeRoom,
    completedSubmission,
    activeExamPaper,
    examFocusIdx,
    activeHomework,
    completedHwSub,
    hwFocusIdx,
    hwPart1Ans,
    hwPart2Ans,
    hwPart3Ans,
    hwEssayText,
    hwImages,
  ]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const studentSubmissions = useMemo(() => {
    const myEmail = (studentAccount.email || '').toLowerCase();
    const myName = (studentAccount.displayName || '').toLowerCase();
    const filtered = submissions.filter(
      (s) =>
        (s.studentEmail && s.studentEmail.toLowerCase() === myEmail) ||
        s.studentUid === studentAccount.uid ||
        s.studentName.toLowerCase() === myName
    );
    return filtered.length > 0 ? filtered : submissions;
  }, [submissions, studentAccount]);

  const classOptions =
    masterData.classCatalog.length > 0
      ? masterData.classCatalog.map((c) => c.name)
      : DEFAULT_CLASSES;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateStudentProfile({
      displayName: profName.trim() || 'Học sinh',
      studentClass: profClass,
      studentCode: profCode.trim().toUpperCase(),
      dob: profDob.trim(),
      phone: profPhone.trim(),
    });
    setProfileSavedToast(true);
    window.setTimeout(() => setProfileSavedToast(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-[#334155] dark:bg-slate-950 dark:text-slate-100">
      {/* Top Student Portal Header (Minimalist 3-Section Navigation) */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 px-4 py-3 backdrop-blur-xs sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#136F63] text-white shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-semibold tracking-tight text-[#0F172A] dark:text-white">
                  TeachLearn Edu · Cổng Học Sinh
                </span>
                <span className="rounded-[8px] bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-semibold text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300">
                  Lớp {studentAccount.studentClass || profClass} · SBD{' '}
                  {studentAccount.studentCode || profCode}
                </span>
              </div>
              <div className="text-[12px] text-[#64748B] dark:text-slate-400">
                {masterData.profile.schoolName} · Bảo mật tuyệt đối (Không truy cập Ngân hàng đề
                Giáo viên)
              </div>
            </div>
          </div>

          {/* 4 Student Portal Navigation Tabs */}
          <nav
            aria-label="Điều hướng Cổng Học Sinh"
            className="flex flex-wrap items-center gap-1.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-slate-800 dark:bg-slate-800/70"
          >
            <button
              type="button"
              onClick={() => onChangeTab('exam_room')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13.5px] font-medium transition ${
                activeTab === 'exam_room'
                  ? 'bg-[#136F63] text-white shadow-xs'
                  : 'text-[#334155] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              <span>1. Phòng Thi Online</span>
            </button>

            <button
              type="button"
              onClick={() => {
                recordFeatureUsage(
                  'student_homework_portal',
                  'Học sinh · Làm Bài tập về nhà & Nộp ảnh tự luận',
                  'student'
                );
                onChangeTab('homework_portal');
              }}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13.5px] font-medium transition ${
                activeTab === 'homework_portal'
                  ? 'bg-[#136F63] text-white shadow-xs'
                  : 'text-[#334155] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>2. Bài Tập Về Nhà</span>
              {homeworkAlerts.length > 0 && (
                <span
                  className={`ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 font-mono text-[11px] font-bold ${
                    activeTab === 'homework_portal'
                      ? 'bg-white text-[#136F63]'
                      : 'bg-[#DC2626] text-white'
                  }`}
                >
                  {homeworkAlerts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                recordFeatureUsage(
                  'student_history_review',
                  'Học sinh · Tra cứu Điểm & Xem lời giải chi tiết',
                  'student'
                );
                onChangeTab('history_results');
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13.5px] font-medium transition ${
                activeTab === 'history_results'
                  ? 'bg-[#136F63] text-white shadow-xs'
                  : 'text-[#334155] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>3. Lịch sử &amp; Kết quả</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('student_profile')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[13.5px] font-medium transition ${
                activeTab === 'student_profile'
                  ? 'bg-[#136F63] text-white shadow-xs'
                  : 'text-[#334155] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>4. Hồ sơ Cá nhân</span>
            </button>
          </nav>

          {/* Notification Bell + Account Badge & Quick Switch for Teacher Preview */}
          <div className="flex items-center gap-2">
            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifDropdown((prev) => !prev)}
                title="Thông báo & Nhắc nhở Bài tập về nhà"
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-semibold transition ${
                  homeworkAlerts.length > 0
                    ? 'border-[#F59E0B] bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]'
                    : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Bell className="h-4 w-4" />
                {homeworkAlerts.length > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-[#DC2626] px-1 font-mono text-[11px] font-bold text-white">
                    {homeworkAlerts.length}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-80 rounded-[8px] border border-[#E2E8F0] bg-white p-3 shadow-lg sm:w-96 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2 dark:border-slate-800">
                    <span className="text-[13px] font-bold text-[#0F172A] dark:text-white">
                      Thông báo Bài tập ({homeworkAlerts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotifDropdown(false)}
                      className="text-[12px] text-[#64748B] hover:text-[#0F172A]"
                    >
                      Đóng
                    </button>
                  </div>
                  {homeworkAlerts.length === 0 ? (
                    <div className="py-4 text-center text-[12.5px] text-[#15803D]">
                      Em đã hoàn thành tất cả bài tập được giao!
                    </div>
                  ) : (
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {homeworkAlerts.map((al) => (
                        <button
                          key={al.assignment.id}
                          type="button"
                          onClick={() => handleOpenHomeworkWorkspace(al.assignment)}
                          className="w-full rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-left transition hover:border-[#136F63] hover:bg-[#E0F2FE]/40 dark:border-slate-800 dark:bg-slate-800/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#136F63]">
                              PIN: {al.assignment.pinCode}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${
                                al.isOverdue
                                  ? 'bg-[#FEE2E2] text-[#DC2626]'
                                  : al.isDueWithin24h
                                    ? 'bg-[#FEF3C7] text-[#B45309]'
                                    : 'bg-[#E0F2FE] text-[#0369A1]'
                              }`}
                            >
                              {al.countdownText}
                            </span>
                          </div>
                          <div className="mt-1 text-[13px] font-semibold text-[#0F172A] dark:text-white">
                            {al.assignment.title}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-[#64748B]">
                            Hạn nộp: {new Date(al.assignment.dueDate).toLocaleString('vi-VN')} · Bấm để
                            làm ngay →
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {onSwitchToTeacherDemo && (
              <button
                type="button"
                onClick={onSwitchToTeacherDemo}
                title="Chuyển về Không gian làm việc của Giáo viên"
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-3 text-[13px] font-semibold text-[#0369A1] transition hover:bg-[#BAE6FD]/70 dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Chuyển sang Giao diện Giáo viên</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Xem nhanh bảng Phím tắt (1–4 / A–D, ←/→, Ctrl+Enter)"
              aria-label="Phím tắt"
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13px] font-semibold text-[#136F63] transition hover:border-[#136F63] hover:bg-[#F0FDFA] dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden md:inline">Phím tắt</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Đổi tài khoản</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top Automatic Reminder Banner for Unsubmitted or Due-within-24h Homework */}
      {homeworkAlerts.length > 0 && !activeRoom && (
        <div className="border-b border-[#F59E0B]/40 bg-[#FEF3C7] px-4 py-2.5 text-[#92400E] sm:px-6 dark:border-amber-800/50 dark:bg-amber-950/60 dark:text-amber-200">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-[13px]">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#D97706] text-white">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <span className="font-bold">
                  Nhắc nhở tự động ({homeworkAlerts.length} bài tập chưa nộp):
                </span>{' '}
                <span className="font-semibold text-[#0F172A] dark:text-white">
                  {homeworkAlerts[0].assignment.title}
                </span>{' '}
                <span className="inline-flex items-center gap-1 rounded bg-[#DC2626] px-2 py-0.5 font-mono text-[11.5px] font-bold text-white">
                  <Clock className="h-3 w-3" />
                  {homeworkAlerts[0].countdownText}
                </span>
                {homeworkAlerts[0].assignment.targetMode === 'remedial_below_threshold' && (
                  <span className="ml-1.5 rounded bg-[#E0F2FE] px-2 py-0.5 text-[11px] font-bold text-[#0369A1]">
                    Phiếu ôn tập cá nhân hóa
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenHomeworkWorkspace(homeworkAlerts[0].assignment)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3 text-[12.5px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Làm bài ngay</span>
              </button>
              {activeTab !== 'homework_portal' && (
                <button
                  type="button"
                  onClick={() => onChangeTab('homework_portal')}
                  className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#D97706]/50 bg-white px-2.5 text-[12px] font-semibold text-[#92400E] hover:bg-[#FFFBEB]"
                >
                  <span>Xem tất cả ({homeworkAlerts.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto max-w-[1400px] p-4 sm:p-6">
        {/* TAB 1: VÀO PHÒNG THI ONLINE */}
        {activeTab === 'exam_room' && (
          <div>
            {!activeRoom ? (
              <div className="space-y-6">
                {/* PIN Entry Banner */}
                <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-7">
                      <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-semibold text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Chế độ Thi Online Chịu tải Toàn trường (0 đồng Cloud)
                      </span>
                      <h1 className="mt-2 text-[20px] font-semibold text-[#0F172A] dark:text-white">
                        Nhập Mã PIN hoặc Chọn Bài Kiểm Tra Của Lớp
                      </h1>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-[#334155] dark:text-slate-400">
                        Trong quá trình làm bài, mọi phương án chọn đều được lưu tức thời vào bộ
                        nhớ trình duyệt (<code className="font-mono">localStorage</code>) giúp
                        chống mất bài khi rớt mạng và chỉ gửi 1 lượt ghi duy nhất lên máy chủ khi
                        em bấm <strong>Nộp bài</strong>.
                      </p>
                    </div>

                    <form
                      onSubmit={handleJoinByPin}
                      className="flex flex-col gap-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <label className="text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
                        Nhập Mã PIN Phòng Thi (6 chữ số)
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            placeholder="VD: 849201"
                            className="h-11 w-full rounded-[8px] border border-[#CBD5E1] bg-white pl-9 pr-3 font-mono text-base font-bold tracking-widest text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <button
                          type="submit"
                          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[8px] bg-[#136F63] px-5 text-[14px] font-medium text-white shadow-xs transition hover:bg-[#0F594F]"
                        >
                          <Play className="h-4 w-4" />
                          <span>Vào thi ngay</span>
                        </button>
                      </div>
                      {pinError && (
                        <p className="text-[12px] font-semibold text-[#B91C1C] dark:text-red-400">
                          {pinError}
                        </p>
                      )}
                    </form>
                  </div>
                </div>

                {/* Assigned Class Exam Rooms */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
                      Danh sách Phòng thi Đang mở cho Lớp {studentAccount.studentClass || profClass}
                    </h2>
                    <span className="text-[12px] text-[#64748B]">
                      {rooms.filter((r) => r.status === 'active').length} phòng đang hoạt động
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {rooms.map((room) => {
                      const hasDraft = Boolean(loadExamDraftFromLocal(room.id));
                      return (
                        <div
                          key={room.id}
                          className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-5 transition hover:border-[#136F63]/60 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5 text-[12px] font-semibold ${
                                  room.status === 'active'
                                    ? 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-slate-100 text-[#64748B] dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                ● {room.status === 'active' ? 'Đang mở thi' : 'Đã đóng'}
                              </span>
                              <span className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-0.5 font-mono text-[12px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                                PIN: {room.pinCode}
                              </span>
                            </div>

                            <h3 className="mt-3 text-[15px] font-semibold leading-snug text-[#0F172A] dark:text-white">
                              {room.title}
                            </h3>

                            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[#64748B] dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {room.durationMinutes} phút
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                                Môn {room.subject}
                              </span>
                              {room.antiCheat && (
                                <span className="inline-flex items-center gap-1 text-[#B45309] dark:text-amber-400">
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                  Giám sát thoát Tab
                                </span>
                              )}
                            </div>

                            {hasDraft && (
                              <div className="mt-3 rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] px-2.5 py-1.5 text-[12px] font-medium text-[#B45309] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                                Có bản nháp đang làm dở trên trình duyệt — bấm vào thi để khôi phục
                                tiếp tục.
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={room.status !== 'active'}
                            onClick={() => enterExamRoom(room)}
                            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F] disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" />
                            <span>{hasDraft ? 'Tiếp tục làm bài' : 'Vào phòng thi này'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* SPLIT-SCREEN LIVE EXAM WORKSPACE */
              <div className="space-y-4">
                {/* Exam Top Status & Timer Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-[8px] bg-[#136F63] px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
                        PIN {activeRoom.pinCode}
                      </span>
                      <h2 className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
                        {activeRoom.title}
                      </h2>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-[#64748B] dark:text-slate-400">
                      <span>
                        Thí sinh: <strong>{studentAccount.displayName || profName}</strong> (Lớp{' '}
                        {studentAccount.studentClass || profClass})
                      </span>
                      {lastLocalSavedAt && (
                        <span className="font-mono text-[11.5px] text-[#15803D] dark:text-emerald-400">
                          ● Đã lưu nháp Local lúc {lastLocalSavedAt} (0 lượt ghi Cloud)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 font-mono text-[12px] font-semibold tabular-nums ${
                        tabSwitches > 0
                          ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-[#B45309]" />
                      <span>Thoát Tab: {tabSwitches} lần</span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 rounded-[8px] border px-3.5 py-1.5 font-mono text-base font-bold tabular-nums ${
                        remainingSeconds < 300
                          ? 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      <span>{formatTimer(remainingSeconds)}</span>
                    </div>

                    {!completedSubmission && (
                      <button
                        type="button"
                        disabled={submittingExam}
                        onClick={handleSubmitExamSingleWrite}
                        className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-medium text-white shadow-xs transition hover:bg-[#0F594F] disabled:opacity-50"
                      >
                        <FileCheck2 className="h-4 w-4" />
                        <span>{submittingExam ? 'Đang nộp...' : 'Nộp bài (1 lượt ghi Cloud)'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveRoom(null)}
                      className="inline-flex h-10 items-center gap-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <X className="h-4 w-4" />
                      <span>Đóng</span>
                    </button>
                  </div>
                </div>

                {tabWarningBanner && (
                  <div className="flex items-center justify-between rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] px-4 py-2.5 text-[13px] font-medium text-[#B45309] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309]" />
                      {tabWarningBanner}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTabWarningBanner(null)}
                      className="font-semibold text-[#B45309] underline"
                    >
                      Đã hiểu
                    </button>
                  </div>
                )}

                {completedSubmission && (
                  <div className="rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] p-5 dark:border-emerald-800 dark:bg-emerald-950/50">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#136F63] text-white">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-[15px] font-semibold text-[#15803D] dark:text-emerald-100">
                            Đã nộp bài thành công lên Cloud Firestore (Chỉ tốn 1 lượt ghi duy nhất!)
                          </h3>
                          <p className="text-[13px] text-[#15803D] dark:text-emerald-300">
                            Điểm Phần I: <strong>{completedSubmission.part1Score}</strong> · Phần
                            II: <strong>{completedSubmission.part2Score}</strong> · Phần III:{' '}
                            <strong>{completedSubmission.part3Score}</strong> · Số lần thoát Tab:{' '}
                            <strong>{completedSubmission.tabSwitches}</strong>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-[8px] bg-white px-4 py-2 text-center shadow-xs dark:bg-slate-900">
                          <div className="text-[11px] font-semibold text-[#64748B] uppercase">
                            Tổng điểm
                          </div>
                          <div className="font-mono text-2xl font-bold text-[#136F63] tabular-nums">
                            {completedSubmission.score} / 10
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRoom(null);
                            onChangeTab('history_results');
                          }}
                          className="rounded-[8px] bg-[#136F63] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#0F594F]"
                        >
                          Xem Lịch sử &amp; Đáp án
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Split-Screen 2 Columns: Left = Exam Content wrapped in SmartboardViewport, Right = 3-Part Answer Sheet */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  {/* Left Column (7/12): Exam Paper Content */}
                  <div className="lg:col-span-7">
                    <SmartboardViewport
                      title={`${activeExamPaper.examTitle} — Mã đề ${activeExamPaper.examCode}`}
                      subtitle={`${activeExamPaper.department} · ${activeExamPaper.schoolName}`}
                      showPenToolbarByDefault
                      bodyClassName="max-h-[calc(100vh-220px)] p-5 sm:p-6"
                    >
                      <div className="border-b border-slate-200 pb-3 text-center dark:border-slate-800">
                        <div className="text-xs font-bold text-slate-500 uppercase">
                          {activeExamPaper.department} · {activeExamPaper.schoolName}
                        </div>
                        <h3 className="mt-1 text-base font-bold text-slate-900 uppercase dark:text-white">
                          {activeExamPaper.examTitle} — Mã đề {activeExamPaper.examCode}
                        </h3>
                      </div>

                    {/* PHẦN I */}
                    <div className="mt-4 space-y-4">
                      <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                        PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (Thí sinh trả lời từ câu 1
                        đến câu {activeExamPaper.part1.length})
                      </div>
                      {activeExamPaper.part1.map((q, idx) => (
                        <div
                          key={q.id}
                          className="rounded-[8px] border border-[#E2E8F0] p-3.5 text-[14px] dark:border-slate-800"
                        >
                          <div className="text-justify leading-relaxed">
                            <span className="mr-1.5 font-semibold text-[#136F63]">
                              Câu {idx + 1}.
                            </span>
                            <MathText text={q.stem} />
                          </div>
                          {q.diagram && !q.image && !q.imageUrl && <ExamDiagram kind={q.diagram} layer="stem" />}
                          {(q.image || q.imageUrl) && (
                            <div className="my-2.5 flex justify-center">
                              <img
                                src={q.image || q.imageUrl}
                                alt={`Hình / Bảng câu ${idx + 1}`}
                                className="h-auto max-h-64 max-w-full rounded-[8px] border border-[#E2E8F0] bg-white p-1 object-contain shadow-2xs"
                              />
                            </div>
                          )}
                          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {q.options.map((opt, oIdx) => {
                              const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, oIdx);
                              const selected = part1Ans[idx] === letter;
                              return (
                                <button
                                  key={letter}
                                  type="button"
                                  disabled={Boolean(completedSubmission)}
                                  onClick={() =>
                                    setPart1Ans((prev) => ({ ...prev, [idx]: letter }))
                                  }
                                  className={`flex min-h-[48px] items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-[13.5px] transition ${
                                    selected
                                      ? 'border-[#136F63] bg-[#DCFCE7] font-semibold text-[#15803D] dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200'
                                      : 'border-[#E2E8F0] hover:bg-[#F8FAFC] dark:border-slate-800 dark:hover:bg-slate-800/50'
                                  }`}
                                >
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                                      selected
                                        ? 'bg-[#136F63] text-white'
                                        : 'bg-slate-100 text-[#334155] dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {letter}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <MathText text={cleanOpt} />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* PHẦN II */}
                    <div className="mt-6 space-y-4">
                      <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                        PHẦN II. Câu trắc nghiệm Đúng / Sai (Trong mỗi ý a, b, c, d ở mỗi câu, thí
                        sinh chọn Đúng hoặc Sai)
                      </div>
                      {activeExamPaper.part2.map((q, idx) => (
                        <div
                          key={q.id}
                          className="rounded-[8px] border border-[#E2E8F0] p-3.5 text-[14px] dark:border-slate-800"
                        >
                          <div className="text-justify leading-relaxed">
                            <span className="mr-1.5 font-semibold text-[#136F63]">
                              Câu {idx + 1}.
                            </span>
                            <MathText text={q.stem} />
                          </div>
                          {q.diagram && !q.image && !q.imageUrl && <ExamDiagram kind={q.diagram} layer="stem" />}
                          {(q.image || q.imageUrl) && (
                            <div className="my-2.5 flex justify-center">
                              <img
                                src={q.image || q.imageUrl}
                                alt={`Hình / Bảng câu ${idx + 1}`}
                                className="h-auto max-h-64 max-w-full rounded-[8px] border border-[#E2E8F0] bg-white p-1 object-contain shadow-2xs"
                              />
                            </div>
                          )}
                          <div className="mt-2.5 space-y-1.5">
                            {q.statements.map((st) => (
                              <div
                                key={st.label}
                                className="rounded-[8px] bg-[#F8FAFC] px-3 py-1.5 text-[13px] dark:bg-slate-800/50"
                              >
                                <strong className="mr-1.5">{st.label})</strong>
                                <MathText text={st.text} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* PHẦN III */}
                    <div className="mt-6 space-y-4">
                      <div className="rounded-[8px] bg-[#E0F2FE] px-3 py-1.5 text-[13px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                        PHẦN III. Câu trắc nghiệm trả lời ngắn (Thí sinh trả lời từ câu 1 đến câu{' '}
                        {activeExamPaper.part3.length})
                      </div>
                      {activeExamPaper.part3.map((q, idx) => (
                        <div
                          key={q.id}
                          className="rounded-[8px] border border-[#E2E8F0] p-3.5 text-[14px] dark:border-slate-800"
                        >
                          <div className="text-justify leading-relaxed">
                            <span className="mr-1.5 font-semibold text-[#136F63]">
                              Câu {idx + 1}.
                            </span>
                            <MathText text={q.stem} />
                          </div>
                          {q.diagram && !q.image && !q.imageUrl && <ExamDiagram kind={q.diagram} layer="stem" />}
                          {(q.image || q.imageUrl) && (
                            <div className="my-2.5 flex justify-center">
                              <img
                                src={q.image || q.imageUrl}
                                alt={`Hình / Bảng câu ${idx + 1}`}
                                className="h-auto max-h-64 max-w-full rounded-[8px] border border-[#E2E8F0] bg-white p-1 object-contain shadow-2xs"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    </SmartboardViewport>
                  </div>

                  {/* Right Column (5/12): 3-Part 2025 Answer Sheet */}
                  <div className="max-h-[calc(100vh-210px)] overflow-y-auto rounded-[8px] border border-[#E2E8F0] bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h3 className="text-sm font-bold text-slate-900 uppercase dark:text-white">
                        Phiếu Tô Đáp Án Điện Tử Chuẩn 2025
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tự động lưu nháp vào thiết bị sau mỗi lần chọn — 0 lượt ghi Cloud khi đang
                        làm bài.
                      </p>
                    </div>

                    {/* Answer Sheet Part I */}
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-bold text-slate-700 uppercase dark:text-slate-300">
                        Phần I. Trắc nghiệm 4 lựa chọn (A - B - C - D)
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {Array.from({
                          length: Math.max(activeExamPaper.part1.length, 12),
                        }).map((_, idx) => (
                          <div
                            key={idx}
                            ref={(el) => {
                              examCardRefs.current[`p1-${idx}`] = el;
                            }}
                            onClick={() => setExamFocusIdx(idx)}
                            className={`flex items-center justify-between rounded-[8px] border px-2.5 py-1.5 transition ${
                              !completedSubmission && examFocusIdx === idx
                                ? 'border-[#136F63] bg-[#F0FDFA]/70 ring-1 ring-[#136F63]/30 dark:border-teal-400 dark:bg-teal-950/30'
                                : 'border-[#E2E8F0] dark:border-slate-800'
                            }`}
                          >
                            <span className="font-mono text-xs font-bold text-slate-600 tabular-nums dark:text-slate-400">
                              {idx + 1}.
                            </span>
                            <div className="flex items-center gap-1">
                              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                                const active = part1Ans[idx] === letter;
                                return (
                                  <button
                                    key={letter}
                                    type="button"
                                    disabled={Boolean(completedSubmission)}
                                    onClick={() => {
                                      setExamFocusIdx(idx);
                                      setPart1Ans((prev) => ({ ...prev, [idx]: letter }));
                                    }}
                                    className={`flex h-9 w-9 items-center justify-center rounded-full font-mono text-[12px] font-bold transition ${
                                      active
                                        ? 'bg-[#136F63] text-white'
                                        : 'bg-slate-100 text-[#334155] hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {letter}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Answer Sheet Part II */}
                    <div className="mt-5">
                      <div className="mb-2 text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
                        Phần II. Trắc nghiệm Đúng / Sai (Mỗi câu 4 ý a, b, c, d)
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {Array.from({
                          length: Math.max(activeExamPaper.part2.length, 4),
                        }).map((_, qIdx) => {
                          const p1Len = Math.max(activeExamPaper.part1.length, 12);
                          const isFocusedP2 = !completedSubmission && examFocusIdx === p1Len + qIdx;
                          return (
                          <div
                            key={qIdx}
                            ref={(el) => {
                              examCardRefs.current[`p2-${qIdx}`] = el;
                            }}
                            onClick={() => setExamFocusIdx(p1Len + qIdx)}
                            className={`rounded-[8px] border p-2.5 transition ${
                              isFocusedP2
                                ? 'border-[#136F63] bg-[#F0FDFA]/50 ring-1 ring-[#136F63]/30 dark:border-teal-400 dark:bg-teal-950/30'
                                : 'border-[#E2E8F0] dark:border-slate-800'
                            }`}
                          >
                            <div className="mb-1.5 font-mono text-[12px] font-semibold text-[#136F63] dark:text-teal-300">
                              Câu {qIdx + 1} (Phần II)
                            </div>
                            <div className="space-y-1.5">
                              {(['a', 'b', 'c', 'd'] as const).map((subKey) => {
                                const currentVal = part2Ans[qIdx]?.[subKey];
                                return (
                                  <div
                                    key={subKey}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="font-mono font-bold text-[#334155] dark:text-slate-300">
                                      Ý {subKey})
                                    </span>
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        disabled={Boolean(completedSubmission)}
                                        onClick={() =>
                                          setPart2Ans((prev) => ({
                                            ...prev,
                                            [qIdx]: { ...(prev[qIdx] || {}), [subKey]: true },
                                          }))
                                        }
                                        className={`min-h-[48px] min-w-[54px] rounded-[6px] px-3 py-1.5 text-[12px] font-semibold transition ${
                                          currentVal === true
                                            ? 'bg-[#136F63] text-white'
                                            : 'bg-slate-100 text-[#334155] hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                      >
                                        Đúng
                                      </button>
                                      <button
                                        type="button"
                                        disabled={Boolean(completedSubmission)}
                                        onClick={() =>
                                          setPart2Ans((prev) => ({
                                            ...prev,
                                            [qIdx]: { ...(prev[qIdx] || {}), [subKey]: false },
                                          }))
                                        }
                                        className={`min-h-[48px] min-w-[54px] rounded-[6px] px-3 py-1.5 text-[12px] font-semibold transition ${
                                          currentVal === false
                                            ? 'bg-[#B45309] text-white'
                                            : 'bg-slate-100 text-[#334155] hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                      >
                                        Sai
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Answer Sheet Part III */}
                    <div className="mt-5">
                      <div className="mb-2 text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
                        Phần III. Trả lời ngắn (Tối đa 4 ký tự · Chạm ô bật bàn phím số ảo)
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {Array.from({
                          length: Math.max(activeExamPaper.part3.length, 6),
                        }).map((_, idx) => {
                          const p1Len = Math.max(activeExamPaper.part1.length, 12);
                          const p2Len = Math.max(activeExamPaper.part2.length, 4);
                          const p3Len = Math.max(activeExamPaper.part3.length, 6);
                          const isFocusedP3 =
                            !completedSubmission && examFocusIdx === p1Len + p2Len + idx;
                          return (
                            <div
                              key={idx}
                              ref={(el) => {
                                examCardRefs.current[`p3-${idx}`] = el;
                              }}
                              className={`rounded-[8px] border p-2 transition ${
                                isFocusedP3 ||
                                (keypadTarget?.mode === 'exam' && keypadTarget.index === idx)
                                  ? 'border-[#136F63] bg-[#F0FDFA]/60 ring-1 ring-[#136F63]/30 dark:border-teal-400 dark:bg-teal-950/30'
                                  : 'border-[#E2E8F0] dark:border-slate-800'
                              }`}
                            >
                              <label className="block font-mono text-[11.5px] font-semibold text-[#64748B] dark:text-slate-400">
                                Câu {idx + 1}
                              </label>
                              <input
                                ref={(el) => {
                                  examP3InputRefs.current[idx] = el;
                                }}
                                type="text"
                                maxLength={SHORT_ANSWER_MAX_LEN}
                                disabled={Boolean(completedSubmission)}
                                value={part3Ans[idx] || ''}
                                onFocus={() => {
                                  if (!completedSubmission) {
                                    setExamFocusIdx(p1Len + p2Len + idx);
                                    setKeypadTarget({ mode: 'exam', index: idx });
                                  }
                                }}
                                onClick={() => {
                                  if (!completedSubmission) {
                                    setExamFocusIdx(p1Len + p2Len + idx);
                                    setKeypadTarget({ mode: 'exam', index: idx });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                    e.preventDefault();
                                    if (idx + 1 < p3Len) {
                                      setExamFocusIdx(p1Len + p2Len + idx + 1);
                                      setKeypadTarget({ mode: 'exam', index: idx + 1 });
                                      examP3InputRefs.current[idx + 1]?.focus();
                                    } else {
                                      setKeypadTarget(null);
                                    }
                                  }
                                }}
                                onChange={(e) =>
                                  setPart3Ans((prev) => ({
                                    ...prev,
                                    [idx]: sanitizeShortAnswerValue(e.target.value),
                                  }))
                                }
                                placeholder="VD: -2,4"
                                className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] text-center font-mono text-[13.5px] font-bold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {!completedSubmission && (
                      <button
                        type="button"
                        disabled={submittingExam}
                        onClick={handleSubmitExamSingleWrite}
                        className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[14px] font-medium text-white shadow-xs transition hover:bg-[#0F594F] disabled:opacity-50"
                      >
                        <FileCheck2 className="h-4 w-4" />
                        <span>Nộp Bài &amp; Chấm Điểm Ngay</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BÀI TẬP VỀ NHÀ (AZOTA-STYLE) */}
        {activeTab === 'homework_portal' && (
          <div>
            {!activeHomework ? (
              <div className="space-y-6">
                {/* Quick PIN Entry & Overview Banner */}
                <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-7">
                      <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-semibold text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>Phân hệ Bài tập về nhà Online · Cá nhân hóa &amp; Chấm tự động</span>
                      </span>
                      <h1 className="mt-2.5 text-[22px] font-semibold tracking-tight text-[#0F172A] dark:text-white">
                        Danh sách Bài tập được giao cho {currentStudentIdentity.studentName} (Lớp{' '}
                        {currentStudentIdentity.studentClass})
                      </h1>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#64748B] dark:text-slate-400">
                        Hệ thống chỉ hiển thị các bài tập Giáo viên giao cho lớp em hoặc phiếu ôn tập
                        cá nhân hóa dành riêng cho em. Hỗ trợ làm trắc nghiệm 3 phần trực tiếp trên
                        màn hình và chụp ảnh vở bài tập tự luận (tự động nén dưới 150KB).
                      </p>
                    </div>

                    <div className="lg:col-span-5">
                      <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-800 dark:bg-slate-800/60">
                        <label className="block text-[12px] font-semibold text-[#334155] uppercase dark:text-slate-300">
                          Mở nhanh bằng Mã PIN Bài tập (từ nhóm Zalo)
                        </label>
                        <div className="mt-2 flex gap-2">
                          <div className="relative flex-1">
                            <KeyRound className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                            <input
                              type="text"
                              value={hwPinInput}
                              onChange={(e) => {
                                setHwPinInput(e.target.value);
                                setHwPinError(null);
                              }}
                              placeholder="VD: 681420"
                              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white pr-3 pl-9 font-mono text-[15px] font-bold tracking-widest text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const found = homeworkAssignments.find(
                                (h) => h.pinCode.trim() === hwPinInput.trim()
                              );
                              if (!found) {
                                setHwPinError('Không tìm thấy bài tập với mã PIN này.');
                                return;
                              }
                              handleOpenHomeworkWorkspace(found);
                            }}
                            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
                          >
                            <Play className="h-3.5 w-3.5" />
                            <span>Mở bài</span>
                          </button>
                        </div>
                        {hwPinError && (
                          <div className="mt-2 text-[12px] font-semibold text-[#DC2626]">
                            {hwPinError}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Homework Cards List (Filtered strictly for this student) */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[16px] font-semibold text-[#0F172A] dark:text-white">
                      Bài tập của em ({visibleHomeworks.length} bài)
                    </h2>
                    <span className="text-[12px] text-[#64748B]">
                      Tự động lưu nháp vào trình duyệt khi đang làm bài
                    </span>
                  </div>

                  {visibleHomeworks.length === 0 ? (
                    <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
                      <ClipboardCheck className="mx-auto h-10 w-10 text-[#64748B]" />
                      <div className="mt-2 text-[15px] font-semibold text-[#0F172A] dark:text-white">
                        Hiện tại chưa có bài tập về nhà nào dành cho em
                      </div>
                      <p className="mt-1 text-[13px] text-[#64748B]">
                        Khi Giáo viên giao bài cho lớp {currentStudentIdentity.studentClass} hoặc giao
                        riêng cho em, bài tập sẽ xuất hiện tại đây.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {visibleHomeworks.map((hw) => {
                        const mySub = myHomeworkSubmissionsMap[hw.id];
                        const countdown = formatCountdownRemaining(hw.dueDate);
                        const hasDraft = Boolean(loadHomeworkDraftFromLocal(hw.id));
                        return (
                          <div
                            key={hw.id}
                            className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs transition hover:border-[#136F63] dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="rounded-[6px] bg-[#E0F2FE] px-2 py-0.5 font-mono text-[11.5px] font-bold text-[#0369A1]">
                                  PIN: {hw.pinCode}
                                </span>
                                {mySub ? (
                                  <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#DCFCE7] px-2.5 py-0.5 text-[11.5px] font-bold text-[#15803D]">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>Đã nộp · {mySub.totalScore} đ</span>
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-[6px] px-2.5 py-0.5 font-mono text-[11.5px] font-bold ${
                                      countdown.isOverdue
                                        ? 'bg-[#FEE2E2] text-[#DC2626]'
                                        : countdown.isDueWithin24h
                                          ? 'bg-[#FEF3C7] text-[#B45309]'
                                          : 'bg-slate-100 text-[#334155]'
                                    }`}
                                  >
                                    <Clock className="h-3 w-3" />
                                    <span>{countdown.label}</span>
                                  </span>
                                )}
                              </div>

                              <h3 className="mt-3 text-[15.5px] font-semibold text-[#0F172A] dark:text-white">
                                {hw.title}
                              </h3>

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#64748B]">
                                <span>
                                  Hạn nộp: {new Date(hw.dueDate).toLocaleString('vi-VN')}
                                </span>
                              </div>

                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {hw.targetMode === 'remedial_below_threshold' && (
                                  <span className="rounded-[6px] bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                                    Phiếu phụ đạo cá nhân hóa
                                  </span>
                                )}
                                {hw.targetMode === 'manual_students' && (
                                  <span className="rounded-[6px] bg-[#E0F2FE] px-2 py-0.5 text-[11px] font-semibold text-[#0369A1]">
                                    Giao riêng cho em
                                  </span>
                                )}
                                {hasDraft && !mySub && (
                                  <span className="rounded-[6px] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                                    Đang có bản lưu nháp
                                  </span>
                                )}
                              </div>

                              {mySub?.teacherFeedback && (
                                <div className="mt-3 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7]/50 p-2.5 text-[12px] text-[#15803D] dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                  <div className="font-bold">Nhận xét của Giáo viên:</div>
                                  <div className="mt-0.5">{mySub.teacherFeedback}</div>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={() => handleOpenHomeworkWorkspace(hw)}
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F]"
                              >
                                <Play className="h-3.5 w-3.5" />
                                <span>
                                  {mySub
                                    ? 'Xem lại Bài đã nộp / Nộp bổ sung'
                                    : hasDraft
                                      ? 'Tiếp tục làm bản nháp'
                                      : 'Bắt đầu Làm bài tập'}
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ACTIVE HOMEWORK TAKING WORKSPACE */
              <div className="space-y-4">
                {/* Sticky Homework Top Bar */}
                <div className="sticky top-[68px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[6px] bg-[#136F63] px-2.5 py-0.5 font-mono text-[12px] font-bold text-white">
                        PIN: {activeHomework.pinCode}
                      </span>
                      <h2 className="text-[16px] font-semibold text-[#0F172A] dark:text-white">
                        {activeHomework.title}
                      </h2>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-[#64748B]">
                      <span>
                        Hạn chót: {new Date(activeHomework.dueDate).toLocaleString('vi-VN')}
                      </span>
                      {hwLastDraftSavedAt && (
                        <span className="font-semibold text-[#15803D]">
                          • Đã tự động lưu nháp lúc {hwLastDraftSavedAt}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveHomework(null)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-semibold text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                      <span>Quay lại Danh sách</span>
                    </button>
                    <button
                      type="button"
                      disabled={submittingHw}
                      onClick={handleSubmitHomework}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F] disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{submittingHw ? 'Đang nộp...' : 'Nộp Bài Tập'}</span>
                    </button>
                  </div>
                </div>

                {/* Submission Confirmation Banner */}
                {completedHwSub && (
                  <div className="rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] p-4 text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        <div>
                          <div className="text-[14px] font-bold">
                            Đã nộp bài tập thành công! Điểm hiện tại: {completedHwSub.totalScore} / 10
                            điểm
                          </div>
                          <div className="text-[12.5px]">
                            Điểm trắc nghiệm tự động: {completedHwSub.objectiveScore} đ
                            {completedHwSub.essayScore !== undefined
                              ? ` · Điểm tự luận Giáo viên chấm: ${completedHwSub.essayScore} đ`
                              : ' · Phần tự luận (nếu có) đang chờ Giáo viên chấm điểm'}
                          </div>
                        </div>
                      </div>
                      {completedHwSub.teacherFeedback && (
                        <div className="rounded-[8px] bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-[#0F172A] dark:bg-slate-900 dark:text-white">
                          Nhận xét GV: &ldquo;{completedHwSub.teacherFeedback}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Essay / SGK Prompt & Photo Upload Section */}
                {(activeHomework.sourceType === 'essay_sgk' ||
                  Boolean(activeHomework.essayPromptText?.trim()) ||
                  (activeHomework.essayPromptImages &&
                    activeHomework.essayPromptImages.length > 0) ||
                  !activeHomework.examPaperSnapshot) && (
                  <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-[15px] font-bold text-[#136F63] uppercase">
                      Đề bài Tự luận / Bài tập SGK &amp; Nộp ảnh chụp vở làm bài
                    </h3>
                    {activeHomework.essayPromptText && (
                      <div className="mt-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[14.5px] leading-relaxed text-[#0F172A] dark:border-slate-800 dark:bg-slate-800/70 dark:text-white">
                        <MathText text={activeHomework.essayPromptText} />
                      </div>
                    )}
                    {activeHomework.essayPromptImages &&
                      activeHomework.essayPromptImages.length > 0 && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {activeHomework.essayPromptImages.map((imgUrl, idx) => (
                            <img
                              key={idx}
                              src={imgUrl}
                              alt={`Đề bài hình ${idx + 1}`}
                              className="max-h-80 w-full rounded-[8px] border border-[#E2E8F0] bg-white object-contain p-2"
                            />
                          ))}
                        </div>
                      )}

                    {/* Student Essay Text & Photo Upload */}
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <label className="block text-[13px] font-semibold text-[#334155] dark:text-slate-200">
                          Nhập lời giải tóm tắt / Đáp số tự luận (Tùy chọn)
                        </label>
                        <textarea
                          rows={4}
                          value={hwEssayText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHwEssayText(val);
                            persistHwDraft(
                              activeHomework.id,
                              hwPart1Ans,
                              hwPart2Ans,
                              hwPart3Ans,
                              val,
                              hwImages
                            );
                          }}
                          placeholder="Em có thể gõ trực tiếp lời giải hoặc chụp ảnh vở bài tập ở khung bên cạnh..."
                          className="mt-1.5 w-full rounded-[8px] border border-[#CBD5E1] bg-white p-3 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-[13px] font-semibold text-[#334155] dark:text-slate-200">
                            Tải ảnh chụp bài làm tự luận (Tự động nén &lt; 150KB)
                          </label>
                          <span className="font-mono text-[11.5px] text-[#64748B]">
                            Đã đính kèm: {hwImages.length}/6 ảnh
                          </span>
                        </div>

                        <input
                          ref={hwFileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleUploadHomeworkPhotos}
                          className="hidden"
                        />

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={hwCompressingImg}
                            onClick={() => hwFileInputRef.current?.click()}
                            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#136F63] bg-[#E0F2FE]/50 px-4 text-[13px] font-semibold text-[#136F63] transition hover:bg-[#E0F2FE]"
                          >
                            <Camera className="h-4 w-4" />
                            <span>
                              {hwCompressingImg
                                ? 'Đang nén ảnh < 150KB...'
                                : '+ Chụp / Tải ảnh bài làm'}
                            </span>
                          </button>
                        </div>

                        {hwImages.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {hwImages.map((imgData, idx) => (
                              <div
                                key={idx}
                                className="group relative overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-1"
                              >
                                <img
                                  src={imgData}
                                  alt={`Ảnh bài làm ${idx + 1}`}
                                  className="h-28 w-full rounded object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = hwImages.filter((_, i) => i !== idx);
                                    setHwImages(next);
                                    persistHwDraft(
                                      activeHomework.id,
                                      hwPart1Ans,
                                      hwPart2Ans,
                                      hwPart3Ans,
                                      hwEssayText,
                                      next
                                    );
                                  }}
                                  className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#DC2626] text-white shadow-xs"
                                  title="Xóa ảnh này"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3-Part Objective Questions if examPaperSnapshot is present */}
                {activeHomework.examPaperSnapshot && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    {/* Left Column: Question Content */}
                    <div className="space-y-5 lg:col-span-8">
                      {/* Part I (-TN) */}
                      {activeHomework.examPaperSnapshot.part1.length > 0 && (
                        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                          <div className="mb-3 border-b border-[#E2E8F0] pb-2 text-[14px] font-bold text-[#136F63] uppercase dark:border-slate-800">
                            Phần I (-TN). Câu trắc nghiệm nhiều phương án lựa chọn (
                            {activeHomework.examPaperSnapshot.part1.length} câu)
                          </div>
                          <div className="space-y-5">
                            {activeHomework.examPaperSnapshot.part1.map((q, qIdx) => {
                              const selectedLetter = hwPart1Ans[qIdx];
                              const isFocusedHw = !completedHwSub && hwFocusIdx === qIdx;
                              return (
                                <div
                                  key={q.id}
                                  ref={(el) => {
                                    hwCardRefs.current[`p1-${qIdx}`] = el;
                                  }}
                                  onClick={() => setHwFocusIdx(qIdx)}
                                  className={`rounded-[8px] border p-4 transition ${
                                    isFocusedHw
                                      ? 'border-[#136F63] ring-2 ring-[#136F63]/20 dark:border-teal-400'
                                      : 'border-[#E2E8F0] dark:border-slate-800'
                                  }`}
                                >
                                  <div className="text-[14.5px] leading-relaxed text-[#0F172A] dark:text-white">
                                    <span className="mr-1.5 font-bold text-[#136F63]">
                                      Câu {qIdx + 1}:
                                    </span>
                                    <MathText text={q.stem} />
                                  </div>
                                  {(q.image || q.imageUrl) && (
                                    <div className="my-2.5 flex justify-center">
                                      <img
                                        src={q.image || q.imageUrl}
                                        alt={`Hình câu ${qIdx + 1}`}
                                        className="max-h-56 rounded border border-[#E2E8F0] bg-white p-1 object-contain"
                                      />
                                    </div>
                                  )}
                                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {q.options.map((ch, cIdx) => {
                                      const { letter, text: cleanOpt } = formatMcqOptionDisplay(ch, cIdx);
                                      const isSelected = selectedLetter === letter;
                                      return (
                                        <button
                                          key={letter}
                                          type="button"
                                          onClick={() => {
                                            const next = { ...hwPart1Ans, [qIdx]: letter };
                                            setHwPart1Ans(next);
                                            persistHwDraft(
                                              activeHomework.id,
                                              next,
                                              hwPart2Ans,
                                              hwPart3Ans,
                                              hwEssayText,
                                              hwImages
                                            );
                                          }}
                                          className={`flex items-center gap-2.5 rounded-[8px] border px-3 py-2 text-left text-[13.5px] transition ${
                                            isSelected
                                              ? 'border-[#136F63] bg-[#136F63] font-semibold text-white'
                                              : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:border-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                                          }`}
                                        >
                                          <span
                                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold ${
                                              isSelected
                                                ? 'bg-white text-[#136F63]'
                                                : 'bg-white text-[#136F63] shadow-2xs dark:bg-slate-900'
                                            }`}
                                          >
                                            {letter}
                                          </span>
                                          <span className="flex-1">
                                            <MathText text={cleanOpt} />
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Part II (-DS) */}
                      {activeHomework.examPaperSnapshot.part2.length > 0 && (
                        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                          <div className="mb-3 border-b border-[#E2E8F0] pb-2 text-[14px] font-bold text-[#136F63] uppercase dark:border-slate-800">
                            Phần II (-DS). Câu trắc nghiệm Đúng / Sai (
                            {activeHomework.examPaperSnapshot.part2.length} câu)
                          </div>
                          <div className="space-y-5">
                            {activeHomework.examPaperSnapshot.part2.map((q, qIdx) => {
                              const p1Len = activeHomework.examPaperSnapshot?.part1.length || 0;
                              const isFocusedHw = !completedHwSub && hwFocusIdx === p1Len + qIdx;
                              return (
                              <div
                                key={q.id}
                                ref={(el) => {
                                  hwCardRefs.current[`p2-${qIdx}`] = el;
                                }}
                                onClick={() => setHwFocusIdx(p1Len + qIdx)}
                                className={`rounded-[8px] border p-4 transition ${
                                  isFocusedHw
                                    ? 'border-[#136F63] ring-2 ring-[#136F63]/20 dark:border-teal-400'
                                    : 'border-[#E2E8F0] dark:border-slate-800'
                                }`}
                              >
                                <div className="text-[14.5px] leading-relaxed text-[#0F172A] dark:text-white">
                                  <span className="mr-1.5 font-bold text-[#136F63]">
                                    Câu {qIdx + 1}:
                                  </span>
                                  <MathText text={q.stem} />
                                </div>
                                <div className="mt-3 space-y-2">
                                  {q.statements.map((st) => {
                                    const subKey = st.label as 'a' | 'b' | 'c' | 'd';
                                    const currentVal = hwPart2Ans[qIdx]?.[subKey];
                                    return (
                                      <div
                                        key={st.label}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                                      >
                                        <div className="flex-1 text-[13.5px] text-[#0F172A] dark:text-slate-100">
                                          <strong className="mr-1.5 text-[#136F63]">
                                            {st.label})
                                          </strong>
                                          <MathText text={st.text} />
                                        </div>
                                        <div className="flex gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const next = {
                                                ...hwPart2Ans,
                                                [qIdx]: {
                                                  ...(hwPart2Ans[qIdx] || {}),
                                                  [subKey]: true,
                                                },
                                              };
                                              setHwPart2Ans(next);
                                              persistHwDraft(
                                                activeHomework.id,
                                                hwPart1Ans,
                                                next,
                                                hwPart3Ans,
                                                hwEssayText,
                                                hwImages
                                              );
                                            }}
                                            className={`rounded-[6px] px-3 py-1 text-[12px] font-semibold transition ${
                                              currentVal === true
                                                ? 'bg-[#136F63] text-white'
                                                : 'bg-white text-[#334155] hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
                                            }`}
                                          >
                                            Đúng
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const next = {
                                                ...hwPart2Ans,
                                                [qIdx]: {
                                                  ...(hwPart2Ans[qIdx] || {}),
                                                  [subKey]: false,
                                                },
                                              };
                                              setHwPart2Ans(next);
                                              persistHwDraft(
                                                activeHomework.id,
                                                hwPart1Ans,
                                                next,
                                                hwPart3Ans,
                                                hwEssayText,
                                                hwImages
                                              );
                                            }}
                                            className={`rounded-[6px] px-3 py-1 text-[12px] font-semibold transition ${
                                              currentVal === false
                                                ? 'bg-[#DC2626] text-white'
                                                : 'bg-white text-[#334155] hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
                                            }`}
                                          >
                                            Sai
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Part III (-TLN) */}
                      {activeHomework.examPaperSnapshot.part3.length > 0 && (
                        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                          <div className="mb-3 border-b border-[#E2E8F0] pb-2 text-[14px] font-bold text-[#136F63] uppercase dark:border-slate-800">
                            Phần III (-TLN). Câu trắc nghiệm trả lời ngắn (
                            {activeHomework.examPaperSnapshot.part3.length} câu)
                          </div>
                          <div className="space-y-4">
                            {activeHomework.examPaperSnapshot.part3.map((q, qIdx) => {
                              const p1Len = activeHomework.examPaperSnapshot?.part1.length || 0;
                              const p2Len = activeHomework.examPaperSnapshot?.part2.length || 0;
                              const p3Len = activeHomework.examPaperSnapshot?.part3.length || 0;
                              const flatIdx = p1Len + p2Len + qIdx;
                              const isFocusedHw =
                                !completedHwSub &&
                                (hwFocusIdx === flatIdx ||
                                  (keypadTarget?.mode === 'homework' && keypadTarget.index === qIdx));
                              return (
                                <div
                                  key={q.id}
                                  ref={(el) => {
                                    hwCardRefs.current[`p3-${qIdx}`] = el;
                                  }}
                                  onClick={() => setHwFocusIdx(flatIdx)}
                                  className={`rounded-[8px] border p-4 transition ${
                                    isFocusedHw
                                      ? 'border-[#136F63] ring-2 ring-[#136F63]/20 dark:border-teal-400'
                                      : 'border-[#E2E8F0] dark:border-slate-800'
                                  }`}
                                >
                                  <div className="text-[14.5px] leading-relaxed text-[#0F172A] dark:text-white">
                                    <span className="mr-1.5 font-bold text-[#136F63]">
                                      Câu {qIdx + 1}:
                                    </span>
                                    <MathText text={q.stem} />
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <span className="text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                                      Đáp số của em:
                                    </span>
                                    <input
                                      ref={(el) => {
                                        hwP3InputRefs.current[qIdx] = el;
                                      }}
                                      type="text"
                                      maxLength={SHORT_ANSWER_MAX_LEN}
                                      value={hwPart3Ans[qIdx] || ''}
                                      onFocus={() => {
                                        setHwFocusIdx(flatIdx);
                                        setKeypadTarget({ mode: 'homework', index: qIdx });
                                      }}
                                      onClick={() => {
                                        setHwFocusIdx(flatIdx);
                                        setKeypadTarget({ mode: 'homework', index: qIdx });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                          e.preventDefault();
                                          if (qIdx + 1 < p3Len) {
                                            setHwFocusIdx(flatIdx + 1);
                                            setKeypadTarget({ mode: 'homework', index: qIdx + 1 });
                                            hwP3InputRefs.current[qIdx + 1]?.focus();
                                          } else {
                                            setKeypadTarget(null);
                                          }
                                        }
                                      }}
                                      onChange={(e) => {
                                        const clean = sanitizeShortAnswerValue(e.target.value);
                                        const next = { ...hwPart3Ans, [qIdx]: clean };
                                        setHwPart3Ans(next);
                                        persistHwDraft(
                                          activeHomework.id,
                                          hwPart1Ans,
                                          hwPart2Ans,
                                          next,
                                          hwEssayText,
                                          hwImages
                                        );
                                      }}
                                      placeholder="VD: -2,4"
                                      className="h-10 w-44 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 font-mono text-[14px] font-bold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                    />
                                    <span className="text-[11.5px] text-[#64748B] dark:text-slate-400">
                                      Tối đa 4 ký tự · Chạm ô bật bàn phím số ảo
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Quick Summary & Submit Panel */}
                    <div className="lg:col-span-4">
                      <div className="sticky top-[148px] rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-[#E2E8F0] pb-2.5 text-[14px] font-bold text-[#0F172A] dark:border-slate-800 dark:text-white">
                          Tóm tắt Phiếu trả lời Bài tập
                        </div>
                        <div className="mt-3 space-y-2 text-[13px] text-[#334155] dark:text-slate-300">
                          <div className="flex items-center justify-between">
                            <span>Phần I (-TN):</span>
                            <span className="font-mono font-bold text-[#136F63]">
                              {Object.keys(hwPart1Ans).length}/
                              {activeHomework.examPaperSnapshot.part1.length} câu
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Phần II (-DS):</span>
                            <span className="font-mono font-bold text-[#136F63]">
                              {Object.keys(hwPart2Ans).length}/
                              {activeHomework.examPaperSnapshot.part2.length} câu
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Phần III (-TLN):</span>
                            <span className="font-mono font-bold text-[#136F63]">
                              {
                                Object.values(hwPart3Ans).filter((v) => String(v || '').trim())
                                  .length
                              }
                              /{activeHomework.examPaperSnapshot.part3.length} câu
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Ảnh chụp bài tự luận:</span>
                            <span className="font-mono font-bold text-[#0369A1]">
                              {hwImages.length} ảnh
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={submittingHw}
                          onClick={handleSubmitHomework}
                          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#0F594F] disabled:opacity-50"
                        >
                          <FileCheck2 className="h-4 w-4" />
                          <span>
                            {submittingHw ? 'Đang lưu & chấm điểm...' : 'Hoàn thành & Nộp bài'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LỊCH SỬ & KẾT QUẢ HỌC TẬP */}
        {activeTab === 'history_results' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="text-[18px] font-semibold text-[#0F172A] dark:text-white">
                  Lịch sử Làm bài &amp; Kết quả Học tập Cá nhân
                </h2>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Lưu trữ vĩnh viễn toàn bộ bài thi đã nộp, điểm thành phần từng phần, số lần thoát
                  Tab và lời giải chi tiết sau khi Giáo viên mở khóa.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-right dark:border-slate-800 dark:bg-slate-800/60">
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase">
                    Số bài đã hoàn thành
                  </div>
                  <div className="font-mono text-lg font-bold text-[#0F172A] tabular-nums dark:text-white">
                    {studentSubmissions.length} bài thi
                  </div>
                </div>
                <div className="rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-3.5 py-2 text-right dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <div className="text-[11px] font-semibold text-[#15803D] uppercase dark:text-emerald-300">
                    Điểm trung bình
                  </div>
                  <div className="font-mono text-lg font-bold text-[#15803D] tabular-nums dark:text-emerald-300">
                    {studentSubmissions.length > 0
                      ? (
                          studentSubmissions.reduce((acc, s) => acc + s.score, 0) /
                          studentSubmissions.length
                        ).toFixed(2)
                      : '0.00'}{' '}
                    / 10
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13.5px]">
                  <thead>
                    <tr className="bg-[#136F63] text-[12px] font-semibold text-white uppercase">
                      <th className="px-4 py-3">Kỳ thi / Phòng thi</th>
                      <th className="px-3 py-3">Học sinh · Lớp</th>
                      <th className="px-3 py-3 text-right">Điểm Phần I / II / III</th>
                      <th className="px-3 py-3 text-right">Tổng điểm</th>
                      <th className="px-3 py-3 text-center">Thoát Tab</th>
                      <th className="px-3 py-3">Thời gian nộp</th>
                      <th className="px-4 py-3 text-right">Đáp án &amp; Lời giải</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {studentSubmissions.map((sub) => {
                      const roomObj = rooms.find((r) => r.id === sub.roomId);
                      const isUnlocked = roomObj ? roomObj.allowReviewSolutions !== false : true;
                      return (
                        <tr
                          key={sub.id}
                          className="transition hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-white">
                            <div>{sub.roomTitle || roomObj?.title || 'Đề kiểm tra định kỳ'}</div>
                            <div className="font-mono text-[11.5px] font-normal text-[#64748B]">
                              Mã đề: {sub.examCode || '0107'}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-[#334155] dark:text-slate-200">
                              {sub.studentName}
                            </div>
                            <div className="font-mono text-[11.5px] text-[#64748B]">
                              Lớp {sub.studentClass}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-[#64748B] dark:text-slate-400">
                            {sub.part1Score !== undefined
                              ? `${sub.part1Score} · ${sub.part2Score} · ${sub.part3Score}`
                              : '3.0 · 3.5 · 2.5'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-sm font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                            {sub.score.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 text-center font-mono tabular-nums">
                            <span
                              className={`inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5 text-[11.5px] font-semibold ${
                                sub.tabSwitches > 0
                                  ? 'bg-[#FEF3C7] text-[#B45309] dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300'
                              }`}
                            >
                              {sub.tabSwitches} lần
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11.5px] text-[#64748B] tabular-nums">
                            {new Date(sub.submittedAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isUnlocked ? (
                              <button
                                type="button"
                                onClick={() => setReviewingSubmission(sub)}
                                className="inline-flex items-center gap-1 rounded-[8px] bg-[#E0F2FE] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]/70 dark:bg-slate-800 dark:text-[#BAE6FD]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Xem lời giải</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-[8px] bg-slate-100 px-2.5 py-1.5 text-[12px] font-semibold text-[#64748B] dark:bg-slate-800 dark:text-slate-400">
                                <Lock className="h-3 w-3" />
                                <span>GV đang khóa</span>
                              </span>
                            )}
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

        {/* TAB 3: HỒ SƠ CÁ NHÂN HỌC SINH */}
        {activeTab === 'student_profile' && (
          <div className="mx-auto max-w-2xl rounded-[8px] border border-[#E2E8F0] bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-[18px] font-semibold text-[#0F172A] dark:text-white">
                  Hồ sơ Cá nhân Học sinh
                </h2>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Thông tin Lớp và Số báo danh gắn liền với Email Google cá nhân để tự động đồng bộ
                  điểm thi vào Sổ điểm của Giáo viên.
                </p>
              </div>
              <span className="rounded-[8px] bg-[#DCFCE7] px-3 py-1 font-mono text-[12px] font-semibold text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300">
                {studentAccount.email}
              </span>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Họ và tên Học sinh
                  </label>
                  <input
                    type="text"
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-semibold text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Email Google liên kết (Cố định)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={studentAccount.email}
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[12.5px] text-[#64748B] dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Lớp học hiện tại
                  </label>
                  <select
                    value={profClass}
                    onChange={(e) => setProfClass(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] font-semibold text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {classOptions.map((c) => (
                      <option key={c} value={c}>
                        Lớp {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Số báo danh / Mã định danh HS
                  </label>
                  <input
                    type="text"
                    value={profCode}
                    onChange={(e) => setProfCode(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] font-semibold text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Ngày sinh
                  </label>
                  <input
                    type="text"
                    value={profDob}
                    onChange={(e) => setProfDob(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#334155] dark:text-slate-300">
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="text"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                {profileSavedToast ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#15803D]">
                    <CheckCircle2 className="h-4 w-4" />
                    Đã lưu Hồ sơ Học sinh lên Cloud Firestore!
                  </span>
                ) : (
                  <span className="text-[12px] text-[#64748B]">
                    Lần đăng nhập gần nhất:{' '}
                    {new Date(studentAccount.lastLoginAt).toLocaleString('vi-VN')}
                  </span>
                )}
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#136F63] px-5 text-[13.5px] font-medium text-white shadow-xs transition hover:bg-[#0F594F]"
                >
                  <Save className="h-4 w-4" />
                  <span>Lưu cập nhật Hồ sơ</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Solution & Answer Key Review Modal (When Teacher Unlocks) */}
      {reviewingSubmission && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setReviewingSubmission(null)}
          maxWidthClass="max-w-4xl"
          title={
            <span className="inline-flex items-center gap-2">
              <Unlock className="h-4 w-4 text-[#136F63]" />
              <span>
                Chi tiết Bài làm &amp; Lời giải ({reviewingSubmission.studentName} —{' '}
                {reviewingSubmission.score} điểm)
              </span>
            </span>
          }
          subtitle="Giáo viên đã mở khóa lời giải chi tiết cho phòng thi này."
          bodyClassName="p-5"
        >
          <div className="space-y-4">
            {defaultExam.part1.slice(0, 6).map((q, idx) => {
              const correctLetter = ['A', 'B', 'C', 'D'][q.correctIndex];
              const studentChoice =
                reviewingSubmission.answersPayload?.part1?.[idx] || correctLetter;
              return (
                <div
                  key={q.id}
                  className="rounded-[8px] border border-[#E2E8F0] p-4 text-[13.5px] dark:border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#136F63]">
                      Câu {idx + 1} (Phần I) · {q.tag}
                    </span>
                    <span className="font-mono text-[12.5px] font-semibold text-[#15803D] dark:text-emerald-400">
                      Đáp án đúng: {correctLetter} · Em chọn: {studentChoice}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[14px] text-[#0F172A] dark:text-slate-100">
                    <MathText text={q.stem} />
                  </div>
                  {(q.image || q.imageUrl) && (
                    <div className="my-2 flex justify-center">
                      <img
                        src={q.image || q.imageUrl}
                        alt={`Hình / Bảng câu ${idx + 1}`}
                        className="h-auto max-h-60 max-w-full rounded border border-[#E2E8F0] bg-white p-1 object-contain"
                      />
                    </div>
                  )}
                  <div className="mt-2.5 rounded-[8px] bg-[#E0F2FE]/60 p-3 dark:bg-slate-800/70">
                    <div className="font-semibold text-[#0369A1] dark:text-[#BAE6FD]">
                      LỜI GIẢI CHI TIẾT:
                    </div>
                    {normalizeSolutionSteps(q.solutionSteps).map((st, sIdx) => (
                      <div key={sIdx} className="mt-1 text-justify leading-relaxed">
                        <strong className="text-[#136F63] dark:text-emerald-300">{st.label}</strong>{' '}
                        <MathText text={st.body} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SmartboardViewport>
      )}

      {/* Auto-popping Floating Math Keypad for Online Exam & Homework Part III Inputs */}
      {keypadTarget && keypadTarget.mode === 'exam' && activeRoom && !completedSubmission && (
        <FloatingMathKeypad
          open={true}
          label={`Câu ${keypadTarget.index + 1} · Phần III (Phòng thi)`}
          value={part3Ans[keypadTarget.index] || ''}
          hasNext={keypadTarget.index + 1 < Math.max(activeExamPaper.part3.length, 6)}
          onChange={(nextVal) =>
            setPart3Ans((prev) => ({
              ...prev,
              [keypadTarget.index]: sanitizeShortAnswerValue(nextVal),
            }))
          }
          onNext={() => {
            const p3Len = Math.max(activeExamPaper.part3.length, 6);
            const p1Len = Math.max(activeExamPaper.part1.length, 12);
            const p2Len = Math.max(activeExamPaper.part2.length, 4);
            if (keypadTarget.index + 1 < p3Len) {
              const nextIdx = keypadTarget.index + 1;
              setExamFocusIdx(p1Len + p2Len + nextIdx);
              setKeypadTarget({ mode: 'exam', index: nextIdx });
              examP3InputRefs.current[nextIdx]?.focus();
              examCardRefs.current[`p3-${nextIdx}`]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
              });
            } else {
              setKeypadTarget(null);
            }
          }}
          onClose={() => setKeypadTarget(null)}
        />
      )}

      {keypadTarget &&
        keypadTarget.mode === 'homework' &&
        activeHomework &&
        activeHomework.examPaperSnapshot &&
        !completedHwSub && (
          <FloatingMathKeypad
            open={true}
            label={`Câu ${keypadTarget.index + 1} · Phần III (Bài tập)`}
            value={hwPart3Ans[keypadTarget.index] || ''}
            hasNext={keypadTarget.index + 1 < activeHomework.examPaperSnapshot.part3.length}
            onChange={(nextVal) => {
              const clean = sanitizeShortAnswerValue(nextVal);
              const next = { ...hwPart3Ans, [keypadTarget.index]: clean };
              setHwPart3Ans(next);
              persistHwDraft(
                activeHomework.id,
                hwPart1Ans,
                hwPart2Ans,
                next,
                hwEssayText,
                hwImages
              );
            }}
            onNext={() => {
              const p1Len = activeHomework.examPaperSnapshot?.part1.length || 0;
              const p2Len = activeHomework.examPaperSnapshot?.part2.length || 0;
              const p3Len = activeHomework.examPaperSnapshot?.part3.length || 0;
              if (keypadTarget.index + 1 < p3Len) {
                const nextIdx = keypadTarget.index + 1;
                setHwFocusIdx(p1Len + p2Len + nextIdx);
                setKeypadTarget({ mode: 'homework', index: nextIdx });
                hwP3InputRefs.current[nextIdx]?.focus();
                hwCardRefs.current[`p3-${nextIdx}`]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                });
              } else {
                setKeypadTarget(null);
              }
            }}
            onClose={() => setKeypadTarget(null)}
          />
        )}

      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
};
