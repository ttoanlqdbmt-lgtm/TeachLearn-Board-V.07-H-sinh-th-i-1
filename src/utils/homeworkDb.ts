import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Classroom,
  ClassroomStoreData,
  ClassroomStudent,
  ExamPaper,
  ExamSubmission,
  HomeworkAssignment,
  HomeworkFilterDataSource,
  HomeworkSubmission,
  OnlineExamRoom,
  StudentExamAnswersPayload,
  SubjectGradeEntry,
  UserAccountRecord,
} from '../types/eduplan';
import { MOCK_EXAM_0107 } from '../data/mockExam0107';
import { computeCircular22TBM, makeGradeEntryId } from './gradebookDb';
import { getCachedData, setCachedData } from './cloudCacheAndCompression';

const HOMEWORK_ASSIGNMENTS_KEY = 'teachlearn_homework_assignments_v1';
const HOMEWORK_SUBMISSIONS_KEY = 'teachlearn_homework_submissions_v1';
const HOMEWORK_DRAFT_PREFIX = 'teachlearn_homework_draft_v1_';

export interface LocalHomeworkDraft {
  homeworkId: string;
  studentName: string;
  studentClass: string;
  studentCode: string;
  part1: Record<number, string>;
  part2: Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>;
  part3: Record<number, string>;
  essayTextAnswer: string;
  essayImages: string[];
  updatedAt: string;
}

export function saveHomeworkDraftToLocal(draft: LocalHomeworkDraft): void {
  try {
    localStorage.setItem(`${HOMEWORK_DRAFT_PREFIX}${draft.homeworkId}`, JSON.stringify(draft));
  } catch {
    // ignore quota error
  }
}

