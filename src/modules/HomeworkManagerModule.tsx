import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { saveAs } from 'file-saver';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  ImagePlus,
  Link2,
  MessageSquareShare,
  Plus,
  QrCode,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  BankQuestion,
  ClassroomStoreData,
  ClassroomStudent,
  ExamPaper,
  ExamSubmission,
  GradeColumnTarget,
  HomeworkAssignment,
  HomeworkContentSourceType,
  HomeworkFilterDataSource,
  HomeworkSubmission,
  HomeworkTargetMode,
  MasterDataStore,
  OnlineExamRoom,
  SubjectGradeEntry,
} from '../types/eduplan';
import { MathText } from '../components/MathText';
import { SmartboardViewport } from '../components/SmartboardViewport';
import {
  buildExamFromSelectedBankQuestions,
  extractTextFromDocxArrayBuffer,
  KNTT_CATALOG_CHAPTERS,
  parseExamTextToBankQuestions,
} from '../utils/questionBankDb';
import { compressImageToWebpOrJpegUnder100KB } from '../utils/cloudCacheAndCompression';
import {
  buildAnswerKeyFromExamPaper,
  buildGeneralHomeworkLink,
  buildPersonalizedStudentHomeworkLink,
  buildZaloHomeworkReminderMessage,
  buildZaloPersonalizedLinksMessage,
  exportHomeworkGradesToExcel,
  getTargetRosterForHomework,
  scanRemedialStudentsBelowThreshold,
} from '../utils/homeworkDb';
import { syncMasterCatalogWithClassroomStore } from '../utils/classroomDb';
import { computeCircular22TBM, makeGradeEntryId, suggestNextTxColumn } from '../utils/gradebookDb';

interface HomeworkManagerModuleProps {
  homeworkAssignments: HomeworkAssignment[];
  homeworkSubmissions: HomeworkSubmission[];
  onCreateHomework: (hw: HomeworkAssignment) => Promise<void>;
  onUpdateHomework: (hw: HomeworkAssignment) => Promise<void>;
  onDeleteHomework: (hwId: string) => Promise<void>;
  onGradeHomeworkSubmission: (updatedSub: HomeworkSubmission) => Promise<void>;
  onSyncHomeworkToSmas: (
    homework: HomeworkAssignment,
    submissionsToSync: HomeworkSubmission[],
    semester: 1 | 2,
    targetColMode: 'auto' | GradeColumnTarget
  ) => Promise<number>;
  classroomStore: ClassroomStoreData;
  gradebookMap: Record<string, SubjectGradeEntry>;
  bankItems: BankQuestion[];
  currentExam: ExamPaper;
  examRooms: OnlineExamRoom[];
  examSubmissions: ExamSubmission[];
  masterData: MasterDataStore;
  teacherDisplayName: string;
}

type FormatSuffixFilter = 'all' | '-TN' | '-DS' | '-TLN';

function getQuestionFormatCode(q: BankQuestion): '-TN' | '-DS' | '-TLN' {
  if (q.partType === 'part2') return '-DS';
  if (q.partType === 'part3') return '-TLN';
  return '-TN';
}

function buildQuestionDisplayCode(q: BankQuestion, index: number): string {
  const suffix = getQuestionFormatCode(q);
  const cleanTag = (q.tag || '[12-C1-B1-TH]').replace(/^\[|\]$/g, '');
  return `${cleanTag}${suffix}#${String(index + 1).padStart(2, '0')}`;
}

