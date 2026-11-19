import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Download,
  Eraser,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  ClassroomStoreData,
  GradebookConfig,
  GradeColumnTarget,
  MasterDataStore,
  SubjectGradeEntry,
} from '../types/eduplan';
import { saveClassroomData, upsertClassInStore } from '../utils/classroomDb';
import { CreateClassroomFromMasterModal } from '../components/CreateClassroomFromMasterModal';
import { resolveActiveTeachingContext } from '../utils/masterDataDb';
import { SmartboardViewport } from '../components/SmartboardViewport';
import {
  computeCircular22TBM,
  computeCircular22YearTBM,
  createEmptyGradeEntry,
  DEFAULT_GRADEBOOK_CONFIG,
  exportSmasGradebookExcel,
  formatScoreValue,
  generateAiRemarksBatch,
  generateFallbackRemark,
  getCircular22Rank,
  importSmasGradebookExcel,
  loadGradebookConfig,
  makeGradeEntryId,
  normalizeGradeEntry,
  parseScoreCell,
  previewAppSyncForClass,
  saveGradebookConfig,
  saveGradebookEntriesBulk,
  syncAppScoresToGradebook,
  syncGradebookEntriesToFirestore,
} from '../utils/gradebookDb';

export type GradeBatchFilter = 'all' | 'tx' | 'gk' | 'ck';
type EditableColKey = 'tx1' | 'tx2' | 'tx3' | 'tx4' | 'tx5' | 'gk' | 'ck' | 'remark' | 'yearRemark';

interface SubjectGradebookModuleProps {
  mode: 'gradebook' | 'sync_smas';
  embedded?: boolean;
  ownerUid?: string;
  classroomStore: ClassroomStoreData;
  onUpdateClassroomStore: (next: ClassroomStoreData) => void;
  activeClassId: string;
  onChangeActiveClassId: (classId: string) => void;
  gradebookMap: Record<string, SubjectGradeEntry>;
  onUpdateGradebookMap: (next: Record<string, SubjectGradeEntry>) => void;
  masterData?: MasterDataStore;
}

const TX_KEYS_ALL: ('tx1' | 'tx2' | 'tx3' | 'tx4' | 'tx5')[] = ['tx1', 'tx2', 'tx3', 'tx4', 'tx5'];

