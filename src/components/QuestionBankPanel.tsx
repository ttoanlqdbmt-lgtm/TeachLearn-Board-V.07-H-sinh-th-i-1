import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileCode2,
  FileDown,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { BankPartType, BankQuestion, ExamPaper, Part2Statement } from '../types/eduplan';
import { MathText } from './MathText';
import { ExamDiagram } from './ExamDiagrams';
import { SmartboardViewport } from './SmartboardViewport';
import { exportExamToDocx } from '../utils/docxExporter';
import {
  formatMcqOptionDisplay,
  normalizeSolutionStep,
  normalizeSolutionSteps,
  stripAnswerPrefix,
} from '../utils/solutionFormat';
import {
  applyTableFormatModeToBank,
  BankExportTableStyle,
  BankTableExportSettings,
  BankTableFormatMode,
  build22BgdExamFromBank,
  buildExamFromSelectedBankQuestions,
  buildQuestionFingerprint,
  convertTableRowsToMarkdown,
  deleteBankQuestion,
  deleteBankQuestionsBulk,
  exportBankToJsonFile,
  exportBankToMarkdownFile,
  extractTextFromDocxArrayBuffer,
  findDuplicateQuestionIds,
  isComplexTableStructure,
  KNTT_CATALOG_CHAPTERS,
  loadBankTableExportSettings,
  lookupKNTTMeta,
  normalizeAndDeduplicateBank,
  normalizeSignature,
  parseBankFromJsonText,
  parseExamTextToBankQuestions,
  parseTagMeta,
  renderTableToPngBase64,
  rescanBankQuestions,
  saveBankQuestionsBulk,
  saveBankTableExportSettings,
  updateBankQuestion,
} from '../utils/questionBankDb';

interface QuestionBankPanelProps {
  bankItems: BankQuestion[];
  onChangeBankItems: (items: BankQuestion[]) => void;
  currentExam: ExamPaper;
  onSelectExam22: (exam: ExamPaper) => void;
}

const LEVEL_STYLES: Record<'NB' | 'TH' | 'VD' | 'VDC', string> = {
  NB: 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  TH: 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  VD: 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  VDC: 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};

const PART_BADGE_STYLES: Record<BankPartType, string> = {
  part1: 'border-[#99F6E4] bg-[#F0FDFA] text-[#136F63] dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  part2: 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  part3: 'border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
};