export const HomeworkManagerModule: React.FC<HomeworkManagerModuleProps> = ({
  homeworkAssignments,
  homeworkSubmissions,
  onCreateHomework,
  onUpdateHomework,
  onDeleteHomework,
  onGradeHomeworkSubmission,
  onSyncHomeworkToSmas,
  classroomStore,
  gradebookMap,
  bankItems,
  currentExam,
  examRooms,
  examSubmissions,
  masterData,
  teacherDisplayName,
}) => {
  // Top-level filter
  const [searchTitle, setSearchTitle] = useState('');
  const [filterTargetMode, setFilterTargetMode] = useState<'all' | HomeworkTargetMode>('all');

  // Create Homework Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [hwTitle, setHwTitle] = useState(
    'Bài tập củng cố: Ứng dụng đạo hàm & Khảo sát hàm số (SGK KNTT)'
  );
  const [hwGrade, setHwGrade] = useState<'10' | '11' | '12'>('12');
  const [hwDueDate, setHwDueDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [sourceTab, setSourceTab] = useState<HomeworkContentSourceType>('bank');

  // Source 1: Bank selection filters (Grade, Chapter, Lesson, ID suffix -TN, -DS, -TLN)
  const [bankFilterGrade, setBankFilterGrade] = useState<'all' | '10' | '11' | '12'>('12');
  const [bankFilterChapter, setBankFilterChapter] = useState<string>('all');
  const [bankFilterLesson, setBankFilterLesson] = useState<string>('all');
  const [bankFilterSuffix, setBankFilterSuffix] = useState<FormatSuffixFilter>('all');
  const [bankSearchCode, setBankSearchCode] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(
    () => new Set(bankItems.slice(0, 8).map((q) => q.id))
  );

  // Source 2: Upload Word (.docx) or PDF / Text
  const [uploadedQuestions, setUploadedQuestions] = useState<BankQuestion[]>([]);
  const [uploadRawText, setUploadRawText] = useState('');
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Source 3: Quick Essay / SGK assignment
  const [requireEssayPhotos, setRequireEssayPhotos] = useState(true);
  const [essayPromptText, setEssayPromptText] = useState(
    'Giải các bài tập SGK Toán 12 (Kết nối tri thức) vào vở, trình bày rõ các bước biến đổi và chụp ảnh bài làm nộp lên hệ thống.'
  );
  const [essayPromptImages, setEssayPromptImages] = useState<string[]>([]);
  const [objectiveWeightPoints, setObjectiveWeightPoints] = useState<number>(7);
  const [essayWeightPoints, setEssayWeightPoints] = useState<number>(3);
  const essayImageInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize real classes from MasterData.classCatalog (11B05, 11B10, 11B13, 12A1, etc.) with classroomStore
  const effectiveClassroomStore = useMemo(() => {
    return syncMasterCatalogWithClassroomStore(masterData, classroomStore).store;
  }, [masterData, classroomStore]);

  // Personalized Targeting (3 modes)
  const [targetMode, setTargetMode] = useState<HomeworkTargetMode>('classes');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(() => {
    const preferred =
      effectiveClassroomStore.classes.find((c) => c.name === '11B13') ||
      effectiveClassroomStore.classes.find((c) => c.name === '11B05') ||
      effectiveClassroomStore.classes[0];
    return preferred ? [preferred.id] : [];
  });
  // Mode 2: Remedial < 5.0
  const [remedialSourceType, setRemedialSourceType] =
    useState<HomeworkFilterDataSource>('smas_tbm');
  const [remedialSourceRefId, setRemedialSourceRefId] = useState<string>('');
  const [remedialThreshold, setRemedialThreshold] = useState<number>(5.0);
  const [remedialSemester, setRemedialSemester] = useState<1 | 2>(1);
  // Mode 3: Manual individual students (default to first real class e.g. 11B13 so full student table shows immediately)
  const [manualClassFilter, setManualClassFilter] = useState<string>(() => {
    const preferred =
      effectiveClassroomStore.classes.find((c) => c.name === '11B13') ||
      effectiveClassroomStore.classes.find((c) => c.name === '11B05') ||
      effectiveClassroomStore.classes[0];
    return preferred ? preferred.id : 'all';
  });
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [manualSelectedStudentIds, setManualSelectedStudentIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (effectiveClassroomStore.classes.length === 0) return;
    if (
      selectedClassIds.length === 0 ||
      !selectedClassIds.some((id) => effectiveClassroomStore.classes.some((c) => c.id === id))
    ) {
      const preferred =
        effectiveClassroomStore.classes.find((c) => c.name === '11B13') ||
        effectiveClassroomStore.classes[0];
      if (preferred) setSelectedClassIds([preferred.id]);
    }
    if (
      manualClassFilter !== 'all' &&
      !effectiveClassroomStore.classes.some((c) => c.id === manualClassFilter)
    ) {
      const preferred =
        effectiveClassroomStore.classes.find((c) => c.name === '11B13') ||
        effectiveClassroomStore.classes[0];
      if (preferred) setManualClassFilter(preferred.id);
    }
  }, [effectiveClassroomStore.classes, selectedClassIds, manualClassFilter]);

  // Modals for Share QR/Link, Zalo Reminder, and Detail & Grading
  const [shareModalHw, setShareModalHw] = useState<HomeworkAssignment | null>(null);
  const [generalQrDataUrl, setGeneralQrDataUrl] = useState<string>('');
  const [shareStudentSearch, setShareStudentSearch] = useState<string>('');
  const [previewStudentQr, setPreviewStudentQr] = useState<{
    studentCode: string;
    fullName: string;
    className: string;
    link: string;
    qrDataUrl: string;
  } | null>(null);
  const [zaloModalHw, setZaloModalHw] = useState<HomeworkAssignment | null>(null);
  const [detailGradingHw, setDetailGradingHw] = useState<HomeworkAssignment | null>(null);
  const [activeGradingSubId, setActiveGradingSubId] = useState<string | null>(null);
  const [draftEssayScore, setDraftEssayScore] = useState<string>('');
  const [draftFeedback, setDraftFeedback] = useState<string>('');
  const [syncSemester, setSyncSemester] = useState<1 | 2>(1);
  const [syncTargetCol, setSyncTargetCol] = useState<'auto' | GradeColumnTarget>('auto');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3600);
  };

  // Resolve a student's current SMAS TBM score (from gradebookMap or fallback to student record)
  const getStudentCurrentTbm = (stu: ClassroomStudent, semester: 1 | 2 = 1): number => {
    const entry = gradebookMap[makeGradeEntryId(stu.classId, semester, stu.id)];
    if (entry) {
      const computed = entry.tbm ?? computeCircular22TBM(entry);
      if (computed !== null && computed !== undefined) return computed;
      const txFallback = [entry.tx1, entry.tx2, entry.tx3, entry.tx4, entry.tx5].find(
        (v): v is number => v !== null && v !== undefined
      );
      if (txFallback !== undefined) return txFallback;
    }
    if (stu.attempts && stu.attempts.length > 0) {
      return stu.attempts[0].score;
    }
    if (stu.academicRank === 'Chưa đạt') return 4.4;
    if (stu.academicRank === 'Đạt') return 6.2;
    if (stu.academicRank === 'Khá') return 7.5;
    return 8.8;
  };

  // Generate crisp QR Code PNG whenever shareModalHw opens
  useEffect(() => {
    if (!shareModalHw) {
      setGeneralQrDataUrl('');
      setPreviewStudentQr(null);
      setShareStudentSearch('');
      return;
    }
    const generalUrl = buildGeneralHomeworkLink(shareModalHw);
    QRCode.toDataURL(generalUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => setGeneralQrDataUrl(url))
      .catch(() => setGeneralQrDataUrl(''));
  }, [shareModalHw]);

  const handleDownloadQrPng = async (
    targetUrl: string,
    fileName: string,
    headerLabel: string,
    subLabel: string
  ) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(targetUrl, {
        width: 520,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });
      // Render a crisp high-res PNG card with title, QR code, and PIN/Student info
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 760;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        saveAs(qrDataUrl, fileName);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top Teal header bar
      ctx.fillStyle = '#136F63';
      ctx.fillRect(0, 0, canvas.width, 84);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TEACHLEARN EDU — BÀI TẬP VỀ NHÀ', canvas.width / 2, 50);

      // Header & Sublabel
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 21px "Be Vietnam Pro", sans-serif';
      ctx.fillText(headerLabel.slice(0, 44), canvas.width / 2, 132);

      ctx.fillStyle = '#136F63';
      ctx.font = 'bold 18px "Be Vietnam Pro", sans-serif';
      ctx.fillText(subLabel.slice(0, 52), canvas.width / 2, 166);

      // Draw QR image
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('QR load error'));
        img.src = qrDataUrl;
      });
      ctx.strokeStyle = '#136F63';
      ctx.lineWidth = 4;
      ctx.strokeRect(86, 192, 468, 468);
      ctx.drawImage(img, 96, 202, 448, 448);

      ctx.fillStyle = '#475569';
      ctx.font = '15px "Be Vietnam Pro", sans-serif';
      ctx.fillText('Quét mã QR bằng Zalo hoặc Camera điện thoại để vào thẳng bài tập', canvas.width / 2, 708);

      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, fileName);
          showToast(`Đã tải ảnh Mã QR (${fileName}) sắc nét về máy!`);
        }
      }, 'image/png');
    } catch {
      showToast('Không thể tạo ảnh Mã QR. Vui lòng thử lại.');
    }
  };

  // Filtered chapters and lessons for Source 1 (Bank)
  const availableChapters = useMemo(() => {
    if (bankFilterGrade === 'all') return KNTT_CATALOG_CHAPTERS;
    return KNTT_CATALOG_CHAPTERS.filter((c) => c.grade === bankFilterGrade);
  }, [bankFilterGrade]);

  const availableLessons = useMemo(() => {
    if (bankFilterChapter === 'all') {
      return availableChapters.flatMap((c) => c.lessons);
    }
    const ch = availableChapters.find((c) => c.code === bankFilterChapter);
    return ch ? ch.lessons : [];
  }, [availableChapters, bankFilterChapter]);

  const filteredBankQuestions = useMemo(() => {
    const qLower = bankSearchCode.trim().toLowerCase();
    return bankItems.filter((item, idx) => {
      if (bankFilterGrade !== 'all' && item.grade !== bankFilterGrade) return false;
      if (bankFilterChapter !== 'all' && item.chapter !== bankFilterChapter) return false;
      if (bankFilterLesson !== 'all' && item.lesson !== bankFilterLesson) return false;
      const suffix = getQuestionFormatCode(item);
      if (bankFilterSuffix !== 'all' && suffix !== bankFilterSuffix) return false;
      if (qLower) {
        const displayCode = buildQuestionDisplayCode(item, idx).toLowerCase();
        const inStem = item.stem.toLowerCase().includes(qLower);
        const inTag = (item.tag || '').toLowerCase().includes(qLower);
        if (!displayCode.includes(qLower) && !inStem && !inTag) return false;
      }
      return true;
    });
  }, [
    bankItems,
    bankFilterGrade,
    bankFilterChapter,
    bankFilterLesson,
    bankFilterSuffix,
    bankSearchCode,
  ]);

  // Build an enriched gradebookMap so newly synced catalog classes always have TBM available for remedial scan
  const enrichedGradebookMap = useMemo(() => {
    const next: Record<string, SubjectGradeEntry> = { ...gradebookMap };
    effectiveClassroomStore.students.forEach((stu) => {
      const id1 = makeGradeEntryId(stu.classId, 1, stu.id);
      if (!next[id1]) {
        const tbm = getStudentCurrentTbm(stu, 1);
        next[id1] = {
          id: id1,
          classId: stu.classId,
          semester: 1,
          studentId: stu.id,
          tx1: tbm,
          tx2: tbm,
          tx3: null,
          tx4: null,
          tx5: null,
          gk: tbm,
          ck: tbm,
          tbm,
          remark: '',
          yearRemark: '',
          syncedAttemptIds: [],
          updatedAt: '2026-11-14T09:00:00.000Z',
        };
      }
    });
    return next;
  }, [gradebookMap, effectiveClassroomStore.students]);

  // Mode 2: Remedial auto-scanned students (< thresholdScore)
  const remedialCandidates = useMemo(() => {
    return scanRemedialStudentsBelowThreshold({
      sourceType: remedialSourceType,
      sourceRefId: remedialSourceRefId || undefined,
      thresholdScore: remedialThreshold,
      semester: remedialSemester,
      selectedClassIds,
      classroomStore: effectiveClassroomStore,
      gradebookMap: enrichedGradebookMap,
      examRooms,
      examSubmissions,
      homeworkAssignments,
      homeworkSubmissions,
    });
  }, [
    remedialSourceType,
    remedialSourceRefId,
    remedialThreshold,
    remedialSemester,
    selectedClassIds,
    effectiveClassroomStore,
    enrichedGradebookMap,
    examRooms,
    examSubmissions,
    homeworkAssignments,
    homeworkSubmissions,
  ]);

  // Mode 3: Manual student list filtered by class & search
  const manualCandidateStudents = useMemo(() => {
    const q = manualStudentSearch.trim().toLowerCase();
    return effectiveClassroomStore.students.filter((s) => {
      if (manualClassFilter !== 'all' && s.classId !== manualClassFilter) return false;
      if (q) {
        return (
          s.fullName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [effectiveClassroomStore.students, manualClassFilter, manualStudentSearch]);

  // Handle Docx or PDF upload in Source 2 using existing verbatim decoder
  const handleFileUploadDocxOrPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setUploadStatusMsg(`Đang giải mã nguyên bản tệp "${file.name}"...`);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'docx') {
        const buf = await file.arrayBuffer();
        const extractedText = await extractTextFromDocxArrayBuffer(buf);
        setUploadRawText(extractedText);
        const parsed = parseExamTextToBankQuestions(extractedText, file.name, hwGrade);
        setUploadedQuestions(parsed);
        setUploadStatusMsg(
          `Đã bóc tách thành công ${parsed.length} câu hỏi chuẩn từ tệp Word "${file.name}".`
        );
      } else if (ext === 'pdf') {
        // Use server-side Gemini PDF OCR or text fallback
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const base64Data = dataUrl.split(',')[1] || '';
        const resp = await fetch('/api/ai/pdf-to-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfBase64: base64Data,
            fileName: file.name,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const text = data.extractedText || data.content || '';
          setUploadRawText(text);
          const parsed = parseExamTextToBankQuestions(text, file.name, hwGrade);
          setUploadedQuestions(parsed);
          setUploadStatusMsg(
            `Đã giải mã PDF "${file.name}" và bóc tách ${parsed.length} câu hỏi.`
          );
        } else {
          setUploadStatusMsg(
            'Tệp PDF đã được nạp. Bạn có thể dán văn bản đề thi vào khung bên dưới để bóc tách tức thời.'
          );
        }
      } else {
        const text = await file.text();
        setUploadRawText(text);
        const parsed = parseExamTextToBankQuestions(text, file.name, hwGrade);
        setUploadedQuestions(parsed);
        setUploadStatusMsg(`Đã bóc tách ${parsed.length} câu hỏi từ "${file.name}".`);
      }
    } catch (err) {
      setUploadStatusMsg(
        err instanceof Error ? err.message : 'Không thể đọc tệp. Vui lòng kiểm tra định dạng.'
      );
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // Handle teacher uploading or pasting an image of SGK/essay problem
  const handleAddEssayPromptImage = async (file: File) => {
    const reader = new FileReader();
    const rawDataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const compressed = await compressImageToWebpOrJpegUnder100KB(rawDataUrl, 140 * 1024);
    setEssayPromptImages((prev) => [...prev, compressed]);
  };

  const handlePasteEssayImage = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleAddEssayPromptImage(file);
          showToast('Đã dán và nén ảnh đề bài tự luận (< 150KB)!');
        }
      }
    }
  };

  const handlePublishNewHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwTitle.trim()) {
      showToast('Vui lòng nhập Tên bài tập về nhà.');
      return;
    }

    // Resolve questions & weights
    let examSnapshot: ExamPaper | undefined = undefined;
    let objWeight = objectiveWeightPoints;
    let essWeight = essayWeightPoints;

    if (sourceTab === 'bank') {
      const chosen = bankItems.filter((q) => selectedBankIds.has(q.id));
      if (chosen.length === 0 && !requireEssayPhotos) {
        showToast('Vui lòng chọn ít nhất 1 câu hỏi từ Ngân hàng đề hoặc bật Tự luận.');
        return;
      }
      if (chosen.length > 0) {
        examSnapshot = buildExamFromSelectedBankQuestions(chosen, currentExam, hwTitle.trim());
      }
      if (!requireEssayPhotos) {
        objWeight = 10;
        essWeight = 0;
      }
    } else if (sourceTab === 'upload_docx_pdf') {
      const parsed =
        uploadedQuestions.length > 0
          ? uploadedQuestions
          : parseExamTextToBankQuestions(uploadRawText, 'Đề tải lên', hwGrade);
      if (parsed.length === 0 && !requireEssayPhotos) {
        showToast('Chưa có câu hỏi nào được bóc tách từ file Word/PDF.');
        return;
      }
      if (parsed.length > 0) {
        examSnapshot = buildExamFromSelectedBankQuestions(parsed, currentExam, hwTitle.trim());
      }
      if (!requireEssayPhotos) {
        objWeight = 10;
        essWeight = 0;
      }
    } else {
      // essay_sgk
      objWeight = 0;
      essWeight = 10;
    }

    // Resolve target students / classes from effectiveClassroomStore
    const classMap = new Map(effectiveClassroomStore.classes.map((c) => [c.id, c]));
    let targetClassIds: string[] = [];
    let targetClassNames: string[] = [];
    let targetStudentIds: string[] = [];
    let targetStudentCodes: string[] = [];
    let targetStudentNames: string[] = [];
    let targetLabel = '';

    if (targetMode === 'classes') {
      if (selectedClassIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 lớp để giao bài.');
        return;
      }
      targetClassIds = selectedClassIds;
      targetClassNames = selectedClassIds
        .map((id) => classMap.get(id)?.name || '')
        .filter(Boolean);
      targetLabel = `Cả lớp ${targetClassNames.join(', ')}`;
    } else if (targetMode === 'remedial_below_threshold') {
      if (remedialCandidates.length === 0) {
        showToast(
          `Không có học sinh nào dưới ${remedialThreshold} điểm theo nguồn dữ liệu đã chọn.`
        );
        return;
      }
      const clsIds = Array.from(new Set(remedialCandidates.map((r) => r.student.classId)));
      targetClassIds = clsIds;
      targetClassNames = clsIds.map((id) => classMap.get(id)?.name || '').filter(Boolean);
      targetStudentIds = remedialCandidates.map((r) => r.student.id);
      targetStudentCodes = remedialCandidates.map((r) => r.student.studentCode);
      targetStudentNames = remedialCandidates.map((r) => r.student.fullName);
      targetLabel = `Nhóm cần phụ đạo < ${remedialThreshold.toFixed(1)} (${remedialCandidates.length} HS lớp ${targetClassNames.join(', ')})`;
    } else {
      // manual_students
      const picked = effectiveClassroomStore.students.filter((s) =>
        manualSelectedStudentIds.has(s.id)
      );
      if (picked.length === 0) {
        showToast('Vui lòng tích chọn ít nhất 1 học sinh trong bảng danh sách.');
        return;
      }
      const clsIds = Array.from(new Set(picked.map((s) => s.classId)));
      targetClassIds = clsIds;
      targetClassNames = clsIds.map((id) => classMap.get(id)?.name || '').filter(Boolean);
      targetStudentIds = picked.map((s) => s.id);
      targetStudentCodes = picked.map((s) => s.studentCode);
      targetStudentNames = picked.map((s) => s.fullName);
      targetLabel = `Giao đích danh (${picked.length} HS lớp ${targetClassNames.join(', ')}: ${picked
        .slice(0, 2)
        .map((s) => s.fullName)
        .join(', ')}${picked.length > 2 ? '...' : ''})`;
    }

    const pinCode = String(Math.floor(100000 + Math.random() * 899999));
    const newHw: HomeworkAssignment = {
      id: `hw-${Date.now()}`,
      pinCode,
      title: hwTitle.trim(),
      subject: masterData.profile.defaultSubject || 'Toán học',
      grade: hwGrade,
      sourceType: sourceTab,
      targetMode,
      targetClassIds,
      targetClassNames,
      targetStudentIds,
      targetStudentCodes,
      targetStudentNames,
      targetLabel,
      remedialConfig:
        targetMode === 'remedial_below_threshold'
          ? {
              sourceType: remedialSourceType,
              sourceRefId: remedialSourceRefId || undefined,
              thresholdScore: remedialThreshold,
              semester: remedialSemester,
            }
          : undefined,
      dueDate: new Date(hwDueDate).toISOString(),
      allowLateSubmission: true,
      allowReviewSolutions: true,
      requireEssayPhotos: sourceTab === 'essay_sgk' ? true : requireEssayPhotos,
      essayPromptText:
        sourceTab === 'essay_sgk' || requireEssayPhotos ? essayPromptText.trim() : undefined,
      essayPromptImages:
        sourceTab === 'essay_sgk' || requireEssayPhotos ? essayPromptImages : undefined,
      objectiveWeightPoints: objWeight,
      essayWeightPoints: essWeight,
      examPaperSnapshot: examSnapshot,
      answerKey: examSnapshot ? buildAnswerKeyFromExamPaper(examSnapshot) : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    await onCreateHomework(newHw);
    setCreateOpen(false);
    // Immediately open the upgraded Share Link & QR Code dialog (Part A + Part B)
    setShareModalHw(newHw);
    showToast(`Đã phát hành Bài tập về nhà (Mã PIN: ${pinCode}) cho ${targetLabel}!`);
  };

  const filteredAssignments = useMemo(() => {
    const q = searchTitle.trim().toLowerCase();
    return homeworkAssignments.filter((hw) => {
      if (filterTargetMode !== 'all' && hw.targetMode !== filterTargetMode) return false;
      if (q) {
        return (
          hw.title.toLowerCase().includes(q) ||
          hw.pinCode.includes(q) ||
          hw.targetLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [homeworkAssignments, searchTitle, filterTargetMode]);

  const openGradingDetail = (hw: HomeworkAssignment) => {
    setDetailGradingHw(hw);
    const hwSubs = homeworkSubmissions.filter((s) => s.homeworkId === hw.id);
    if (hwSubs.length > 0) {
      const first = hwSubs[0];
      setActiveGradingSubId(first.id);
      setDraftEssayScore(first.essayScore !== null ? String(first.essayScore) : '');
      setDraftFeedback(first.teacherFeedback || '');
    } else {
      setActiveGradingSubId(null);
    }
  };

  const selectSubmissionForGrading = (sub: HomeworkSubmission) => {
    setActiveGradingSubId(sub.id);
    setDraftEssayScore(sub.essayScore !== null ? String(sub.essayScore) : '');
    setDraftFeedback(sub.teacherFeedback || '');
  };

  const handleSaveSingleStudentGrading = async (sub: HomeworkSubmission, hw: HomeworkAssignment) => {
    const parsedEssay =
      hw.essayWeightPoints > 0 && draftEssayScore.trim() !== ''
        ? Math.max(
            0,
            Math.min(
              hw.essayWeightPoints,
              Number(draftEssayScore.trim().replace(',', '.')) || 0
            )
          )
        : sub.essayScore;
    const total = Number((sub.objectiveScore + (parsedEssay ?? 0)).toFixed(2));
    const updated: HomeworkSubmission = {
      ...sub,
      essayScore: parsedEssay,
      totalScore: Math.min(10, total),
      teacherFeedback: draftFeedback.trim(),
      gradingStatus: 'graded',
      gradedAt: new Date().toISOString(),
    };
    await onGradeHomeworkSubmission(updated);
    showToast(`Đã lưu điểm (${updated.totalScore}/10) và nhận xét cho em ${sub.studentName}!`);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed right-5 bottom-5 z-50 flex items-center gap-2.5 rounded-[8px] border border-[#136F63] bg-[#0B3B35] px-4 py-3 text-[13.5px] font-medium text-white shadow-xl">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Phân hệ Giao Bài Tập Về Nhà Online (Chuẩn SMAS 4.0)
            </span>
          </div>
          <h1 className="mt-1.5 text-[18px] font-bold text-slate-900 dark:text-white">
            Quản lý Bài Tập Về Nhà &amp; Phân Luồng Phụ Đạo Cá Nhân Hóa
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            Giao bài từ Ngân hàng đề, file Word/PDF hoặc ảnh chụp SGK · Phân luồng riêng cho nhóm
            dưới trung bình (&lt; 5.0) · Nhắc nộp Zalo 1 chạm &amp; đồng bộ Sổ điểm SMAS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#136F63] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-xs transition-colors hover:bg-[#0F594F]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            <span>+ Tạo Bài Tập Mới</span>
          </button>
        </div>
      </div>

      {/* Filter & KPI Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              placeholder="Tìm tên bài tập, lớp, mã PIN..."
              className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] pr-3 pl-9 text-[13px] text-slate-800 focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="inline-flex rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 dark:border-slate-700 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: 'Tất cả đối tượng' },
                { id: 'classes', label: 'Cả lớp' },
                { id: 'remedial_below_threshold', label: 'Phụ đạo (< 5.0)' },
                { id: 'manual_students', label: 'Chọn thủ công / HSG' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTargetMode(tab.id)}
                className={`rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  filterTargetMode === tab.id
                    ? 'bg-[#136F63] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-[12.5px] text-slate-600 dark:text-slate-300">
          <span>
            Đang giao: <strong className="text-[#136F63]">{homeworkAssignments.length}</strong> phiếu
            bài tập
          </span>
          <span>
            Tổng lượt nộp:{' '}
            <strong className="text-[#0369A1]">{homeworkSubmissions.length}</strong> bài làm
          </span>
        </div>
      </div>

      {/* Homework Card Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredAssignments.map((hw) => {
          const targetRoster = getTargetRosterForHomework(hw, effectiveClassroomStore);
          const totalTargetCount = Math.max(
            targetRoster.length,
            hw.targetStudentIds.length || 16
          );
          const hwSubs = homeworkSubmissions.filter((s) => s.homeworkId === hw.id);
          const submittedCount = hwSubs.length;
          const progressPct = Math.min(
            100,
            Math.round((submittedCount / Math.max(1, totalTargetCount)) * 100)
          );
          const pendingEssayCount = hwSubs.filter(
            (s) => s.gradingStatus === 'pending_essay_review'
          ).length;

          const dueMs = new Date(hw.dueDate).getTime();
          const hoursLeft = Math.round((dueMs - Date.now()) / (3600 * 1000));
          const isDueSoon = hoursLeft >= 0 && hoursLeft <= 24;
          const isOverdue = hoursLeft < 0;

          const p1Count = hw.examPaperSnapshot?.part1.length || 0;
          const p2Count = hw.examPaperSnapshot?.part2.length || 0;
          const p3Count = hw.examPaperSnapshot?.part3.length || 0;

          return (
            <div
              key={hw.id}
              className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-2xs transition-colors hover:border-[#136F63]/60 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                {/* Top Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-0.5 text-[11.5px] font-semibold ${
                      hw.targetMode === 'remedial_below_threshold'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : hw.targetMode === 'manual_students'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>{hw.targetLabel}</span>
                  </span>

                  <span className="rounded-[6px] bg-[#E0F2FE] px-2.5 py-0.5 font-mono text-[12px] font-bold text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                    Mã: {hw.pinCode}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mt-3 text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
                  {hw.title}
                </h3>

                {/* Meta details */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#F8FAFC] px-2 py-0.5 dark:bg-slate-800">
                    <BookOpen className="h-3.5 w-3.5 text-[#136F63]" />
                    {p1Count + p2Count + p3Count > 0
                      ? `${p1Count} TN · ${p2Count} Đ/S · ${p3Count} TLN`
                      : '100% Tự luận / SGK'}
                  </span>
                  {hw.requireEssayPhotos && (
                    <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#F8FAFC] px-2 py-0.5 text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                      <ImagePlus className="h-3.5 w-3.5" />
                      Nộp ảnh tự luận ({hw.essayWeightPoints}đ)
                    </span>
                  )}
                </div>

                {/* Deadline badge */}
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <CalendarClock className="h-3.5 w-3.5 text-[#136F63]" />
                    <span>
                      Hạn chót:{' '}
                      <strong className="tabular-nums">
                        {new Date(hw.dueDate).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </strong>
                    </span>
                  </span>
                  {isDueSoon && (
                    <span className="rounded-[5px] bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Còn {hoursLeft}h
                    </span>
                  )}
                  {isOverdue && (
                    <span className="rounded-[5px] bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      Đã quá hạn
                    </span>
                  )}
                </div>

                {/* Submission Progress Bar */}
                <div className="mt-3.5 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Tiến độ học sinh nộp bài
                    </span>
                    <span className="font-mono font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                      {submittedCount}/{totalTargetCount} HS đã nộp ({progressPct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-[#136F63] transition-all duration-300"
                      style={{ width: `${Math.max(5, progressPct)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-slate-500 dark:text-slate-400">
                    <span>
                      Chưa nộp:{' '}
                      <strong className="text-red-600 dark:text-red-400">
                        {Math.max(0, totalTargetCount - submittedCount)} HS
                      </strong>
                    </span>
                    {pendingEssayCount > 0 ? (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        ● {pendingEssayCount} bài chờ GV chấm ảnh
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        ● Đã chấm tự động TN
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="mt-4 space-y-2 border-t border-[#E2E8F0] pt-3.5 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShareModalHw(hw)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-2 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <QrCode className="h-3.5 w-3.5 shrink-0" />
                    <span>Link / Mã QR Zalo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setZaloModalHw(hw)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-amber-300 bg-amber-50/80 px-2.5 py-2 text-[12.5px] font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <MessageSquareShare className="h-3.5 w-3.5 shrink-0" />
                    <span>Nhắc nhở nộp bài</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openGradingDetail(hw)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#0F594F]"
                  >
                    <Eye className="h-4 w-4 shrink-0" />
                    <span>Xem chi tiết &amp; Chấm bài</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteHomework(hw.id)}
                    title="Xóa bài tập này"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: + TẠO BÀI TẬP MỚI (3 NGUỒN NỘI DUNG + 3 CHẾ ĐỘ GIAO BÀI CÁ NHÂN HÓA) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:p-5">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#136F63] px-5 py-3.5 text-white">
              <div>
                <h2 className="text-[16px] font-bold">
                  + Tạo &amp; Giao Bài Tập Về Nhà Online (Tích hợp Phân luồng Học sinh)
                </h2>
                <p className="text-[12px] text-emerald-100">
                  Kết nối trực tiếp Ngân hàng đề, Giải mã Word/PDF nguyên bản và Sổ điểm SMAS 4.0
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-[6px] bg-white/10 p-1.5 text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Form */}
            <form
              onSubmit={handlePublishNewHomework}
              className="flex-1 space-y-5 overflow-y-auto p-5"
            >
              {/* STEP 1: Basic Info */}
              <div className="grid grid-cols-1 gap-4 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="sm:col-span-6">
                  <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                    Tên Phiếu Bài Tập Về Nhà
                  </label>
                  <input
                    type="text"
                    required
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                    placeholder="VD: Bài tập Chương 1 - Khảo sát hàm số & Cực trị..."
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                    Khối lớp
                  </label>
                  <select
                    value={hwGrade}
                    onChange={(e) => {
                      const g = e.target.value as '10' | '11' | '12';
                      setHwGrade(g);
                      setBankFilterGrade(g);
                    }}
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] font-semibold text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="12">Khối 12</option>
                    <option value="11">Khối 11</option>
                    <option value="10">Khối 10</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                    Hạn chót nộp bài (Tự động cảnh báo trước 24h)
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={hwDueDate}
                    onChange={(e) => setHwDueDate(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13px] font-semibold text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* STEP 2: 3 Content Sources */}
              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">
                      Bước 1. Chọn Nguồn Nội Dung Bài Tập (3 nguồn linh hoạt)
                    </h3>
                    <p className="text-[12px] text-slate-500">
                      Ghép câu hỏi từ Ngân hàng đề, tải file Word/PDF hoặc giao nhanh bài tự luận
                      SGK
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSourceTab('bank')}
                      className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                        sourceTab === 'bank'
                          ? 'bg-[#136F63] text-white'
                          : 'border border-[#CBD5E1] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Database className="h-3.5 w-3.5" />
                      <span>1. Chọn từ Ngân hàng đề ({selectedBankIds.size} câu)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSourceTab('upload_docx_pdf')}
                      className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                        sourceTab === 'upload_docx_pdf'
                          ? 'bg-[#136F63] text-white'
                          : 'border border-[#CBD5E1] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>2. Tải lên Word (.docx) / PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSourceTab('essay_sgk');
                        setRequireEssayPhotos(true);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                        sourceTab === 'essay_sgk'
                          ? 'bg-[#136F63] text-white'
                          : 'border border-[#CBD5E1] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>3. Giao bài Tự luận / SGK nhanh</span>
                    </button>
                  </div>
                </div>

                {/* SOURCE 1: QUESTION BANK FILTER BY GRADE, CHAPTER, LESSON, AND -TN / -DS / -TLN */}
                {sourceTab === 'bank' && (
                  <div className="mt-3.5 space-y-3">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                      <div className="sm:col-span-2">
                        <label className="text-[11.5px] font-semibold text-slate-500">Khối</label>
                        <select
                          value={bankFilterGrade}
                          onChange={(e) => {
                            setBankFilterGrade(e.target.value as 'all' | '10' | '11' | '12');
                            setBankFilterChapter('all');
                            setBankFilterLesson('all');
                          }}
                          className="mt-0.5 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-medium dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="all">Tất cả khối</option>
                          <option value="12">Toán 12</option>
                          <option value="11">Toán 11</option>
                          <option value="10">Toán 10</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[11.5px] font-semibold text-slate-500">Chương</label>
                        <select
                          value={bankFilterChapter}
                          onChange={(e) => {
                            setBankFilterChapter(e.target.value);
                            setBankFilterLesson('all');
                          }}
                          className="mt-0.5 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-medium dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="all">Tất cả Chương</option>
                          {availableChapters.map((ch) => (
                            <option key={`${ch.grade}-${ch.code}`} value={ch.code}>
                              {ch.code} — {ch.title.replace(/^Chương\s+\d+\.\s*/i, '')}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[11.5px] font-semibold text-slate-500">
                          Bài học SGK
                        </label>
                        <select
                          value={bankFilterLesson}
                          onChange={(e) => setBankFilterLesson(e.target.value)}
                          className="mt-0.5 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-[12.5px] font-medium dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="all">Tất cả Bài học</option>
                          {availableLessons.map((ls) => (
                            <option key={ls.code} value={ls.code}>
                              {ls.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11.5px] font-semibold text-slate-500">
                          Mã định dạng ID
                        </label>
                        <select
                          value={bankFilterSuffix}
                          onChange={(e) =>
                            setBankFilterSuffix(e.target.value as FormatSuffixFilter)
                          }
                          className="mt-0.5 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 font-mono text-[12.5px] font-semibold text-[#136F63] dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="all">Tất cả (-TN, -DS, -TLN)</option>
                          <option value="-TN">-TN (4 lựa chọn)</option>
                          <option value="-DS">-DS (Đúng / Sai)</option>
                          <option value="-TLN">-TLN (Trả lời ngắn)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11.5px] font-semibold text-slate-500">
                          Tìm Mã ID / Từ khóa
                        </label>
                        <input
                          type="text"
                          value={bankSearchCode}
                          onChange={(e) => setBankSearchCode(e.target.value)}
                          placeholder="VD: C1-B1-TN..."
                          className="mt-0.5 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <span className="text-slate-600 dark:text-slate-300">
                        Tìm thấy <strong>{filteredBankQuestions.length}</strong> câu phù hợp · Đã
                        tích chọn:{' '}
                        <strong className="text-[#136F63]">{selectedBankIds.size} câu</strong>
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedBankIds);
                            filteredBankQuestions.slice(0, 15).forEach((q) => next.add(q.id));
                            setSelectedBankIds(next);
                          }}
                          className="rounded-[5px] bg-[#E0F2FE] px-2.5 py-1 font-semibold text-[#0369A1] hover:bg-[#BAE6FD]"
                        >
                          + Chọn nhanh 15 câu đang lọc
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedBankIds(new Set())}
                          className="rounded-[5px] border border-slate-300 px-2.5 py-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                    </div>

                    <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                      {filteredBankQuestions.slice(0, 60).map((q, idx) => {
                        const checked = selectedBankIds.has(q.id);
                        const codeLabel = buildQuestionDisplayCode(q, idx);
                        return (
                          <label
                            key={q.id}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-2.5 text-[13px] transition-colors ${
                              checked
                                ? 'border-[#136F63] bg-[#DCFCE7]/50 dark:border-emerald-600 dark:bg-emerald-950/30'
                                : 'border-[#E2E8F0] bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = new Set(selectedBankIds);
                                if (next.has(q.id)) next.delete(q.id);
                                else next.add(q.id);
                                setSelectedBankIds(next);
                              }}
                              className="mt-1 h-4 w-4 rounded accent-[#136F63]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-[#136F63] px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                                  {codeLabel}
                                </span>
                                <span className="text-[11.5px] font-medium text-slate-500">
                                  Khối {q.grade} · {q.chapter} · {q.lesson} · Mức {q.level}
                                </span>
                              </div>
                              <div className="mt-1 line-clamp-2 text-slate-800 dark:text-slate-200">
                                <MathText text={q.stem} />
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SOURCE 2: UPLOAD WORD (.DOCX) OR PDF */}
                {sourceTab === 'upload_docx_pdf' && (
                  <div className="mt-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-dashed border-[#136F63] bg-[#F8FAFC] p-4 dark:bg-slate-800/40">
                      <div>
                        <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
                          Tải lên tệp Đề bài Word (.docx) hoặc PDF
                        </div>
                        <p className="text-[12px] text-slate-500">
                          Sử dụng bộ giải mã OMML &amp; Bảng biến thiên nguyên bản để tách tự động
                          câu hỏi Phần I (-TN), Phần II (-DS), Phần III (-TLN) và hình vẽ.
                        </p>
                      </div>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".docx,.pdf,.txt"
                          onChange={handleFileUploadDocxOrPdf}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingFile}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-[6px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F]"
                        >
                          <Upload className="h-4 w-4" />
                          <span>{uploadingFile ? 'Đang giải mã...' : 'Chọn file .docx / .pdf'}</span>
                        </button>
                      </div>
                    </div>

                    {uploadStatusMsg && (
                      <div className="rounded-[6px] bg-[#E0F2FE] px-3 py-2 text-[12.5px] font-medium text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]">
                        {uploadStatusMsg}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                          Hoặc dán trực tiếp nội dung đề bài trắc nghiệm / tự luận vào đây:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const parsed = parseExamTextToBankQuestions(
                              uploadRawText,
                              'Đề dán trực tiếp',
                              hwGrade
                            );
                            setUploadedQuestions(parsed);
                            setUploadStatusMsg(`Đã phân tích ${parsed.length} câu hỏi từ văn bản.`);
                          }}
                          className="text-[12px] font-semibold text-[#136F63] hover:underline"
                        >
                          Phân tích câu hỏi ngay
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={uploadRawText}
                        onChange={(e) => setUploadRawText(e.target.value)}
                        placeholder="Câu 1. Tập nghiệm của phương trình cos x = 0 là&#10;A. ... B. ... C. ... D. ..."
                        className="mt-1 w-full rounded-[6px] border border-[#CBD5E1] bg-white p-2.5 font-mono text-[12.5px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                )}

                {/* SOURCE 3 OR SUPPLEMENTARY ESSAY / SGK ASSIGNMENT */}
                <div className="mt-4 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={sourceTab === 'essay_sgk' ? true : requireEssayPhotos}
                        disabled={sourceTab === 'essay_sgk'}
                        onChange={(e) => setRequireEssayPhotos(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#136F63]"
                      />
                      <span>
                        Yêu cầu học sinh làm Tự luận ra giấy &amp; chụp ảnh nộp bài (Tự động nén
                        &lt; 150KB)
                      </span>
                    </label>

                    {(sourceTab === 'essay_sgk' || requireEssayPhotos) &&
                      sourceTab !== 'essay_sgk' && (
                        <div className="flex items-center gap-2 text-[12px]">
                          <span>Tỷ trọng điểm:</span>
                          <span className="rounded bg-[#E0F2FE] px-2 py-0.5 font-mono font-bold text-[#0369A1]">
                            Trắc nghiệm: {objectiveWeightPoints}đ
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={9}
                            value={essayWeightPoints}
                            onChange={(e) => {
                              const ess = Number(e.target.value);
                              setEssayWeightPoints(ess);
                              setObjectiveWeightPoints(10 - ess);
                            }}
                            className="w-24 accent-[#136F63]"
                          />
                          <span className="rounded bg-[#DCFCE7] px-2 py-0.5 font-mono font-bold text-[#15803D]">
                            Tự luận: {essayWeightPoints}đ
                          </span>
                        </div>
                      )}
                  </div>

                  {(sourceTab === 'essay_sgk' || requireEssayPhotos) && (
                    <div className="mt-3 space-y-2.5" onPaste={handlePasteEssayImage}>
                      <textarea
                        rows={3}
                        value={essayPromptText}
                        onChange={(e) => setEssayPromptText(e.target.value)}
                        placeholder="Nhập đề bài tự luận / bài tập SGK hoặc nhấn Ctrl+V để dán trực tiếp ảnh chụp đề bài vào đây..."
                        className="w-full rounded-[6px] border border-[#CBD5E1] bg-white p-2.5 text-[13px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={essayImageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleAddEssayPromptImage(f);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => essayImageInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <ImagePlus className="h-3.5 w-3.5 text-[#136F63]" />
                            <span>Đính kèm ảnh chụp đề SGK (hoặc Ctrl+V dán ảnh)</span>
                          </button>
                        </div>

                        {essayPromptImages.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {essayPromptImages.map((img, i) => (
                              <div key={i} className="relative">
                                <img
                                  src={img}
                                  alt={`Đề tự luận ${i + 1}`}
                                  className="h-14 w-20 rounded border border-slate-300 object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEssayPromptImages((prev) =>
                                      prev.filter((_, idx) => idx !== i)
                                    )
                                  }
                                  className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-0.5 text-white"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

                {/* STEP 3: PERSONALIZED TARGETING (3 SMART MODES CONNECTED TO REAL CLASS CATALOG) */}
              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">
                      Bước 2. Chọn đối tượng giao bài (Kết nối trực tiếp Danh mục Lớp &amp; Sổ điểm SMAS)
                    </h3>
                    <p className="text-[12px] text-slate-500">
                      Đồng bộ trực tiếp với <strong>Khai báo &amp; Hồ sơ → Năm học &amp; Danh mục lớp</strong> ({effectiveClassroomStore.classes.map((c) => c.name).join(', ')}).
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#E0F2FE] px-2.5 py-1 text-[11.5px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-sky-300">
                    <Database className="h-3.5 w-3.5" />
                    <span>
                      {effectiveClassroomStore.classes.length} lớp · {effectiveClassroomStore.students.length} học sinh
                    </span>
                  </span>
                </div>

                {/* 3 Target Mode Cards */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setTargetMode('classes')}
                    className={`flex flex-col items-start rounded-[8px] border p-3.5 text-left transition-all ${
                      targetMode === 'classes'
                        ? 'border-[#136F63] bg-[#DCFCE7]/40 ring-1 ring-[#136F63] dark:bg-emerald-950/30'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white dark:border-slate-800 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <Users className="h-4 w-4 text-[#136F63]" />
                      <span className="text-[13.5px]">Chế độ 1: Giao cho Cả lớp</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                      Tích chọn 1 hoặc nhiều lớp trong danh mục hệ thống (VD: 11B05, 11B10, 11B13, 12A1...).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetMode('remedial_below_threshold')}
                    className={`flex flex-col items-start rounded-[8px] border p-3.5 text-left transition-all ${
                      targetMode === 'remedial_below_threshold'
                        ? 'border-[#136F63] bg-amber-50/70 ring-1 ring-[#136F63] dark:bg-amber-950/30'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white dark:border-slate-800 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <Filter className="h-4 w-4 text-amber-600" />
                      <span className="text-[13.5px]">Chế độ 2: Giao theo nhóm điểm (&lt; 5.0)</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                      Tự động lọc các học sinh có điểm dưới 5.0 từ Sổ điểm SMAS của lớp đang chọn.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetMode('manual_students')}
                    className={`flex flex-col items-start rounded-[8px] border p-3.5 text-left transition-all ${
                      targetMode === 'manual_students'
                        ? 'border-[#136F63] bg-purple-50/70 ring-1 ring-[#136F63] dark:bg-purple-950/30'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white dark:border-slate-800 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <UserCheck className="h-4 w-4 text-purple-600" />
                      <span className="text-[13.5px]">Chế độ 3: Chọn thủ công từng HS / Nhiều HS</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                      Chọn lớp để mở bảng danh sách học sinh kèm Điểm TBM, tích chọn 1 hoặc nhiều em từ nhiều lớp.
                    </p>
                  </button>
                </div>

                {/* TARGET MODE 1 DETAILS: WHOLE CLASSES */}
                {targetMode === 'classes' && (
                  <div className="mt-3.5 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                        Tích chọn 1 hoặc nhiều lớp thực tế trong hệ thống:
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClassIds(effectiveClassroomStore.classes.map((c) => c.id))
                          }
                          className="rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          Chọn tất cả lớp
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedClassIds([])}
                          className="rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {effectiveClassroomStore.classes.map((cls) => {
                        const active = selectedClassIds.includes(cls.id);
                        const count = effectiveClassroomStore.students.filter(
                          (s) => s.classId === cls.id
                        ).length;
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => {
                              setSelectedClassIds((prev) =>
                                prev.includes(cls.id)
                                  ? prev.filter((id) => id !== cls.id)
                                  : [...prev, cls.id]
                              );
                            }}
                            className={`inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[13px] font-semibold transition-colors ${
                              active
                                ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                                : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                          >
                            <Check
                              className={`h-3.5 w-3.5 ${active ? 'opacity-100' : 'opacity-30'}`}
                            />
                            <span>
                              Lớp {cls.name} ({count} HS)
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-[#E2E8F0] pt-2 text-[12px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <span>
                        Đã chọn:{' '}
                        <strong className="text-[#136F63]">
                          {selectedClassIds.length} lớp (
                          {effectiveClassroomStore.classes
                            .filter((c) => selectedClassIds.includes(c.id))
                            .map((c) => c.name)
                            .join(', ') || 'Chưa chọn'}
                          )
                        </strong>
                      </span>
                      <span>
                        Tổng số học sinh nhận bài:{' '}
                        <strong className="text-[#136F63]">
                          {
                            effectiveClassroomStore.students.filter((s) =>
                              selectedClassIds.includes(s.classId)
                            ).length
                          }{' '}
                          học sinh
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* TARGET MODE 2 DETAILS: REMEDIAL SCAN (< 5.0) */}
                {targetMode === 'remedial_below_threshold' && (
                  <div className="mt-3.5 space-y-3 rounded-[6px] border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                    {/* Choose which classes to scan for < 5.0 */}
                    <div>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          Chọn lớp cần lọc học sinh dưới trung bình (&lt; {remedialThreshold.toFixed(1)}):
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClassIds(
                              selectedClassIds.length === effectiveClassroomStore.classes.length
                                ? [effectiveClassroomStore.classes[0]?.id || '']
                                : effectiveClassroomStore.classes.map((c) => c.id)
                            )
                          }
                          className="text-[11.5px] font-semibold text-[#136F63] hover:underline"
                        >
                          {selectedClassIds.length === effectiveClassroomStore.classes.length
                            ? 'Chỉ chọn 1 lớp đầu'
                            : 'Quét tất cả các lớp'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveClassroomStore.classes.map((cls) => {
                          const active = selectedClassIds.includes(cls.id);
                          return (
                            <button
                              key={cls.id}
                              type="button"
                              onClick={() => {
                                setSelectedClassIds((prev) =>
                                  prev.includes(cls.id)
                                    ? prev.filter((id) => id !== cls.id)
                                    : [...prev, cls.id]
                                );
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                                active
                                  ? 'border-[#136F63] bg-[#136F63] text-white'
                                  : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                            >
                              <Check className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
                              <span>Lớp {cls.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          Nguồn quét dữ liệu điểm
                        </label>
                        <select
                          value={remedialSourceType}
                          onChange={(e) =>
                            setRemedialSourceType(e.target.value as HomeworkFilterDataSource)
                          }
                          className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="smas_tbm">1. Sổ điểm chuẩn SMAS (Điểm TBM hiện tại)</option>
                          <option value="online_exam">2. Kết quả một bài Thi Online</option>
                          <option value="previous_homework">
                            3. Kết quả một Bài tập về nhà trước đó
                          </option>
                        </select>
                      </div>

                      {remedialSourceType === 'smas_tbm' && (
                        <div className="sm:col-span-3">
                          <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            Học kỳ Sổ điểm SMAS
                          </label>
                          <select
                            value={remedialSemester}
                            onChange={(e) =>
                              setRemedialSemester(Number(e.target.value) as 1 | 2)
                            }
                            className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value={1}>Học kỳ I</option>
                            <option value={2}>Học kỳ II</option>
                          </select>
                        </div>
                      )}

                      {remedialSourceType === 'online_exam' && (
                        <div className="sm:col-span-4">
                          <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            Chọn Phòng thi Online
                          </label>
                          <select
                            value={remedialSourceRefId}
                            onChange={(e) => setRemedialSourceRefId(e.target.value)}
                            className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="">Tất cả phòng thi</option>
                            {examRooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.title} (PIN {r.pinCode})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {remedialSourceType === 'previous_homework' && (
                        <div className="sm:col-span-4">
                          <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            Chọn Bài tập trước đó
                          </label>
                          <select
                            value={remedialSourceRefId}
                            onChange={(e) => setRemedialSourceRefId(e.target.value)}
                            className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="">Tất cả bài tập trước</option>
                            {homeworkAssignments.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="sm:col-span-4">
                        <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          Ngưỡng điểm lọc (&lt; Mức điểm)
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="9.5"
                            value={remedialThreshold}
                            onChange={(e) => setRemedialThreshold(Number(e.target.value) || 5.0)}
                            className="h-9 w-24 rounded-[6px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] font-bold text-amber-800 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-300"
                          />
                          <span className="text-[12px] text-slate-500">điểm</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[6px] border border-amber-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                        <span className="font-semibold text-amber-900 dark:text-amber-300">
                          Danh sách tự động lọc từ Sổ điểm SMAS ({remedialCandidates.length} học sinh có điểm &lt;{' '}
                          {remedialThreshold.toFixed(1)}):
                        </span>
                        <span className="text-[11.5px] text-slate-500">
                          Chỉ những em này mới thấy phiếu bài tập trên Cổng Học sinh
                        </span>
                      </div>

                      {remedialCandidates.length === 0 ? (
                        <p className="mt-2 text-[12.5px] text-slate-500">
                          Không có học sinh nào dưới {remedialThreshold.toFixed(1)} điểm. Hãy chọn thêm lớp hoặc tăng ngưỡng điểm (VD: 6.5) để kiểm tra.
                        </p>
                      ) : (
                        <div className="mt-2.5 max-h-48 overflow-y-auto rounded-[6px] border border-[#E2E8F0] dark:border-slate-800">
                          <table className="w-full border-collapse text-left text-[12.5px]">
                            <thead className="sticky top-0 bg-amber-50/90 text-[11.5px] font-bold text-amber-950 uppercase dark:bg-slate-800 dark:text-amber-200">
                              <tr>
                                <th className="border-b border-[#E2E8F0] px-3 py-2 dark:border-slate-700">STT</th>
                                <th className="border-b border-[#E2E8F0] px-3 py-2 dark:border-slate-700">Mã học sinh</th>
                                <th className="border-b border-[#E2E8F0] px-3 py-2 dark:border-slate-700">Họ và tên</th>
                                <th className="border-b border-[#E2E8F0] px-3 py-2 dark:border-slate-700">Lớp</th>
                                <th className="border-b border-[#E2E8F0] px-3 py-2 text-right dark:border-slate-700">Điểm TBM hiện tại</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                              {remedialCandidates.map((item, idx) => (
                                <tr key={item.student.id} className="hover:bg-amber-50/40 dark:hover:bg-slate-800/40">
                                  <td className="px-3 py-1.5 font-mono text-slate-500">{idx + 1}</td>
                                  <td className="px-3 py-1.5 font-mono font-semibold text-slate-700 dark:text-slate-200">
                                    {item.student.studentCode}
                                  </td>
                                  <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-white">
                                    {item.student.fullName}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      {item.className}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    <span className="inline-flex items-center rounded bg-rose-100 px-2 py-0.5 font-mono text-[12px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                      {item.referenceScore.toFixed(1).replace('.', ',')}đ
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TARGET MODE 3 DETAILS: MANUAL INDIVIDUAL / MULTI-STUDENT PICKER WITH FULL TABLE */}
                {targetMode === 'manual_students' && (() => {
                  const classMap = new Map(effectiveClassroomStore.classes.map((c) => [c.id, c]));
                  const activeManualClassObj =
                    manualClassFilter !== 'all' ? classMap.get(manualClassFilter) : null;
                  const allVisibleIds = manualCandidateStudents.map((s) => s.id);
                  const allVisibleSelected =
                    allVisibleIds.length > 0 &&
                    allVisibleIds.every((id) => manualSelectedStudentIds.has(id));
                  const someVisibleSelected =
                    allVisibleIds.some((id) => manualSelectedStudentIds.has(id)) &&
                    !allVisibleSelected;

                  const toggleSelectAllVisible = () => {
                    const next = new Set(manualSelectedStudentIds);
                    if (allVisibleSelected) {
                      allVisibleIds.forEach((id) => next.delete(id));
                    } else {
                      allVisibleIds.forEach((id) => next.add(id));
                    }
                    setManualSelectedStudentIds(next);
                  };

                  const selectedStudentsList = effectiveClassroomStore.students.filter((s) =>
                    manualSelectedStudentIds.has(s.id)
                  );

                  return (
                    <div className="mt-3.5 space-y-3 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                      {/* Class quick selector tabs */}
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                            1. Chọn lớp học để hiển thị bảng danh sách học sinh (có thể chuyển qua lại nhiều lớp để chọn gộp):
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {effectiveClassroomStore.classes.map((c) => {
                            const isCurrent = manualClassFilter === c.id;
                            const totalInClass = effectiveClassroomStore.students.filter(
                              (s) => s.classId === c.id
                            ).length;
                            const pickedInClass = effectiveClassroomStore.students.filter(
                              (s) => s.classId === c.id && manualSelectedStudentIds.has(s.id)
                            ).length;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setManualClassFilter(c.id)}
                                className={`inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12.5px] font-semibold transition-all ${
                                  isCurrent
                                    ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                                    : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                }`}
                              >
                                <span>Lớp {c.name}</span>
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[11px] ${
                                    isCurrent
                                      ? 'bg-white/20 text-white'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {totalInClass} HS
                                </span>
                                {pickedInClass > 0 && (
                                  <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10.5px] font-bold text-slate-950">
                                    ✓ {pickedInClass}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setManualClassFilter('all')}
                            className={`inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12.5px] font-semibold transition-all ${
                              manualClassFilter === 'all'
                                ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                                : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                          >
                            <span>Tất cả các lớp ({effectiveClassroomStore.students.length} HS)</span>
                          </button>
                        </div>
                      </div>

                      {/* Search input & Select All / Deselect All toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="relative min-w-[260px] flex-1">
                          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={manualStudentSearch}
                            onChange={(e) => setManualStudentSearch(e.target.value)}
                            placeholder={`Tìm nhanh tên hoặc mã học sinh ${
                              activeManualClassObj ? `lớp ${activeManualClassObj.name}` : 'trong tất cả lớp'
                            }...`}
                            className="h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white pr-3 pl-9 text-[12.5px] text-slate-800 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={toggleSelectAllVisible}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#136F63] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#136F63] hover:bg-[#DCFCE7]/50 dark:bg-slate-900 dark:text-emerald-300"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>
                              {allVisibleSelected
                                ? `Bỏ chọn tất cả (${allVisibleIds.length} HS đang hiển thị)`
                                : `Chọn tất cả (${allVisibleIds.length} HS ${
                                    activeManualClassObj
                                      ? `lớp ${activeManualClassObj.name}`
                                      : 'đang hiển thị'
                                  })`}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* FULL STUDENT ROSTER TABLE: Checkbox | STT | Mã học sinh | Họ và tên | Điểm TBM hiện tại */}
                      <div className="max-h-72 overflow-y-auto rounded-[6px] border border-[#E2E8F0] bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full border-collapse text-left text-[13px]">
                          <thead className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F1F5F9] text-[12px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            <tr>
                              <th className="w-12 px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={allVisibleSelected}
                                  ref={(el) => {
                                    if (el) el.indeterminate = someVisibleSelected;
                                  }}
                                  onChange={toggleSelectAllVisible}
                                  title="Chọn tất cả / Bỏ chọn tất cả"
                                  className="h-4 w-4 cursor-pointer rounded accent-[#136F63]"
                                />
                              </th>
                              <th className="w-14 px-2.5 py-2.5 text-center">STT</th>
                              <th className="w-36 px-3 py-2.5">Mã học sinh</th>
                              <th className="px-3 py-2.5">Họ và tên</th>
                              {manualClassFilter === 'all' && (
                                <th className="w-24 px-3 py-2.5 text-center">Lớp</th>
                              )}
                              <th className="w-40 px-3 py-2.5 text-right">Điểm TBM hiện tại</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                            {manualCandidateStudents.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={manualClassFilter === 'all' ? 6 : 5}
                                  className="px-4 py-6 text-center text-[13px] text-slate-500"
                                >
                                  Không tìm thấy học sinh nào khớp với từ khóa &ldquo;{manualStudentSearch}&rdquo;.
                                </td>
                              </tr>
                            ) : (
                              manualCandidateStudents.map((stu, idx) => {
                                const checked = manualSelectedStudentIds.has(stu.id);
                                const cls = classMap.get(stu.classId);
                                const tbm = getStudentCurrentTbm(stu, 1);
                                const isBelow5 = tbm < 5.0;
                                const isGood = tbm >= 8.0;

                                return (
                                  <tr
                                    key={stu.id}
                                    onClick={() => {
                                      const next = new Set(manualSelectedStudentIds);
                                      if (next.has(stu.id)) next.delete(stu.id);
                                      else next.add(stu.id);
                                      setManualSelectedStudentIds(next);
                                    }}
                                    className={`cursor-pointer transition-colors ${
                                      checked
                                        ? 'bg-[#DCFCE7]/50 font-semibold dark:bg-emerald-950/35'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                    }`}
                                  >
                                    <td
                                      className="px-3 py-2 text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = new Set(manualSelectedStudentIds);
                                          if (next.has(stu.id)) next.delete(stu.id);
                                          else next.add(stu.id);
                                          setManualSelectedStudentIds(next);
                                        }}
                                        className="h-4 w-4 cursor-pointer rounded accent-[#136F63]"
                                      />
                                    </td>
                                    <td className="px-2.5 py-2 text-center font-mono text-[12px] text-slate-500">
                                      {idx + 1}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">
                                      {stu.studentCode}
                                    </td>
                                    <td className="px-3 py-2 text-[13px] font-medium text-slate-900 dark:text-white">
                                      {stu.fullName}
                                    </td>
                                    {manualClassFilter === 'all' && (
                                      <td className="px-3 py-2 text-center">
                                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                          {cls?.name || '12A1'}
                                        </span>
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right">
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 font-mono text-[12px] font-bold ${
                                          isBelow5
                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                            : isGood
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                              : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                        }`}
                                      >
                                        <span>{tbm.toFixed(1).replace('.', ',')}</span>
                                        <span className="font-sans text-[10.5px] font-semibold opacity-80">
                                          ({isBelow5 ? 'Dưới TB' : isGood ? 'Tốt' : 'Khá/Đạt'})
                                        </span>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* VISUAL COUNTER & SELECTED STUDENT TAGS BELOW TABLE */}
                      <div className="rounded-[6px] border border-[#136F63]/30 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-2.5 py-1 text-[12.5px] font-bold text-white">
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Đã chọn: {selectedStudentsList.length} học sinh</span>
                            </span>
                            <span className="text-[12px] text-slate-500">
                              (Mỗi học sinh được chọn sẽ có thêm 1 Đường link &amp; Mã QR định danh riêng sau khi bấm phát hành)
                            </span>
                          </div>
                          {selectedStudentsList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setManualSelectedStudentIds(new Set())}
                              className="text-[12px] font-semibold text-rose-600 hover:underline"
                            >
                              Xóa tất cả đã chọn
                            </button>
                          )}
                        </div>

                        {selectedStudentsList.length === 0 ? (
                          <p className="mt-2 text-[12px] text-slate-500">
                            Chưa có học sinh nào được tích chọn. Hãy tích vào ô vuông ở bảng trên để chọn 1 hoặc nhiều học sinh.
                          </p>
                        ) : (
                          <div className="mt-2.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                            {selectedStudentsList.map((stu) => {
                              const cls = classMap.get(stu.classId);
                              return (
                                <span
                                  key={stu.id}
                                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#136F63]/40 bg-[#DCFCE7]/50 px-2.5 py-1 text-[12px] font-semibold text-[#0F594F] dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                                >
                                  <span>
                                    {stu.fullName} ({cls?.name || ''})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = new Set(manualSelectedStudentIds);
                                      next.delete(stu.id);
                                      setManualSelectedStudentIds(next);
                                    }}
                                    title="Bỏ chọn học sinh này"
                                    className="ml-0.5 rounded-full p-0.5 text-slate-500 hover:bg-rose-100 hover:text-rose-700"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Submit Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-[6px] border border-[#CBD5E1] bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-[6px] bg-[#136F63] px-5 py-2 text-[13.5px] font-semibold text-white shadow-xs hover:bg-[#0F594F]"
                >
                  <Send className="h-4 w-4" />
                  <span>Hoàn tất Giao bài &amp; Xuất Link / Mã QR</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPGRADED SHARE LINK & QR CODE GỬI ZALO (PHẦN A: LINK CHUNG + PHẦN B: LINK & QR ĐỊNH DANH RIÊNG TỪNG HS) */}
      {shareModalHw && (() => {
        const generalLink = buildGeneralHomeworkLink(shareModalHw);
        const classMap = new Map(effectiveClassroomStore.classes.map((c) => [c.id, c]));
        const targetRoster = getTargetRosterForHomework(shareModalHw, effectiveClassroomStore);

        // Build list of targeted students for Part B (fallback to targetStudentNames/Codes if custom)
        const targetStudentRows: Array<{
          id: string;
          studentCode: string;
          fullName: string;
          className: string;
          personalLink: string;
        }> =
          targetRoster.length > 0
            ? targetRoster.map((stu) => {
                const clsName =
                  classMap.get(stu.classId)?.name || shareModalHw.targetClassNames[0] || '12A1';
                return {
                  id: stu.id,
                  studentCode: stu.studentCode,
                  fullName: stu.fullName,
                  className: clsName,
                  personalLink: buildPersonalizedStudentHomeworkLink(shareModalHw, {
                    studentCode: stu.studentCode,
                    fullName: stu.fullName,
                    className: clsName,
                  }),
                };
              })
            : shareModalHw.targetStudentNames.map((name, idx) => {
                const code =
                  shareModalHw.targetStudentCodes[idx] ||
                  `HS-${String(idx + 1).padStart(2, '0')}`;
                const clsName = shareModalHw.targetClassNames[0] || '12A1';
                return {
                  id: shareModalHw.targetStudentIds[idx] || `stu-custom-${idx}`,
                  studentCode: code,
                  fullName: name,
                  className: clsName,
                  personalLink: buildPersonalizedStudentHomeworkLink(shareModalHw, {
                    studentCode: code,
                    fullName: name,
                    className: clsName,
                  }),
                };
              });

        const qLower = shareStudentSearch.trim().toLowerCase();
        const filteredStudentRows = qLower
          ? targetStudentRows.filter(
              (r) =>
                r.fullName.toLowerCase().includes(qLower) ||
                r.studentCode.toLowerCase().includes(qLower) ||
                r.className.toLowerCase().includes(qLower)
            )
          : targetStudentRows;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="my-auto flex max-h-[92vh] w-full max-w-4xl flex-col rounded-[8px] border border-[#E2E8F0] bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#DCFCE7] px-2 py-0.5 text-[11.5px] font-bold text-[#15803D]">
                      <QrCode className="h-3.5 w-3.5" />
                      Đã sẵn sàng chia sẻ qua Zalo / Bảng tương tác
                    </span>
                    <span className="font-mono text-[12px] font-bold text-[#0369A1]">
                      Mã PIN: {shareModalHw.pinCode}
                    </span>
                  </div>
                  <h3 className="mt-1 text-[16px] font-bold text-slate-900 dark:text-white">
                    Link &amp; Mã QR Zalo — {shareModalHw.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModalHw(null)}
                  className="rounded-[6px] p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body: Part A + Part B */}
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {/* PHẦN A — LINK & MÃ QR CHUNG CỦA BÀI GIAO */}
                <div className="rounded-[8px] border border-[#136F63]/30 bg-[#F8FAFC] p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5 dark:border-slate-700">
                    <div>
                      <h4 className="text-[14px] font-bold text-[#136F63] dark:text-emerald-400">
                        Phần A — Link &amp; Mã QR chung của bài giao
                      </h4>
                      <p className="text-[12px] text-slate-500">
                        Dùng để dán vào nhóm Zalo lớp hoặc chiếu lên bảng tương tác cho học sinh quét vào thẳng bài tập.
                      </p>
                    </div>
                    <span className="rounded-[6px] bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 shadow-2xs dark:bg-slate-900 dark:text-slate-200">
                      Đối tượng: <strong>{shareModalHw.targetLabel}</strong>
                    </span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-1 items-center gap-4 md:grid-cols-12">
                    {/* Crisp Real QR Code Image */}
                    <div className="flex flex-col items-center justify-center md:col-span-4">
                      <div className="flex flex-col items-center rounded-[8px] border-2 border-[#136F63] bg-white p-3 shadow-xs">
                        {generalQrDataUrl ? (
                          <img
                            src={generalQrDataUrl}
                            alt={`QR Code ${shareModalHw.pinCode}`}
                            className="h-40 w-40 object-contain"
                          />
                        ) : (
                          <div className="flex h-40 w-40 items-center justify-center">
                            <QrCode className="h-24 w-24 text-slate-400" />
                          </div>
                        )}
                        <span className="mt-1 font-mono text-[12px] font-bold tracking-wider text-[#136F63]">
                          PIN: {shareModalHw.pinCode}
                        </span>
                      </div>
                    </div>

                    {/* Direct Link & Action Buttons */}
                    <div className="space-y-3 md:col-span-8">
                      <div>
                        <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                          Đường dẫn trực tiếp vào bài tập (?assignmentId=...&amp;pin=...):
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={generalLink}
                            className="h-9 flex-1 rounded-[6px] border border-[#CBD5E1] bg-white px-3 font-mono text-[12px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(generalLink);
                              showToast('Đã sao chép Link chung của bài tập!');
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#0F594F]"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Sao chép Link</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadQrPng(
                              generalLink,
                              `QR_BaiTap_${shareModalHw.pinCode}.png`,
                              shareModalHw.title,
                              `Đối tượng: ${shareModalHw.targetLabel} | Mã PIN: ${shareModalHw.pinCode}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#136F63] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#136F63] shadow-2xs hover:bg-[#DCFCE7]/50 dark:bg-slate-900 dark:text-emerald-300"
                        >
                          <Download className="h-4 w-4" />
                          <span>Tải ảnh Mã QR (.png)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(
                              `[BÀI TẬP VỀ NHÀ] ${shareModalHw.title}\n• Đối tượng: ${shareModalHw.targetLabel}\n• Mã PIN: ${shareModalHw.pinCode}\n• Hạn nộp: ${new Date(
                                shareModalHw.dueDate
                              ).toLocaleString('vi-VN')}\n• Link vào thẳng bài tập: ${generalLink}`
                            );
                            showToast('Đã sao chép trọn bộ Tin nhắn & Link chung để dán vào Zalo lớp!');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#0369A1] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-2xs hover:bg-[#075985]"
                        >
                          <MessageSquareShare className="h-4 w-4" />
                          <span>Sao chép Tin nhắn + Link gửi Zalo lớp</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PHẦN B — LINK & MÃ QR ĐỊNH DANH RIÊNG CHO TỪNG HỌC SINH ĐƯỢC GIAO */}
                <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
                    <div>
                      <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">
                        Phần B — Link &amp; Mã QR định danh riêng cho từng học sinh được giao ({targetStudentRows.length} học sinh)
                      </h4>
                      <p className="text-[12px] text-slate-500">
                        Mỗi học sinh có một đường link &amp; mã QR cá nhân riêng (tự động điền sẵn Mã HS, Họ và tên, Lớp khi học sinh mở link).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const msg = buildZaloPersonalizedLinksMessage({
                          homework: shareModalHw,
                          students: targetStudentRows,
                          teacherName: teacherDisplayName,
                        });
                        navigator.clipboard?.writeText(msg);
                        showToast(
                          `Đã sao chép toàn bộ danh sách ${targetStudentRows.length} Link định danh riêng để gửi Zalo!`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-xs hover:bg-[#0F594F]"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Sao chép toàn bộ danh sách Link gửi Zalo</span>
                    </button>
                  </div>

                  {/* Inline Personal QR Preview Card when teacher clicks "Xem QR" on a student */}
                  {previewStudentQr && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border-2 border-[#136F63] bg-[#DCFCE7]/30 p-3.5 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-3.5">
                        <img
                          src={previewStudentQr.qrDataUrl}
                          alt={previewStudentQr.fullName}
                          className="h-28 w-28 rounded-[6px] border border-[#136F63] bg-white p-1.5"
                        />
                        <div>
                          <span className="rounded bg-[#136F63] px-2 py-0.5 text-[11px] font-bold text-white">
                            Mã QR Định Danh Cá Nhân
                          </span>
                          <div className="mt-1 text-[14px] font-bold text-slate-900 dark:text-white">
                            {previewStudentQr.fullName} — Lớp {previewStudentQr.className}
                          </div>
                          <div className="font-mono text-[12px] font-semibold text-[#136F63]">
                            Mã học sinh: {previewStudentQr.studentCode}
                          </div>
                          <div className="mt-1 max-w-md truncate font-mono text-[11px] text-slate-500">
                            {previewStudentQr.link}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadQrPng(
                              previewStudentQr.link,
                              `QR_${previewStudentQr.studentCode}_${shareModalHw.pinCode}.png`,
                              `${previewStudentQr.fullName} (${previewStudentQr.studentCode} - ${previewStudentQr.className})`,
                              `Bài tập: ${shareModalHw.title}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0F594F]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Tải ảnh QR cá nhân (.png)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewStudentQr(null)}
                          className="rounded-[6px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quick filter if many students */}
                  {targetStudentRows.length > 5 && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="relative max-w-xs flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={shareStudentSearch}
                          onChange={(e) => setShareStudentSearch(e.target.value)}
                          placeholder="Tìm tên hoặc mã HS trong danh sách được giao..."
                          className="h-8 w-full rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] pr-3 pl-8 text-[12px] focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <span className="text-[12px] text-slate-500">
                        Hiển thị {filteredStudentRows.length}/{targetStudentRows.length} học sinh
                      </span>
                    </div>
                  )}

                  {/* Personalized Student Links & QR Table */}
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-[6px] border border-[#E2E8F0] dark:border-slate-800">
                    <table className="w-full border-collapse text-left text-[12.5px]">
                      <thead className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F1F5F9] text-[11.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        <tr>
                          <th className="w-12 px-2.5 py-2 text-center">STT</th>
                          <th className="w-28 px-2.5 py-2">Mã HS</th>
                          <th className="w-44 px-2.5 py-2">Họ và tên (Lớp)</th>
                          <th className="px-2.5 py-2">Đường link định danh riêng</th>
                          <th className="w-52 px-2.5 py-2 text-right">Thao tác Link / QR cá nhân</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                        {filteredStudentRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-2.5 py-2 text-center font-mono text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="px-2.5 py-2 font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {row.studentCode}
                            </td>
                            <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-white">
                              {row.fullName}{' '}
                              <span className="text-[11px] font-normal text-slate-500">
                                ({row.className})
                              </span>
                            </td>
                            <td className="max-w-[240px] truncate px-2.5 py-2 font-mono text-[11.5px] text-[#0369A1] dark:text-sky-400">
                              {row.personalLink}
                            </td>
                            <td className="px-2.5 py-2 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(row.personalLink);
                                    showToast(`Đã sao chép Link định danh của em ${row.fullName}!`);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-[5px] border border-[#CBD5E1] bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Link</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const qrUrl = await QRCode.toDataURL(row.personalLink, {
                                      width: 320,
                                      margin: 2,
                                      color: { dark: '#0F172A', light: '#FFFFFF' },
                                    });
                                    setPreviewStudentQr({
                                      studentCode: row.studentCode,
                                      fullName: row.fullName,
                                      className: row.className,
                                      link: row.personalLink,
                                      qrDataUrl: qrUrl,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 rounded-[5px] border border-[#136F63]/40 bg-[#DCFCE7]/50 px-2 py-1 text-[11.5px] font-semibold text-[#136F63] hover:bg-[#DCFCE7] dark:bg-emerald-950/50 dark:text-emerald-300"
                                >
                                  <QrCode className="h-3 w-3" />
                                  <span>Xem / Tải QR</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-[#E2E8F0] px-5 py-3 dark:border-slate-800">
                <span className="text-[12px] text-slate-500">
                  Mẹo: Giáo viên có thể gửi Link chung cho cả lớp hoặc gửi danh sách Link định danh riêng cho nhóm học sinh được chọn.
                </span>
                <button
                  type="button"
                  onClick={() => setShareModalHw(null)}
                  className="rounded-[6px] bg-slate-800 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-700"
                >
                  Đóng cửa sổ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: GỬI NHẮC NHỞ NHANH QUA ZALO (LỌC DANH SÁCH CHƯA NỘP + TIN NHẮN MẪU) */}
      {zaloModalHw && (() => {
        const targetRoster = getTargetRosterForHomework(zaloModalHw, effectiveClassroomStore);
        const hwSubs = homeworkSubmissions.filter((s) => s.homeworkId === zaloModalHw.id);
        const submittedStudents = new Set(
          hwSubs.map((s) => (s.studentCode || s.studentName).trim().toLowerCase())
        );
        const unsubmittedStudents = targetRoster.filter(
          (stu) =>
            !submittedStudents.has(stu.studentCode.trim().toLowerCase()) &&
            !submittedStudents.has(stu.fullName.trim().toLowerCase()) &&
            !hwSubs.some((s) => s.studentId === stu.id)
        );
        const zaloTemplateText = buildZaloHomeworkReminderMessage({
          homework: zaloModalHw,
          unsubmittedStudents,
          submittedCount: hwSubs.length,
          totalTargetCount: Math.max(targetRoster.length, hwSubs.length),
          teacherName: teacherDisplayName,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-2xl rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <MessageSquareShare className="h-5 w-5 text-[#136F63]" />
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                      Gửi Nhắc Nhở Nhanh Qua Zalo (Tự động lọc HS chưa nộp)
                    </h3>
                    <p className="text-[12px] text-slate-500">
                      Sao chép danh sách chưa nộp kèm lời nhắc chuyên nghiệp để dán ngay vào nhóm
                      Zalo lớp / phụ huynh
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setZaloModalHw(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <span>
                    Đã phát hiện <strong>{unsubmittedStudents.length} học sinh</strong> chưa nộp bài
                    tập này.
                  </span>
                  <span className="font-mono text-[12px] font-semibold">
                    Hạn nộp: {new Date(zaloModalHw.dueDate).toLocaleString('vi-VN')}
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                    Nội dung tin nhắn mẫu gửi nhóm Zalo Lớp / Phụ huynh:
                  </label>
                  <textarea
                    readOnly
                    rows={11}
                    value={zaloTemplateText}
                    className="mt-1 w-full rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] p-3 font-mono text-[12.5px] leading-relaxed text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setZaloModalHw(null)}
                    className="rounded-[6px] border border-[#CBD5E1] px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(zaloTemplateText);
                      showToast(
                        `Đã sao chép danh sách ${unsubmittedStudents.length} HS chưa nộp & lời nhắc Zalo!`
                      );
                    }}
                    className="inline-flex items-center gap-2 rounded-[6px] bg-[#136F63] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-xs hover:bg-[#0F594F]"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Sao chép danh sách chưa nộp &amp; Lời nhắc Zalo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: XEM CHI TIẾT, CHẤM BÀI TỰ LUẬN & ĐỒNG BỘ SỔ ĐIỂM SMAS */}
      {detailGradingHw && (() => {
        const targetRoster = getTargetRosterForHomework(detailGradingHw, effectiveClassroomStore);
        const hwSubs = homeworkSubmissions.filter((s) => s.homeworkId === detailGradingHw.id);
        const activeSub = hwSubs.find((s) => s.id === activeGradingSubId) || hwSubs[0] || null;
        const unsubmittedRoster = targetRoster.filter(
          (stu) =>
            !hwSubs.some(
              (s) =>
                s.studentId === stu.id ||
                s.studentCode.trim().toLowerCase() === stu.studentCode.trim().toLowerCase() ||
                s.studentName.trim().toLowerCase() === stu.fullName.trim().toLowerCase()
            )
        );

        return (
          <SmartboardViewport
            isModal
            onCloseModal={() => setDetailGradingHw(null)}
            maxWidthClass="max-w-6xl"
            title={`${detailGradingHw.title} — Bảng Chấm Bài & Chuyển Điểm SMAS`}
            subtitle={`Đối tượng: ${detailGradingHw.targetLabel} · Mã PIN: ${detailGradingHw.pinCode} · Đã nộp: ${hwSubs.length}/${Math.max(targetRoster.length, hwSubs.length)} HS`}
            bodyClassName="p-5"
          >
            <div className="space-y-4">
              {/* Top Action Bar: Sync to SMAS Gradebook & Export Excel */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-white">
                    Đồng bộ sang Sổ điểm SMAS 4.0:
                  </span>
                  <select
                    value={syncSemester}
                    onChange={(e) => setSyncSemester(Number(e.target.value) as 1 | 2)}
                    className="h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value={1}>Học kỳ I</option>
                    <option value={2}>Học kỳ II</option>
                  </select>
                  <select
                    value={syncTargetCol}
                    onChange={(e) =>
                      setSyncTargetCol(e.target.value as 'auto' | GradeColumnTarget)
                    }
                    className="h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#136F63] dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="auto">Tự động điền cột ĐĐG TX trống tiếp theo</option>
                    <option value="tx1">Cột ĐĐG TX 1</option>
                    <option value="tx2">Cột ĐĐG TX 2</option>
                    <option value="tx3">Cột ĐĐG TX 3</option>
                    <option value="tx4">Cột ĐĐG TX 4</option>
                    <option value="tx5">Cột ĐĐG TX 5</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const count = await onSyncHomeworkToSmas(
                        detailGradingHw,
                        hwSubs,
                        syncSemester,
                        syncTargetCol
                      );
                      showToast(
                        `Đã chuyển thành công điểm của ${count} học sinh sang Sổ điểm SMAS (HK${syncSemester})!`
                      );
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#0F594F]"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Chuyển điểm sang Sổ điểm SMAS</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZaloModalHw(detailGradingHw)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-amber-300 bg-amber-50 px-3 text-[12.5px] font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <MessageSquareShare className="h-3.5 w-3.5" />
                    <span>Nhắc Zalo ({unsubmittedRoster.length} HS chưa nộp)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportHomeworkGradesToExcel(
                        detailGradingHw,
                        targetRoster,
                        hwSubs,
                        masterData.profile.schoolName
                      )
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white px-3 text-[12.5px] font-semibold text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#136F63]" />
                    <span>Xuất bảng điểm Excel</span>
                  </button>
                </div>
              </div>

              {/* 2-Column Split: Left = Student Submissions Table, Right = Essay Image Viewer & Grading Form */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left 7/12: Submissions & Unsubmitted Roster */}
                <div className="space-y-3 lg:col-span-7">
                  <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="bg-[#136F63] text-[12px] font-semibold text-white">
                          <th className="px-3 py-2.5">Học sinh · Lớp</th>
                          <th className="px-2.5 py-2.5 text-right">
                            TN (/{detailGradingHw.objectiveWeightPoints})
                          </th>
                          <th className="px-2.5 py-2.5 text-right">
                            Tự luận (/{detailGradingHw.essayWeightPoints})
                          </th>
                          <th className="px-2.5 py-2.5 text-right">Tổng (/10)</th>
                          <th className="px-2.5 py-2.5 text-center">SMAS</th>
                          <th className="px-3 py-2.5 text-right">Chấm bài</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                        {hwSubs.map((sub) => {
                          const isSelected = activeSub?.id === sub.id;
                          return (
                            <tr
                              key={sub.id}
                              onClick={() => selectSubmissionForGrading(sub)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#DCFCE7]/50 dark:bg-emerald-950/40'
                                  : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-slate-900 dark:text-white">
                                  {sub.studentName}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  Lớp {sub.studentClass} · {sub.studentCode}
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                                {sub.objectiveScore.toFixed(2)}
                              </td>
                              <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                                {sub.essayScore !== null ? (
                                  <span className="font-semibold text-[#0369A1]">
                                    {sub.essayScore.toFixed(2)}
                                  </span>
                                ) : detailGradingHw.essayWeightPoints > 0 ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                                    Chờ chấm
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-right font-mono text-[14px] font-bold text-[#136F63] tabular-nums dark:text-emerald-400">
                                {sub.totalScore.toFixed(2)}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                {sub.syncedToSmas ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-[#DCFCE7] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#15803D]">
                                    <Check className="h-3 w-3" />
                                    {(sub.syncedColumn || 'TX').toUpperCase()}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Chưa</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectSubmissionForGrading(sub);
                                  }}
                                  className="rounded-[5px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]"
                                >
                                  Chấm / Xem
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Unsubmitted collapse summary */}
                  {unsubmittedRoster.length > 0 && (
                    <div className="rounded-[8px] border border-red-200 bg-red-50/40 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                      <div className="text-[12.5px] font-semibold text-red-800 dark:text-red-300">
                        Danh sách học sinh CHƯA NỘP BÀI ({unsubmittedRoster.length} em):
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {unsubmittedRoster.map((stu) => (
                          <span
                            key={stu.id}
                            className="rounded bg-white px-2 py-0.5 text-[11.5px] font-medium text-red-700 shadow-2xs dark:bg-slate-900 dark:text-red-300"
                          >
                            {stu.fullName} ({stu.studentCode})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 5/12: Active Student Grading Panel (Essay Photos + Teacher Feedback) */}
                <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                  {activeSub ? (
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5 dark:border-slate-800">
                        <div>
                          <div className="text-[14px] font-bold text-slate-900 dark:text-white">
                            Bài làm của: {activeSub.studentName}
                          </div>
                          <div className="text-[12px] text-slate-500">
                            Lớp {activeSub.studentClass} · Mã HS: {activeSub.studentCode} · Nộp lúc{' '}
                            {new Date(activeSub.submittedAt).toLocaleString('vi-VN')}
                          </div>
                        </div>
                        <div className="rounded-[6px] bg-[#DCFCE7] px-3 py-1 text-right">
                          <div className="text-[10px] font-bold text-[#15803D] uppercase">
                            Tổng điểm
                          </div>
                          <div className="font-mono text-[16px] font-bold text-[#136F63]">
                            {activeSub.totalScore.toFixed(2)} / 10
                          </div>
                        </div>
                      </div>

                      {/* Objective Auto-graded Summary */}
                      <div className="rounded-[6px] bg-[#F8FAFC] p-3 text-[12.5px] dark:bg-slate-800/50">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          1. Phần Trắc nghiệm 3 phần (Hệ thống tự động chấm):{' '}
                          <strong className="font-mono text-[#136F63]">
                            {activeSub.objectiveScore.toFixed(2)} /{' '}
                            {detailGradingHw.objectiveWeightPoints} điểm
                          </strong>
                        </div>
                        <div className="mt-1 font-mono text-[11.5px] text-slate-500">
                          Phương án chọn Phần I:{' '}
                          {Object.entries(activeSub.answersPayload.part1 || {})
                            .map(([k, v]) => `C${Number(k) + 1}:${v}`)
                            .join(', ') || 'Không có'}
                        </div>
                      </div>

                      {/* Student Essay Text & Uploaded Photos */}
                      <div className="space-y-2">
                        <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
                          2. Bài làm Tự luận &amp; Ảnh chụp vở của Học sinh:
                        </div>
                        {activeSub.essayTextAnswer && (
                          <div className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[12.5px] text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            {activeSub.essayTextAnswer}
                          </div>
                        )}
                        {activeSub.essayImages && activeSub.essayImages.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {activeSub.essayImages.map((imgUrl, idx) => (
                              <a
                                key={idx}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-[6px] border border-[#CBD5E1] bg-slate-50 p-1"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Ảnh bài làm ${idx + 1}`}
                                  className="max-h-56 w-full rounded object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[6px] border border-dashed border-slate-300 p-3 text-center text-[12px] text-slate-400 dark:border-slate-700">
                            Học sinh không đính kèm ảnh chụp tự luận (hoặc đã trình bày trực tiếp ở
                            trên).
                          </div>
                        )}
                      </div>

                      {/* Teacher Essay Score & Feedback Form */}
                      <div className="space-y-2.5 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
                        {detailGradingHw.essayWeightPoints > 0 && (
                          <div>
                            <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                              Chấm điểm phần Tự luận (Thang 0 – {detailGradingHw.essayWeightPoints}{' '}
                              điểm)
                            </label>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max={detailGradingHw.essayWeightPoints}
                              value={draftEssayScore}
                              onChange={(e) => setDraftEssayScore(e.target.value)}
                              placeholder={`Nhập điểm tự luận (tối đa ${detailGradingHw.essayWeightPoints}đ)...`}
                              className="mt-1 h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] font-bold text-[#136F63] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                            Nhận xét của Giáo viên (Hiển thị trên Cổng Học sinh &amp; Sổ điểm)
                          </label>
                          <textarea
                            rows={3}
                            value={draftFeedback}
                            onChange={(e) => setDraftFeedback(e.target.value)}
                            placeholder="Ghi nhận xét chi tiết bài làm của học sinh..."
                            className="mt-1 w-full rounded-[6px] border border-[#CBD5E1] bg-white p-2.5 text-[13px] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveSingleStudentGrading(activeSub, detailGradingHw)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F]"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Lưu Điểm &amp; Nhận Xét</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await handleSaveSingleStudentGrading(activeSub, detailGradingHw);
                              const count = await onSyncHomeworkToSmas(
                                detailGradingHw,
                                [
                                  {
                                    ...activeSub,
                                    essayScore:
                                      detailGradingHw.essayWeightPoints > 0 &&
                                      draftEssayScore.trim() !== ''
                                        ? Number(draftEssayScore.replace(',', '.')) || 0
                                        : activeSub.essayScore,
                                    totalScore: Math.min(
                                      10,
                                      Number(
                                        (
                                          activeSub.objectiveScore +
                                          (Number(draftEssayScore.replace(',', '.')) ||
                                            activeSub.essayScore ||
                                            0)
                                        ).toFixed(2)
                                      )
                                    ),
                                  },
                                ],
                                syncSemester,
                                syncTargetCol
                              );
                              if (count > 0) {
                                showToast(
                                  `Đã chấm & chuyển điểm em ${activeSub.studentName} sang Sổ điểm SMAS!`
                                );
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-[#136F63] bg-[#DCFCE7]/50 px-3 py-2 text-[12.5px] font-semibold text-[#136F63] hover:bg-[#DCFCE7]"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span>Lưu &amp; Chuyển SMAS</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-[13px] text-slate-400">
                      Chọn một học sinh ở bảng bên trái để xem ảnh bài làm tự luận và chấm điểm.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SmartboardViewport>
        );
      })()}
    </div>
  );
};