export const SubjectGradebookModule: React.FC<SubjectGradebookModuleProps> = ({
  mode,
  embedded = false,
  ownerUid,
  classroomStore,
  onUpdateClassroomStore,
  activeClassId,
  onChangeActiveClassId,
  gradebookMap,
  onUpdateGradebookMap,
  masterData,
}) => {
  const masterCtx = useMemo(() => resolveActiveTeachingContext(masterData), [masterData]);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [semester, setSemester] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState<{ key: string; raw: string } | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // SMAS Config & Popovers
  const [config, setConfig] = useState<GradebookConfig>(() => loadGradebookConfig());
  const [configOpen, setConfigOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<GradebookConfig>(config);

  const [remarkMenuOpen, setRemarkMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Per-column quick menu (batch fill / clear column)
  const [activeColMenu, setActiveColMenu] = useState<GradeColumnTarget | null>(null);
  const [batchScoreInput, setBatchScoreInput] = useState('8,5');
  const [batchFillEmptyOnly, setBatchFillEmptyOnly] = useState(true);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  // Close floating dropdowns on outside click
  useEffect(() => {
    if (!remarkMenuOpen && !exportMenuOpen && !activeColMenu) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRemarkMenuOpen(false);
        setExportMenuOpen(false);
        setActiveColMenu(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [remarkMenuOpen, exportMenuOpen, activeColMenu]);

  const txCols = useMemo(
    () => TX_KEYS_ALL.slice(0, config.txColumnCount),
    [config.txColumnCount]
  );

  const selectedClass = useMemo(() => {
    return (
      classroomStore.classes.find((c) => c.id === activeClassId) ||
      classroomStore.classes[0] ||
      null
    );
  }, [classroomStore.classes, activeClassId]);

  const allClassStudents = useMemo(() => {
    if (!selectedClass) return [];
    return classroomStore.students.filter((s) => s.classId === selectedClass.id);
  }, [classroomStore.students, selectedClass]);

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    if (!searchQuery.trim()) return allClassStudents;
    const q = searchQuery.trim().toLowerCase();
    return allClassStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        s.dob.toLowerCase().includes(q)
    );
  }, [allClassStudents, selectedClass, searchQuery]);

  const getEntryForStudent = (studentId: string, sem: 1 | 2 = semester): SubjectGradeEntry => {
    const classId = selectedClass?.id || activeClassId;
    const id = makeGradeEntryId(classId, sem, studentId);
    return normalizeGradeEntry(gradebookMap[id] || createEmptyGradeEntry(classId, sem, studentId));
  };

  const visibleCols = useMemo<EditableColKey[]>(() => {
    const base: EditableColKey[] = [...txCols, 'gk', 'ck', 'remark'];
    if (semester === 2) {
      base.push('yearRemark');
    }
    return base;
  }, [txCols, semester]);

  const stats = useMemo(() => {
    let totalWithTbm = 0;
    let sumTbm = 0;
    let tot = 0;
    let kha = 0;
    let dat = 0;
    let chuaDat = 0;

    allClassStudents.forEach((st) => {
      const entry = getEntryForStudent(st.id, semester);
      const tbm = computeCircular22TBM(entry, config.txColumnCount);
      const hk1Tbm =
        semester === 2
          ? computeCircular22TBM(getEntryForStudent(st.id, 1), config.txColumnCount)
          : null;
      const effectiveTbm =
        semester === 2 ? computeCircular22YearTBM(hk1Tbm, tbm) ?? tbm : tbm;

      if (effectiveTbm !== null) {
        totalWithTbm++;
        sumTbm += effectiveTbm;
        const rank = getCircular22Rank(effectiveTbm);
        if (rank === 'Tốt') tot++;
        else if (rank === 'Khá') kha++;
        else if (rank === 'Đạt') dat++;
        else if (rank === 'Chưa đạt') chuaDat++;
      }
    });

    return {
      totalStudents: allClassStudents.length,
      avgClassTbm: totalWithTbm > 0 ? Math.round((sumTbm / totalWithTbm) * 10) / 10 : null,
      tot,
      kha,
      dat,
      chuaDat,
    };
  }, [allClassStudents, gradebookMap, semester, selectedClass, config.txColumnCount]);

  const syncPreview = useMemo(() => {
    if (!selectedClass) return [];
    return previewAppSyncForClass(
      allClassStudents,
      gradebookMap,
      selectedClass.id,
      semester,
      config.txColumnCount
    );
  }, [allClassStudents, gradebookMap, selectedClass, semester, config.txColumnCount]);

  const totalPendingAppScores = useMemo(() => {
    return syncPreview.reduce(
      (sum, item) => sum + Math.min(item.pendingScores.length, item.availableSlots),
      0
    );
  }, [syncPreview]);

  const dirtyCount = Object.keys(dirtyIds).length;

  const commitScoreChange = (
    studentId: string,
    colKey: GradeColumnTarget,
    rawValue: string
  ) => {
    if (!selectedClass) return;
    const entryId = makeGradeEntryId(selectedClass.id, semester, studentId);
    const prev = getEntryForStudent(studentId, semester);
    const parsed = parseScoreCell(rawValue);
    const nextEntry: SubjectGradeEntry = {
      ...prev,
      [colKey]: parsed,
      updatedAt: new Date().toISOString(),
    };
    nextEntry.tbm = computeCircular22TBM(nextEntry, config.txColumnCount);

    onUpdateGradebookMap({
      ...gradebookMap,
      [entryId]: nextEntry,
    });
    setDirtyIds((d) => ({ ...d, [entryId]: true }));
  };

  const handleRemarkChange = (
    studentId: string,
    field: 'remark' | 'yearRemark',
    text: string
  ) => {
    if (!selectedClass) return;
    const entryId = makeGradeEntryId(selectedClass.id, semester, studentId);
    const prev = getEntryForStudent(studentId, semester);
    const nextEntry: SubjectGradeEntry = {
      ...prev,
      [field]: text,
      updatedAt: new Date().toISOString(),
    };
    onUpdateGradebookMap({
      ...gradebookMap,
      [entryId]: nextEntry,
    });
    setDirtyIds((d) => ({ ...d, [entryId]: true }));
  };

  const focusGridCell = (rowIdx: number, colIdx: number) => {
    if (rowIdx < 0 || rowIdx >= classStudents.length) return;
    if (colIdx < 0 || colIdx >= visibleCols.length) return;
    const colKey = visibleCols[colIdx];
    const target = cellRefs.current.get(`${rowIdx}-${colKey}`);
    if (target) {
      target.focus();
      target.select();
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: EditableColKey
  ) => {
    const colIdx = visibleCols.indexOf(colKey);
    if (colIdx === -1) return;

    const isScoreCol = colKey !== 'remark' && colKey !== 'yearRemark';

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (isScoreCol && editingCell) {
        const student = classStudents[rowIdx];
        if (student) commitScoreChange(student.id, colKey, editingCell.raw);
        setEditingCell(null);
      }
      focusGridCell(rowIdx + 1, colIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isScoreCol && editingCell) {
        const student = classStudents[rowIdx];
        if (student) commitScoreChange(student.id, colKey, editingCell.raw);
        setEditingCell(null);
      }
      focusGridCell(rowIdx - 1, colIdx);
    } else if (e.key === 'ArrowRight' && isScoreCol) {
      const input = e.currentTarget;
      if (
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length
      ) {
        e.preventDefault();
        focusGridCell(rowIdx, colIdx + 1);
      }
    } else if (e.key === 'ArrowLeft' && isScoreCol) {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        focusGridCell(rowIdx, colIdx - 1);
      }
    }
  };

  const handleBatchColumnFill = (colKey: GradeColumnTarget) => {
    if (!selectedClass) return;
    const parsed = parseScoreCell(batchScoreInput);
    if (parsed === null) {
      setStatusBanner({
        type: 'error',
        text: 'Điểm điền hàng loạt không hợp lệ (nhập số từ 0 đến 10).',
      });
      return;
    }

    const nextMap = { ...gradebookMap };
    const newDirty = { ...dirtyIds };
    const now = new Date().toISOString();
    let count = 0;

    allClassStudents.forEach((st) => {
      const entryId = makeGradeEntryId(selectedClass.id, semester, st.id);
      const prev = getEntryForStudent(st.id, semester);
      const currentVal = prev[colKey];
      if (batchFillEmptyOnly && currentVal !== null && currentVal !== undefined) return;
      const updated: SubjectGradeEntry = {
        ...prev,
        [colKey]: parsed,
        updatedAt: now,
      };
      updated.tbm = computeCircular22TBM(updated, config.txColumnCount);
      nextMap[entryId] = updated;
      newDirty[entryId] = true;
      count++;
    });

    onUpdateGradebookMap(nextMap);
    setDirtyIds(newDirty);
    setActiveColMenu(null);
    setStatusBanner({
      type: 'success',
      text: `Đã điền điểm ${formatScoreValue(parsed, 2)} cho ${count} học sinh ở cột ${colKey.toUpperCase()}.`,
    });
  };

  const handleClearColumn = (colKey: GradeColumnTarget) => {
    if (!selectedClass) return;
    const nextMap = { ...gradebookMap };
    const newDirty = { ...dirtyIds };
    const now = new Date().toISOString();

    allClassStudents.forEach((st) => {
      const entryId = makeGradeEntryId(selectedClass.id, semester, st.id);
      const prev = getEntryForStudent(st.id, semester);
      if (prev[colKey] === null || prev[colKey] === undefined) return;
      const updated: SubjectGradeEntry = {
        ...prev,
        [colKey]: null,
        updatedAt: now,
      };
      updated.tbm = computeCircular22TBM(updated, config.txColumnCount);
      nextMap[entryId] = updated;
      newDirty[entryId] = true;
    });

    onUpdateGradebookMap(nextMap);
    setDirtyIds(newDirty);
    setActiveColMenu(null);
    setStatusBanner({
      type: 'info',
      text: `Đã xóa toàn bộ dữ liệu cột ${colKey.toUpperCase()} của lớp ${selectedClass.name}. Nhấn "Lưu" để xác nhận ghi CSDL.`,
    });
  };

  const handleSaveGradebook = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      const entriesToSave = allClassStudents.map((st) => {
        const entry = getEntryForStudent(st.id, semester);
        return {
          ...entry,
          tbm: computeCircular22TBM(entry, config.txColumnCount),
          updatedAt: new Date().toISOString(),
        };
      });

      await saveGradebookEntriesBulk(entriesToSave);

      let cloudSaved = 0;
      if (ownerUid) {
        cloudSaved = await syncGradebookEntriesToFirestore(entriesToSave, ownerUid);
      }

      const updatedMap = { ...gradebookMap };
      entriesToSave.forEach((e) => {
        updatedMap[e.id] = e;
      });
      onUpdateGradebookMap(updatedMap);
      setDirtyIds({});
      setStatusBanner({
        type: 'success',
        text:
          cloudSaved > 0
            ? `Đã lưu Học kỳ ${semester} lớp ${selectedClass.name} (${entriesToSave.length} HS) vào IndexedDB & Cloud Firestore.`
            : `Đã lưu Học kỳ ${semester} lớp ${selectedClass.name} (${entriesToSave.length} HS) vào bộ nhớ Offline IndexedDB.`,
      });
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Không thể lưu bảng điểm. Vui lòng thử lại.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromApp = async () => {
    if (!selectedClass) return;
    setSyncing(true);
    try {
      const { nextMap, syncedSlotsCount, affectedStudentsCount } =
        await syncAppScoresToGradebook(
          allClassStudents,
          gradebookMap,
          selectedClass.id,
          semester,
          config.txColumnCount
        );
      onUpdateGradebookMap(nextMap);
      if (syncedSlotsCount > 0) {
        setStatusBanner({
          type: 'success',
          text: `Đã đồng bộ thành công ${syncedSlotsCount} cột điểm từ mục Gọi học sinh & Trắc nghiệm cho ${affectedStudentsCount} học sinh lớp ${selectedClass.name}.`,
        });
      } else {
        setStatusBanner({
          type: 'info',
          text: `Không có lượt điểm App mới nào chưa đồng bộ hoặc các cột ĐĐG TX (1–${config.txColumnCount}) của lớp ${selectedClass.name} đã được điền đủ.`,
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickApplyRemarks = async (
    fillMode: 'empty_only' | 'overwrite_all',
    useAi = false
  ) => {
    if (!selectedClass || allClassStudents.length === 0) return;
    setRemarkMenuOpen(false);
    setAiLoading(true);
    try {
      let aiMap: Record<string, string> | null = null;
      let usedAi = false;

      if (useAi) {
        const res = await generateAiRemarksBatch(
          selectedClass,
          semester,
          allClassStudents,
          gradebookMap,
          masterCtx.subjectName,
          config
        );
        aiMap = res.remarksByStudentId;
        usedAi = res.usedAi;
      }

      const nextMap = { ...gradebookMap };
      const changed: SubjectGradeEntry[] = [];
      const now = new Date().toISOString();

      allClassStudents.forEach((st, idx) => {
        const entryId = makeGradeEntryId(selectedClass.id, semester, st.id);
        const prev = getEntryForStudent(st.id, semester);
        const tbmSem = computeCircular22TBM(prev, config.txColumnCount);
        const hk1Tbm =
          semester === 2
            ? computeCircular22TBM(getEntryForStudent(st.id, 1), config.txColumnCount)
            : null;
        const yearTbm = semester === 2 ? computeCircular22YearTBM(hk1Tbm, tbmSem) : null;

        const targetRemark =
          (aiMap && aiMap[st.id]) || generateFallbackRemark(st, prev, idx, config);
        const shouldFillSem =
          fillMode === 'overwrite_all' || !(prev.remark && prev.remark.trim());

        let nextYearRemark = prev.yearRemark || '';
        let shouldFillYear = false;
        if (semester === 2) {
          shouldFillYear =
            fillMode === 'overwrite_all' || !(prev.yearRemark && prev.yearRemark.trim());
          if (shouldFillYear) {
            const yearRank = getCircular22Rank(yearTbm ?? tbmSem);
            const sample =
              yearRank === 'Tốt'
                ? config.remarkTemplates.tot
                : yearRank === 'Khá'
                  ? config.remarkTemplates.kha
                  : yearRank === 'Đạt'
                    ? config.remarkTemplates.dat
                    : yearRank === 'Chưa đạt'
                      ? config.remarkTemplates.chuaDat
                      : targetRemark;
            nextYearRemark = sample;
          }
        }

        if (!shouldFillSem && !shouldFillYear) return;

        const updated: SubjectGradeEntry = {
          ...prev,
          remark: shouldFillSem ? targetRemark : prev.remark,
          yearRemark: semester === 2 && shouldFillYear ? nextYearRemark : prev.yearRemark,
          tbm: tbmSem,
          updatedAt: now,
        };
        nextMap[entryId] = updated;
        changed.push(updated);
      });

      if (changed.length > 0) {
        await saveGradebookEntriesBulk(changed);
        if (ownerUid) {
          await syncGradebookEntriesToFirestore(changed, ownerUid);
        }
        onUpdateGradebookMap(nextMap);
      }

      setStatusBanner({
        type: changed.length > 0 ? 'success' : 'info',
        text:
          changed.length > 0
            ? usedAi
              ? `Gemini AI đã điền nhận xét cho ${changed.length} học sinh lớp ${selectedClass.name}.`
              : `Đã tự động điền nhận xét mẫu cho ${changed.length} học sinh lớp ${selectedClass.name} (${
                  fillMode === 'empty_only' ? 'chỉ ô trống' : 'ghi đè toàn bộ'
                }).`
            : 'Tất cả học sinh đã có nhận xét. Chọn "Ghi đè toàn bộ" nếu muốn thay thế lại.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportSmas = (scope: 'current' | 'all') => {
    setExportMenuOpen(false);
    if (!selectedClass) return;
    const targetClasses = scope === 'all' ? classroomStore.classes : [selectedClass];
    exportSmasGradebookExcel(targetClasses, semester, classroomStore.students, gradebookMap, {
      departmentName: masterCtx.departmentName,
      schoolName: masterCtx.schoolName,
      subjectName: masterCtx.subjectName,
      teacherName: masterCtx.teacherHonorific,
    });
    setStatusBanner({
      type: 'success',
      text:
        scope === 'all'
          ? `Đã xuất file Excel chuẩn SMAS 4.0 cho tất cả ${targetClasses.length} lớp (${targetClasses
              .map((c) => `${masterCtx.subjectName} ${c.name}`)
              .join(', ')}).`
          : `Đã xuất file Excel chuẩn SMAS 4.0 lớp ${selectedClass.name} (Môn ${masterCtx.subjectName} · HK${semester}).`,
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedClass) return;

    setImporting(true);
    try {
      const { updatedEntries, matchedCount, newStudents } =
        await importSmasGradebookExcel(
          file,
          selectedClass,
          semester,
          allClassStudents,
          gradebookMap
        );

      if (newStudents.length > 0) {
        const nextStore = await saveClassroomData({
          ...classroomStore,
          students: [...classroomStore.students, ...newStudents],
        });
        onUpdateClassroomStore(nextStore);
      }

      if (updatedEntries.length > 0) {
        await saveGradebookEntriesBulk(updatedEntries);
        if (ownerUid) {
          await syncGradebookEntriesToFirestore(updatedEntries, ownerUid);
        }
        const nextMap = { ...gradebookMap };
        updatedEntries.forEach((entry) => {
          nextMap[entry.id] = entry;
        });
        onUpdateGradebookMap(nextMap);
      }

      setStatusBanner({
        type: matchedCount > 0 ? 'success' : 'info',
        text:
          matchedCount > 0
            ? `Đã nhập dữ liệu SMAS 4.0 từ "${file.name}" cho ${matchedCount} học sinh${newStudents.length > 0 ? ` (bổ sung ${newStudents.length} HS mới)` : ''}.`
            : `Không tìm thấy dữ liệu hợp lệ trong tệp "${file.name}". Vui lòng kiểm tra cột Họ và tên / Mã học sinh / ĐĐG TX / GK / CK.`,
      });
    } catch {
      setStatusBanner({
        type: 'error',
        text: `Không thể đọc tệp "${file.name}". Định dạng hỗ trợ: .xlsx, .xls, .csv.`,
      });
    } finally {
      setImporting(false);
    }
  };

  const renderColumnActionDropdown = (
    colKey: GradeColumnTarget,
    colLabel: string
  ) => {
    const isOpen = activeColMenu === colKey;
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveColMenu(isOpen ? null : colKey);
          }}
          title={`Thao tác nhanh cột ${colLabel}`}
          aria-label={`Thao tác nhanh cột ${colLabel}`}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <ChevronDown className="h-3 w-3" />
        </button>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1/2 top-full z-40 mt-1.5 w-56 -translate-x-1/2 rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-left text-[#334155] shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase text-[#136F63] dark:text-teal-300">
                Cột {colLabel}
              </span>
              <button
                type="button"
                onClick={() => setActiveColMenu(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Điền điểm hàng loạt (0–10):
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={batchScoreInput}
                    onChange={(e) => setBatchScoreInput(e.target.value)}
                    className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-center font-mono text-xs font-bold text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleBatchColumnFill(colKey)}
                    className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-[#136F63] px-2.5 text-[11px] font-bold text-white hover:bg-[#0F5A50]"
                  >
                    Điền ngay
                  </button>
                </div>
                <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={batchFillEmptyOnly}
                    onChange={(e) => setBatchFillEmptyOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#136F63]"
                  />
                  Chỉ điền các ô đang trống
                </label>
              </div>

              <button
                type="button"
                onClick={() => handleClearColumn(colKey)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <Eraser className="h-3.5 w-3.5" />
                Xóa sạch điểm cột này
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderScoreInput = (
    studentId: string,
    rowIdx: number,
    colKey: GradeColumnTarget,
    numericValue: number | null,
    accentClass?: string
  ) => {
    const cellKey = `${studentId}:${semester}:${colKey}`;
    const isEditing = editingCell?.key === cellKey;
    const displayValue = isEditing
      ? editingCell.raw
      : formatScoreValue(numericValue, 2);

    return (
      <input
        ref={(el) => {
          cellRefs.current.set(`${rowIdx}-${colKey}`, el);
        }}
        type="text"
        inputMode="decimal"
        value={displayValue}
        placeholder=""
        aria-label={`${colKey.toUpperCase()} dòng ${rowIdx + 1}`}
        onFocus={() =>
          setEditingCell({
            key: cellKey,
            raw: formatScoreValue(numericValue, 2),
          })
        }
        onChange={(e) =>
          setEditingCell({
            key: cellKey,
            raw: e.target.value,
          })
        }
        onBlur={() => {
          if (editingCell && editingCell.key === cellKey) {
            commitScoreChange(studentId, colKey, editingCell.raw);
            setEditingCell(null);
          }
        }}
        onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colKey)}
        className={`tabular-nums h-9 w-full min-w-[44px] rounded border border-transparent bg-transparent px-1 text-center text-[13px] font-semibold outline-none transition focus:border-[#136F63] focus:bg-teal-50/70 focus:ring-2 focus:ring-teal-200 dark:focus:bg-slate-800 dark:focus:ring-teal-900 ${
          accentClass || 'text-slate-900 dark:text-slate-100'
        }`}
      />
    );
  };

  return (
    <div className="space-y-3.5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportExcel}
        className="hidden"
      />

      {/* Top SMAS 4.0 Control Bar */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 shadow-xs sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Left Side: Class Quick Buttons & Semester Switcher (#136F63) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!embedded && (
              <>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#136F63]" strokeWidth={2} />
                  <h1 className="text-[16px] font-bold tracking-tight text-slate-900 sm:text-[17px] dark:text-white">
                    {mode === 'gradebook'
                      ? `Sổ điểm riêng · Môn ${masterCtx.subjectName} (SMAS 4.0)`
                      : 'Đồng bộ điểm App & Xuất SMAS'}
                  </h1>
                </div>
                <div className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />
              </>
            )}

            {/* Quick Class Selector Buttons (e.g. 11B05, 11B10, 11B13, 11B11...) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Lớp:</span>
              {classroomStore.classes.map((c) => {
                const isSelected = c.id === selectedClass?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChangeActiveClassId(c.id)}
                    className={`h-8 whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold transition ${
                      isSelected
                        ? 'border-[#136F63] bg-[#136F63] text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#136F63]/50 hover:bg-teal-50/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setShowCreateClassModal(true)}
                title="Thêm lớp mới từ Khai báo Đầu năm"
                className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-dashed border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tạo lớp</span>
              </button>
            </div>

            <div className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />

            {/* Semester 1 / Semester 2 Switcher highlighted with #136F63 */}
            <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setSemester(1)}
                className={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${
                  semester === 1
                    ? 'bg-[#136F63] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                Học kỳ 1
              </button>
              <button
                type="button"
                onClick={() => setSemester(2)}
                className={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${
                  semester === 2
                    ? 'bg-[#136F63] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                Học kỳ 2
              </button>
            </div>
          </div>

          {/* Right Side: Compact Tool Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Cấu hình */}
            <button
              type="button"
              onClick={() => {
                setDraftConfig(config);
                setConfigOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:border-[#136F63]/50 hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Settings2 className="h-3.5 w-3.5 text-[#136F63]" />
              <span>Cấu hình</span>
            </button>

            {/* Nhận xét (Dropdown: Điền ô trống / Ghi đè toàn bộ / AI) */}
            <div className="relative">
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => {
                  setExportMenuOpen(false);
                  setRemarkMenuOpen((v) => !v);
                }}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:border-[#136F63]/50 hover:bg-[#F8FAFC] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#136F63]" />
                ) : (
                  <MessageSquareText className="h-3.5 w-3.5 text-[#136F63]" />
                )}
                <span>Nhận xét</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {remarkMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-[8px] border border-[#E2E8F0] bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                    Điền nhanh nhận xét theo TBM
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickApplyRemarks('empty_only', false)}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-[#136F63] dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <PenLine className="h-3.5 w-3.5 shrink-0 text-[#136F63]" />
                    <span>Điền vào các ô trống</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickApplyRemarks('overwrite_all', false)}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-[#136F63] dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#B45309]" />
                    <span>Ghi đè toàn bộ lớp</span>
                  </button>
                  <div className="my-1 border-t border-[#E2E8F0] dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={() => handleQuickApplyRemarks('empty_only', true)}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-semibold text-[#136F63] hover:bg-[#F8FAFC] dark:text-teal-300 dark:hover:bg-slate-800"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span>AI Gemini gợi ý (ô trống)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickApplyRemarks('overwrite_all', true)}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-semibold text-[#136F63] hover:bg-[#F8FAFC] dark:text-teal-300 dark:hover:bg-slate-800"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span>AI Gemini viết lại toàn bộ</span>
                  </button>
                </div>
              )}
            </div>

            {/* Nhập dữ liệu (Excel SMAS) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:border-[#136F63]/50 hover:bg-[#F8FAFC] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#136F63]" />
              ) : (
                <Upload className="h-3.5 w-3.5 text-[#136F63]" />
              )}
              <span>Nhập dữ liệu</span>
            </button>

            {/* Xuất Excel (1 lớp hoặc tất cả các lớp thành các Sheet riêng) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setRemarkMenuOpen(false);
                  setExportMenuOpen((v) => !v);
                }}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:border-[#136F63]/50 hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Download className="h-3.5 w-3.5 text-[#136F63]" />
                <span>Xuất Excel</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-[8px] border border-[#E2E8F0] bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                    Biểu mẫu Excel chuẩn SMAS 4.0
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportSmas('current')}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-[#136F63] dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-[#136F63]" />
                    <span>Xuất lớp {selectedClass?.name} (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSmas('all')}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-[#136F63] dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0 text-[#136F63]" />
                    <span>
                      Xuất tất cả {classroomStore.classes.length} lớp (Sheet riêng)
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Lưu (IndexedDB & Cloud Firestore) */}
            <button
              type="button"
              onClick={handleSaveGradebook}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-4 text-[13px] font-medium text-white transition hover:bg-[#0F594F] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Lưu{dirtyCount > 0 ? ` (${dirtyCount})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Summary Metrics & Quick Sync / Search Strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Sĩ số:{' '}
              <strong className="tabular-nums text-slate-900 dark:text-white">
                {stats.totalStudents}
              </strong>
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              TBM Lớp:{' '}
              <strong className="tabular-nums text-[#136F63] dark:text-teal-300">
                {stats.avgClassTbm !== null ? formatScoreValue(stats.avgClassTbm, 1) : '—'}
              </strong>
            </span>
            <span className="font-semibold text-[#15803D] dark:text-emerald-400">
              Tốt: <strong className="tabular-nums">{stats.tot}</strong>
            </span>
            <span className="font-semibold text-[#0369A1] dark:text-[#BAE6FD]">
              Khá: <strong className="tabular-nums">{stats.kha}</strong>
            </span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              Đạt: <strong className="tabular-nums">{stats.dat}</strong>
            </span>
            <span className="font-semibold text-[#C00000] dark:text-rose-400">
              Chưa đạt (&lt;5,0): <strong className="tabular-nums">{stats.chuaDat}</strong>
            </span>
            {ownerUid && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <Cloud className="h-3 w-3 text-[#136F63]" />
                Đồng bộ IndexedDB &amp; Cloud Firestore
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {totalPendingAppScores > 0 && (
              <button
                type="button"
                onClick={handleSyncFromApp}
                disabled={syncing}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-bold text-[#136F63] transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>Đồng bộ điểm App ({totalPendingAppScores})</span>
              </button>
            )}
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, ngày sinh hoặc mã HS..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none transition focus:border-[#136F63] focus:bg-white sm:w-56 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {statusBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-[8px] border px-3.5 py-2.5 text-[13px] font-medium ${
            statusBanner.type === 'error'
              ? 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C] dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
              : statusBanner.type === 'success'
                ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                : 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="shrink-0 text-[12px] font-semibold underline opacity-80 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      {mode === 'gradebook' ? (
        /* SMAS 4.0 2-Tier Teal Header Gradebook Table inside SmartboardViewport */
        <SmartboardViewport
          title={`Bảng Sổ điểm chuẩn SMAS 4.0 · Lớp ${selectedClass?.name || '—'}`}
          subtitle={`Môn ${masterCtx.subjectName} · Học kỳ ${semester} · ${classStudents.length} học sinh`}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table
              className={`w-full border-collapse text-left text-[13px] ${
                semester === 2 ? 'min-w-[1220px]' : 'min-w-[980px]'
              }`}
            >
              <thead>
                {/* Header Row 1 */}
                <tr className="bg-[#136F63] text-white">
                  <th
                    rowSpan={2}
                    className="w-12 border-b border-r border-teal-700/70 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide"
                  >
                    STT
                  </th>
                  <th
                    rowSpan={2}
                    className="min-w-[225px] border-b border-r border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide"
                  >
                    Họ và tên
                  </th>
                  <th
                    colSpan={config.txColumnCount}
                    className="border-b border-r border-teal-700/70 px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide"
                  >
                    ĐĐG TX
                  </th>
                  <th
                    rowSpan={2}
                    className="w-20 border-b border-r border-teal-700/70 px-1.5 py-2 text-center text-xs font-bold uppercase tracking-wide"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>ĐĐG GK</span>
                      {renderColumnActionDropdown('gk', 'ĐĐG GK')}
                    </div>
                  </th>
                  <th
                    rowSpan={2}
                    className="w-20 border-b border-r border-teal-700/70 px-1.5 py-2 text-center text-xs font-bold uppercase tracking-wide"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>ĐĐG CK</span>
                      {renderColumnActionDropdown('ck', 'ĐĐG CK')}
                    </div>
                  </th>

                  {semester === 1 ? (
                    <>
                      <th
                        rowSpan={2}
                        className="w-24 border-b border-r border-teal-700/70 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide"
                      >
                        TBM HKI
                      </th>
                      <th
                        rowSpan={2}
                        className="min-w-[250px] border-b border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide"
                      >
                        Nhận xét HKI
                      </th>
                    </>
                  ) : (
                    <>
                      <th
                        rowSpan={2}
                        className="w-24 border-b border-r border-teal-700/70 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide"
                      >
                        TBM HKII
                      </th>
                      <th
                        rowSpan={2}
                        className="w-24 border-b border-r border-teal-700/70 bg-[#0F5A50] px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide"
                      >
                        TBM CN
                      </th>
                      <th
                        rowSpan={2}
                        className="min-w-[215px] border-b border-r border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide"
                      >
                        Nhận xét HKII
                      </th>
                      <th
                        rowSpan={2}
                        className="min-w-[215px] border-b border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase tracking-wide"
                      >
                        Nhận xét CN
                      </th>
                    </>
                  )}
                </tr>

                {/* Header Row 2: ĐĐG TX sub-columns 1..5 with dropdown quick actions */}
                <tr className="bg-[#136F63] text-white">
                  {txCols.map((txKey, idx) => (
                    <th
                      key={txKey}
                      className="w-16 border-b border-r border-teal-700/70 px-1 py-1 text-center text-xs font-bold"
                    >
                      <div className="inline-flex items-center justify-center">
                        <span>{idx + 1}</span>
                        {renderColumnActionDropdown(txKey, `ĐĐG TX ${idx + 1}`)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {classStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={semester === 2 ? 12 : 10}
                      className="px-4 py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400"
                    >
                      Chưa có học sinh phù hợp trong lớp này. Hãy thêm học sinh ở tab Danh sách lớp hoặc dùng nút <strong>Nhập dữ liệu</strong> từ file Excel SMAS 4.0.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((st, rowIdx) => {
                    const entry = getEntryForStudent(st.id, semester);
                    const tbm = computeCircular22TBM(entry, config.txColumnCount);
                    const hk1Entry = semester === 2 ? getEntryForStudent(st.id, 1) : null;
                    const tbmHk1 = hk1Entry
                      ? computeCircular22TBM(hk1Entry, config.txColumnCount)
                      : null;
                    const tbmCn =
                      semester === 2 ? computeCircular22YearTBM(tbmHk1, tbm) : null;
                    const activeRankTbm = semester === 2 ? tbmCn ?? tbm : tbm;
                    const rank = getCircular22Rank(activeRankTbm);
                    const isBelowPass = activeRankTbm !== null && activeRankTbm < 5.0;

                    return (
                      <tr
                        key={st.id}
                        className={`transition-colors ${
                          isBelowPass
                            ? 'bg-rose-50/45 hover:bg-rose-50/80 dark:bg-rose-950/20 dark:hover:bg-rose-950/35'
                            : rowIdx % 2 === 1
                              ? 'bg-slate-50/60 hover:bg-teal-50/40 dark:bg-slate-900/60 dark:hover:bg-slate-800/70'
                              : 'bg-white hover:bg-teal-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <td className="tabular-nums border-r border-slate-200 px-2 py-1.5 text-center text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                          {rowIdx + 1}
                        </td>

                        {/* SMAS style Student Name + Dob - Code */}
                        <td className="border-r border-slate-200 px-3 py-1.5 dark:border-slate-800">
                          <div className="font-bold leading-snug text-slate-900 dark:text-slate-100">
                            {st.fullName}
                          </div>
                          <div className="tabular-nums mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                            {st.dob} - {st.studentCode}
                          </div>
                        </td>

                        {/* ĐĐG TX 1..5 */}
                        {txCols.map((txKey) => (
                          <td
                            key={txKey}
                            className="border-r border-slate-200 px-1 py-1 dark:border-slate-800"
                          >
                            {renderScoreInput(st.id, rowIdx, txKey, entry[txKey] ?? null)}
                          </td>
                        ))}

                        {/* ĐĐG GK */}
                        <td className="border-r border-slate-200 bg-teal-50/20 px-1 py-1 dark:border-slate-800 dark:bg-teal-950/15">
                          {renderScoreInput(
                            st.id,
                            rowIdx,
                            'gk',
                            entry.gk,
                            'text-[#136F63] dark:text-teal-300'
                          )}
                        </td>

                        {/* ĐĐG CK */}
                        <td className="border-r border-slate-200 bg-teal-50/35 px-1 py-1 dark:border-slate-800 dark:bg-teal-950/25">
                          {renderScoreInput(
                            st.id,
                            rowIdx,
                            'ck',
                            entry.ck,
                            'text-[#0F5A50] dark:text-teal-200'
                          )}
                        </td>

                        {/* TBM HKI or TBM HKII */}
                        <td
                          className={`tabular-nums border-r border-slate-200 px-2 py-1.5 text-center dark:border-slate-800 ${
                            tbm !== null && tbm < 5.0
                              ? 'bg-rose-100/80 text-[#C00000] dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-slate-50/70 text-slate-900 dark:bg-slate-800/50 dark:text-white'
                          }`}
                        >
                          <div className="text-[14px] font-extrabold">
                            {tbm !== null ? formatScoreValue(tbm, 1) : '—'}
                          </div>
                          {semester === 1 && tbm !== null && (
                            <div
                              className={`text-[10px] font-bold ${
                                tbm < 5.0
                                  ? 'text-[#C00000] dark:text-rose-300'
                                  : tbm >= 8.0
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : tbm >= 6.5
                                      ? 'text-[#136F63] dark:text-teal-300'
                                      : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {getCircular22Rank(tbm)}
                            </div>
                          )}
                        </td>

                        {/* TBM CN when Semester 2 */}
                        {semester === 2 && (
                          <td
                            className={`tabular-nums border-r border-slate-200 px-2 py-1.5 text-center dark:border-slate-800 ${
                              tbmCn !== null && tbmCn < 5.0
                                ? 'bg-rose-100/90 text-[#C00000] dark:bg-rose-950/70 dark:text-rose-300'
                                : 'bg-teal-50/50 text-[#0F5A50] dark:bg-teal-950/35 dark:text-teal-200'
                            }`}
                          >
                            <div className="text-[14px] font-extrabold">
                              {tbmCn !== null ? formatScoreValue(tbmCn, 1) : '—'}
                            </div>
                            {tbmCn !== null && (
                              <div className="text-[10px] font-bold">{rank}</div>
                            )}
                          </td>
                        )}

                        {/* Nhận xét HKI / HKII */}
                        <td
                          className={`px-2 py-1 ${
                            semester === 2 ? 'border-r border-slate-200 dark:border-slate-800' : ''
                          }`}
                        >
                          <input
                            ref={(el) => {
                              cellRefs.current.set(`${rowIdx}-remark`, el);
                            }}
                            type="text"
                            value={entry.remark}
                            placeholder={`Nhận xét HK${semester === 1 ? 'I' : 'II'}...`}
                            onChange={(e) =>
                              handleRemarkChange(st.id, 'remark', e.target.value)
                            }
                            onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 'remark')}
                            className="h-9 w-full rounded border border-transparent bg-transparent px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-[#136F63] focus:bg-teal-50/50 dark:text-slate-200 dark:focus:bg-slate-800"
                          />
                        </td>

                        {/* Nhận xét CN when Semester 2 */}
                        {semester === 2 && (
                          <td className="px-2 py-1">
                            <input
                              ref={(el) => {
                                cellRefs.current.set(`${rowIdx}-yearRemark`, el);
                              }}
                              type="text"
                              value={entry.yearRemark || ''}
                              placeholder="Nhận xét Cả năm..."
                              onChange={(e) =>
                                handleRemarkChange(st.id, 'yearRemark', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 'yearRemark')}
                              className="h-9 w-full rounded border border-transparent bg-transparent px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-[#136F63] focus:bg-teal-50/50 dark:text-slate-200 dark:focus:bg-slate-800"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SmartboardViewport>
      ) : (
        /* II.2.b: App Sync Queue & SMAS Batch Export View */
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400">
                Điểm App chờ đồng bộ (HK{semester})
              </div>
              <div className="tabular-nums mt-1.5 text-2xl font-bold text-[#136F63] dark:text-teal-400">
                {totalPendingAppScores} cột điểm
              </div>
              <div className="mt-1 text-[12px] text-[#64748B] dark:text-slate-400">
                Từ kết quả Gọi học sinh &amp; Trắc nghiệm nhanh
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400">
                Cơ cấu xếp loại Thông tư 22
              </div>
              <div className="tabular-nums mt-1.5 text-[14px] font-semibold text-[#0F172A] dark:text-slate-100">
                Tốt: {stats.tot} · Khá: {stats.kha} · Đạt: {stats.dat} ·{' '}
                <span className="text-[#B91C1C] dark:text-rose-400">
                  Chưa đạt: {stats.chuaDat}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-[#64748B] dark:text-slate-400">
                TBM cả lớp:{' '}
                {stats.avgClassTbm !== null ? formatScoreValue(stats.avgClassTbm, 1) : '—'}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400">
                Thao tác nhanh SMAS 4.0
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSyncFromApp}
                  disabled={syncing}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3 text-[13px] font-medium text-white transition hover:bg-[#0F594F]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>Đồng bộ ngay</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSmas('all')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5 text-[#136F63]" />
                  <span>Xuất tất cả lớp (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="bg-[#136F63] text-white">
                    <th className="w-12 border-b border-r border-teal-700/70 px-2 py-2.5 text-center text-xs font-bold uppercase">
                      STT
                    </th>
                    <th className="min-w-[200px] border-b border-r border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase">
                      Họ và tên
                    </th>
                    <th className="min-w-[230px] border-b border-r border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase">
                      Điểm App chưa đồng bộ
                    </th>
                    <th className="border-b border-r border-teal-700/70 px-3 py-2.5 text-center text-xs font-bold uppercase">
                      ĐĐG TX (1–{config.txColumnCount})
                    </th>
                    <th className="w-24 border-b border-r border-teal-700/70 px-2 py-2.5 text-center text-xs font-bold uppercase">
                      TBM HK
                    </th>
                    <th className="min-w-[220px] border-b border-teal-700/70 px-3 py-2.5 text-xs font-bold uppercase">
                      Nhận xét HK
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {classStudents.map((st, idx) => {
                    const entry = getEntryForStudent(st.id, semester);
                    const tbm = computeCircular22TBM(entry, config.txColumnCount);
                    const rank = getCircular22Rank(tbm);
                    const isBelowPass = tbm !== null && tbm < 5.0;
                    const preview = syncPreview.find((p) => p.studentId === st.id);

                    return (
                      <tr
                        key={st.id}
                        className={
                          isBelowPass
                            ? 'bg-rose-50/45 dark:bg-rose-950/20'
                            : idx % 2 === 1
                              ? 'bg-slate-50/50 dark:bg-slate-900/60'
                              : 'bg-white dark:bg-slate-900'
                        }
                      >
                        <td className="tabular-nums border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-500 dark:border-slate-800">
                          {idx + 1}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {st.fullName}
                          </div>
                          <div className="tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                            {st.dob} - {st.studentCode}
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                          {preview && preview.pendingScores.length > 0 ? (
                            <div className="space-y-1">
                              {preview.pendingScores.slice(0, 2).map((ps) => (
                                <div
                                  key={ps.attemptId}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-2 py-1 text-xs font-semibold text-[#136F63] dark:bg-teal-950/50 dark:text-teal-300"
                                >
                                  <span className="truncate">{ps.label}</span>
                                  <span className="tabular-nums shrink-0 font-extrabold">
                                    {formatScoreValue(ps.score, 2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Đã đồng bộ hết</span>
                          )}
                        </td>
                        <td className="tabular-nums border-r border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
                          {txCols
                            .map((k) => {
                              const v = entry[k];
                              return v !== null && v !== undefined ? formatScoreValue(v, 2) : '—';
                            })
                            .join('  |  ')}
                        </td>
                        <td
                          className={`tabular-nums border-r border-slate-200 px-2 py-2 text-center dark:border-slate-800 ${
                            isBelowPass
                              ? 'bg-rose-100/80 text-[#C00000] dark:bg-rose-950/60 dark:text-rose-300'
                              : ''
                          }`}
                        >
                          <div className="text-sm font-extrabold">
                            {tbm !== null ? formatScoreValue(tbm, 1) : '—'}
                          </div>
                          <div className="text-[10px] font-bold">{rank}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                          {entry.remark || 'Chưa có nhận xét'}
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

      {/* MODAL: Cấu hình Sổ điểm SMAS 4.0 */}
      {configOpen && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setConfigOpen(false)}
          maxWidthClass="max-w-lg"
          title={
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-[#136F63]" />
              <span>Cấu hình Sổ điểm &amp; Câu nhận xét mẫu</span>
            </div>
          }
          bodyClassName="p-5"
        >
          <div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold uppercase text-[#64748B] dark:text-slate-300">
                  Số cột ĐĐG Thường xuyên (TX)
                </label>
                <div className="mt-1.5 flex gap-2">
                  {([3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDraftConfig((prev) => ({ ...prev, txColumnCount: n }))}
                      className={`h-9 flex-1 rounded-[8px] border text-[13px] font-medium transition ${
                        draftConfig.txColumnCount === n
                          ? 'border-[#136F63] bg-[#136F63] text-white'
                          : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {n} cột TX
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                    Câu nhận xét mẫu theo mức TBM
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftConfig(DEFAULT_GRADEBOOK_CONFIG)}
                    className="text-[11px] font-semibold text-[#136F63] underline"
                  >
                    Khôi phục mặc định
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Mức Tốt (TBM ≥ 8,0):
                  </label>
                  <input
                    type="text"
                    value={draftConfig.remarkTemplates.tot}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        remarkTemplates: { ...prev.remarkTemplates, tot: e.target.value },
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0369A1] dark:text-[#BAE6FD]">
                    Mức Khá (6,5 ≤ TBM &lt; 8,0):
                  </label>
                  <input
                    type="text"
                    value={draftConfig.remarkTemplates.kha}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        remarkTemplates: { ...prev.remarkTemplates, kha: e.target.value },
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    Mức Đạt (5,0 ≤ TBM &lt; 6,5):
                  </label>
                  <input
                    type="text"
                    value={draftConfig.remarkTemplates.dat}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        remarkTemplates: { ...prev.remarkTemplates, dat: e.target.value },
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                    Mức Chưa đạt (TBM &lt; 5,0):
                  </label>
                  <input
                    type="text"
                    value={draftConfig.remarkTemplates.chuaDat}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        remarkTemplates: { ...prev.remarkTemplates, chuaDat: e.target.value },
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-4 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfig(draftConfig);
                  saveGradebookConfig(draftConfig);
                  setConfigOpen(false);
                  setStatusBanner({
                    type: 'success',
                    text: `Đã lưu cấu hình (${draftConfig.txColumnCount} cột ĐĐG TX & bộ nhận xét mẫu).`,
                  });
                }}
                className="min-h-[48px] rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                Áp dụng cấu hình
              </button>
            </div>
          </div>
        </SmartboardViewport>
      )}

      <CreateClassroomFromMasterModal
        open={showCreateClassModal}
        onClose={() => setShowCreateClassModal(false)}
        masterData={masterData}
        existingClasses={classroomStore.classes}
        onSelectExistingClass={(cid) => onChangeActiveClassId(cid)}
        onCreateClass={async (newCls) => {
          const next = await upsertClassInStore(classroomStore, newCls);
          onUpdateClassroomStore(next);
          onChangeActiveClassId(newCls.id);
          setStatusBanner({
            type: 'success',
            text: `Đã mở lớp ${newCls.name} (Khối ${newCls.grade} · Năm học ${newCls.schoolYear} · GVCN: ${newCls.homeroomTeacher}) từ Khai báo Đầu năm.`,
          });
        }}
      />
    </div>
  );
};
