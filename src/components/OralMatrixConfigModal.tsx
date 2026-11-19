import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  Lock,
  Minus,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BankQuestion,
  Classroom,
  ClassroomStudent,
  GradeColumnTarget,
  OralCheckMatrixConfig,
  SubjectGradeEntry,
} from '../types/eduplan';
import {
  KNTT_CATALOG_CHAPTERS,
  lookupKNTTMeta,
} from '../utils/questionBankDb';
import {
  buildTopicLabelFromScope,
  CognitiveLevel,
  countAvailabilityForScope,
  createDefaultOralMatrixConfig,
  getDefaultChapterForGrade,
} from '../utils/oralMatrixDb';
import {
  loadGradebookConfig,
  makeGradeEntryId,
  suggestNextTxColumn,
} from '../utils/gradebookDb';
import { SmartboardViewport } from './SmartboardViewport';

interface OralMatrixConfigModalProps {
  open: boolean;
  activeClass: Classroom | null;
  classStudents: ClassroomStudent[];
  bankItems: BankQuestion[];
  gradebookMap?: Record<string, SubjectGradeEntry>;
  initialConfig: OralCheckMatrixConfig | null;
  requiredPromptReason?: string | null;
  onClose: () => void;
  onSaveMatrix: (config: OralCheckMatrixConfig) => void;
}

const SMAS_COL_LABELS: Record<GradeColumnTarget, string> = {
  tx1: 'ĐĐG TX 1',
  tx2: 'ĐĐG TX 2',
  tx3: 'ĐĐG TX 3',
  tx4: 'ĐĐG TX 4',
  tx5: 'ĐĐG TX 5',
  gk: 'ĐĐG GK',
  ck: 'ĐĐG CK',
};

const LEVEL_META: { key: CognitiveLevel; label: string; short: string }[] = [
  { key: 'NB', label: 'Nhận biết', short: 'NB' },
  { key: 'TH', label: 'Thông hiểu', short: 'TH' },
  { key: 'VD', label: 'Vận dụng', short: 'VD' },
  { key: 'VDC', label: 'Vận dụng cao', short: 'VDC' },
];

