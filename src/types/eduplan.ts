export type ModuleId =
  | 'home_dashboard'
  | 'assistant'
  | 'worksheet'
  | 'solve_exercise'
  | 'pdf_to_word'
  | 'omr_shuffle'
  | 'matrix_exam'
  | 'bank_repository'
  | 'similar_exam'
  | 'online_pdf_exam'
  | 'edu_plan'
  | 'lesson_plan'
  | 'review_5512_12'
  | 'review_tn_math'
  | 'teaching_smartboard'
  | 'teaching_function_plot'
  | 'teaching_geometry_3d'
  | 'teaching_slides'
  | 'teaching_realworld'
  | 'teaching_classroom'
  | 'subject_gradebook'
  | 'gradebook_sync_smas'
  | 'master_years_classes'
  | 'master_teachers'
  | 'master_assignments'
  | 'system_config'
  | 'system_accounts_logs'
  | 'exam_stats_dashboard'
  | 'overview_dashboard'
  | 'homeroom_book'
  | 'seating_chart'
  | 'lucky_wheel'
  | 'legal_docs'
  | 'history_archive'
  | 'homework_assignments';

export type ScheduleSession = 'morning' | 'afternoon';

export interface WeeklyScheduleSlot {
  classId: string;
  subjectLabel?: string;
  topicNote?: string;
}

export type ViewMode = 'teacher' | 'student';
export type AppUserRole = 'teacher' | 'student' | 'admin';

export interface UserAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: AppUserRole;
  status: 'active' | 'pending';
  studentClass?: string;
  studentCode?: string;
  dob?: string;
  phone?: string;
  department?: string;
  inviteCodeUsed?: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LoginAuditLogRecord {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: AppUserRole;
  loginAt: string;
  deviceBrowser: string;
  userAgent: string;
}

export interface FeatureUsageMetric {
  featureId: string;
  featureName: string;
  role: 'teacher' | 'student';
  count: number;
  lastUsedAt: string;
}
export type WorksheetLayoutStyle = 'a4_bw' | 'two_col_peace';

export interface SolutionStep {
  title: string;
  leadIn: string;
  math: string;
}

export type DiagramKind =
  | 'bbt_cubic'
  | 'bbt_rational'
  | 'pyramid_rect'
  | 'cubic_area'
  | 'stat_table_12'
  | 'cubic_graph_p2'
  | 'rational_oblique_p2'
  | 'ellipse_circle_solid'
  | 'semicircle_trapezoid'
  | 'open_box_cutout';

export interface Part1Question {
  id: string;
  number: number;
  tag: string; // e.g., [11-C6-B20-NB]
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  diagram?: DiagramKind;
  image?: string;
  imageUrl?: string;
  solutionImage?: string;
  tableData?: string[][];
  solutionSteps: SolutionStep[];
}

export interface Part2Statement {
  label: 'a' | 'b' | 'c' | 'd';
  text: string;
  isTrue: boolean;
  stepTitle: string;
  leadIn: string;
  explanation: string;
}

export interface Part2Question {
  id: string;
  number: number;
  tag: string;
  stem: string;
  diagram?: DiagramKind;
  image?: string;
  imageUrl?: string;
  solutionImage?: string;
  tableData?: string[][];
  statements: [Part2Statement, Part2Statement, Part2Statement, Part2Statement];
  solutionSteps?: SolutionStep[];
}

export interface Part3Question {
  id: string;
  number: number;
  tag: string;
  stem: string;
  answer: string; // <= 4 chars, comma decimal
  diagram?: DiagramKind;
  image?: string;
  imageUrl?: string;
  solutionImage?: string;
  tableData?: string[][];
  solutionSteps: SolutionStep[];
}

export interface ExamPaper {
  id: string;
  department: string;
  schoolName: string;
  author: string;
  sourceRepo: string;
  examTitle: string;
  subject: string;
  durationMinutes: number;
  examCode: string;
  grade: '10' | '11' | '12';
  part1: Part1Question[];
  part2: Part2Question[];
  part3: Part3Question[];
}

export type BankPartType = 'part1' | 'part2' | 'part3';