export function loadHomeworkDraftFromLocal(homeworkId: string): LocalHomeworkDraft | null {
  try {
    const raw = localStorage.getItem(`${HOMEWORK_DRAFT_PREFIX}${homeworkId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalHomeworkDraft;
  } catch {
    return null;
  }
}

export function clearHomeworkDraftFromLocal(homeworkId: string): void {
  try {
    localStorage.removeItem(`${HOMEWORK_DRAFT_PREFIX}${homeworkId}`);
  } catch {
    // ignore
  }
}

export function buildAnswerKeyFromExamPaper(exam: ExamPaper): {
  part1: string[];
  part2: { a: boolean; b: boolean; c: boolean; d: boolean }[];
  part3: string[];
} {
  const letters = ['A', 'B', 'C', 'D'];
  return {
    part1: exam.part1.map((q) => letters[q.correctIndex ?? 0] || 'A'),
    part2: exam.part2.map((q) => ({
      a: q.statements[0]?.isTrue ?? true,
      b: q.statements[1]?.isTrue ?? true,
      c: q.statements[2]?.isTrue ?? false,
      d: q.statements[3]?.isTrue ?? false,
    })),
    part3: exam.part3.map((q) => (q.answer || '').trim()),
  };
}

export function buildInitialHomeworkSeed(
  classroomStore: ClassroomStoreData
): { assignments: HomeworkAssignment[]; submissions: HomeworkSubmission[] } {
  const now = Date.now();
  const in16Hours = new Date(now + 16 * 3600 * 1000).toISOString();
  const in3Days = new Date(now + 72 * 3600 * 1000).toISOString();
  const in48Hours = new Date(now + 48 * 3600 * 1000).toISOString();

  const cls12A1 =
    classroomStore.classes.find((c) => c.name === '12A1') || classroomStore.classes[0];
  const cls12A2 =
    classroomStore.classes.find((c) => c.name === '12A2') || classroomStore.classes[1];
  const students12A1 = classroomStore.students.filter(
    (s) => s.classId === (cls12A1?.id || 'cls-12a1')
  );

  // Sample subset of MOCK_EXAM_0107 for Homework 1
  const hw1Exam: ExamPaper = {
    ...MOCK_EXAM_0107,
    id: 'hw-paper-01',
    examTitle: 'BÀI TẬP VỀ NHÀ SỐ 01: KHẢO SÁT HÀM SỐ & TÍCH PHÂN (SGK KNTT)',
    durationMinutes: 45,
    part1: MOCK_EXAM_0107.part1.slice(0, 6),
    part2: MOCK_EXAM_0107.part2.slice(0, 2),
    part3: MOCK_EXAM_0107.part3.slice(0, 2),
  };

  // Sample subset for Remedial Homework 2 (< 5.0)
  const hw2Exam: ExamPaper = {
    ...MOCK_EXAM_0107,
    id: 'hw-paper-02',
    examTitle: 'PHIẾU ÔN LUYỆN PHỤ ĐẠO: CỦNG CỐ CỰC TRỊ & TIỆM CẬN ĐỒ THỊ HÀM SỐ',
    durationMinutes: 35,
    part1: MOCK_EXAM_0107.part1.slice(0, 4),
    part2: MOCK_EXAM_0107.part2.slice(0, 1),
    part3: MOCK_EXAM_0107.part3.slice(0, 1),
  };

  // Remedial students from 12A1 (indices 5 and 11 in seeded gradebook have TBM < 5.0)
  const remedialStudents =
    students12A1.length >= 12
      ? [students12A1[5], students12A1[11]].filter(Boolean)
      : students12A1.slice(0, 2);

  // Gifted / manual selection students
  const manualStudents =
    students12A1.length >= 3
      ? [students12A1[0], students12A1[2], students12A1[14]].filter(Boolean)
      : students12A1.slice(0, 2);

  const assignments: HomeworkAssignment[] = [
    {
      id: 'hw-2026-01',
      pinCode: '752819',
      title: 'Bài tập Tuần 11: Khảo sát hàm số, Nguyên hàm & Tích phân ứng dụng',
      subject: 'Toán học',
      grade: '12',
      sourceType: 'bank',
      targetMode: 'classes',
      targetClassIds: [cls12A1?.id || 'cls-12a1', cls12A2?.id || 'cls-12a2'].filter(Boolean),
      targetClassNames: [cls12A1?.name || '12A1', cls12A2?.name || '12A2'].filter(Boolean),
      targetStudentIds: [],
      targetStudentCodes: [],
      targetStudentNames: [],
      targetLabel: `Cả lớp ${cls12A1?.name || '12A1'}, ${cls12A2?.name || '12A2'}`,
      dueDate: in16Hours,
      allowLateSubmission: true,
      allowReviewSolutions: true,
      requireEssayPhotos: true,
      essayPromptText:
        'Bài tự luận bổ sung (3,0 điểm): Cho hàm số y = x^3 - 3x^2 + 2 có đồ thị (C). Hãy trình bày chi tiết vào vở các bước khảo sát sự biến thiên, vẽ đồ thị (C) và viết phương trình tiếp tuyến của (C) tại điểm uốn I(1; 0), sau đó chụp ảnh bài làm tải lên hệ thống.',
      essayPromptImages: [],
      objectiveWeightPoints: 7,
      essayWeightPoints: 3,
      examPaperSnapshot: hw1Exam,
      answerKey: buildAnswerKeyFromExamPaper(hw1Exam),
      status: 'active',
      createdAt: new Date(now - 20 * 3600 * 1000).toISOString(),
    },
    {
      id: 'hw-2026-02',
      pinCode: '419305',
      title: 'Phiếu Phụ đạo Cá nhân hóa: Rèn kỹ năng Cực trị & Tiệm cận (Dành cho HS < 5.0)',
      subject: 'Toán học',
      grade: '12',
      sourceType: 'bank',
      targetMode: 'remedial_below_threshold',
      targetClassIds: [cls12A1?.id || 'cls-12a1'],
      targetClassNames: [cls12A1?.name || '12A1'],
      targetStudentIds: remedialStudents.map((s) => s.id),
      targetStudentCodes: remedialStudents.map((s) => s.studentCode),
      targetStudentNames: remedialStudents.map((s) => s.fullName),
      targetLabel: `Nhóm cần phụ đạo < 5.0 (${remedialStudents.length} HS lớp ${cls12A1?.name || '12A1'})`,
      remedialConfig: {
        sourceType: 'smas_tbm',
        thresholdScore: 5.0,
        semester: 1,
      },
      dueDate: in48Hours,
      allowLateSubmission: true,
      allowReviewSolutions: true,
      requireEssayPhotos: false,
      objectiveWeightPoints: 10,
      essayWeightPoints: 0,
      examPaperSnapshot: hw2Exam,
      answerKey: buildAnswerKeyFromExamPaper(hw2Exam),
      status: 'active',
      createdAt: new Date(now - 10 * 3600 * 1000).toISOString(),
    },
    {
      id: 'hw-2026-03',
      pinCode: '893140',
      title: 'Bồi dưỡng HSG & Vận dụng cao: Tối ưu hóa Hình học không gian & Thực tế',
      subject: 'Toán học',
      grade: '12',
      sourceType: 'essay_sgk',
      targetMode: 'manual_students',
      targetClassIds: [cls12A1?.id || 'cls-12a1'],
      targetClassNames: [cls12A1?.name || '12A1'],
      targetStudentIds: manualStudents.map((s) => s.id),
      targetStudentCodes: manualStudents.map((s) => s.studentCode),
      targetStudentNames: manualStudents.map((s) => s.fullName),
      targetLabel: `Nhóm bồi dưỡng chọn lọc (${manualStudents.length} HS lớp ${cls12A1?.name || '12A1'})`,
      dueDate: in3Days,
      allowLateSubmission: true,
      allowReviewSolutions: true,
      requireEssayPhotos: true,
      essayPromptText:
        'Đề bài Tự luận SGK & Chuyên đề VDC (10 điểm):\nCâu 1 (5,0 điểm): Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh 3, H là trung điểm AB, SH ⊥ (ABCD) và SH = 4. Trình bày chi tiết cách dựng và tính khoảng cách giữa hai đường thẳng chéo nhau AB và SC.\nCâu 2 (5,0 điểm): Giải bài toán tối ưu cắt tấm nhôm nửa hình tròn đường kính AB = 12 cm thành hình thang cân ABCD có diện tích lớn nhất. Học sinh giải ra giấy và chụp ảnh rõ nét nộp lên hệ thống.',
      essayPromptImages: [],
      objectiveWeightPoints: 0,
      essayWeightPoints: 10,
      status: 'active',
      createdAt: new Date(now - 5 * 3600 * 1000).toISOString(),
    },
  ];

  // Create initial sample submissions for hw-2026-01 so the progress bar & grading table have rich real data immediately
  const submissions: HomeworkSubmission[] = students12A1.slice(0, 6).map((stu, idx) => {
    const objScore = idx % 2 === 0 ? 6.5 : 5.75;
    const isGraded = idx < 4;
    const essScore = isGraded ? (idx === 0 ? 2.75 : idx === 1 ? 2.5 : 2.25) : null;
    const totScore = Number((objScore + (essScore ?? 0)).toFixed(2));
    return {
      id: `hwsub-seed-${idx + 1}`,
      homeworkId: 'hw-2026-01',
      homeworkTitle: assignments[0].title,
      studentId: stu.id,
      studentCode: stu.studentCode,
      studentName: stu.fullName,
      studentClass: cls12A1?.name || '12A1',
      classId: cls12A1?.id || 'cls-12a1',
      answersPayload: {
        part1: { 0: 'B', 1: 'C', 2: 'D', 3: 'B', 4: 'A', 5: 'C' },
        part2: {
          0: { a: true, b: true, c: true, d: false },
          1: { a: true, b: true, c: false, d: false },
        },
        part3: { 0: '2,4', 1: idx % 2 === 0 ? '218' : '215' },
      },
      essayTextAnswer:
        'Em đã trình bày đầy đủ các bước khảo sát hàm số bậc ba, lập bảng biến thiên và viết phương trình tiếp tuyến y = -3x + 3 tại điểm uốn I(1; 0).',
      essayImages: [],
      objectiveScore: objScore,
      essayScore: essScore,
      totalScore: totScore,
      teacherFeedback: isGraded
        ? 'Trình bày các bước khảo sát hàm số rõ ràng, chữ viết sạch đẹp, tính đúng đạo hàm và tiếp tuyến tại điểm uốn.'
        : '',
      gradingStatus: isGraded ? 'graded' : 'pending_essay_review',
      syncedToSmas: idx < 2,
      syncedColumn: idx < 2 ? 'tx3' : undefined,
      submittedAt: new Date(now - (12 - idx) * 3600 * 1000).toISOString(),
      gradedAt: isGraded ? new Date(now - (4 - idx) * 3600 * 1000).toISOString() : undefined,
    };
  });

  return { assignments, submissions };
}

export function formatCountdownRemaining(dueDateIso: string): {
  label: string;
  isOverdue: boolean;
  isDueWithin24h: boolean;
} {
  const dueMs = new Date(dueDateIso).getTime();
  const diffMs = dueMs - Date.now();
  if (Number.isNaN(dueMs)) {
    return { label: 'Chưa rõ hạn', isOverdue: false, isDueWithin24h: false };
  }
  if (diffMs <= 0) {
    const overdueHours = Math.abs(Math.floor(diffMs / (3600 * 1000)));
    return {
      label: overdueHours > 0 ? `Quá hạn ${overdueHours} giờ` : 'Đã quá hạn nộp',
      isOverdue: true,
      isDueWithin24h: false,
    };
  }
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return {
      label: `Còn ${hours}h ${String(minutes).padStart(2, '0')}p`,
      isOverdue: false,
      isDueWithin24h: true,
    };
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return {
    label: `Còn ${days} ngày ${remHours}h`,
    isOverdue: false,
    isDueWithin24h: false,
  };
}

export function loadLocalHomeworkAssignments(
  classroomStore: ClassroomStoreData = { classes: [], students: [] }
): HomeworkAssignment[] {
  const cached = getCachedData<HomeworkAssignment[]>(HOMEWORK_ASSIGNMENTS_KEY, 365 * 24 * 3600 * 1000);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  const seeded = buildInitialHomeworkSeed(classroomStore);
  setCachedData(HOMEWORK_ASSIGNMENTS_KEY, seeded.assignments);
  const existingSubs = getCachedData<HomeworkSubmission[]>(
    HOMEWORK_SUBMISSIONS_KEY,
    365 * 24 * 3600 * 1000
  );
  if (!existingSubs || existingSubs.length === 0) {
    setCachedData(HOMEWORK_SUBMISSIONS_KEY, seeded.submissions);
  }
  return seeded.assignments;
}

export function saveLocalHomeworkAssignments(list: HomeworkAssignment[]): void {
  setCachedData(HOMEWORK_ASSIGNMENTS_KEY, list);
}

export function loadLocalHomeworkSubmissions(
  classroomStore: ClassroomStoreData = { classes: [], students: [] }
): HomeworkSubmission[] {
  const cached = getCachedData<HomeworkSubmission[]>(HOMEWORK_SUBMISSIONS_KEY, 365 * 24 * 3600 * 1000);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  const seeded = buildInitialHomeworkSeed(classroomStore);
  setCachedData(HOMEWORK_SUBMISSIONS_KEY, seeded.submissions);
  return seeded.submissions;
}

export function saveLocalHomeworkSubmissions(list: HomeworkSubmission[]): void {
  setCachedData(HOMEWORK_SUBMISSIONS_KEY, list);
}

/**
 * Determine if a given student is assigned to a specific HomeworkAssignment.
 * Important rule from prompt:
 * - If targetMode === 'classes': Any student in targetClassNames or targetClassIds sees it.
 * - If targetMode === 'remedial_below_threshold' or 'manual_students': ONLY students whose ID, studentCode, or fullName matches targetStudentIds/Codes/Names see it (other students in the class DO NOT see this assignment!).
 */
export function isHomeworkAssignedToStudent(
  hw: HomeworkAssignment,
  student: {
    studentId?: string;
    studentCode?: string;
    studentName?: string;
    studentClass?: string;
    classId?: string;
  }
): boolean {
  const cleanCode = (student.studentCode || '').trim().toLowerCase();
  const cleanName = (student.studentName || '').trim().toLowerCase();
  const cleanClass = (student.studentClass || '').trim().toLowerCase();

  if (hw.targetMode === 'remedial_below_threshold' || hw.targetMode === 'manual_students') {
    if (student.studentId && hw.targetStudentIds.includes(student.studentId)) {
      return true;
    }
    if (
      cleanCode &&
      hw.targetStudentCodes.some((c) => (c || '').trim().toLowerCase() === cleanCode)
    ) {
      return true;
    }
    if (
      cleanName &&
      hw.targetStudentNames.some((n) => (n || '').trim().toLowerCase() === cleanName)
    ) {
      return true;
    }
    return false;
  }

  // targetMode === 'classes'
  if (student.classId && hw.targetClassIds.includes(student.classId)) {
    return true;
  }
  if (
    cleanClass &&
    hw.targetClassNames.some((cn) => (cn || '').trim().toLowerCase() === cleanClass)
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve the exact list of target ClassroomStudents for a homework assignment
 */
export function getTargetRosterForHomework(
  hw: HomeworkAssignment,
  classroomStore: ClassroomStoreData
): ClassroomStudent[] {
  if (hw.targetMode === 'remedial_below_threshold' || hw.targetMode === 'manual_students') {
    const idSet = new Set(hw.targetStudentIds);
    const codeSet = new Set(hw.targetStudentCodes.map((c) => c.trim().toLowerCase()));
    return classroomStore.students.filter(
      (s) => idSet.has(s.id) || codeSet.has(s.studentCode.trim().toLowerCase())
    );
  }

  const classIdSet = new Set(hw.targetClassIds);
  const classNameSet = new Set(hw.targetClassNames.map((n) => n.trim().toLowerCase()));
  const matchingClassIds = new Set(
    classroomStore.classes
      .filter((c) => classIdSet.has(c.id) || classNameSet.has(c.name.trim().toLowerCase()))
      .map((c) => c.id)
  );

  return classroomStore.students.filter((s) => matchingClassIds.has(s.classId));
}

/**
 * Scan SMAS gradebook, online exam submissions, or previous homework submissions
 * to filter students scoring strictly below thresholdScore (e.g. < 5.0)
 */
export interface RemedialCandidateStudent {
  student: ClassroomStudent;
  className: string;
  referenceScore: number;
  referenceLabel: string;
}

export function scanRemedialStudentsBelowThreshold(params: {
  sourceType: HomeworkFilterDataSource;
  sourceRefId?: string;
  thresholdScore: number;
  semester: 1 | 2;
  selectedClassIds: string[];
  classroomStore: ClassroomStoreData;
  gradebookMap: Record<string, SubjectGradeEntry>;
  examRooms: OnlineExamRoom[];
  examSubmissions: ExamSubmission[];
  homeworkAssignments: HomeworkAssignment[];
  homeworkSubmissions: HomeworkSubmission[];
}): RemedialCandidateStudent[] {
  const {
    sourceType,
    sourceRefId,
    thresholdScore,
    semester,
    selectedClassIds,
    classroomStore,
    gradebookMap,
    examSubmissions,
    homeworkSubmissions,
  } = params;

  const classMap = new Map<string, Classroom>();
  classroomStore.classes.forEach((c) => classMap.set(c.id, c));

  const poolStudents =
    selectedClassIds.length > 0
      ? classroomStore.students.filter((s) => selectedClassIds.includes(s.classId))
      : classroomStore.students;

  const results: RemedialCandidateStudent[] = [];

  for (const stu of poolStudents) {
    const cls = classMap.get(stu.classId);
    const className = cls?.name || '12A1';

    if (sourceType === 'smas_tbm') {
      const entryId = makeGradeEntryId(stu.classId, semester, stu.id);
      const entry = gradebookMap[entryId];
      const tbm = entry ? (entry.tbm ?? computeCircular22TBM(entry)) : null;
      // Also check latest TX scores if TBM is null
      const fallbackTx = entry
        ? [entry.tx1, entry.tx2, entry.tx3, entry.tx4, entry.tx5].find(
            (v): v is number => v !== null && v !== undefined
          ) ?? null
        : null;
      const effectiveScore = tbm !== null ? tbm : fallbackTx;
      if (effectiveScore !== null && effectiveScore < thresholdScore) {
        results.push({
          student: stu,
          className,
          referenceScore: effectiveScore,
          referenceLabel: `Sổ điểm SMAS HK${semester} (${effectiveScore.toFixed(1).replace('.', ',')}đ)`,
        });
      }
    } else if (sourceType === 'online_exam') {
      const matchingSub = examSubmissions.find(
        (sub) =>
          (!sourceRefId || sub.roomId === sourceRefId) &&
          ((sub.studentCode &&
            sub.studentCode.trim().toLowerCase() === stu.studentCode.trim().toLowerCase()) ||
            sub.studentName.trim().toLowerCase() === stu.fullName.trim().toLowerCase())
      );
      if (matchingSub && matchingSub.score < thresholdScore) {
        results.push({
          student: stu,
          className,
          referenceScore: matchingSub.score,
          referenceLabel: `Bài thi Online (${matchingSub.score.toFixed(2).replace('.', ',')}đ)`,
        });
      }
    } else if (sourceType === 'previous_homework') {
      const matchingHwSub = homeworkSubmissions.find(
        (sub) =>
          (!sourceRefId || sub.homeworkId === sourceRefId) &&
          (sub.studentId === stu.id ||
            sub.studentCode.trim().toLowerCase() === stu.studentCode.trim().toLowerCase() ||
            sub.studentName.trim().toLowerCase() === stu.fullName.trim().toLowerCase())
      );
      if (matchingHwSub && matchingHwSub.totalScore < thresholdScore) {
        results.push({
          student: stu,
          className,
          referenceScore: matchingHwSub.totalScore,
          referenceLabel: `Bài tập trước (${matchingHwSub.totalScore.toFixed(2).replace('.', ',')}đ)`,
        });
      }
    }
  }

  return results.sort((a, b) => a.referenceScore - b.referenceScore);
}

/**
 * Automatically grade objective 3-part questions scaled to hw.objectiveWeightPoints
 */
export function calculateHomeworkObjectiveScore(
  hw: HomeworkAssignment,
  answers: StudentExamAnswersPayload
): {
  objectiveScore: number;
  correctP1: number;
  totalP1: number;
  scoreP2Raw: number;
  totalP2: number;
  correctP3: number;
  totalP3: number;
} {
  const paper = hw.examPaperSnapshot;
  if (!paper || hw.objectiveWeightPoints <= 0) {
    return {
      objectiveScore: 0,
      correctP1: 0,
      totalP1: 0,
      scoreP2Raw: 0,
      totalP2: 0,
      correctP3: 0,
      totalP3: 0,
    };
  }

  const keyP1 = hw.answerKey?.part1 || [];
  const keyP2 = hw.answerKey?.part2 || [];
  const keyP3 = hw.answerKey?.part3 || [];

  const totalP1 = paper.part1.length;
  let correctP1 = 0;
  for (let i = 0; i < totalP1; i++) {
    const expected = (
      keyP1[i] ||
      ['A', 'B', 'C', 'D'][paper.part1[i]?.correctIndex ?? 0] ||
      'A'
    ).toUpperCase();
    if ((answers.part1[i] || '').toUpperCase() === expected) {
      correctP1++;
    }
  }

  const totalP2 = paper.part2.length;
  let scoreP2Raw = 0;
  for (let i = 0; i < totalP2; i++) {
    const expectedObj = keyP2[i] || {
      a: paper.part2[i]?.statements[0]?.isTrue ?? true,
      b: paper.part2[i]?.statements[1]?.isTrue ?? true,
      c: paper.part2[i]?.statements[2]?.isTrue ?? false,
      d: paper.part2[i]?.statements[3]?.isTrue ?? false,
    };
    const stuObj = answers.part2[i] || {};
    let subMatches = 0;
    (['a', 'b', 'c', 'd'] as const).forEach((subKey) => {
      if (typeof stuObj[subKey] === 'boolean' && stuObj[subKey] === expectedObj[subKey]) {
        subMatches++;
      }
    });
    if (subMatches === 1) scoreP2Raw += 0.1;
    else if (subMatches === 2) scoreP2Raw += 0.25;
    else if (subMatches === 3) scoreP2Raw += 0.5;
    else if (subMatches === 4) scoreP2Raw += 1.0;
  }

  const totalP3 = paper.part3.length;
  let correctP3 = 0;
  for (let i = 0; i < totalP3; i++) {
    const expectedRaw = (keyP3[i] || paper.part3[i]?.answer || '').trim();
    const stuRaw = (answers.part3[i] || '').trim();
    if (
      stuRaw &&
      expectedRaw &&
      stuRaw.replace('.', ',') === expectedRaw.replace('.', ',')
    ) {
      correctP3++;
    }
  }

  const maxRawPoints = totalP1 * 0.25 + totalP2 * 1.0 + totalP3 * 0.5;
  const earnedRawPoints = correctP1 * 0.25 + scoreP2Raw + correctP3 * 0.5;

  const scaled =
    maxRawPoints > 0
      ? Number(((earnedRawPoints / maxRawPoints) * hw.objectiveWeightPoints).toFixed(2))
      : 0;

  return {
    objectiveScore: Math.min(hw.objectiveWeightPoints, scaled),
    correctP1,
    totalP1,
    scoreP2Raw: Number(scoreP2Raw.toFixed(2)),
    totalP2,
    correctP3,
    totalP3,
  };
}

export function buildGeneralHomeworkLink(
  homework: HomeworkAssignment,
  appBaseUrl?: string
): string {
  const baseUrl =
    appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://teachlearn.edu.vn');
  return `${baseUrl}/?assignmentId=${encodeURIComponent(homework.id)}&pin=${encodeURIComponent(homework.pinCode)}`;
}

export function buildPersonalizedStudentHomeworkLink(
  homework: HomeworkAssignment,
  student: { studentCode: string; fullName: string; className?: string },
  appBaseUrl?: string
): string {
  const baseUrl =
    appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://teachlearn.edu.vn');
  const clsName = student.className || homework.targetClassNames[0] || '12A1';
  return `${baseUrl}/?assignmentId=${encodeURIComponent(homework.id)}&pin=${encodeURIComponent(
    homework.pinCode
  )}&studentCode=${encodeURIComponent(student.studentCode)}&studentName=${encodeURIComponent(
    student.fullName
  )}&studentClass=${encodeURIComponent(clsName)}`;
}

export function buildZaloPersonalizedLinksMessage(params: {
  homework: HomeworkAssignment;
  students: Array<{ studentCode: string; fullName: string; className?: string }>;
  teacherName: string;
  appBaseUrl?: string;
}): string {
  const { homework, students, teacherName, appBaseUrl } = params;
  const dueFormatted = new Date(homework.dueDate).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const generalLink = buildGeneralHomeworkLink(homework, appBaseUrl);
  const personalLines =
    students.length > 0
      ? students
          .map((s, idx) => {
            const pLink = buildPersonalizedStudentHomeworkLink(homework, s, appBaseUrl);
            const clsTag = s.className ? ` - Lớp ${s.className}` : '';
            return `${idx + 1}. ${s.fullName} (${s.studentCode}${clsTag}):\n   👉 ${pLink}`;
          })
          .join('\n')
      : `Link chung vào bài tập: ${generalLink}`;

  return [
    `[GIAO BÀI TẬP VỀ NHÀ — MÔN ${homework.subject.toUpperCase()}]`,
    `• Tên bài tập: ${homework.title}`,
    `• Đối tượng được giao: ${homework.targetLabel}`,
    `• Mã PIN bài tập: ${homework.pinCode}`,
    `• Hạn chót nộp bài: ${dueFormatted}`,
    ``,
    `DANH SÁCH LINK ĐỊNH DANH RIÊNG CHO TỪNG HỌC SINH (${students.length} em):`,
    `(Mỗi em bấm vào đúng đường link mang tên mình để hệ thống tự động điền sẵn Mã HS & Họ tên)`,
    personalLines,
    ``,
    `• Link chung dự phòng: ${generalLink}`,
    `Trân trọng, ${teacherName}.`,
  ].join('\n');
}

/**
 * Generate a professional Zalo reminder message with the unsubmitted student list & direct link
 */
export function buildZaloHomeworkReminderMessage(params: {
  homework: HomeworkAssignment;
  unsubmittedStudents: ClassroomStudent[];
  submittedCount: number;
  totalTargetCount: number;
  teacherName: string;
  appBaseUrl?: string;
}): string {
  const {
    homework,
    unsubmittedStudents,
    submittedCount,
    totalTargetCount,
    teacherName,
    appBaseUrl,
  } = params;

  const directLink = buildGeneralHomeworkLink(homework, appBaseUrl);
  const dueFormatted = new Date(homework.dueDate).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const missingNamesLines =
    unsubmittedStudents.length > 0
      ? unsubmittedStudents
          .map((s, idx) => `${idx + 1}. ${s.fullName} (${s.studentCode})`)
          .join('\n')
      : 'Tất cả học sinh trong danh sách đã hoàn thành nộp bài đầy đủ!';

  return [
    `[THÔNG BÁO NHẮC NỘP BÀI TẬP VỀ NHÀ — MÔN ${homework.subject.toUpperCase()}]`,
    `• Tên bài tập: ${homework.title}`,
    `• Đối tượng: ${homework.targetLabel}`,
    `• Hạn chót nộp bài: ${dueFormatted}`,
    `• Tiến độ hiện tại: ${submittedCount}/${totalTargetCount} học sinh đã nộp bài.`,
    ``,
    `Danh sách học sinh CHƯA NỘP BÀI (${unsubmittedStudents.length} em):`,
    missingNamesLines,
    ``,
    `Các em học sinh có tên trên khẩn trương đăng nhập Cổng Học Sinh (Mã bài tập: ${homework.pinCode}) để hoàn thành trước hạn chót:`,
    `Link vào thẳng bài tập: ${directLink}`,
    `Trân trọng, ${teacherName}.`,
  ].join('\n');
}

/**
 * Export Homework grading results to Excel (.xlsx)
 */
export function exportHomeworkGradesToExcel(
  homework: HomeworkAssignment,
  targetStudents: ClassroomStudent[],
  submissions: HomeworkSubmission[],
  schoolName = 'TRƯỜNG THPT LÊ QUÝ ĐÔN'
): void {
  const hwSubs = submissions.filter((s) => s.homeworkId === homework.id);

  const header = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Lớp',
    'Trạng thái nộp',
    `Điểm Trắc nghiệm (/${homework.objectiveWeightPoints})`,
    `Điểm Tự luận (/${homework.essayWeightPoints})`,
    'Tổng điểm (/10)',
    'Nhận xét của Giáo viên',
    'Đã chuyển Sổ SMAS',
    'Thời gian nộp',
  ];

  const rows: (string | number)[][] = [
    [schoolName.toUpperCase()],
    [`BẢNG ĐIỂM BÀI TẬP VỀ NHÀ: ${homework.title.toUpperCase()}`],
    [
      `Đối tượng: ${homework.targetLabel} | Mã PIN: ${homework.pinCode} | Hạn nộp: ${new Date(
        homework.dueDate
      ).toLocaleString('vi-VN')}`,
    ],
    [],
    header,
  ];

  targetStudents.forEach((stu, idx) => {
    const sub = hwSubs.find(
      (s) =>
        s.studentId === stu.id ||
        s.studentCode.trim().toLowerCase() === stu.studentCode.trim().toLowerCase() ||
        s.studentName.trim().toLowerCase() === stu.fullName.trim().toLowerCase()
    );
    rows.push([
      idx + 1,
      stu.studentCode,
      stu.fullName,
      sub?.studentClass || homework.targetClassNames[0] || '',
      sub ? 'Đã nộp' : 'Chưa nộp',
      sub ? sub.objectiveScore : '',
      sub && sub.essayScore !== null ? sub.essayScore : '',
      sub ? sub.totalScore : '',
      sub?.teacherFeedback || '',
      sub?.syncedToSmas ? `Đã chuyển (${(sub.syncedColumn || 'tx').toUpperCase()})` : 'Chưa chuyển',
      sub ? new Date(sub.submittedAt).toLocaleString('vi-VN') : '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 24 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 38 },
    { wch: 18 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KetQua_BTVN');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const dateStr = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `BangDiem_BTVN_${homework.pinCode}_${dateStr}.xlsx`
  );
}

/**
 * Determine which homework assignments are unsubmitted or due within 24 hours for a logged-in student
 */
export function getStudentHomeworkAlerts(
  assignments: HomeworkAssignment[],
  submissions: HomeworkSubmission[],
  studentAccount: UserAccountRecord
): {
  assignedList: HomeworkAssignment[];
  unsubmittedList: HomeworkAssignment[];
  dueWithin24hList: HomeworkAssignment[];
} {
  const assignedList = assignments.filter(
    (hw) =>
      hw.status === 'active' &&
      isHomeworkAssignedToStudent(hw, {
        studentCode: studentAccount.studentCode,
        studentName: studentAccount.displayName,
        studentClass: studentAccount.studentClass,
      })
  );

  const mySubs = submissions.filter(
    (s) =>
      s.studentUid === studentAccount.uid ||
      (s.studentCode &&
        studentAccount.studentCode &&
        s.studentCode.trim().toLowerCase() === studentAccount.studentCode.trim().toLowerCase()) ||
      s.studentName.trim().toLowerCase() === (studentAccount.displayName || '').trim().toLowerCase()
  );
  const submittedHwIds = new Set(mySubs.map((s) => s.homeworkId));

  const unsubmittedList = assignedList.filter((hw) => !submittedHwIds.has(hw.id));
  const now = Date.now();
  const dueWithin24hList = unsubmittedList.filter((hw) => {
    const dueMs = new Date(hw.dueDate).getTime();
    const diffHours = (dueMs - now) / (3600 * 1000);
    return diffHours > -12 && diffHours <= 24;
  });

  return {
    assignedList,
    unsubmittedList,
    dueWithin24hList,
  };
}