export const QuestionBankPanel: React.FC<QuestionBankPanelProps> = ({
  bankItems,
  onChangeBankItems,
  currentExam,
  onSelectExam22,
}) => {
  // 5-level intelligent filters + search
  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [chapterFilter, setChapterFilter] = useState<string>('all'); // e.g. 'all' or '11:C1' (grade:code) or 'C1'
  const [lessonFilter, setLessonFilter] = useState<string>('all'); // e.g. 'all' or '11:C1:B4'
  const [levelFilter, setLevelFilter] = useState<'all' | 'NB' | 'TH' | 'VD' | 'VDC'>('all');
  const [partFilter, setPartFilter] = useState<'all' | BankPartType>('all');
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'involved' | 'extra_only'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pagination for main bank list & import preview
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [previewPage, setPreviewPage] = useState(1);
  const PREVIEW_PAGE_SIZE = 20;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim().toLowerCase());
    }, 150);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // Selection, expansion & status
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add / Edit Question Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPartType, setNewPartType] = useState<BankPartType>('part1');
  const [newTag, setNewTag] = useState('[12-C1-B1-TH]');
  const [newStem, setNewStem] = useState('');
  const [newOpts, setNewOpts] = useState<[string, string, string, string]>(['', '', '', '']);
  const [newCorrectIdx, setNewCorrectIdx] = useState<0 | 1 | 2 | 3>(0);
  const [newStatements, setNewStatements] = useState<[string, string, string, string]>(['', '', '', '']);
  const [newStmtTruth, setNewStmtTruth] = useState<[boolean, boolean, boolean, boolean]>([true, true, false, false]);
  const [newPart3Ans, setNewPart3Ans] = useState('');
  const [newSolution, setNewSolution] = useState('');

  // Import Modal (Word / Folder / Drive)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'files' | 'folder' | 'drive'>('files');
  const [driveUrl, setDriveUrl] = useState('');
  const [rawPasteText, setRawPasteText] = useState('');
  const [importGrade, setImportGrade] = useState<'10' | '11' | '12'>('12');
  const [parsedPreviewItems, setParsedPreviewItems] = useState<BankQuestion[] | null>(null);

  // Interactive Mock Test Modal (supports 22-question BGD or custom selected set)
  const [quickQuizExam, setQuickQuizExam] = useState<ExamPaper | null>(null);
  const [quizP1, setQuizP1] = useState<Record<number, number>>({});
  const [quizP2, setQuizP2] = useState<Record<string, boolean | null>>({});
  const [quizP3, setQuizP3] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Advanced Table & Export Format Settings
  const [showAdvancedTableSettings, setShowAdvancedTableSettings] = useState(false);
  const [tableSettings, setTableSettings] = useState<BankTableExportSettings>(() =>
    loadBankTableExportSettings()
  );
  const [questionTableViewOverride, setQuestionTableViewOverride] = useState<
    Record<string, 'native' | 'markdown' | 'image'>
  >({});

  const SAMPLE_PREVIEW_TABLE_ROWS = useMemo(
    () => [
      ['Nhóm thời gian (phút)', '[30; 50)', '[50; 70)', '[70; 90)', '[90; 110)', '[110; 130)'],
      ['Số học sinh ($n = 40$)', '6', '10', '12', '8', '4'],
    ],
    []
  );
  const samplePreviewImage = useMemo(
    () => renderTableToPngBase64(SAMPLE_PREVIEW_TABLE_ROWS, tableSettings.imageDpiScale),
    [SAMPLE_PREVIEW_TABLE_ROWS, tableSettings.imageDpiScale]
  );

  const handleUpdateTableSettings = (patch: Partial<BankTableExportSettings>) => {
    setTableSettings((prev) => {
      const next = { ...prev, ...patch };
      saveBankTableExportSettings(next);
      return next;
    });
  };

  const handleApplyTableSettingsToWholeBank = async () => {
    setBusy(true);
    try {
      const { items, convertedCount } = await applyTableFormatModeToBank(bankItems, tableSettings);
      onChangeBankItems(items);
      setQuestionTableViewOverride({});
      const modeName =
        tableSettings.tableFormatMode === 'keep_native'
          ? 'Giữ nguyên cấu trúc bảng gốc'
          : tableSettings.tableFormatMode === 'markdown'
          ? 'Định dạng bảng Markdown'
          : tableSettings.tableFormatMode === 'image_png'
          ? 'Hình ảnh PNG độ nét cao'
          : 'Tự động chuyển bảng phức tạp sang Image/Markdown';
      setStatusMsg(
        `Đã áp dụng chế độ "${modeName}" cho ${convertedCount.toLocaleString('vi-VN')} câu hỏi chứa bảng số liệu trong Kho!`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportMarkdownBank = async () => {
    setBusy(true);
    try {
      const targetList = selectedQuestionsList.length > 0 ? selectedQuestionsList : bankItems;
      await exportBankToMarkdownFile(
        targetList,
        tableSettings,
        selectedQuestionsList.length > 0
          ? `TeachLearnEdu_${selectedQuestionsList.length}Cau_Markdown`
          : 'TeachLearnEdu_ToanBoKho_Markdown'
      );
      setStatusMsg(
        `Đã xuất ${targetList.length.toLocaleString('vi-VN')} câu hỏi ra định dạng Markdown (.md) với cấu hình bảng đã chọn!`
      );
    } finally {
      setBusy(false);
    }
  };

  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  // Dynamic Chapter Options (KNTT Catalog + any extra codes found in bankItems)
  const chapterOptions = useMemo(() => {
    const map = new Map<string, { value: string; grade: string; code: string; label: string }>();

    KNTT_CATALOG_CHAPTERS.forEach((ch) => {
      if (gradeFilter !== 'all' && ch.grade !== gradeFilter) return;
      const val = `${ch.grade}:${ch.code}`;
      map.set(val, {
        value: val,
        grade: ch.grade,
        code: ch.code,
        label: gradeFilter === 'all' ? `Lớp ${ch.grade} · ${ch.title}` : ch.title,
      });
    });

    bankItems.forEach((item) => {
      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return;
      const val = `${item.grade}:${item.chapter.toUpperCase()}`;
      if (!map.has(val)) {
        const meta = lookupKNTTMeta(item.grade, item.chapter, item.lesson);
        map.set(val, {
          value: val,
          grade: item.grade,
          code: item.chapter.toUpperCase(),
          label: gradeFilter === 'all' ? `Lớp ${item.grade} · ${meta.chapterTitle}` : meta.chapterTitle,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.grade !== b.grade) return Number(a.grade) - Number(b.grade);
      return Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, ''));
    });
  }, [bankItems, gradeFilter]);

  // Dynamic Lesson Options (filtered by Grade and Chapter)
  const lessonOptions = useMemo(() => {
    const map = new Map<string, { value: string; grade: string; chapter: string; code: string; label: string }>();

    KNTT_CATALOG_CHAPTERS.forEach((ch) => {
      if (gradeFilter !== 'all' && ch.grade !== gradeFilter) return;
      const chVal = `${ch.grade}:${ch.code}`;
      if (chapterFilter !== 'all' && chVal !== chapterFilter) return;

      ch.lessons.forEach((ls) => {
        const val = `${ch.grade}:${ch.code}:${ls.code}`;
        map.set(val, {
          value: val,
          grade: ch.grade,
          chapter: ch.code,
          code: ls.code,
          label: chapterFilter === 'all' ? `Lớp ${ch.grade} · ${ls.title}` : ls.title,
        });
      });
    });

    bankItems.forEach((item) => {
      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return;
      const chCode = item.chapter.toUpperCase();
      const chVal = `${item.grade}:${chCode}`;
      if (chapterFilter !== 'all' && chVal !== chapterFilter) return;

      const lCode = item.lesson.toUpperCase();
      const val = `${item.grade}:${chCode}:${lCode}`;
      if (!map.has(val)) {
        const meta = lookupKNTTMeta(item.grade, chCode, lCode);
        map.set(val, {
          value: val,
          grade: item.grade,
          chapter: chCode,
          code: lCode,
          label: chapterFilter === 'all' ? `Lớp ${item.grade} · ${meta.lessonTitle}` : meta.lessonTitle,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.grade !== b.grade) return Number(a.grade) - Number(b.grade);
      const chDiff = Number(a.chapter.replace(/\D/g, '')) - Number(b.chapter.replace(/\D/g, ''));
      if (chDiff !== 0) return chDiff;
      return Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, ''));
    });
  }, [bankItems, gradeFilter, chapterFilter]);

  // Keep cascading filters valid when parent filter changes
  const handleGradeFilterChange = (nextGrade: 'all' | '10' | '11' | '12') => {
    setGradeFilter(nextGrade);
    if (nextGrade !== 'all') {
      if (chapterFilter !== 'all' && !chapterFilter.startsWith(`${nextGrade}:`)) {
        setChapterFilter('all');
      }
      if (lessonFilter !== 'all' && !lessonFilter.startsWith(`${nextGrade}:`)) {
        setLessonFilter('all');
      }
    }
  };

  const handleChapterFilterChange = (nextChapter: string) => {
    setChapterFilter(nextChapter);
    if (nextChapter !== 'all') {
      const [g] = nextChapter.split(':');
      if (gradeFilter === 'all' && (g === '10' || g === '11' || g === '12')) {
        // leave gradeFilter as 'all' or sync? Keep gradeFilter intact unless lesson mismatches
      }
      if (lessonFilter !== 'all' && !lessonFilter.startsWith(`${nextChapter}:`)) {
        setLessonFilter('all');
      }
    }
  };

  // Fast O(N) duplicate analysis & curriculum distribution stats across the entire bank
  const duplicateAnalysis = useMemo(() => findDuplicateQuestionIds(bankItems), [bankItems]);

  const bankDistribution = useMemo(() => {
    let g10 = 0;
    let g11 = 0;
    let g12 = 0;
    let nb = 0;
    let th = 0;
    let vd = 0;
    let vdc = 0;
    for (let i = 0; i < bankItems.length; i++) {
      const item = bankItems[i];
      if (item.grade === '10') g10++;
      else if (item.grade === '11') g11++;
      else g12++;

      if (item.level === 'NB') nb++;
      else if (item.level === 'TH') th++;
      else if (item.level === 'VD') vd++;
      else if (item.level === 'VDC') vdc++;
    }
    return { g10, g11, g12, nb, th, vd, vdc };
  }, [bankItems]);

  // Duplicate analysis for Import Preview Modal
  const previewDuplicateInfo = useMemo(() => {
    if (!parsedPreviewItems || parsedPreviewItems.length === 0) {
      return { statusByIdx: [] as ('new' | 'dup_bank' | 'dup_file')[], newCount: 0, dupBankCount: 0, dupFileCount: 0 };
    }
    const bankFpSet = new Set<string>();
    const bankStemSet = new Set<string>();
    for (let i = 0; i < bankItems.length; i++) {
      const q = bankItems[i];
      const fp = buildQuestionFingerprint(q);
      if (fp) bankFpSet.add(fp);
      const stemOnly = `${q.partType}:${normalizeSignature(q.stem)}`;
      if (stemOnly.length > 45) bankStemSet.add(stemOnly);
    }

    const fileFpSet = new Set<string>();
    const statusByIdx: ('new' | 'dup_bank' | 'dup_file')[] = [];
    let newCount = 0;
    let dupBankCount = 0;
    let dupFileCount = 0;

    for (let i = 0; i < parsedPreviewItems.length; i++) {
      const item = parsedPreviewItems[i];
      const fp = buildQuestionFingerprint(item);
      const stemOnly = `${item.partType}:${normalizeSignature(item.stem)}`;
      const inBank =
        Boolean(fp && bankFpSet.has(fp)) ||
        (stemOnly.length > 45 &&
          !/hình vẽ|bảng biến thiên|đồ thị như|bảng số liệu|khẳng định nào|mệnh đề nào/i.test(item.stem) &&
          bankStemSet.has(stemOnly));

      if (inBank) {
        statusByIdx.push('dup_bank');
        dupBankCount++;
      } else if (fp && fileFpSet.has(fp)) {
        statusByIdx.push('dup_file');
        dupFileCount++;
      } else {
        if (fp) fileFpSet.add(fp);
        statusByIdx.push('new');
        newCount++;
      }
    }

    return { statusByIdx, newCount, dupBankCount, dupFileCount };
  }, [parsedPreviewItems, bankItems]);

  const handleResetFilters = () => {
    setGradeFilter('all');
    setChapterFilter('all');
    setLessonFilter('all');
    setLevelFilter('all');
    setPartFilter('all');
    setDuplicateFilter('all');
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const filteredQuestions = useMemo(() => {
    const q = debouncedSearch;
    return bankItems.filter((item) => {
      if (duplicateFilter === 'involved' && !duplicateAnalysis.allInvolvedIds.has(item.id)) return false;
      if (duplicateFilter === 'extra_only' && !duplicateAnalysis.duplicateIds.has(item.id)) return false;
      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return false;
      if (chapterFilter !== 'all') {
        const chKey = `${item.grade}:${item.chapter.toUpperCase()}`;
        if (chKey !== chapterFilter) return false;
      }
      if (lessonFilter !== 'all') {
        const lsKey = `${item.grade}:${item.chapter.toUpperCase()}:${item.lesson.toUpperCase()}`;
        if (lsKey !== lessonFilter) return false;
      }
      if (levelFilter !== 'all' && item.level !== levelFilter) return false;
      if (partFilter !== 'all' && item.partType !== partFilter) return false;

      if (q) {
        if (item.stem.toLowerCase().includes(q) || item.tag.toLowerCase().includes(q)) {
          return true;
        }
        const meta = lookupKNTTMeta(item.grade, item.chapter, item.lesson);
        const hay = `${meta.chapterTitle} ${meta.lessonTitle} ${item.source || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    bankItems,
    duplicateFilter,
    duplicateAnalysis,
    gradeFilter,
    chapterFilter,
    lessonFilter,
    levelFilter,
    partFilter,
    debouncedSearch,
  ]);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [gradeFilter, chapterFilter, lessonFilter, levelFilter, partFilter, duplicateFilter, debouncedSearch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const paginatedQuestions = useMemo(
    () => filteredQuestions.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredQuestions, pageStartIndex, pageSize]
  );

  // Prune stale selectedIds if items are deleted
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const existingIds = new Set(bankItems.map((b) => b.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [bankItems]);

  // Select-all checkbox indeterminate state (O(1) short-circuit when selectedIds is empty)
  const { allFilteredSelected, someFilteredSelected } = useMemo(() => {
    if (selectedIds.size === 0 || filteredQuestions.length === 0) {
      return { allFilteredSelected: false, someFilteredSelected: false };
    }
    let selectedInFiltered = 0;
    for (let i = 0; i < filteredQuestions.length; i++) {
      if (selectedIds.has(filteredQuestions[i].id)) {
        selectedInFiltered++;
      }
    }
    const all = selectedInFiltered === filteredQuestions.length;
    const some = selectedInFiltered > 0 && !all;
    return { allFilteredSelected: all, someFilteredSelected: some };
  }, [filteredQuestions, selectedIds]);

  const allPageSelected = useMemo(() => {
    if (selectedIds.size === 0 || paginatedQuestions.length === 0) return false;
    return paginatedQuestions.every((q) => selectedIds.has(q.id));
  }, [paginatedQuestions, selectedIds]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const selectedQuestionsList = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return bankItems.filter((item) => selectedIds.has(item.id));
  }, [bankItems, selectedIds]);

  const selectedStats = useMemo(() => {
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    selectedQuestionsList.forEach((q) => {
      if (q.partType === 'part1') p1++;
      else if (q.partType === 'part2') p2++;
      else p3++;
    });
    return { p1, p2, p3 };
  }, [selectedQuestionsList]);

  const toggleSelectOne = (id: string) => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredQuestions.forEach((q) => next.delete(q.id));
      } else {
        filteredQuestions.forEach((q) => next.add(q.id));
      }
      return next;
    });
  };

  const toggleSelectCurrentPage = () => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedQuestions.forEach((q) => next.delete(q.id));
      } else {
        paginatedQuestions.forEach((q) => next.add(q.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const toggleExpandSolution = (id: string) => {
    setExpandedSolutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Top toolbar handlers
  const handleQuickSelect22 = () => {
    const built = build22BgdExamFromBank(bankItems, currentExam, gradeFilter);
    onSelectExam22(built);
    setStatusMsg(
      `Đã chọn nhanh 22 câu chuẩn BGD (12 TN + 4 Đ/S + 6 TLN) từ kho và nạp sang Tab "2. Xem & Xuất Đề A4" (Mã đề ${built.examCode}).`
    );
  };

  const handleStartQuickTest22 = () => {
    const built = build22BgdExamFromBank(bankItems, currentExam, gradeFilter);
    setQuickQuizExam(built);
    setQuizP1({});
    setQuizP2({});
    setQuizP3({});
    setQuizSubmitted(false);
  };

  const handleRescanBank = async () => {
    setBusy(true);
    try {
      const rescanned = await rescanBankQuestions(bankItems);
      onChangeBankItems(rescanned);
      setStatusMsg(
        `Đã quét nhận diện lại toàn bộ ${rescanned.length.toLocaleString('vi-VN')} câu hỏi và cập nhật thẻ [Lớp-Chương-Bài-Mức độ].`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNormalizeBank = async () => {
    setBusy(true);
    try {
      const { items, removedDuplicates } = await normalizeAndDeduplicateBank(bankItems);
      onChangeBankItems(items);
      setStatusMsg(
        `Đã chuẩn hóa kho câu hỏi (${items.length.toLocaleString('vi-VN')} câu hợp lệ, tự động lọc bỏ ${removedDuplicates} câu trùng lặp).`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = async () => {
    setBusy(true);
    try {
      setStatusMsg(`Đang đóng gói sao lưu ${bankItems.length.toLocaleString('vi-VN')} câu hỏi...`);
      await exportBankToJsonFile(bankItems, 'TeachLearnEdu_KhoCauHoi', (done, total) => {
        if (total > 1000) {
          setStatusMsg(
            `Đang sao lưu kho: ${done.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} câu hỏi...`
          );
        }
      });
      setStatusMsg(
        `Đã sao lưu toàn kho (${bankItems.length.toLocaleString('vi-VN')} câu hỏi) ra tệp .json thành công!`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi xuất tệp sao lưu .json.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseBankFromJsonText(text);
      const { items, added, skippedDuplicates } = await saveBankQuestionsBulk(bankItems, parsed);
      onChangeBankItems(items);
      setStatusMsg(
        `Đã nạp "${file.name}": thêm mới ${added.toLocaleString('vi-VN')} câu hỏi vào Kho Offline IndexedDB (lọc trùng ${skippedDuplicates.toLocaleString('vi-VN')} câu).`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi đọc tệp JSON.');
    } finally {
      setBusy(false);
    }
  };

  const handleFilesOrFolderImport = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const allIncoming: BankQuestion[] = [];
      let processedFiles = 0;

      for (const file of Array.from(fileList)) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.json')) {
          const txt = await file.text();
          allIncoming.push(...parseBankFromJsonText(txt));
          processedFiles++;
        } else if (lower.endsWith('.docx')) {
          const buf = await file.arrayBuffer();
          const extracted = await extractTextFromDocxArrayBuffer(buf);
          allIncoming.push(...parseExamTextToBankQuestions(extracted, file.name, importGrade));
          processedFiles++;
        } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
          const txt = await file.text();
          allIncoming.push(...parseExamTextToBankQuestions(txt, file.name, importGrade));
          processedFiles++;
        }
      }

      if (allIncoming.length === 0) {
        setStatusMsg('Không trích xuất được câu hỏi nào từ các tệp đã chọn (hỗ trợ .docx, .txt, .json).');
        return;
      }

      setPreviewPage(1);
      setParsedPreviewItems(allIncoming);
      setStatusMsg(`Đã trích xuất thành công ${allIncoming.length.toLocaleString('vi-VN')} câu hỏi từ ${processedFiles} tệp (giữ nguyên 100% nội dung gốc). Hãy kiểm tra bản xem trước bên dưới.`);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi nhập dữ liệu từ Word/Thư mục.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedPreviewItems || parsedPreviewItems.length === 0) return;
    setBusy(true);
    try {
      const { items, added, skippedDuplicates } = await saveBankQuestionsBulk(bankItems, parsedPreviewItems);
      onChangeBankItems(items);
      setShowImportModal(false);
      setParsedPreviewItems(null);
      setStatusMsg(
        `Đã thêm thành công ${added} câu hỏi vào Kho (Tự động lọc ${skippedDuplicates} câu trùng). Nội dung giữ nguyên 100% từ file gốc.`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi lưu vào kho.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportDriveOrText = async () => {
    setBusy(true);
    try {
      let textToParse = rawPasteText.trim();
      let sourceLabel = 'Dán văn bản đề thi';

      if (driveUrl.trim()) {
        const res = await fetch('/api/import/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: driveUrl.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải tệp từ Google Drive.');
        }
        sourceLabel = 'Google Drive';
        if (data.kind === 'docx' && data.base64) {
          const bin = atob(data.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          textToParse = await extractTextFromDocxArrayBuffer(bytes.buffer);
        } else {
          textToParse = data.text || '';
        }
      }

      if (!textToParse) {
        throw new Error('Vui lòng nhập liên kết Google Drive công khai hoặc dán nội dung đề thi.');
      }

      const parsed = parseExamTextToBankQuestions(textToParse, sourceLabel, importGrade);
      if (parsed.length === 0) {
        throw new Error('Không tìm thấy câu hỏi hợp lệ. Hãy đảm bảo mỗi câu bắt đầu bằng "Câu 1.", "Câu 2."...');
      }

      setParsedPreviewItems(parsed);
      setStatusMsg(
        `Đã trích xuất nguyên bản ${parsed.length} câu hỏi từ ${sourceLabel}. Hãy kiểm tra bản xem trước trước khi xác nhận lưu vào Kho.`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi nhập từ Drive / văn bản.');
    } finally {
      setBusy(false);
    }
  };

  // Add / Edit Modal handlers
  const openAddQuestionModal = () => {
    setEditingId(null);
    setNewPartType('part1');
    setNewTag('[12-C1-B1-TH]');
    setNewStem('');
    setNewOpts(['', '', '', '']);
    setNewCorrectIdx(0);
    setNewStatements(['', '', '', '']);
    setNewStmtTruth([true, true, false, false]);
    setNewPart3Ans('');
    setNewSolution('');
    setShowAddModal(true);
  };

  const openEditQuestionModal = (q: BankQuestion) => {
    setEditingId(q.id);
    setNewPartType(q.partType);
    setNewTag(q.tag);
    setNewStem(q.stem);
    setNewOpts(q.options ? [...q.options] as [string, string, string, string] : ['', '', '', '']);
    setNewCorrectIdx(q.correctIndex ?? 0);
    if (q.statements) {
      setNewStatements(q.statements.map((s) => s.text) as [string, string, string, string]);
      setNewStmtTruth(q.statements.map((s) => s.isTrue) as [boolean, boolean, boolean, boolean]);
    } else {
      setNewStatements(['', '', '', '']);
      setNewStmtTruth([true, true, false, false]);
    }
    setNewPart3Ans(q.answer || '');
    setNewSolution(
      q.solutionSteps?.map((st) => [st.title, st.leadIn, st.math].filter(Boolean).join('\n')).join('\n\n') || ''
    );
    setShowAddModal(true);
  };

  const handleSaveNewOrEditedQuestion = async () => {
    if (!newStem.trim()) return;
    const meta = parseTagMeta(newTag);
    const now = new Date().toISOString();
    const existing = editingId ? bankItems.find((x) => x.id === editingId) : undefined;

    const item: BankQuestion = {
      id: existing ? existing.id : `manual-${Date.now()}`,
      partType: newPartType,
      tag: newTag.trim() || `[${meta.grade}-${meta.chapter}-${meta.lesson}-${meta.level}]`,
      ...meta,
      stem: newStem.trim(),
      diagram: existing?.diagram,
      image: existing?.image,
      imageUrl: existing?.imageUrl,
      solutionImage: existing?.solutionImage,
      tableData: existing?.tableData,
      source: existing?.source || 'Thêm thủ công',
      updatedAt: now,
    };

    if (newPartType === 'part1') {
      item.options = [
        newOpts[0].trim() || 'Phương án A.',
        newOpts[1].trim() || 'Phương án B.',
        newOpts[2].trim() || 'Phương án C.',
        newOpts[3].trim() || 'Phương án D.',
      ];
      item.correctIndex = newCorrectIdx;
      item.solutionSteps = newSolution.trim()
        ? [
            {
              title: 'Bước 1: Phân tích và giải chi tiết',
              leadIn: 'Theo giả thiết bài toán:',
              math: newSolution.trim(),
            },
          ]
        : existing?.solutionSteps || [
            {
              title: 'Bước 1: Phân tích và giải chi tiết',
              leadIn: 'Theo giả thiết bài toán:',
              math: 'Chọn đáp án đúng theo phân tích.',
            },
          ];
    } else if (newPartType === 'part2') {
      const labels: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];
      item.statements = labels.map((lb, idx): Part2Statement => {
        const prevStmt = existing?.statements?.[idx];
        return {
          label: lb,
          text: newStatements[idx].trim() || `Mệnh đề ${lb})`,
          isTrue: newStmtTruth[idx],
          stepTitle: prevStmt?.stepTitle || `Bước ${idx + 1}: Xét ý ${lb})`,
          leadIn: prevStmt?.leadIn || `Kiểm tra mệnh đề ${lb}):`,
          explanation:
            prevStmt?.explanation && prevStmt.isTrue === newStmtTruth[idx]
              ? prevStmt.explanation
              : newStmtTruth[idx]
              ? `Mệnh đề ${lb}) Đúng.`
              : `Mệnh đề ${lb}) Sai.`,
        };
      }) as [Part2Statement, Part2Statement, Part2Statement, Part2Statement];
    } else {
      item.answer = (newPart3Ans.trim() || '0').replace(/\./g, ',').slice(0, 4);
      item.solutionSteps = newSolution.trim()
        ? [
            {
              title: 'Bước 1: Thiết lập và tính toán',
              leadIn: 'Theo đề bài:',
              math: newSolution.trim(),
            },
          ]
        : existing?.solutionSteps || [
            {
              title: 'Bước 1: Thiết lập và tính toán',
              leadIn: 'Theo đề bài:',
              math: `Giá trị cần tìm là $${item.answer}$.`,
            },
          ];
    }

    if (existing) {
      const next = await updateBankQuestion(bankItems, item);
      onChangeBankItems(next);
      setStatusMsg('Đã cập nhật câu hỏi và lưu vào Kho Offline IndexedDB!');
    } else {
      const { items, added } = await saveBankQuestionsBulk(bankItems, [item]);
      onChangeBankItems(items);
      setStatusMsg(
        added > 0
          ? 'Đã thêm câu hỏi mới vào Kho Offline IndexedDB!'
          : 'Câu hỏi này đã tồn tại trong kho (lọc trùng).'
      );
    }

    setShowAddModal(false);
    setEditingId(null);
  };

  const handleDeleteItem = async (id: string) => {
    const next = await deleteBankQuestion(bankItems, id);
    onChangeBankItems(next);
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
    setStatusMsg('Đã xóa câu hỏi khỏi Kho Offline IndexedDB.');
  };

  // Sticky Floating Action Bar handlers
  const handleBulkExportWord = async () => {
    if (selectedQuestionsList.length === 0) return;
    setBusy(true);
    try {
      const customExam = buildExamFromSelectedBankQuestions(
        selectedQuestionsList,
        currentExam,
        `ĐỀ CHỌN LỌC ${selectedQuestionsList.length} CÂU CHUYÊN ĐỀ (SGK KNTT)`
      );
      await exportExamToDocx(customExam, 'teacher');
      setStatusMsg(`Đã xuất ${selectedQuestionsList.length} câu hỏi đã chọn ra tệp Word (.docx) chuẩn OMML.`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkExportJson = async () => {
    if (selectedQuestionsList.length === 0) return;
    setBusy(true);
    try {
      await exportBankToJsonFile(
        selectedQuestionsList,
        `TeachLearnEdu_Goi_${selectedQuestionsList.length}Cau`
      );
      setStatusMsg(`Đã xuất gói ${selectedQuestionsList.length.toLocaleString('vi-VN')} câu hỏi đã chọn ra tệp .json.`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const next = await deleteBankQuestionsBulk(bankItems, selectedIds);
    onChangeBankItems(next);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setStatusMsg(`Đã xóa ${count} câu hỏi đã chọn khỏi Kho Offline IndexedDB.`);
  };

  const handleBulkMockTest = () => {
    if (selectedQuestionsList.length === 0) return;
    const customExam = buildExamFromSelectedBankQuestions(
      selectedQuestionsList,
      currentExam,
      `THI THỬ CHUYÊN ĐỀ (${selectedQuestionsList.length} CÂU ĐÃ CHỌN)`
    );
    setQuickQuizExam(customExam);
    setQuizP1({});
    setQuizP2({});
    setQuizP3({});
    setQuizSubmitted(false);
  };

  const handleBulkCreateA4 = () => {
    if (selectedQuestionsList.length === 0) return;
    const customExam = buildExamFromSelectedBankQuestions(
      selectedQuestionsList,
      currentExam,
      `ĐỀ KIỂM TRA CHUYÊN ĐỀ (${selectedQuestionsList.length} CÂU TỪ KHO KNTT)`
    );
    onSelectExam22(customExam);
    setStatusMsg(
      `Đã tạo đề A4 từ ${selectedQuestionsList.length} câu hỏi đã chọn và nạp sang Tab "2. Xem & Xuất Đề A4" (Mã đề ${customExam.examCode}).`
    );
  };

  const computeQuizScore = () => {
    if (!quickQuizExam) return { total: 0, maxTotal: 10, p1Pts: 0, p2Pts: 0, p3Pts: 0 };
    let p1Correct = 0;
    quickQuizExam.part1.forEach((q, idx) => {
      if (quizP1[idx] === q.correctIndex) p1Correct++;
    });
    const p1Pts = p1Correct * 0.25;

    let p2Pts = 0;
    quickQuizExam.part2.forEach((q, qIdx) => {
      let matched = 0;
      q.statements.forEach((s) => {
        if (quizP2[`${qIdx}-${s.label}`] === s.isTrue) matched++;
      });
      if (matched === 1) p2Pts += 0.1;
      else if (matched === 2) p2Pts += 0.25;
      else if (matched === 3) p2Pts += 0.5;
      else if (matched === 4) p2Pts += 1.0;
    });

    let p3Correct = 0;
    quickQuizExam.part3.forEach((q, idx) => {
      const userVal = (quizP3[idx] || '').trim().replace(/\./g, ',');
      if (userVal === q.answer.trim()) p3Correct++;
    });
    const p3Pts = p3Correct * 0.5;

    const maxTotal =
      Math.round(
        (quickQuizExam.part1.length * 0.25 +
          quickQuizExam.part2.length * 1.0 +
          quickQuizExam.part3.length * 0.5) *
          100
      ) / 100;
    const total = Math.round((p1Pts + p2Pts + p3Pts) * 100) / 100;
    return { total, maxTotal, p1Pts, p2Pts, p3Pts };
  };

  return (
    <div className="space-y-4">
      {/* 1. Khối điều khiển kho câu hỏi ở đầu trang */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        <div className="text-[12px] font-semibold text-[#136F63] tabular-nums dark:text-teal-400">
          Kho Offline IndexedDB · Tổng cộng {bankItems.length.toLocaleString('vi-VN')} câu hỏi đã lưu (tự động lọc trùng)
        </div>
        <h3 className="mt-0.5 text-[19px] font-semibold tracking-tight text-[#0F172A] dark:text-white">
          Ngân hàng câu hỏi chuyên đề (Chuẩn SGK KNTT)
        </h3>

        {/* Hàng nút 1 */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleQuickSelect22}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4 text-[#136F63]" />
            Chọn nhanh 22 câu chuẩn BGD
          </button>

          <button
            type="button"
            onClick={handleStartQuickTest22}
            disabled={busy}
            className="btn-glossy-3d-active inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-4 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <Play className="h-4 w-4 fill-current" />
            Thi thử nhanh 22 câu chuẩn BGD
          </button>

          <button
            type="button"
            onClick={openAddQuestionModal}
            disabled={busy}
            className="btn-glossy-3d-active inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Thêm câu hỏi mới
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <FileText className="h-4 w-4 text-[#136F63]" />
            Nhập Word / Thư mục / Drive
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <Download className="h-4 w-4 text-[#136F63]" />
            Sao lưu toàn kho (.json)
          </button>
        </div>

        {/* Hàng nút 2 */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRescanBank}
            disabled={busy}
            className="btn-glossy-3d-active inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <ScanSearch className="h-4 w-4" />
            Quét nhận diện lại kho đề
          </button>

          <button
            type="button"
            onClick={handleNormalizeBank}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium tabular-nums transition-all duration-150 disabled:opacity-60"
          >
            <Wand2 className="h-4 w-4 text-[#136F63]" />
            Chuẩn hóa kho ({bankItems.length.toLocaleString('vi-VN')} câu)
          </button>

          <button
            type="button"
            onClick={() => jsonInputRef.current?.click()}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <Upload className="h-4 w-4 text-[#136F63]" />
            Nạp (.json)
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJsonFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowAdvancedTableSettings((v) => !v)}
            disabled={busy}
            className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 ${
              showAdvancedTableSettings
                ? 'btn-glossy-3d-active ring-2 ring-[#136F63]/35'
                : 'btn-glossy-3d-inactive'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>Cài đặt nâng cao: Bảng &amp; Xuất dữ liệu</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                showAdvancedTableSettings ? 'rotate-180' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={handleExportMarkdownBank}
            disabled={busy}
            className="btn-glossy-3d-inactive inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-all duration-150 disabled:opacity-60"
          >
            <FileCode2 className="h-4 w-4 text-[#136F63]" />
            <span>Xuất Markdown (.md)</span>
          </button>
        </div>

        {/* BẢNG CÀI ĐẶT NÂNG CAO: TÙY CHỌN ĐỊNH DẠNG BẢNG BIỂU & XUẤT DỮ LIỆU */}
        {showAdvancedTableSettings && (
          <div className="mt-4 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3.5 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#136F63] text-white shadow-2xs">
                  <Table2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                    Cài đặt Nâng cao: Xử lý Bảng biểu từ Word &amp; Định dạng Xuất dữ liệu
                  </h4>
                  <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                    Tùy chọn giữ nguyên cấu trúc bảng gốc hoặc chuyển đổi bảng phức tạp (bảng biến thiên, bảng gộp ô) sang Markdown / Image HD để hiển thị hoàn hảo 100%
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedTableSettings(false)}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                Thu gọn
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* Cột trái (7 col): 4 Chế độ xử lý & hiển thị bảng trong Ngân hàng đề */}
              <div className="space-y-3 lg:col-span-7">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#136F63] dark:text-teal-400">
                  1. Chế độ xử lý &amp; hiển thị Bảng biểu từ file Word (.docx)
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {([
                    {
                      id: 'keep_native' as BankTableFormatMode,
                      title: 'Giữ nguyên cấu trúc bảng gốc',
                      badge: 'Native Table',
                      desc: 'Bảo toàn 100% cấu trúc dòng/cột gốc từ Word và hiển thị công thức KaTeX sắc nét trong từng ô bảng.',
                      icon: Table2,
                    },
                    {
                      id: 'markdown' as BankTableFormatMode,
                      title: 'Chuyển đổi sang bảng Markdown',
                      badge: 'Markdown | Col |',
                      desc: 'Chuyển bảng số liệu Word sang cú pháp Markdown chuẩn (| A | B |), dễ chỉnh sửa trực tiếp và xuất .md.',
                      icon: FileCode2,
                    },
                    {
                      id: 'image_png' as BankTableFormatMode,
                      title: 'Tự động chụp Bảng thành Ảnh HD (Mặc định)',
                      badge: 'Auto 2x <100KB',
                      desc: 'Tự động bóc tách mọi bảng biểu (thống kê, tần số, bảng biến thiên) và kết xuất ảnh PNG/WebP 2x nền trắng, viền đen, KaTeX sắc nét <100KB.',
                      icon: ImageIcon,
                    },
                    {
                      id: 'auto_complex_to_image' as BankTableFormatMode,
                      title: 'Chỉ chuyển Bảng phức tạp sang Ảnh',
                      badge: 'Hybrid',
                      desc: 'Giữ bảng thống kê đơn giản dạng HTML và chỉ chụp ảnh cho bảng biến thiên hoặc bảng có ô gộp.',
                      icon: Sparkles,
                    },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const active = tableSettings.tableFormatMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdateTableSettings({ tableFormatMode: opt.id })}
                        className={`flex flex-col justify-between rounded-[8px] border p-3.5 text-left transition-all ${
                          active
                            ? 'border-[#136F63] bg-white shadow-xs ring-2 ring-[#136F63]/20 dark:border-teal-500 dark:bg-slate-900'
                            : 'border-[#E2E8F0] bg-white hover:border-[#136F63]/50 dark:border-slate-700 dark:bg-slate-900/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1E293B] dark:text-slate-100">
                              <Icon className="h-4 w-4 text-[#136F63]" />
                              {opt.title}
                            </span>
                            <span
                              className={`rounded-[6px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${
                                active
                                  ? 'bg-[#136F63] text-white'
                                  : 'bg-[#F1F5F9] text-[#64748B] dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {opt.badge}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-[#64748B] dark:text-slate-400">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cột phải (5 col): Tùy chọn định dạng xuất dữ liệu (Word / Markdown / JSON) */}
              <div className="flex flex-col justify-between space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-700 dark:bg-slate-900 lg:col-span-5">
                <div className="space-y-3">
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-[#136F63] dark:text-teal-400">
                    2. Định dạng Xuất dữ liệu (Word .docx / Markdown .md)
                  </div>

                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                      Kiểu đóng gói bảng khi xuất ra tệp Word (.docx):
                    </label>
                    <select
                      value={tableSettings.exportDocxTableStyle}
                      onChange={(e) =>
                        handleUpdateTableSettings({
                          exportDocxTableStyle: e.target.value as BankExportTableStyle,
                        })
                      }
                      className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="native_word_table">
                        Giữ nguyên cấu trúc Bảng Word gốc (&lt;w:tbl&gt; + OMML)
                      </option>
                      <option value="embedded_png_image">
                        Chuyển bảng thành Ảnh PNG nét cao nhúng vào Word (Chống lệch bảng)
                      </option>
                      <option value="markdown_text">
                        Chuyển bảng thành cú pháp văn bản Markdown (| Cột 1 | Cột 2 |)
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                        Độ phân giải kết xuất Ảnh:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([2, 3] as const).map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => handleUpdateTableSettings({ imageDpiScale: scale })}
                            className={`rounded-[8px] py-1.5 text-[12px] font-medium transition ${
                              tableSettings.imageDpiScale === scale
                                ? 'bg-[#136F63] text-white'
                                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {scale === 2 ? 'Retina 2x' : 'Ultra HD 3x'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                        Công thức toán trong ô:
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateTableSettings({
                            preserveMathInCells: !tableSettings.preserveMathInCells,
                          })
                        }
                        className={`w-full rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                          tableSettings.preserveMathInCells
                            ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]'
                        }`}
                      >
                        {tableSettings.preserveMathInCells
                          ? 'Giữ nguyên LaTeX / OMML'
                          : 'Chuyển sang ký tự thuần'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-[#E2E8F0] pt-3 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleApplyTableSettingsToWholeBank}
                    disabled={busy}
                    className="flex-1 rounded-[8px] bg-[#136F63] px-3 py-2 text-[13px] font-medium text-white shadow-2xs transition hover:bg-[#0F594F] disabled:opacity-50"
                  >
                    Áp dụng ngay cho toàn Kho
                  </button>
                  <button
                    type="button"
                    onClick={handleExportMarkdownBank}
                    disabled={busy}
                    className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] font-medium text-[#334155] transition hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    Xuất file .md
                  </button>
                </div>
              </div>
            </div>

            {/* Khung Xem Trước Trực Quan (Live Preview) của chế độ bảng đang chọn */}
            <div className="mt-4 rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-[#1E293B] dark:text-slate-200">
                  Xem trước hiển thị thực tế trong Ngân hàng đề ({
                    tableSettings.tableFormatMode === 'keep_native'
                      ? 'Cấu trúc Bảng Gốc HTML/Word'
                      : tableSettings.tableFormatMode === 'markdown'
                      ? 'Định dạng Bảng Markdown'
                      : tableSettings.tableFormatMode === 'image_png'
                      ? `Hình ảnh PNG (${tableSettings.imageDpiScale}x Retina)`
                      : 'Tự động (Auto Hybrid)'
                  }):
                </span>
                <span className="font-mono text-[11px] text-[#64748B]">
                  Mẫu số liệu ghép nhóm Câu 12 · Toán 12 KNTT
                </span>
              </div>

              {tableSettings.tableFormatMode === 'markdown' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <pre className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] bg-slate-900 p-2.5 font-mono text-[11px] text-teal-200">
                    {convertTableRowsToMarkdown(
                      SAMPLE_PREVIEW_TABLE_ROWS,
                      tableSettings.preserveMathInCells
                    )}
                  </pre>
                  <div>
                    <MathText
                      text={convertTableRowsToMarkdown(
                        SAMPLE_PREVIEW_TABLE_ROWS,
                        tableSettings.preserveMathInCells
                      )}
                    />
                  </div>
                </div>
              ) : tableSettings.tableFormatMode === 'image_png' && samplePreviewImage ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                  <img
                    src={samplePreviewImage}
                    alt="Xem trước bảng dạng ảnh PNG"
                    className="max-h-28 max-w-full rounded-[6px] border border-[#CBD5E1] bg-white p-1 shadow-2xs"
                  />
                  <span className="text-[11.5px] font-medium text-[#15803D]">
                    Đã kết xuất thành ảnh PNG chống vỡ khung 100% ({tableSettings.imageDpiScale}x DPI)
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-[#E2E8F0] text-center text-[13px]">
                    <tbody>
                      {SAMPLE_PREVIEW_TABLE_ROWS.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            rIdx === 0
                              ? 'bg-[#136F63] font-semibold text-white'
                              : 'bg-white text-[#334155] dark:bg-slate-900 dark:text-slate-200'
                          }
                        >
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="border border-[#E2E8F0] px-2.5 py-1.5">
                              <MathText text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {statusMsg && (
          <div className="mt-3.5 flex items-center justify-between gap-2 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-3.5 py-2.5 text-[13px] font-medium text-[#0369A1] dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0369A1]" />
              {statusMsg}
            </span>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              aria-label="Đóng thông báo"
              className="rounded-[6px] p-1 text-[#0369A1] hover:bg-white/60 dark:text-sky-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Khung bộ lọc thông minh 5 cấp & Tìm kiếm */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Cột 1: Khối lớp */}
          <div>
            <label
              htmlFor="qb-filter-grade"
              className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#64748B] dark:text-slate-300"
            >
              1. KHỐI LỚP
            </label>
            <select
              id="qb-filter-grade"
              value={gradeFilter}
              onChange={(e) => handleGradeFilterChange(e.target.value as 'all' | '10' | '11' | '12')}
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-normal text-[#0F172A] transition-colors focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="10">Lớp 10 (SGK KNTT)</option>
              <option value="11">Lớp 11 (SGK KNTT)</option>
              <option value="12">Lớp 12 (SGK KNTT)</option>
            </select>
          </div>

          {/* Cột 2: Chương */}
          <div>
            <label
              htmlFor="qb-filter-chapter"
              className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#64748B] dark:text-slate-300"
            >
              2. CHƯƠNG (SGK KNTT)
            </label>
            <select
              id="qb-filter-chapter"
              value={chapterFilter}
              onChange={(e) => handleChapterFilterChange(e.target.value)}
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-normal text-[#0F172A] transition-colors focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả chương</option>
              {chapterOptions.map((ch) => (
                <option key={ch.value} value={ch.value}>
                  {ch.label}
                </option>
              ))}
            </select>
          </div>

          {/* Cột 3: Bài học */}
          <div>
            <label
              htmlFor="qb-filter-lesson"
              className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#64748B] dark:text-slate-300"
            >
              3. BÀI HỌC
            </label>
            <select
              id="qb-filter-lesson"
              value={lessonFilter}
              onChange={(e) => setLessonFilter(e.target.value)}
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-normal text-[#0F172A] transition-colors focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả bài học</option>
              {lessonOptions.map((ls) => (
                <option key={ls.value} value={ls.value}>
                  {ls.label}
                </option>
              ))}
            </select>
          </div>

          {/* Cột 4: Mức độ nhận thức */}
          <div>
            <label
              htmlFor="qb-filter-level"
              className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#64748B] dark:text-slate-300"
            >
              4. MỨC ĐỘ NHẬN THỨC
            </label>
            <select
              id="qb-filter-level"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as 'all' | 'NB' | 'TH' | 'VD' | 'VDC')}
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-normal text-[#0F172A] transition-colors focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="NB">NB — Nhận biết</option>
              <option value="TH">TH — Thông hiểu</option>
              <option value="VD">VD — Vận dụng</option>
              <option value="VDC">VDC — Vận dụng cao</option>
            </select>
          </div>

          {/* Cột 5: Dạng câu hỏi */}
          <div>
            <label
              htmlFor="qb-filter-part"
              className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#64748B] dark:text-slate-300"
            >
              5. DẠNG CÂU HỎI
            </label>
            <select
              id="qb-filter-part"
              value={partFilter}
              onChange={(e) => setPartFilter(e.target.value as 'all' | BankPartType)}
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-normal text-[#0F172A] transition-colors focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả dạng câu</option>
              <option value="part1">Phần I (TN 4 lựa chọn)</option>
              <option value="part2">Phần II (Đúng / Sai)</option>
              <option value="part3">Phần III (Trả lời ngắn)</option>
            </select>
          </div>
        </div>

        {/* Hàng tìm kiếm + bộ đếm + đặt lại bộ lọc */}
        <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo từ khóa đề bài, thẻ [11-C6-B21-NB], tên bài học..."
              className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white pr-9 pl-10 text-[13.5px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <select
              aria-label="Chế độ lọc câu hỏi trùng lặp"
              value={duplicateFilter}
              onChange={(e) => setDuplicateFilter(e.target.value as 'all' | 'involved' | 'extra_only')}
              className={`h-10 rounded-[8px] border px-3 text-[12.5px] font-medium transition-colors focus:outline-none ${
                duplicateFilter !== 'all'
                  ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-200'
                  : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <option value="all">
                Lọc trùng: Tất cả ({duplicateAnalysis.duplicateIds.size.toLocaleString('vi-VN')} bản sao trùng)
              </option>
              <option value="involved">
                Xem các cặp trùng ({duplicateAnalysis.allInvolvedIds.size.toLocaleString('vi-VN')} câu gốc + sao)
              </option>
              <option value="extra_only">
                Chỉ hiện bản sao dư ({duplicateAnalysis.duplicateIds.size.toLocaleString('vi-VN')} câu trùng)
              </option>
            </select>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-[12.5px] font-medium text-[#334155] tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Hiển thị <span className="font-semibold text-[#136F63]">{filteredQuestions.length.toLocaleString('vi-VN')}</span> /{' '}
              {bankItems.length.toLocaleString('vi-VN')} câu
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-glossy-3d-inactive inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 text-[13px] font-medium transition-all duration-150"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#136F63]" />
              Đặt lại bộ lọc
            </button>
          </div>
        </div>

        {/* Thanh thống kê nhanh phân bố Chương trình Lớp 10-11-12 & Mức độ nhận thức + Cảnh báo trùng lặp */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 text-[12px] dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-[#64748B] dark:text-slate-300">Phân bố SGK KNTT:</span>
            {([
              { g: '10' as const, label: 'Lớp 10', count: bankDistribution.g10 },
              { g: '11' as const, label: 'Lớp 11', count: bankDistribution.g11 },
              { g: '12' as const, label: 'Lớp 12', count: bankDistribution.g12 },
            ]).map((item) => (
              <button
                key={item.g}
                type="button"
                onClick={() => handleGradeFilterChange(gradeFilter === item.g ? 'all' : item.g)}
                className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 font-medium tabular-nums transition-colors ${
                  gradeFilter === item.g
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <span>{item.label}:</span>
                <strong>{item.count.toLocaleString('vi-VN')}</strong>
              </button>
            ))}

            <span className="mx-1 text-[#CBD5E1] dark:text-slate-700">|</span>

            {([
              { lv: 'NB' as const, count: bankDistribution.nb },
              { lv: 'TH' as const, count: bankDistribution.th },
              { lv: 'VD' as const, count: bankDistribution.vd },
              { lv: 'VDC' as const, count: bankDistribution.vdc },
            ]).map((item) => (
              <button
                key={item.lv}
                type="button"
                onClick={() => setLevelFilter(levelFilter === item.lv ? 'all' : item.lv)}
                className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 font-medium tabular-nums transition-colors ${
                  levelFilter === item.lv
                    ? 'ring-2 ring-[#136F63] ' + LEVEL_STYLES[item.lv]
                    : LEVEL_STYLES[item.lv]
                }`}
              >
                <span>{item.lv}:</span>
                <strong>{item.count.toLocaleString('vi-VN')}</strong>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {duplicateAnalysis.duplicateIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setDuplicateFilter((prev) => (prev === 'involved' ? 'all' : 'involved'))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 font-semibold tabular-nums transition-colors ${
                    duplicateFilter !== 'all'
                      ? 'border-[#B45309] bg-[#B45309] text-white'
                      : 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  <span>
                    Phát hiện {duplicateAnalysis.duplicateIds.size.toLocaleString('vi-VN')} câu trùng lặp
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleNormalizeBank}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-[6px] bg-[#B91C1C] px-2.5 py-1 font-semibold text-white shadow-2xs hover:bg-red-800 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Lọc bỏ ngay ({duplicateAnalysis.duplicateIds.size.toLocaleString('vi-VN')})
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-1 font-medium text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Không có câu hỏi trùng lặp (100% duy nhất)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Thanh chọn tất cả & Danh sách thẻ câu hỏi gắn nhãn chuẩn */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        {/* Dòng chọn nhanh & Điều hướng phân trang đầu danh sách */}
        <div className="mb-4 flex flex-col gap-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-[#0F172A] select-none dark:text-slate-100">
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                disabled={filteredQuestions.length === 0}
                className="h-4 w-4 cursor-pointer rounded accent-[#136F63]"
              />
              <span className="tabular-nums">
                Chọn tất cả ({filteredQuestions.length.toLocaleString('vi-VN')} câu đang lọc)
              </span>
            </label>

            {paginatedQuestions.length > 0 && filteredQuestions.length > paginatedQuestions.length && (
              <button
                type="button"
                onClick={toggleSelectCurrentPage}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#136F63] shadow-2xs transition-colors hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-900 dark:text-teal-300"
              >
                {allPageSelected
                  ? `Bỏ chọn ${paginatedQuestions.length} câu trang này`
                  : `Chọn ${paginatedQuestions.length} câu trang này`}
              </button>
            )}
          </div>

          {/* Thanh phân trang nhanh ở đầu danh sách */}
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-normal text-[#64748B] tabular-nums dark:text-slate-300">
              Hiển thị{' '}
              <strong className="text-[#0F172A] dark:text-white">
                {filteredQuestions.length === 0 ? 0 : (pageStartIndex + 1).toLocaleString('vi-VN')}–
                {Math.min(pageStartIndex + pageSize, filteredQuestions.length).toLocaleString('vi-VN')}
              </strong>{' '}
              / {filteredQuestions.length.toLocaleString('vi-VN')} câu
            </span>

            <select
              aria-label="Số câu mỗi trang"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as 25 | 50 | 100)}
              className="h-8 rounded-[8px] border border-[#CBD5E1] bg-white px-2 text-[12px] font-medium text-[#334155] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value={25}>25 câu / trang</option>
              <option value={50}>50 câu / trang</option>
              <option value={100}>100 câu / trang</option>
            </select>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 tabular-nums">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  title="Trang đầu"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  Trước
                </button>
                <span className="px-2 font-semibold text-[#136F63] dark:text-teal-300">
                  Trang {safePage.toLocaleString('vi-VN')} / {totalPages.toLocaleString('vi-VN')}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  Sau
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  title="Trang cuối"
                >
                  »
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Danh sách thẻ câu hỏi (chỉ render đúng trang hiện tại để mượt tuyệt đối với 10.000+ câu) */}
        <div className="space-y-3">
          {paginatedQuestions.map((b) => {
            const isSelected = selectedIds.has(b.id);
            const isExpanded = expandedSolutions.has(b.id);
            const meta = lookupKNTTMeta(b.grade, b.chapter, b.lesson);
            const chapterNum = b.chapter.replace(/^C/i, '');
            const lessonNum = b.lesson.replace(/^B/i, '');
            const partLabel =
              b.partType === 'part1'
                ? 'Phần I (TN)'
                : b.partType === 'part2'
                ? 'Phần II (Đ/S)'
                : 'Phần III (TLN)';
            const stepCount =
              b.partType === 'part2'
                ? b.statements?.length || 4
                : b.solutionSteps?.length || 1;
            const letters = ['A', 'B', 'C', 'D'] as const;

            return (
              <div
                key={b.id}
                className={`rounded-[8px] border p-4 transition-colors ${
                  isSelected
                    ? 'border-[#136F63] bg-[#F0FDFA] shadow-xs dark:border-teal-500 dark:bg-teal-950/30'
                    : 'border-[#E2E8F0] bg-white hover:border-[#136F63]/50 dark:border-slate-700 dark:bg-slate-900/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox góc trái */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectOne(b.id)}
                    aria-label={`Chọn câu hỏi ${b.tag}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-[#136F63]"
                  />

                  <div className="min-w-0 flex-1">
                    {/* Hàng huy hiệu phân loại + Mã thẻ + Nút Sửa / Xóa góc phải */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-2 py-0.5 text-[11.5px] font-semibold text-[#0369A1] dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          Lớp {b.grade}
                        </span>
                        <span className="inline-flex items-center rounded-[6px] border border-[#99F6E4] bg-[#F0FDFA] px-2 py-0.5 text-[11.5px] font-medium text-[#136F63] dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
                          Chương {chapterNum}
                        </span>
                        <span className="inline-flex items-center rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11.5px] font-medium text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          Bài {lessonNum}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11.5px] font-semibold ${LEVEL_STYLES[b.level]}`}
                        >
                          Mức {b.level}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11.5px] font-medium ${PART_BADGE_STYLES[b.partType]}`}
                        >
                          {partLabel}
                        </span>
                        {duplicateAnalysis.duplicateRankById.has(b.id) && (() => {
                          const dupInfo = duplicateAnalysis.duplicateRankById.get(b.id)!;
                          const isOriginal = dupInfo.occurrence === 1;
                          return (
                            <span
                              className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11.5px] font-semibold ${
                                isOriginal
                                  ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                              }`}
                            >
                              {isOriginal
                                ? `Nhóm trùng #${dupInfo.groupIndex} (Bản gốc 1/${dupInfo.totalInGroup})`
                                : `Trùng lặp #${dupInfo.groupIndex} (Bản sao ${dupInfo.occurrence}/${dupInfo.totalInGroup})`}
                            </span>
                          );
                        })()}
                        <span className="ml-0.5 text-[12.5px] font-semibold text-[#1E293B] dark:text-slate-200">
                          {b.tag} {meta.lessonTitle}
                        </span>
                      </div>

                      {/* 2 biểu tượng Sửa / Xóa ở góc phải */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditQuestionModal(b)}
                          title="Chỉnh sửa câu hỏi"
                          aria-label="Chỉnh sửa câu hỏi"
                          className="rounded-[6px] p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#136F63] dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(b.id)}
                          title="Xóa khỏi kho"
                          aria-label="Xóa khỏi kho"
                          className="rounded-[6px] p-1.5 text-[#64748B] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C] dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Nội dung đề bài KaTeX */}
                    <div className="mt-2.5 text-[14px] leading-relaxed text-[#0F172A] dark:text-slate-100">
                      <MathText text={b.stem} />
                    </div>

                    {b.diagram && !b.image && !b.imageUrl && !b.tableData && !b.id.startsWith('imp-') && (
                      <div className="my-2.5 flex justify-center">
                        <ExamDiagram kind={b.diagram} layer="stem" />
                      </div>
                    )}

                    {b.tableData && b.tableData.length > 0 ? (() => {
                      const override = questionTableViewOverride[b.id];
                      const isComplex = isComplexTableStructure(b.tableData);
                      const hasImg = Boolean(b.image || b.imageUrl);
                      const effectiveView: 'native' | 'markdown' | 'image' = override
                        ? override
                        : hasImg ||
                          tableSettings.tableFormatMode === 'image_png' ||
                          (tableSettings.tableFormatMode === 'auto_complex_to_image' && isComplex)
                        ? 'image'
                        : tableSettings.tableFormatMode === 'markdown'
                        ? 'markdown'
                        : 'native';

                      const mdString = convertTableRowsToMarkdown(
                        b.tableData,
                        tableSettings.preserveMathInCells
                      );
                      const pngSrc =
                        b.image ||
                        b.imageUrl ||
                        (effectiveView === 'image'
                          ? renderTableToPngBase64(b.tableData, tableSettings.imageDpiScale)
                          : undefined);

                      return (
                        <div className="my-2.5 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                              Bảng dữ liệu ({isComplex ? 'Bảng phức tạp' : 'Bảng chuẩn'}):
                            </span>
                            <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 text-[11.5px] dark:border-slate-700 dark:bg-slate-800">
                              {(
                                [
                                  { id: 'native', label: 'Bảng gốc' },
                                  { id: 'markdown', label: 'Markdown' },
                                  { id: 'image', label: 'Ảnh PNG' },
                                ] as const
                              ).map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() =>
                                    setQuestionTableViewOverride((prev) => ({
                                      ...prev,
                                      [b.id]: m.id,
                                    }))
                                  }
                                  className={`rounded-[6px] px-2 py-0.5 font-semibold transition ${
                                    effectiveView === m.id
                                      ? 'bg-[#136F63] text-white shadow-2xs'
                                      : 'text-[#64748B] hover:text-[#0F172A] dark:text-slate-300'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {effectiveView === 'markdown' ? (
                            <div className="space-y-1.5">
                              <pre className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] bg-slate-900 p-2.5 font-mono text-xs text-teal-200">
                                {mdString}
                              </pre>
                              <MathText text={mdString} />
                            </div>
                          ) : effectiveView === 'image' && pngSrc ? (
                            <div className="flex justify-center">
                              <img
                                src={pngSrc}
                                alt="Bảng số liệu kết xuất Ảnh"
                                className="h-auto max-w-full rounded border border-slate-300 bg-white p-1 shadow-sm object-contain"
                                style={{ maxHeight: '260px' }}
                              />
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse border border-slate-300 text-center text-sm">
                                <tbody>
                                  {b.tableData.map((row, rIdx) => (
                                    <tr
                                      key={rIdx}
                                      className={
                                        rIdx === 0
                                          ? 'bg-[#E8F1FA] font-bold text-[#1F497D]'
                                          : 'bg-white dark:bg-slate-900'
                                      }
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td
                                          key={cIdx}
                                          className="border border-slate-300 px-3 py-1.5 text-center"
                                        >
                                          <MathText text={cell} />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })() : (b.image || b.imageUrl) ? (
                      <div className="my-2.5 flex justify-center">
                        <img
                          src={b.image || b.imageUrl}
                          alt="Bảng số liệu / Hình minh họa"
                          className="h-auto max-w-full rounded border border-slate-300 bg-white p-1 shadow-sm object-contain"
                          style={{ maxHeight: '260px' }}
                        />
                      </div>
                    ) : null}

                    {/* Phần I: 4 phương án A, B, C, D chia 2 cột */}
                    {b.partType === 'part1' && b.options && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {b.options.map((opt, idx) => {
                          const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, idx);
                          const isCorrect = idx === (b.correctIndex ?? 0);
                          return (
                            <div
                              key={idx}
                              className={`flex items-baseline gap-1.5 rounded-[8px] border px-3 py-2 text-[13.5px] leading-snug ${
                                isCorrect
                                  ? 'border-[#FCA5A5] bg-[#FEE2E2]/70 font-semibold text-[#B91C1C] dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                  : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                              }`}
                            >
                              <span className="shrink-0 font-bold">{letter}.</span>
                              <span className="min-w-0 flex-1">
                                <MathText text={cleanOpt} />
                              </span>
                              {isCorrect && (
                                <Check className="ml-1 h-3.5 w-3.5 shrink-0 self-center text-[#B91C1C] dark:text-rose-300" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Phần II: 4 mệnh đề Đúng / Sai */}
                    {b.partType === 'part2' && b.statements && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {b.statements.map((st) => (
                          <div
                            key={st.label}
                            className={`flex items-start justify-between gap-2 rounded-[8px] border px-3 py-2 text-[13.5px] leading-snug ${
                              st.isTrue
                                ? 'border-[#FCA5A5] bg-[#FEE2E2]/50 text-[#0F172A] dark:border-rose-800 dark:bg-rose-950/30 dark:text-slate-100'
                                : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold">{st.label}) </span>
                              <MathText text={st.text} />
                            </div>
                            <span
                              className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold ${
                                st.isTrue
                                  ? 'bg-[#FEE2E2] text-[#B91C1C] dark:bg-rose-900/60 dark:text-rose-200'
                                  : 'bg-[#E0F2FE] text-[#0369A1] dark:bg-sky-900/60 dark:text-sky-200'
                              }`}
                            >
                              {st.isTrue ? 'Đúng' : 'Sai'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Phần III: Đáp số */}
                    {b.partType === 'part3' && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2]/70 px-3 py-1.5 text-[13px] font-semibold text-[#B91C1C] dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                        <span>Đáp số chuẩn:</span>
                        <span className="tabular-nums">
                          <MathText text={stripAnswerPrefix(b.answer || '0')} />
                        </span>
                      </div>
                    )}

                    {/* Nút sổ xuống Xem lời giải ([X] bước) ở dưới cùng */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => toggleExpandSolution(b.id)}
                        aria-expanded={isExpanded}
                        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12.5px] font-semibold text-[#136F63] transition-colors hover:bg-[#F0FDFA] hover:text-[#0F594F] dark:text-teal-300 dark:hover:bg-teal-950/40"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                        <span>Xem lời giải ({stepCount} bước)</span>
                      </button>

                      {b.source && (
                        <span className="text-[12px] text-[#64748B] dark:text-slate-400">
                          Nguồn: {b.source}
                        </span>
                      )}
                    </div>

                    {/* Khung lời giải chi tiết khi sổ xuống (hỗ trợ hình ảnh lớp 2) */}
                    {isExpanded && (
                      <div className="mt-2.5 space-y-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-[13.5px] leading-relaxed text-[#334155] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
                        {b.diagram && !b.solutionImage && !b.image && !b.imageUrl && !b.id.startsWith('imp-') && (
                          <div className="my-2 flex justify-center">
                            <ExamDiagram kind={b.diagram} layer="sol" />
                          </div>
                        )}
                        {b.solutionImage && (
                          <div className="my-2 flex justify-center">
                            <img
                              src={b.solutionImage}
                              alt="Hình minh họa lời giải (Lớp 2)"
                              className="max-w-full rounded border border-[#CBD5E1] bg-white p-1 shadow-sm"
                              style={{ maxHeight: '240px', objectFit: 'contain' }}
                            />
                          </div>
                        )}

                        {b.partType === 'part2' && b.statements ? (
                          b.statements.map((st, stIdx) => {
                            const normalized = normalizeSolutionStep(
                              {
                                stepTitle: st.stepTitle,
                                leadIn: st.leadIn,
                                content: st.explanation,
                              },
                              stIdx
                            );
                            return (
                              <div key={st.label} className="text-justify leading-relaxed">
                                <span className="font-bold text-[#136F63] dark:text-teal-300">
                                  {normalized.label}
                                </span>{' '}
                                <MathText text={normalized.body} />{' '}
                                <span className="font-semibold">
                                  (Kết luận ý {st.label}):{' '}
                                  <span className={st.isTrue ? 'text-[#B91C1C]' : 'text-[#0369A1]'}>
                                    {st.isTrue ? 'Đúng' : 'Sai'}
                                  </span>
                                  )
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <>
                            {normalizeSolutionSteps(b.solutionSteps).map((st, sIdx) => (
                              <div key={sIdx} className="text-justify leading-relaxed">
                                <span className="font-bold text-[#136F63] dark:text-teal-300">
                                  {st.label}
                                </span>{' '}
                                <MathText text={st.body} />
                              </div>
                            ))}
                            {!(b.solutionSteps || []).some((st) => /Kết luận:/i.test(st.math || '')) && (
                              <div className="pt-1 font-semibold text-[#B91C1C] dark:text-rose-300">
                                {b.partType === 'part1' ? (
                                  <MathText text={`Kết luận: Chọn ${letters[b.correctIndex ?? 0]}.`} />
                                ) : (
                                  <>
                                    <span>Đáp số / Kết luận: </span>
                                    <MathText text={stripAnswerPrefix(b.answer || '0')} />
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-[#CBD5E1] p-8 text-center text-[13.5px] text-[#64748B] dark:border-slate-700 dark:text-slate-400">
              Không có câu hỏi nào khớp với bộ lọc hiện tại. Thầy có thể bấm{' '}
              <button
                type="button"
                onClick={handleResetFilters}
                className="font-semibold text-[#136F63] underline hover:text-[#0F594F]"
              >
                Đặt lại bộ lọc
              </button>{' '}
              hoặc thêm câu hỏi mới vào kho.
            </div>
          )}
        </div>

        {/* Thanh phân trang cuối danh sách */}
        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800/60">
            <div className="font-normal text-[#64748B] tabular-nums dark:text-slate-300">
              Đang xem câu{' '}
              <strong className="text-[#0F172A] dark:text-white">
                {(pageStartIndex + 1).toLocaleString('vi-VN')}–
                {Math.min(pageStartIndex + pageSize, filteredQuestions.length).toLocaleString('vi-VN')}
              </strong>{' '}
              trên tổng số <strong className="text-[#0F172A] dark:text-white">{filteredQuestions.length.toLocaleString('vi-VN')}</strong> câu
            </div>

            <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                « Đầu
              </button>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                ‹ Trước
              </button>
              <span className="px-2 font-semibold text-[#136F63] dark:text-teal-300">
                Trang {safePage.toLocaleString('vi-VN')} / {totalPages.toLocaleString('vi-VN')}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                Sau ›
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                Cuối »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Thanh công cụ thao tác hàng loạt nổi (Sticky Floating Action Bar) */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Thanh thao tác hàng loạt với các câu hỏi đã chọn"
          className="sticky bottom-3 z-30 flex flex-col gap-3 rounded-[8px] border border-slate-700 bg-[#0F172A] px-4 py-3 text-white shadow-2xl shadow-slate-950/45 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex flex-wrap items-center gap-2.5 text-[13.5px]">
            <span className="font-semibold tabular-nums">
              Thao tác với <strong className="text-teal-300">{selectedIds.size}</strong> câu đã chọn
            </span>
            <span className="inline-flex items-center rounded-[6px] border border-teal-400/40 bg-[#136F63]/40 px-2.5 py-1 text-[12px] font-medium text-teal-100 tabular-nums">
              {selectedStats.p1} TN - {selectedStats.p2} Đ/S - {selectedStats.p3} TLN
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[12px] font-medium text-teal-300 underline underline-offset-2 transition-colors hover:text-white"
            >
              Bỏ chọn tất cả
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBulkExportWord}
              disabled={busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[#0F594F] disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              Xuất Word (.docx)
            </button>

            <button
              type="button"
              onClick={handleBulkExportJson}
              disabled={busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0F172A] shadow-sm transition-colors hover:bg-[#F1F5F9] disabled:opacity-60"
            >
              <Download className="h-4 w-4 text-[#136F63]" />
              Xuất gói (.json)
            </button>

            {!confirmBulkDelete ? (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={busy}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#B91C1C] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-red-800 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Xóa câu hỏi
              </button>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-[8px] bg-rose-950/90 p-1 ring-1 ring-rose-400">
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="rounded-[6px] bg-[#B91C1C] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-red-800"
                >
                  Xác nhận xóa ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-rose-200 hover:text-white"
                >
                  Hủy
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkMockTest}
              disabled={busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#15803D] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-60"
            >
              <Play className="h-4 w-4 fill-current" />
              Thi thử
            </button>

            <button
              type="button"
              onClick={handleBulkCreateA4}
              disabled={busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#0369A1] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              Tạo đề A4
            </button>
          </div>
        </div>
      )}

      {/* Modal 1: Thêm / Chỉnh sửa câu hỏi */}
      {showAddModal && (
        <SmartboardViewport
          isModal
          maxWidthClass="max-w-2xl"
          title={
            editingId
              ? 'Chỉnh sửa câu hỏi trong Kho Offline IndexedDB'
              : 'Thêm câu hỏi mới vào Kho Offline IndexedDB'
          }
          onCloseModal={() => {
            setShowAddModal(false);
            setEditingId(null);
          }}
          bodyClassName="p-5"
        >
          <div className="space-y-3 text-[13.5px] text-[#334155] dark:text-slate-200">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">Loại câu hỏi</label>
                <select
                  value={newPartType}
                  onChange={(e) => setNewPartType(e.target.value as BankPartType)}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="part1">Phần I — Trắc nghiệm 4 lựa chọn</option>
                  <option value="part2">Phần II — Đúng / Sai (4 ý)</option>
                  <option value="part3">Phần III — Trả lời ngắn (≤ 4 ký tự)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">
                  Thẻ ma trận [Lớp-Chương-Bài-Mức độ]
                </label>
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="[12-C1-B1-TH]"
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">
                Nội dung câu dẫn (hỗ trợ LaTeX $...$)
              </label>
              <textarea
                rows={3}
                value={newStem}
                onChange={(e) => setNewStem(e.target.value)}
                placeholder="Ví dụ: Cho hàm số $y = x^3 - 3x + 1$..."
                className="w-full rounded-[8px] border border-[#CBD5E1] bg-white p-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {newPartType === 'part1' && (
              <div className="space-y-2">
                <div className="text-[12px] font-semibold text-[#64748B]">4 phương án A, B, C, D &amp; chọn đáp án đúng:</div>
                {(['A', 'B', 'C', 'D'] as const).map((ltr, idx) => (
                  <div key={ltr} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="newCorrect"
                      checked={newCorrectIdx === idx}
                      onChange={() => setNewCorrectIdx(idx as 0 | 1 | 2 | 3)}
                      className="h-4 w-4 accent-[#136F63]"
                    />
                    <span className="w-5 font-semibold text-[#0F172A]">{ltr}.</span>
                    <input
                      value={newOpts[idx]}
                      onChange={(e) => {
                        const cp = [...newOpts] as [string, string, string, string];
                        cp[idx] = e.target.value;
                        setNewOpts(cp);
                      }}
                      placeholder={`Nội dung phương án ${ltr}...`}
                      className="h-10 flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            )}

            {newPartType === 'part2' && (
              <div className="space-y-2">
                <div className="text-[12px] font-semibold text-[#64748B]">4 mệnh đề a, b, c, d &amp; tích chọn ý Đúng:</div>
                {(['a', 'b', 'c', 'd'] as const).map((lb, idx) => (
                  <div key={lb} className="flex items-center gap-2">
                    <span className="w-5 font-semibold text-[#0F172A]">{lb})</span>
                    <input
                      value={newStatements[idx]}
                      onChange={(e) => {
                        const cp = [...newStatements] as [string, string, string, string];
                        cp[idx] = e.target.value;
                        setNewStatements(cp);
                      }}
                      placeholder={`Nội dung mệnh đề ${lb})...`}
                      className="h-10 flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <label className="flex items-center gap-1.5 font-semibold text-[#334155]">
                      <input
                        type="checkbox"
                        checked={newStmtTruth[idx]}
                        onChange={(e) => {
                          const cp = [...newStmtTruth] as [boolean, boolean, boolean, boolean];
                          cp[idx] = e.target.checked;
                          setNewStmtTruth(cp);
                        }}
                        className="h-4 w-4 accent-[#136F63]"
                      />
                      Đúng
                    </label>
                  </div>
                ))}
              </div>
            )}

            {newPartType === 'part3' && (
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">
                  Đáp số (≤ 4 ký tự, thập phân dùng dấu phẩy)
                </label>
                <input
                  maxLength={4}
                  value={newPart3Ans}
                  onChange={(e) => setNewPart3Ans(e.target.value.replace('.', ','))}
                  placeholder="Ví dụ: 46,8"
                  className="h-10 w-36 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[14px] font-semibold text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}

            {newPartType !== 'part2' && (
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">Lời giải chi tiết (tùy chọn)</label>
                <textarea
                  rows={3}
                  value={newSolution}
                  onChange={(e) => setNewSolution(e.target.value)}
                  placeholder="Nhập các bước giải bằng LaTeX $...$..."
                  className="w-full rounded-[8px] border border-[#CBD5E1] bg-white p-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingId(null);
                }}
                className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveNewOrEditedQuestion}
                disabled={!newStem.trim()}
                className="btn-glossy-3d-active min-h-[48px] rounded-[8px] px-5 py-2 text-[13.5px] font-medium disabled:opacity-50"
              >
                {editingId ? 'Lưu thay đổi' : 'Lưu vào Kho IndexedDB'}
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      {/* Modal 2: Import Word / Folder / Drive */}
      {showImportModal && (
        <SmartboardViewport
          isModal
          maxWidthClass={parsedPreviewItems ? 'max-w-4xl' : 'max-w-2xl'}
          title={
            parsedPreviewItems
              ? `Xem trước chi tiết (${parsedPreviewItems.length} câu hỏi trích xuất 100% nguyên bản từ file gốc)`
              : 'Nhập câu hỏi từ Word (.docx) / Thư mục / Google Drive'
          }
          onCloseModal={() => {
            setShowImportModal(false);
            setParsedPreviewItems(null);
          }}
          bodyClassName="p-5"
        >
          {parsedPreviewItems ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] p-3 text-[12.5px] font-medium text-[#15803D] dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                <div className="space-y-1">
                  <div>
                    Đã trích xuất trực tiếp {parsedPreviewItems.length.toLocaleString('vi-VN')} câu hỏi. Giữ nguyên 100% nội dung gốc từ file Word (.docx) (từng chữ, số liệu, công thức OMML → LaTeX, bảng số liệu, hình ảnh 2 lớp và lời giải).
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center rounded-[6px] bg-[#15803D] px-2 py-0.5 text-[11.5px] font-semibold text-white">
                      Mới hợp lệ: {previewDuplicateInfo.newCount.toLocaleString('vi-VN')} câu
                    </span>
                    {previewDuplicateInfo.dupBankCount > 0 && (
                      <span className="inline-flex items-center rounded-[6px] bg-[#B45309] px-2 py-0.5 text-[11.5px] font-semibold text-white">
                        Trùng với Kho hiện tại: {previewDuplicateInfo.dupBankCount.toLocaleString('vi-VN')} câu (sẽ tự động bỏ qua)
                      </span>
                    )}
                    {previewDuplicateInfo.dupFileCount > 0 && (
                      <span className="inline-flex items-center rounded-[6px] bg-[#B91C1C] px-2 py-0.5 text-[11.5px] font-semibold text-white">
                        Trùng lặp trong chính file: {previewDuplicateInfo.dupFileCount.toLocaleString('vi-VN')} câu (sẽ tự động bỏ qua)
                      </span>
                    )}
                  </div>
                </div>
                {parsedPreviewItems.length > PREVIEW_PAGE_SIZE && (
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <button
                      type="button"
                      disabled={previewPage <= 1}
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      className="rounded-[6px] border border-[#86EFAC] bg-white px-2 py-0.5 font-semibold text-[#15803D] disabled:opacity-40"
                    >
                      ‹ Trước
                    </button>
                    <span>
                      Trang {previewPage} / {Math.ceil(parsedPreviewItems.length / PREVIEW_PAGE_SIZE)}
                    </span>
                    <button
                      type="button"
                      disabled={previewPage >= Math.ceil(parsedPreviewItems.length / PREVIEW_PAGE_SIZE)}
                      onClick={() =>
                        setPreviewPage((p) =>
                          Math.min(Math.ceil(parsedPreviewItems.length / PREVIEW_PAGE_SIZE), p + 1)
                        )
                      }
                      className="rounded-[6px] border border-[#86EFAC] bg-white px-2 py-0.5 font-semibold text-[#15803D] disabled:opacity-40"
                    >
                      Sau ›
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-[60vh] space-y-3.5 overflow-y-auto pr-1">
                {parsedPreviewItems
                  .slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE)
                  .map((q, localIdx) => {
                    const idx = (previewPage - 1) * PREVIEW_PAGE_SIZE + localIdx;
                    const dupState = previewDuplicateInfo.statusByIdx[idx] || 'new';
                    const meta = lookupKNTTMeta(q.grade, q.chapter, q.lesson);
                    const partTitle =
                      q.partType === 'part1'
                        ? 'Phần I (TN 4 lựa chọn)'
                        : q.partType === 'part2'
                        ? 'Phần II (Đúng / Sai)'
                        : 'Phần III (Trả lời ngắn)';
                    return (
                      <div
                        key={q.id || idx}
                        className={`rounded-[8px] border p-4 text-[13.5px] shadow-xs ${
                          dupState === 'new'
                            ? 'border-[#E2E8F0] bg-white dark:border-slate-700 dark:bg-slate-900/50'
                            : 'border-[#FCD34D] bg-[#FEF3C7]/40 dark:border-amber-700 dark:bg-amber-950/20'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-[#136F63]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-[6px] border border-[#99F6E4] bg-[#F0FDFA] px-2 py-0.5 text-[#136F63] dark:bg-teal-950 dark:text-teal-200">
                              Câu {idx + 1}
                            </span>
                            <span className="rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 text-[#334155] dark:bg-slate-800 dark:text-slate-200">
                              {partTitle}
                            </span>
                            <span className="rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-2 py-0.5 text-[#0369A1]">
                              Lớp {q.grade} · Mức {q.level}
                            </span>
                            <span className="text-[#1E293B] dark:text-slate-200">
                              {q.tag} {meta.lessonTitle}
                            </span>
                            {dupState === 'new' ? (
                              <span className="rounded-[6px] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                                Mới hợp lệ
                              </span>
                            ) : dupState === 'dup_bank' ? (
                              <span className="rounded-[6px] bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                                Đã tồn tại trong Kho (Lọc trùng)
                              </span>
                            ) : (
                              <span className="rounded-[6px] bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-semibold text-[#B91C1C]">
                                Trùng lặp trong File
                              </span>
                            )}
                          </div>
                          <span className="text-[#64748B]">Nguồn: {q.source}</span>
                        </div>

                        <div className="mt-2 text-[14px] leading-relaxed text-[#0F172A] dark:text-slate-100">
                          <MathText text={q.stem} />
                        </div>

                        {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                          <div className="my-2.5 flex justify-center">
                            <ExamDiagram kind={q.diagram} layer="stem" />
                          </div>
                        )}

                        {(q.image || q.imageUrl) ? (
                          <div className="my-2.5 flex justify-center">
                            <img
                              src={q.image || q.imageUrl}
                              alt="Hình minh họa / Bảng biểu (Lớp 1)"
                              className="h-auto max-h-64 max-w-full rounded border border-[#CBD5E1] bg-white p-1 shadow-sm object-contain"
                            />
                          </div>
                        ) : q.tableData && q.tableData.length > 0 ? (
                          <div className="my-2.5 overflow-x-auto">
                            <table className="w-full border-collapse border border-[#E2E8F0] text-center text-[12.5px]">
                              <tbody>
                                {q.tableData.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={
                                      rIdx === 0
                                        ? 'bg-[#136F63] font-semibold text-white'
                                        : 'bg-white text-[#334155] dark:bg-slate-900 dark:text-slate-200'
                                    }
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="border border-[#E2E8F0] px-2.5 py-1.5 text-center"
                                      >
                                        <MathText text={cell} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {q.partType === 'part1' && q.options && (
                          <div className="mt-2.5 grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-2">
                            {q.options.map((opt, oIdx) => {
                              const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, oIdx);
                              return (
                                <div
                                  key={oIdx}
                                  className={`rounded-[8px] border px-2.5 py-1.5 ${
                                    oIdx === q.correctIndex
                                      ? 'border-[#FCA5A5] bg-[#FEE2E2] font-semibold text-[#B91C1C] dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] dark:border-slate-700 dark:bg-slate-900/40'
                                  }`}
                                >
                                  <strong>{letter}.</strong> <MathText text={cleanOpt} />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.partType === 'part2' && q.statements && (
                          <div className="mt-2.5 grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-2">
                            {q.statements.map((st) => (
                              <div
                                key={st.label}
                                className="flex items-start justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/40"
                              >
                                <div>
                                  <strong>{st.label}) </strong>
                                  <MathText text={st.text} />
                                </div>
                                <span
                                  className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold ${
                                    st.isTrue
                                      ? 'bg-[#FEE2E2] text-[#B91C1C]'
                                      : 'bg-[#E0F2FE] text-[#0369A1]'
                                  }`}
                                >
                                  {st.isTrue ? 'Đúng' : 'Sai'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Xem trước Lời giải & Hình ảnh lớp 2 */}
                        {((q.solutionSteps && q.solutionSteps.length > 0) ||
                          q.solutionImage ||
                          q.diagram ||
                          q.partType === 'part3') && (
                          <div className="mt-2.5 space-y-1.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[12.5px] text-[#334155] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                            <div className="font-semibold text-[#136F63] dark:text-teal-300">
                              LỜI GIẢI TRÍCH XUẤT NGUYÊN BẢN:
                            </div>
                            {q.diagram && !q.solutionImage && !q.image && !q.imageUrl && !q.id.startsWith('imp-') && (
                              <div className="my-1.5 flex justify-center">
                                <ExamDiagram kind={q.diagram} layer="sol" />
                              </div>
                            )}
                            {q.solutionImage && (
                              <div className="my-1.5 flex justify-center">
                                <img
                                  src={q.solutionImage}
                                  alt="Hình minh họa lời giải (Lớp 2)"
                                  className="max-h-44 max-w-full rounded border border-[#CBD5E1] bg-white p-1"
                                />
                              </div>
                            )}
                            {normalizeSolutionSteps(q.solutionSteps).map((st, sIdx) => (
                              <div key={sIdx} className="text-justify leading-relaxed">
                                <span className="font-bold text-[#136F63] dark:text-teal-300">
                                  {st.label}
                                </span>{' '}
                                <MathText text={st.body} />
                              </div>
                            ))}
                            {q.partType === 'part3' && (
                              <div className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-2.5 py-1 text-[12.5px] font-semibold text-[#B91C1C]">
                                <span>Đáp số:</span>
                                <MathText text={stripAnswerPrefix(q.answer || '0')} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setParsedPreviewItems(null)}
                  className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
                >
                  Chọn lại tệp khác
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={busy}
                  className="inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-5 py-2 text-[13.5px] font-medium text-white shadow-sm hover:bg-[#0F594F] disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Xác nhận lưu {parsedPreviewItems.length} câu vào Kho
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'files', label: 'Chọn tệp Word / JSON', icon: FileText },
                    { id: 'folder', label: 'Quét cả Thư mục', icon: FolderOpen },
                    { id: 'drive', label: 'Link Drive / Dán đề', icon: Link2 },
                  ].map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setImportTab(t.id as 'files' | 'folder' | 'drive')}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                          importTab === t.id
                            ? 'bg-[#136F63] text-white'
                            : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="font-semibold text-[#334155] dark:text-slate-200">Xử lý bảng Word:</span>
                  <select
                    value={tableSettings.tableFormatMode}
                    onChange={(e) =>
                      handleUpdateTableSettings({
                        tableFormatMode: e.target.value as BankTableFormatMode,
                      })
                    }
                    className="h-9 rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12.5px] font-medium text-[#0F172A] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="auto_complex_to_image">Tự động chuyển bảng phức tạp sang Ảnh</option>
                    <option value="keep_native">Giữ nguyên cấu trúc bảng gốc</option>
                    <option value="markdown">Chuyển bảng sang Markdown</option>
                    <option value="image_png">Chuyển toàn bộ bảng sang Ảnh PNG</option>
                  </select>

                  <span className="font-medium text-[#64748B]">Khối mặc định:</span>
                  <select
                    value={importGrade}
                    onChange={(e) => setImportGrade(e.target.value as '10' | '11' | '12')}
                    className="h-9 rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 text-[13px] text-[#0F172A] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="10">Lớp 10</option>
                    <option value="11">Lớp 11</option>
                    <option value="12">Lớp 12</option>
                  </select>
                </div>
              </div>

              {importTab === 'files' && (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center transition-colors hover:border-[#136F63] hover:bg-[#F0FDFA]/50 dark:border-slate-700 dark:bg-slate-800/40">
                  {busy ? (
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#136F63]" />
                  ) : (
                    <Upload className="mb-2 h-8 w-8 text-[#136F63]" />
                  )}
                  <div className="text-[13.5px] font-semibold text-[#0F172A] dark:text-slate-100">
                    Chọn 1 hoặc nhiều tệp Word (.docx), Text (.txt) hoặc Backup (.json)
                  </div>
                  <div className="mt-1 text-[12px] text-[#64748B] dark:text-slate-400">
                    Trích xuất trực tiếp 100% nội dung gốc (không qua AI sửa đổi). Hỗ trợ công thức OMML và bảng biểu.
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".docx,.txt,.md,.json"
                    onChange={(e) => handleFilesOrFolderImport(e.target.files)}
                    className="hidden"
                  />
                </label>
              )}

              {importTab === 'folder' && (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center transition-colors hover:border-[#136F63] hover:bg-[#F0FDFA]/50 dark:border-slate-700 dark:bg-slate-800/40">
                  {busy ? (
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#136F63]" />
                  ) : (
                    <FolderOpen className="mb-2 h-8 w-8 text-[#136F63]" />
                  )}
                  <div className="text-[13.5px] font-semibold text-[#0F172A] dark:text-slate-100">
                    Chọn Thư mục chứa nhiều đề kiểm tra (.docx / .txt / .json)
                  </div>
                  <div className="mt-1 text-[12px] text-[#64748B] dark:text-slate-400">
                    Duyệt toàn bộ tệp, giữ nguyên 100% nội dung gốc và lưu Offline IndexedDB.
                  </div>
                  <input
                    type="file"
                    multiple
                    {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(e) => handleFilesOrFolderImport(e.target.files)}
                    className="hidden"
                  />
                </label>
              )}

              {importTab === 'drive' && (
                <div className="space-y-3 text-[13.5px]">
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">
                      Đường dẫn Google Docs / Google Drive (chế độ chia sẻ công khai)
                    </label>
                    <input
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                      placeholder="https://docs.google.com/document/d/... hoặc https://drive.google.com/file/d/..."
                      className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">
                      Hoặc dán trực tiếp nội dung câu hỏi (Câu 1... A. B. C. D.)
                    </label>
                    <textarea
                      rows={6}
                      value={rawPasteText}
                      onChange={(e) => setRawPasteText(e.target.value)}
                      placeholder="Câu 1. Tìm cực trị của hàm số $y = x^3 - 3x$...&#10;A. ...&#10;B. ...&#10;C. ...&#10;D. ..."
                      className="w-full rounded-[8px] border border-[#CBD5E1] bg-white p-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleImportDriveOrText}
                      disabled={busy || (!driveUrl.trim() && !rawPasteText.trim())}
                      className="inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-5 py-2 text-[13.5px] font-medium text-white hover:bg-[#0F594F] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Phân tích &amp; Nhập vào Kho
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </SmartboardViewport>
      )}

      {/* Modal 3: Interactive Mock Test (22 câu chuẩn BGD hoặc các câu đã chọn) */}
      {quickQuizExam && (
        <SmartboardViewport
          isModal
          showPenToolbarByDefault
          maxWidthClass="max-w-4xl"
          title={`${quickQuizExam.examTitle} (Mã ${quickQuizExam.examCode})`}
          subtitle={
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Clock className="h-3.5 w-3.5 text-[#136F63]" />
              {quickQuizExam.part1.length + quickQuizExam.part2.length + quickQuizExam.part3.length} câu ·{' '}
              {quickQuizExam.part1.length + quickQuizExam.part2.length * 4 + quickQuizExam.part3.length} lệnh hỏi · Chuẩn BGD 2025–2027
            </span>
          }
          onCloseModal={() => setQuickQuizExam(null)}
          bodyClassName="p-5"
        >
          {quizSubmitted && (
            <div className="mb-4 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] p-4 text-[14px] text-[#15803D] tabular-nums">
              <div className="text-[16px] font-semibold text-[#B91C1C]">
                Tổng điểm: {computeQuizScore().total} / {computeQuizScore().maxTotal} điểm
              </div>
              <div className="mt-1 font-medium">
                Phần I: {computeQuizScore().p1Pts}đ · Phần II: {computeQuizScore().p2Pts}đ · Phần III:{' '}
                {computeQuizScore().p3Pts}đ
              </div>
            </div>
          )}

          <div className="space-y-4 text-[14px] text-[#334155] dark:text-slate-200">
            {quickQuizExam.part1.length > 0 && (
              <>
                <div className="text-[15px] font-semibold text-[#136F63] dark:text-teal-400">
                  PHẦN I. Trắc nghiệm nhiều lựa chọn ({quickQuizExam.part1.length} câu)
                </div>
                {quickQuizExam.part1.map((q, idx) => (
                  <div key={q.id} className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="font-semibold text-[#0F172A] dark:text-slate-100">
                      Câu {q.number} {q.tag}. <MathText text={q.stem} />
                    </div>
                    {q.diagram && !q.image && !q.imageUrl && (
                      <div className="my-2 flex justify-center">
                        <ExamDiagram kind={q.diagram} layer="stem" />
                      </div>
                    )}
                    {(q.image || q.imageUrl) && (
                      <div className="my-2 flex justify-center">
                        <img
                          src={q.image || q.imageUrl}
                          alt={`Hình / Bảng câu ${q.number}`}
                          className="h-auto max-h-60 max-w-full rounded border border-[#CBD5E1] bg-white p-1 object-contain"
                        />
                      </div>
                    )}
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oIdx) => {
                        const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, oIdx);
                        const picked = quizP1[idx] === oIdx;
                        const isRight = quizSubmitted && oIdx === q.correctIndex;
                        return (
                          <button
                            type="button"
                            key={oIdx}
                            disabled={quizSubmitted}
                            onClick={() => setQuizP1((prev) => ({ ...prev, [idx]: oIdx }))}
                            className={`min-h-[48px] rounded-[8px] border px-3 py-2 text-left transition-colors ${
                              isRight
                                ? 'border-[#86EFAC] bg-[#DCFCE7] font-semibold text-[#15803D]'
                                : picked
                                ? 'border-[#136F63] bg-[#F0FDFA] font-semibold text-[#136F63]'
                                : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800'
                            }`}
                          >
                            <strong>{letter}.</strong> <MathText text={cleanOpt} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {quickQuizExam.part2.length > 0 && (
              <>
                <div className="text-[15px] font-semibold text-[#136F63] dark:text-teal-400">
                  PHẦN II. Trắc nghiệm Đúng / Sai ({quickQuizExam.part2.length} câu)
                </div>
                {quickQuizExam.part2.map((q, qIdx) => (
                  <div key={q.id} className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="font-semibold text-[#0F172A] dark:text-slate-100">
                      Câu {q.number} {q.tag}. <MathText text={q.stem} />
                    </div>
                    {q.diagram && !q.image && !q.imageUrl && (
                      <div className="my-2 flex justify-center">
                        <ExamDiagram kind={q.diagram} layer="stem" />
                      </div>
                    )}
                    {(q.image || q.imageUrl) && (
                      <div className="my-2 flex justify-center">
                        <img
                          src={q.image || q.imageUrl}
                          alt={`Hình / Bảng câu ${q.number}`}
                          className="h-auto max-h-60 max-w-full rounded border border-[#CBD5E1] bg-white p-1 object-contain"
                        />
                      </div>
                    )}
                    <div className="mt-2.5 space-y-2">
                      {q.statements.map((s) => {
                        const val = quizP2[`${qIdx}-${s.label}`];
                        return (
                          <div
                            key={s.label}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                          >
                            <span className="flex-1">
                              <strong>{s.label})</strong> <MathText text={s.text} />
                            </span>
                            <div className="flex items-center gap-1.5">
                              {[
                                { label: 'Đúng', v: true },
                                { label: 'Sai', v: false },
                              ].map((btn) => (
                                <button
                                  type="button"
                                  key={btn.label}
                                  disabled={quizSubmitted}
                                  onClick={() =>
                                    setQuizP2((prev) => ({ ...prev, [`${qIdx}-${s.label}`]: btn.v }))
                                  }
                                  className={`min-h-[48px] min-w-[54px] rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                                    val === btn.v
                                      ? 'bg-[#136F63] text-white'
                                      : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]'
                                  }`}
                                >
                                  {btn.label}
                                </button>
                              ))}
                              {quizSubmitted && (
                                <span
                                  className={`ml-1 font-bold ${s.isTrue ? 'text-[#B91C1C]' : 'text-[#0369A1]'}`}
                                >
                                  ({s.isTrue ? 'Đ' : 'S'})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {quickQuizExam.part3.length > 0 && (
              <>
                <div className="text-[15px] font-semibold text-[#136F63] dark:text-teal-400">
                  PHẦN III. Trả lời ngắn ({quickQuizExam.part3.length} câu)
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {quickQuizExam.part3.map((q, idx) => (
                    <div key={q.id} className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="font-semibold text-[#0F172A] dark:text-slate-100">
                        Câu {q.number}. <MathText text={q.stem} />
                      </div>
                      {q.diagram && !q.image && !q.imageUrl && (
                        <div className="my-2 flex justify-center">
                          <ExamDiagram kind={q.diagram} layer="stem" />
                        </div>
                      )}
                      {(q.image || q.imageUrl) && (
                        <div className="my-2 flex justify-center">
                          <img
                            src={q.image || q.imageUrl}
                            alt={`Hình / Bảng câu ${q.number}`}
                            className="h-auto max-h-60 max-w-full rounded border border-[#CBD5E1] bg-white p-1 object-contain"
                          />
                        </div>
                      )}
                      <div className="mt-2.5 flex items-center gap-2">
                        <input
                          maxLength={4}
                          disabled={quizSubmitted}
                          value={quizP3[idx] || ''}
                          onChange={(e) =>
                            setQuizP3((prev) => ({ ...prev, [idx]: e.target.value.replace('.', ',') }))
                          }
                          placeholder="Đáp số..."
                          className="min-h-[48px] w-32 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[14px] font-semibold text-[#0F172A] focus:border-[#136F63] focus:outline-none"
                        />
                        {quizSubmitted && (
                          <span className="font-semibold text-[#B91C1C]">Đáp án: {q.answer}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-[#E2E8F0] pt-3 dark:border-slate-700">
            {!quizSubmitted && (
              <button
                type="button"
                onClick={() => setQuizSubmitted(true)}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-[#0F594F]"
              >
                Nộp bài &amp; Chấm điểm ngay
              </button>
            )}
          </div>
        </SmartboardViewport>
      )}
    </div>
  );
};