export interface BankQuestion {
  id: string;
  partType: BankPartType;
  tag: string;
  grade: '10' | '11' | '12';
  chapter: string;
  lesson: string;
  level: 'NB' | 'TH' | 'VD' | 'VDC';
  stem: string;
  options?: [string, string, string, string];
  correctIndex?: 0 | 1 | 2 | 3;
  statements?: [Part2Statement, Part2Statement, Part2Statement, Part2Statement];
  answer?: string;
  diagram?: DiagramKind;
  image?: string;
  imageUrl?: string;
  images?: string[];
  solutionImage?: string;
  solutionImages?: string[];
  tableData?: string[][];
  solutionSteps?: SolutionStep[];
  source?: string;
  updatedAt: string;
}

export interface ValidationDimension {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

export interface ValidationReport5D {
  allPassed: boolean;
  dimensions: ValidationDimension[];
  summaryStats: {
    part1Counts: Record<'A' | 'B' | 'C' | 'D', number>;
    part2TrueCount: number;
    part2FalseCount: number;
    part3ValidCount: number;
  };
}

export interface CurriculumRow {
  stt: number;
  grade: '10' | '11' | '12';
  chapter: string;
  lesson: string;
  periods: number;
  objectives: string;
  digitalCompetency: string; // TT 02/2025 & CV 3456
  aiCompetency: string;
  stemIntegration: string;
  notes?: string;
}

export interface LessonActivity {
  name: string;
  duration: string;
  goal: string;
  content: string;
  product: string;
  execution: string;
}

export interface LessonPlan5512 {
  id: string;
  title: string;
  subject: string;
  grade: '10' | '11' | '12';
  periods: number;
  track: string;
  objectives: {
    knowledge: string;
    competencies: string;
    qualities: string;
    digitalAi: string;
  };
  activities: LessonActivity[];
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  fullName: string;
  dob: string;
  studentPhone: string;
  parentName: string;
  parentPhone: string;
  role: string;
  seatRow: number;
  seatCol: number;
  pinned: boolean;
  conductScore: number;
  notes?: string;
}

export interface OnlineExamRoom {
  id: string;
  pinCode: string;
  title: string;
  subject: string;
  grade?: '10' | '11' | '12';
  assignedClass?: string;
  durationMinutes: number;
  examCodesCount: number;
  antiCheat: boolean;
  allowReviewSolutions?: boolean;
  loginMode: 'google' | 'roster' | 'quick_name';
  status: 'active' | 'closed';
  answerKey: {
    part1: string[];
    part2: { a: boolean; b: boolean; c: boolean; d: boolean }[];
    part3: string[];
  };
  examPaperSnapshot?: ExamPaper;
  createdAt: string;
}

export interface StudentExamAnswersPayload {
  part1: Record<number, string>;
  part2: Record<number, { a?: boolean; b?: boolean; c?: boolean; d?: boolean }>;
  part3: Record<number, string>;
}

export interface ExamSubmission {
  id: string;
  roomId: string;
  roomTitle?: string;
  studentUid?: string;
  studentEmail?: string;
  studentCode?: string;
  studentName: string;
  studentClass: string;
  grade?: '10' | '11' | '12';
  examCode?: string;
  score: number;
  part1Score?: number;
  part2Score?: number;
  part3Score?: number;
  durationSeconds?: number;
  tabSwitches: number;
  answersPayload?: StudentExamAnswersPayload;
  submittedAt: string;
}

export interface LegalDocument {
  id: string;
  code: string;
  title: string;
  issuedDate: string;
  category: 'Thông tư' | 'Công văn' | 'Quyết định';
  summary: string;
  keyPoints: string[];
}

export interface HistoryRecord {
  id: string;
  title: string;
  docType: 'exam' | 'worksheet' | 'lesson_plan' | 'curriculum' | 'blueprint';
  grade: '10' | '11' | '12';
  subject: string;
  examCode?: string;
  createdAt: string;
  examData?: ExamPaper;
  lessonPlanData?: LessonPlan5512;
}

export interface SubjectDirectoryItem {
  id: string;
  name: string;
  group: 'Khoa học Tự nhiên' | 'Khoa học Xã hội' | 'Ngoại ngữ' | 'Nghệ thuật & Công nghệ';
  enabled: boolean;
}

export type AcademicRank = 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đạt';

export interface StudentQuizQuestionDetail {
  questionNumber: number;
  tag: string;
  partLabel: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface StudentAttemptRecord {
  id: string;
  studentId: string;
  classId: string;
  type: 'quiz' | 'oral' | 'bonus';
  title: string;
  score: number; // Thang 10 cho quiz/oral, hoặc số điểm cộng cho bonus
  maxScore: number;
  correctCount?: number;
  totalQuestions?: number;
  durationSeconds?: number;
  tabSwitches?: number;
  note?: string;
  details?: StudentQuizQuestionDetail[];
  createdAt: string;
}

export interface ClassroomStudent {
  id: string;
  classId: string;
  studentCode: string;
  fullName: string;
  dob: string;
  gender: 'Nam' | 'Nữ';
  phone: string;
  parentName: string;
  parentPhone: string;
  avatarUrl?: string;
  academicRank: AcademicRank;
  teacherNotes: string;
  attempts: StudentAttemptRecord[];
  createdAt: string;
}

export interface Classroom {
  id: string;
  name: string;
  grade: '10' | '11' | '12';
  schoolYear: string;
  homeroomTeacher: string;
  subjectTeacher?: string;
  createdAt: string;
}

export interface ClassroomStoreData {
  classes: Classroom[];
  students: ClassroomStudent[];
}

export type GradeColumnTarget = 'tx1' | 'tx2' | 'tx3' | 'tx4' | 'tx5' | 'gk' | 'ck';

export interface GradebookRemarkTemplates {
  tot: string;
  kha: string;
  dat: string;
  chuaDat: string;
  yearPrefix?: string;
}

export interface GradebookConfig {
  txColumnCount: 3 | 4 | 5;
  remarkTemplates: GradebookRemarkTemplates;
}

export interface SubjectGradeEntry {
  id: string; // `${classId}__hk${semester}__${studentId}`
  classId: string;
  semester: 1 | 2;
  studentId: string;
  tx1: number | null;
  tx2: number | null;
  tx3: number | null;
  tx4: number | null;
  tx5: number | null;
  gk: number | null;
  ck: number | null;
  tbm: number | null;
  remark: string;
  yearRemark?: string;
  syncedAttemptIds: string[];
  updatedAt: string;
}

export interface SchoolYearRecord {
  id: string;
  label: string; // e.g. '2026–2027'
  isCurrent: boolean;
  startDate?: string;
  endDate?: string;
}

export interface MasterClassCatalogItem {
  id: string;
  schoolYearId: string;
  grade: '10' | '11' | '12';
  name: string;
  plannedSize: number;
  room?: string;
  notes?: string;
}

export type TeacherRole = 'Tổ trưởng' | 'Tổ phó' | 'Giáo viên';

export interface TeacherRecord {
  id: string;
  teacherCode: string;
  fullName: string;
  gender: 'Nam' | 'Nữ';
  departmentGroup: string; // Tổ chuyên môn: Toán, Vật lý, Ngữ văn...
  mainSubject: string;
  phone: string;
  email: string;
  role: TeacherRole;
}

export interface ClassSubjectAssignment {
  id: string;
  schoolYearId: string;
  classCatalogId: string;
  className: string;
  grade: '10' | '11' | '12';
  homeroomTeacherId: string;
  subjectTeachers: Record<string, string>; // subjectName -> teacherId
}

export interface SchoolHeaderProfile {
  departmentName: string; // SỞ GIÁO DỤC VÀ ĐÀO TẠO
  schoolName: string; // Trường THPT Lê Quý Đôn
  activeSchoolYearId: string;
  activeDepartmentGroup: string; // Tổ chuyên môn
  activeTeacherId: string;
  activeTeacherName: string;
  defaultSubject: string;
}

export interface MasterDataStore {
  profile: SchoolHeaderProfile;
  schoolYears: SchoolYearRecord[];
  classCatalog: MasterClassCatalogItem[];
  teachers: TeacherRecord[];
  assignments: ClassSubjectAssignment[];
}

export type OralQuestionFormat = 'part1' | 'part2' | 'part3' | 'essay';

export interface OralCheckMatrixConfig {
  id: string;
  grade: '10' | '11' | '12';
  chapterCode: string; // 'all' | 'C1' | 'C2' ...
  lessonCode: string; // 'all' | 'B1' | 'B2' ...
  topicLabel: string;
  formats: {
    part1: boolean;
    part2: boolean;
    part3: boolean;
    essay: boolean;
  };
  levelCounts: {
    NB: number;
    TH: number;
    VD: number;
    VDC: number;
  };
  essayPromptNote?: string;
  semester: 1 | 2;
  targetColumnMode: 'auto' | GradeColumnTarget;
  timeLimitMinutes: number;
  packageCount: 3 | 4;
  isLocked: boolean;
  updatedAt: string;
}

export interface BoardEssayQuestion {
  id: string;
  number: number;
  tag: string;
  level: 'NB' | 'TH' | 'VD' | 'VDC';
  stem: string;
  diagram?: DiagramKind;
  image?: string;
  tableData?: string[][];
  referenceAnswer?: string;
  solutionSteps: SolutionStep[];
}

export interface LiveQuizPackage {
  packageIndex: number;
  packageLabel: string; // e.g. 'Gói đề số 01'
  examPaper: ExamPaper;
  essays: BoardEssayQuestion[];
  totalItems: number;
  levelSummary: { NB: number; TH: number; VD: number; VDC: number };
}

export type HomeworkContentSourceType = 'bank' | 'upload_docx_pdf' | 'essay_sgk';
export type HomeworkTargetMode = 'classes' | 'remedial_below_threshold' | 'manual_students';
export type HomeworkFilterDataSource = 'smas_tbm' | 'online_exam' | 'previous_homework';

export interface HomeworkAssignment {
  id: string;
  ownerId?: string;
  pinCode: string;
  title: string;
  subject: string;
  grade: '10' | '11' | '12';
  sourceType: HomeworkContentSourceType;
  targetMode: HomeworkTargetMode;
  targetClassIds: string[];
  targetClassNames: string[];
  targetStudentIds: string[];
  targetStudentCodes: string[];
  targetStudentNames: string[];
  targetLabel: string;
  remedialConfig?: {
    sourceType: HomeworkFilterDataSource;
    sourceRefId?: string;
    thresholdScore: number;
    semester: 1 | 2;
  };
  dueDate: string; // ISO string
  allowLateSubmission: boolean;
  allowReviewSolutions: boolean;
  requireEssayPhotos: boolean;
  essayPromptText?: string;
  essayPromptImages?: string[];
  objectiveWeightPoints: number; // e.g. 10 if only objective, 6 if mixed, 0 if only essay
  essayWeightPoints: number; // e.g. 0 if only objective, 4 if mixed, 10 if only essay
  examPaperSnapshot?: ExamPaper;
  answerKey?: {
    part1: string[];
    part2: { a: boolean; b: boolean; c: boolean; d: boolean }[];
    part3: string[];
  };
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt?: string;
}

export interface HomeworkSubmission {
  id: string;
  ownerId?: string;
  homeworkId: string;
  homeworkTitle: string;
  studentUid?: string;
  studentEmail?: string;
  studentId?: string;
  studentCode: string;
  studentName: string;
  studentClass: string;
  classId?: string;
  answersPayload: StudentExamAnswersPayload;
  essayTextAnswer?: string;
  essayImages: string[]; // Compressed under 150KB
  objectiveScore: number; // Auto-calculated
  essayScore: number | null; // Graded by teacher
  totalScore: number; // objectiveScore + (essayScore ?? 0)
  teacherFeedback: string;
  gradingStatus: 'auto_graded' | 'pending_essay_review' | 'graded';
  syncedToSmas: boolean;
  syncedColumn?: GradeColumnTarget;
  submittedAt: string;
  gradedAt?: string;
}