export const OralMatrixConfigModal: React.FC<OralMatrixConfigModalProps> = ({
  open,
  activeClass,
  classStudents,
  bankItems,
  gradebookMap = {},
  initialConfig,
  requiredPromptReason,
  onClose,
  onSaveMatrix,
}) => {
  const defaultGrade: '10' | '11' | '12' = activeClass?.grade || '12';

  const [draft, setDraft] = useState<OralCheckMatrixConfig>(() => {
    if (initialConfig && initialConfig.grade === defaultGrade) {
      return { ...initialConfig };
    }
    return createDefaultOralMatrixConfig(defaultGrade);
  });
  const [topicManuallyEdited, setTopicManuallyEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    const g = activeClass?.grade || '12';
    if (initialConfig && initialConfig.grade === g) {
      setDraft({ ...initialConfig });
      setTopicManuallyEdited(false);
    } else {
      setDraft(createDefaultOralMatrixConfig(g));
      setTopicManuallyEdited(false);
    }
  }, [open, activeClass?.id, activeClass?.grade, initialConfig]);

  // Dynamic Chapters for chosen Grade
  const chapterOptions = useMemo(() => {
    const map = new Map<string, { code: string; label: string; count: number }>();
    const gradeBank = bankItems.filter((q) => q.grade === draft.grade);

    KNTT_CATALOG_CHAPTERS.filter((c) => c.grade === draft.grade).forEach((ch) => {
      const cnt = gradeBank.filter(
        (q) => q.chapter.toUpperCase() === ch.code.toUpperCase()
      ).length;
      map.set(ch.code, {
        code: ch.code,
        label: ch.title,
        count: cnt,
      });
    });

    gradeBank.forEach((q) => {
      const code = q.chapter.toUpperCase();
      if (!map.has(code)) {
        const meta = lookupKNTTMeta(draft.grade, code, q.lesson);
        const cnt = gradeBank.filter((x) => x.chapter.toUpperCase() === code).length;
        map.set(code, { code, label: meta.chapterTitle, count: cnt });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, ''))
    );
  }, [bankItems, draft.grade]);

  // Dynamic Lessons for chosen Grade + Chapter
  const lessonOptions = useMemo(() => {
    if (draft.chapterCode === 'all') return [];
    const map = new Map<string, { code: string; label: string; count: number }>();
    const chBank = bankItems.filter(
      (q) =>
        q.grade === draft.grade &&
        q.chapter.toUpperCase() === draft.chapterCode.toUpperCase()
    );

    const catChapter = KNTT_CATALOG_CHAPTERS.find(
      (c) => c.grade === draft.grade && c.code.toUpperCase() === draft.chapterCode.toUpperCase()
    );
    if (catChapter) {
      catChapter.lessons.forEach((ls) => {
        const cnt = chBank.filter((q) => q.lesson.toUpperCase() === ls.code.toUpperCase()).length;
        map.set(ls.code, { code: ls.code, label: ls.title, count: cnt });
      });
    }

    chBank.forEach((q) => {
      const lCode = q.lesson.toUpperCase();
      if (!map.has(lCode)) {
        const meta = lookupKNTTMeta(draft.grade, draft.chapterCode, lCode);
        const cnt = chBank.filter((x) => x.lesson.toUpperCase() === lCode).length;
        map.set(lCode, { code: lCode, label: meta.lessonTitle, count: cnt });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, ''))
    );
  }, [bankItems, draft.grade, draft.chapterCode]);

  const availability = useMemo(
    () =>
      countAvailabilityForScope(
        bankItems,
        draft.grade,
        draft.chapterCode,
        draft.lessonCode,
        draft.formats
      ),
    [bankItems, draft.grade, draft.chapterCode, draft.lessonCode, draft.formats]
  );

  // Determine class-wide next suggested empty ĐĐG TX column
  const classSuggestedTxColumn = useMemo(() => {
    const cfg = loadGradebookConfig();
    if (!activeClass || classStudents.length === 0) return 'tx1' as GradeColumnTarget;
    const freq: Record<GradeColumnTarget, number> = {
      tx1: 0,
      tx2: 0,
      tx3: 0,
      tx4: 0,
      tx5: 0,
      gk: 0,
      ck: 0,
    };
    classStudents.forEach((st) => {
      const id = makeGradeEntryId(activeClass.id, draft.semester, st.id);
      const col = suggestNextTxColumn(gradebookMap[id], cfg.txColumnCount);
      freq[col] = (freq[col] || 0) + 1;
    });
    let best: GradeColumnTarget = 'tx1';
    let bestCount = -1;
    (['tx1', 'tx2', 'tx3', 'tx4', 'tx5'] as GradeColumnTarget[]).forEach((c) => {
      if (freq[c] > bestCount) {
        bestCount = freq[c];
        best = c;
      }
    });
    return best;
  }, [activeClass, classStudents, draft.semester, gradebookMap]);

  if (!open) return null;

  const totalQuestions =
    draft.levelCounts.NB +
    draft.levelCounts.TH +
    draft.levelCounts.VD +
    draft.levelCounts.VDC;

  const hasAnyFormat =
    draft.formats.part1 ||
    draft.formats.part2 ||
    draft.formats.part3 ||
    draft.formats.essay;

  const handleChangeGrade = (nextGrade: '10' | '11' | '12') => {
    const nextChap = getDefaultChapterForGrade(nextGrade);
    const nextTopic = buildTopicLabelFromScope(nextGrade, nextChap, 'all');
    setDraft((prev) => ({
      ...prev,
      grade: nextGrade,
      chapterCode: nextChap,
      lessonCode: 'all',
      topicLabel: topicManuallyEdited ? prev.topicLabel : nextTopic,
    }));
  };

  const handleChangeChapter = (nextChap: string) => {
    const nextTopic = buildTopicLabelFromScope(draft.grade, nextChap, 'all');
    setDraft((prev) => ({
      ...prev,
      chapterCode: nextChap,
      lessonCode: 'all',
      topicLabel: topicManuallyEdited ? prev.topicLabel : nextTopic,
    }));
  };

  const handleChangeLesson = (nextLesson: string) => {
    const nextTopic = buildTopicLabelFromScope(draft.grade, draft.chapterCode, nextLesson);
    setDraft((prev) => ({
      ...prev,
      lessonCode: nextLesson,
      topicLabel: topicManuallyEdited ? prev.topicLabel : nextTopic,
    }));
  };

  const handleToggleFormat = (fmt: 'part1' | 'part2' | 'part3' | 'essay') => {
    setDraft((prev) => {
      const nextFormats = { ...prev.formats, [fmt]: !prev.formats[fmt] };
      if (!nextFormats.part1 && !nextFormats.part2 && !nextFormats.part3 && !nextFormats.essay) {
        return prev; // Keep at least 1 format enabled
      }
      return { ...prev, formats: nextFormats };
    });
  };

  const handleStepLevel = (lvl: CognitiveLevel, delta: number) => {
    setDraft((prev) => {
      const cur = prev.levelCounts[lvl] || 0;
      const next = Math.max(0, Math.min(10, cur + delta));
      return {
        ...prev,
        levelCounts: {
          ...prev.levelCounts,
          [lvl]: next,
        },
      };
    });
  };

  const applyPreset = (
    counts: { NB: number; TH: number; VD: number; VDC: number },
    formats?: { part1: boolean; part2: boolean; part3: boolean; essay: boolean }
  ) => {
    setDraft((prev) => ({
      ...prev,
      levelCounts: counts,
      formats: formats || prev.formats,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalQuestions <= 0 || !hasAnyFormat) return;
    onSaveMatrix({
      ...draft,
      topicLabel: draft.topicLabel.trim() || buildTopicLabelFromScope(draft.grade, draft.chapterCode, draft.lessonCode),
      isLocked: true,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-4xl"
      title={
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-[#136F63]" />
          <span>Bước 1 · Cấu hình Yêu cầu Trả bài (Ma trận Kiểm tra)</span>
        </div>
      }
      subtitle={
        activeClass
          ? `Đang cấu hình cho Lớp ${activeClass.name} (Khối ${activeClass.grade}) · Học sinh sẽ tự bốc 1 gói đề theo đúng Ma trận này`
          : 'Thiết lập phạm vi kiến thức, mức độ nhận thức và cột điểm SMAS trước khi gọi học sinh'
      }
      bodyClassName="p-5"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
          {requiredPromptReason && (
            <div className="flex items-start gap-2.5 rounded-[8px] border border-[#FEF3C7] bg-[#FEF3C7] px-4 py-3 text-[13.5px] font-medium text-[#B45309]">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
              <div>
                <div className="font-semibold">Chưa khóa Ma trận Yêu cầu Kiểm tra cho tiết dạy</div>
                <div className="mt-0.5 text-[12px]">{requiredPromptReason}</div>
              </div>
            </div>
          )}

          {/* Section 1: Phạm vi kiến thức */}
          <section className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#136F63]">
                <BookOpen className="h-4 w-4" />
                1. Phạm vi kiến thức (Kho Ngân hàng đề thực tế)
              </div>
              <div className="text-[12px] font-medium text-[#64748B] tabular-nums">
                Nguồn khả dụng:{' '}
                <strong className="text-[#136F63]">
                  {availability.totalInScope} câu
                </strong>
                {' · '}
                <span>
                  NB: {availability.byLevel.NB} · TH: {availability.byLevel.TH} · VD:{' '}
                  {availability.byLevel.VD} · VDC: {availability.byLevel.VDC}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label
                  htmlFor="matrix-grade-select"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Khối lớp
                </label>
                <select
                  id="matrix-grade-select"
                  value={draft.grade}
                  onChange={(e) => handleChangeGrade(e.target.value as '10' | '11' | '12')}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none"
                >
                  <option value="10">Toán Khối 10</option>
                  <option value="11">Toán Khối 11</option>
                  <option value="12">Toán Khối 12</option>
                </select>
              </div>

              <div className="sm:col-span-5">
                <label
                  htmlFor="matrix-chapter-select"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Chương / Chuyên đề
                </label>
                <select
                  id="matrix-chapter-select"
                  value={draft.chapterCode}
                  onChange={(e) => handleChangeChapter(e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none"
                >
                  <option value="all">Tất cả các Chương (Khối {draft.grade})</option>
                  {chapterOptions.map((ch) => (
                    <option key={ch.code} value={ch.code}>
                      {ch.label} ({ch.count > 0 ? `${ch.count} câu trong Kho` : 'Kho mẫu KNTT'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label
                  htmlFor="matrix-lesson-select"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Bài học cụ thể
                </label>
                <select
                  id="matrix-lesson-select"
                  disabled={draft.chapterCode === 'all'}
                  value={draft.lessonCode}
                  onChange={(e) => handleChangeLesson(e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none disabled:bg-[#F1F5F9] disabled:text-[#64748B]"
                >
                  <option value="all">Toàn bộ bài học trong Chương</option>
                  {lessonOptions.map((ls) => (
                    <option key={ls.code} value={ls.code}>
                      {ls.label} ({ls.count} câu)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="matrix-topic-label"
                className="mb-1 block text-[12px] font-medium text-[#64748B]"
              >
                Tên Chuyên đề / Nội dung kiểm tra hiển thị khi gọi học sinh
              </label>
              <input
                id="matrix-topic-label"
                value={draft.topicLabel}
                onChange={(e) => {
                  setTopicManuallyEdited(true);
                  setDraft((prev) => ({ ...prev, topicLabel: e.target.value }));
                }}
                placeholder="Ví dụ: Chuyên đề Hàm số lượng giác & Phương trình lượng giác"
                className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
              />
            </div>

            {availability.isSupplemented && (
              <div className="text-[12px] text-[#64748B]">
                Lưu ý: Kho Ngân hàng đề hiện có ít câu hỏi thuộc phạm vi này — hệ thống sẽ tự động kết hợp bộ câu hỏi chuẩn SGK Kết nối tri thức Khối {draft.grade} để đảm bảo đủ câu sinh các gói đề ngẫu nhiên.
              </div>
            )}
          </section>

          {/* Section 2: Cấu trúc & Mức độ nhận thức */}
          <section className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#136F63]">
                <Layers className="h-4 w-4" />
                2. Cấu trúc dạng thức &amp; Mức độ nhận thức
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset({ NB: 1, TH: 2, VD: 0, VDC: 0 })}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Kiểm tra bài cũ (3 câu)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset({ NB: 0, TH: 2, VD: 1, VDC: 0 })}
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  2 TH + 1 VD
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      { NB: 2, TH: 2, VD: 1, VDC: 0 },
                      { part1: true, part2: false, part3: true, essay: false }
                    )
                  }
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Trắc nghiệm 5 câu
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      { NB: 0, TH: 1, VD: 1, VDC: 0 },
                      { part1: false, part2: false, part3: false, essay: true }
                    )
                  }
                  className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Trình bày bảng (2 câu)
                </button>
              </div>
            </div>

            {/* Format toggles */}
            <div>
              <div className="mb-1.5 text-[13.5px] font-medium text-[#334155]">
                Chọn dạng thức câu hỏi trong mỗi gói đề:
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: 'part1' as const, label: 'Trắc nghiệm 4 lựa chọn', sub: 'Chấm tự động' },
                  { key: 'part2' as const, label: 'Đúng / Sai (4 ý)', sub: 'Chấm tự động BGD 2025' },
                  { key: 'part3' as const, label: 'Trả lời ngắn', sub: 'Chấm tự động' },
                  { key: 'essay' as const, label: 'Tự luận trình bày bảng', sub: 'Giáo viên chấm trực tiếp' },
                ].map((fmt) => {
                  const active = draft.formats[fmt.key];
                  return (
                    <button
                      key={fmt.key}
                      type="button"
                      onClick={() => handleToggleFormat(fmt.key)}
                      className={`flex flex-col items-start rounded-[8px] border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-[#136F63] bg-[#F8FAFC] text-[#136F63]'
                          : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2 text-[13.5px] font-semibold">
                        <span>{fmt.label}</span>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] ${
                            active
                              ? 'border-[#136F63] bg-[#136F63] text-white'
                              : 'border-[#CBD5E1] bg-white'
                          }`}
                        >
                          {active ? '✓' : ''}
                        </span>
                      </div>
                      <span className="mt-0.5 text-[12px] text-[#64748B]">{fmt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.formats.essay && (
              <div>
                <label
                  htmlFor="matrix-essay-note"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Yêu cầu bổ sung cho phần Tự luận trình bày bảng (tùy chọn)
                </label>
                <input
                  id="matrix-essay-note"
                  value={draft.essayPromptNote || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, essayPromptNote: e.target.value }))
                  }
                  placeholder="Ví dụ: Viết rõ các bước biến đổi và kết luận tập nghiệm trên bảng..."
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
                />
              </div>
            )}

            {/* Cognitive level counts */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[13.5px] font-medium text-[#334155]">
                <span>Số lượng câu hỏi theo mức độ nhận thức:</span>
                <span className="tabular-nums text-[#136F63]">
                  Tổng: <strong>{totalQuestions}</strong> câu / 1 gói đề
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {LEVEL_META.map((lvl) => {
                  const val = draft.levelCounts[lvl.key] || 0;
                  const avail = availability.byLevel[lvl.key] || 0;
                  return (
                    <div
                      key={lvl.key}
                      className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[13.5px] font-semibold text-[#1E293B]">
                          {lvl.label}
                        </span>
                        <span className="text-[12px] text-[#64748B] tabular-nums">
                          Kho: {avail}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleStepLevel(lvl.key, -1)}
                          aria-label={`Giảm câu ${lvl.label}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[16px] font-semibold text-[#0F172A] tabular-nums">
                          {val}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStepLevel(lvl.key, 1)}
                          aria-label={`Tăng câu ${lvl.label}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalQuestions === 0 && (
                <div className="mt-1.5 rounded-[8px] bg-[#FEE2E2] px-3 py-1.5 text-[12px] font-medium text-[#B91C1C]">
                  Vui lòng chọn ít nhất 1 câu hỏi cho ma trận.
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Cấu hình chấm & lưu điểm SMAS */}
          <section className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[#136F63]">
              <ClipboardList className="h-4 w-4" />
              3. Cấu hình chấm bài, Gói đề &amp; Lưu điểm Sổ SMAS 4.0
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="matrix-semester"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Học kỳ ghi điểm
                </label>
                <select
                  id="matrix-semester"
                  value={draft.semester}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      semester: Number(e.target.value) as 1 | 2,
                    }))
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none"
                >
                  <option value={1}>Học kỳ 1 (HKI)</option>
                  <option value={2}>Học kỳ 2 (HKII)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="matrix-smas-col"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Cột điểm SMAS mặc định
                </label>
                <select
                  id="matrix-smas-col"
                  value={draft.targetColumnMode}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      targetColumnMode: e.target.value as 'auto' | GradeColumnTarget,
                    }))
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-semibold text-[#136F63] focus:border-[#136F63] focus:outline-none"
                >
                  <option value="auto">
                    Tự động gợi ý ĐĐG TX trống tiếp theo (Phổ biến: {SMAS_COL_LABELS[classSuggestedTxColumn]})
                  </option>
                  {(['tx1', 'tx2', 'tx3', 'tx4', 'tx5', 'gk', 'ck'] as GradeColumnTarget[]).map(
                    (col) => (
                      <option key={col} value={col}>
                        Cố định: {SMAS_COL_LABELS[col]}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="matrix-time-limit"
                  className="mb-1 flex items-center gap-1 text-[12px] font-medium text-[#64748B]"
                >
                  <Clock className="h-3.5 w-3.5 text-[#64748B]" />
                  Thời gian làm bài
                </label>
                <select
                  id="matrix-time-limit"
                  value={draft.timeLimitMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      timeLimitMinutes: Number(e.target.value),
                    }))
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none"
                >
                  <option value={3}>3 phút</option>
                  <option value={5}>5 phút</option>
                  <option value={10}>10 phút</option>
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={45}>45 phút</option>
                  <option value={0}>Không giới hạn</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="matrix-pkg-count"
                  className="mb-1 block text-[12px] font-medium text-[#64748B]"
                >
                  Số Gói đề cho HS chọn
                </label>
                <select
                  id="matrix-pkg-count"
                  value={draft.packageCount}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      packageCount: Number(e.target.value) as 3 | 4,
                    }))
                  }
                  className="h-10 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none"
                >
                  <option value={3}>3 Gói đề ngẫu nhiên (01–03)</option>
                  <option value={4}>4 Gói đề ngẫu nhiên (01–04)</option>
                </select>
              </div>
            </div>
          </section>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3.5 rounded-[8px]">
          <div className="text-[12px] text-[#64748B]">
            Sau khi lưu, mỗi học sinh lên bảng sẽ tự chọn <strong>1 trong {draft.packageCount} gói đề</strong> sinh ngẫu nhiên theo đúng ma trận trên.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[48px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white px-4 text-[13.5px] font-medium text-[#334155] hover:bg-[#F1F5F9]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={totalQuestions === 0 || !hasAnyFormat}
              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-[8px] bg-[#136F63] px-5 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Lưu Cấu hình Yêu cầu
            </button>
          </div>
        </div>
      </form>
    </SmartboardViewport>
  );
};
