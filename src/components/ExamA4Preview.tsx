import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileDown,
  Link2,
  Printer,
  ShieldCheck,
  Shuffle,
} from 'lucide-react';
import { ExamPaper, Part1Question, Part2Question, Part3Question, ViewMode, WorksheetLayoutStyle } from '../types/eduplan';
import { MathText } from './MathText';
import { ExamDiagram } from './ExamDiagrams';
import { validateExam5D } from '../utils/examValidator';
import { exportExamToDocx, MatrixDocxAttachment } from '../utils/docxExporter';
import { SmartboardViewport } from './SmartboardViewport';
import {
  formatMcqOptionDisplay,
  normalizeSolutionStep,
  normalizeSolutionSteps,
  stripAnswerPrefix,
} from '../utils/solutionFormat';

interface ExamA4PreviewProps {
  exam: ExamPaper;
  viewMode: ViewMode;
  onChangeViewMode: (m: ViewMode) => void;
  layoutStyle?: WorksheetLayoutStyle;
  onChangeLayoutStyle?: (s: WorksheetLayoutStyle) => void;
  matrixAttachment?: MatrixDocxAttachment;
  onCreateOnlineLink?: (exam: ExamPaper) => void;
}

function createShuffledExamVariant(base: ExamPaper, variantIndex: number, code: string): ExamPaper {
  const rotateArr = <T,>(arr: T[], shift: number): T[] => {
    if (arr.length <= 1) return [...arr];
    const k = ((shift % arr.length) + arr.length) % arr.length;
    return [...arr.slice(k), ...arr.slice(0, k)];
  };

  // Shuffle Part I question order + option order while preserving exact correct option
  const rotatedP1 = rotateArr(base.part1, variantIndex * 3 + 1);
  const part1: Part1Question[] = rotatedP1.map((q, idx) => {
    const optIndices = rotateArr([0, 1, 2, 3], (variantIndex + idx + 1) % 4);
    const newOptions = optIndices.map((oi) => q.options[oi]) as [string, string, string, string];
    const newCorrectIdx = optIndices.indexOf(q.correctIndex) as 0 | 1 | 2 | 3;
    return {
      ...q,
      number: idx + 1,
      options: newOptions,
      correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
    };
  });

  // Shuffle Part II question order + statement order (relabeled a, b, c, d)
  const rotatedP2 = rotateArr(base.part2, variantIndex + 1);
  const labels = ['a', 'b', 'c', 'd'] as const;
  const part2: Part2Question[] = rotatedP2.map((q, idx) => {
    const stIndices = rotateArr([0, 1, 2, 3], (variantIndex + idx) % 4);
    const newStatements = stIndices.map((si, pos) => ({
      ...q.statements[si],
      label: labels[pos],
      stepTitle: `Bước ${pos + 1}: Xét ý ${labels[pos]})`,
    })) as Part2Question['statements'];
    return {
      ...q,
      number: idx + 1,
      statements: newStatements,
    };
  });

  // Shuffle Part III question order
  const rotatedP3 = rotateArr(base.part3, variantIndex * 2 + 1);
  const part3: Part3Question[] = rotatedP3.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));

  return {
    ...base,
    id: `${base.id}-code-${code}`,
    examCode: code,
    part1,
    part2,
    part3,
  };
}

export const ExamA4Preview: React.FC<ExamA4PreviewProps> = ({
  exam: baseExam,
  viewMode,
  onChangeViewMode,
  layoutStyle = 'a4_bw',
  onChangeLayoutStyle,
  matrixAttachment,
  onCreateOnlineLink,
}) => {
  const [showAudit, setShowAudit] = useState(false);
  const [exportingMode, setExportingMode] = useState<ViewMode | 'batch' | null>(null);
  const [shuffledVariants, setShuffledVariants] = useState<ExamPaper[]>([]);
  const [selectedVariantCode, setSelectedVariantCode] = useState<string>('original');

  // Reset shuffled variants whenever the underlying base exam changes
  useEffect(() => {
    setShuffledVariants([]);
    setSelectedVariantCode('original');
  }, [baseExam.id]);

  const exam = useMemo(() => {
    if (selectedVariantCode === 'original') return baseExam;
    return shuffledVariants.find((v) => v.examCode === selectedVariantCode) || baseExam;
  }, [baseExam, shuffledVariants, selectedVariantCode]);

  const report5D = useMemo(() => validateExam5D(exam), [exam]);
  const letters = ['A', 'B', 'C', 'D'] as const;

  const handleShuffleCodes = () => {
    const codes = ['101', '102', '103', '104'];
    const generated = codes.map((c, idx) => createShuffledExamVariant(baseExam, idx, c));
    setShuffledVariants(generated);
    setSelectedVariantCode('101');
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleExportWord = async (targetMode: ViewMode) => {
    setExportingMode(targetMode);
    try {
      await exportExamToDocx(exam, targetMode, matrixAttachment);
    } finally {
      setExportingMode(null);
    }
  };

  const handleExportAllShuffledCodes = async (targetMode: ViewMode) => {
    if (shuffledVariants.length === 0) return;
    setExportingMode('batch');
    try {
      for (const variant of shuffledVariants) {
        await exportExamToDocx(variant, targetMode, matrixAttachment);
      }
    } finally {
      setExportingMode(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="no-print flex flex-col gap-2.5 rounded-[8px] border border-[#E2E8F0] bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Teacher / Student View Toggle */}
          <div className="inline-flex rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onChangeViewMode('teacher')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                viewMode === 'teacher'
                  ? 'bg-[#136F63] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] dark:text-slate-300'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Bản Giáo Viên</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('student')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                viewMode === 'student'
                  ? 'bg-[#136F63] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] dark:text-slate-300'
              }`}
            >
              <span>Bản Học Sinh</span>
            </button>
          </div>

          {/* Right Action Cluster */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleShuffleCodes}
              title="Trộn tạo 4 mã đề 101, 102, 103, 104 (đảo câu hỏi và đáp án)"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Shuffle className="h-3.5 w-3.5 text-[#136F63]" />
              <span>Trộn nhiều mã đề (101–104)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAudit((v) => !v)}
              className={`inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-[8px] border px-2.5 text-[13px] font-medium transition-colors ${
                report5D.allPassed
                  ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] hover:bg-[#DCFCE7]/80'
                  : 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Kiểm định ({report5D.dimensions.filter((d) => d.passed).length}/5)</span>
            </button>
          </div>
        </div>

        {/* Export & Online Actions Row */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E2E8F0] pt-2.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleExportWord('teacher')}
            disabled={exportingMode !== null}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#0F594F] disabled:opacity-60"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>
              {exportingMode === 'teacher' ? 'Đang xuất...' : 'Xuất Word - Bản Giáo Viên (.docx)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleExportWord('student')}
            disabled={exportingMode !== null}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#136F63] bg-white px-3 text-[13px] font-medium text-[#136F63] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60 dark:border-emerald-500 dark:bg-slate-800 dark:text-emerald-300"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>
              {exportingMode === 'student' ? 'Đang xuất...' : 'Xuất Word - Bản Học Sinh (.docx)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>In / Xuất PDF A4</span>
          </button>

          {onCreateOnlineLink && (
            <button
              type="button"
              onClick={() => onCreateOnlineLink(exam)}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#136F63] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#0F594F]"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Tạo Link Làm Online</span>
            </button>
          )}
        </div>

        {/* Shuffled Exam Codes Selector Bar */}
        {shuffledVariants.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-semibold text-[#136F63] dark:text-emerald-400">
                Chọn mã đề xem &amp; in:
              </span>
              <button
                type="button"
                onClick={() => setSelectedVariantCode('original')}
                className={`rounded-[8px] px-2.5 py-1 text-[12px] font-medium tabular-nums transition-colors ${
                  selectedVariantCode === 'original'
                    ? 'bg-[#136F63] text-white'
                    : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                Đề gốc ({baseExam.examCode})
              </button>
              {shuffledVariants.map((v) => (
                <button
                  key={v.examCode}
                  type="button"
                  onClick={() => setSelectedVariantCode(v.examCode)}
                  className={`rounded-[8px] px-2.5 py-1 text-[12px] font-medium tabular-nums transition-colors ${
                    selectedVariantCode === v.examCode
                      ? 'bg-[#136F63] text-white'
                      : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  Mã đề {v.examCode}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleExportAllShuffledCodes(viewMode)}
              disabled={exportingMode !== null}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD] disabled:opacity-60"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>
                {exportingMode === 'batch'
                  ? 'Đang tải 4 mã đề...'
                  : `Tải trọn bộ 4 mã đề (${viewMode === 'teacher' ? 'Bản GV' : 'Bản HS'})`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 5-Dimensional Inspector */}
      {showAudit && (
        <div className="no-print rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
              Báo cáo Kiểm định 5 Chiều Chuẩn Bộ GD&amp;ĐT (2025–2027)
            </h4>
            <span className="text-[12px] font-medium text-[#136F63] tabular-nums dark:text-emerald-400">
              {exam.part1.length} TN · {exam.part2.length} Đ/S (
              {report5D.summaryStats.part2TrueCount + report5D.summaryStats.part2FalseCount} lệnh) ·{' '}
              {exam.part3.length} TLN
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report5D.dimensions.map((dim) => (
              <div
                key={dim.id}
                className="flex items-start gap-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[12px] dark:border-slate-800 dark:bg-slate-800/50"
              >
                {dim.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                )}
                <div>
                  <div className="font-semibold text-[#0F172A] dark:text-slate-100">{dim.name}</div>
                  <div className="mt-0.5 text-[#334155] dark:text-slate-300">{dim.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A4 Paper Canvas inside SmartboardViewport */}
      <SmartboardViewport
        title={`Xem trước Đề thi chuẩn A4 · Mã đề ${exam.examCode}`}
        subtitle={`${exam.subject} · ${exam.part1.length + exam.part2.length + exam.part3.length} câu · ${exam.durationMinutes} phút`}
        bodyClassName="bg-[#F1F5F9] p-3 sm:p-5 dark:bg-slate-950 print:bg-white print:p-0 print:overflow-visible"
        className="print:border-none print:shadow-none"
      >
        <div
          className={`print-only-a4 a4-paper mx-auto w-full max-w-[21cm] overflow-x-hidden rounded-[8px] border bg-white shadow-[0_6px_28px_-6px_rgba(15,23,42,0.12)] ${
            layoutStyle === 'two_col_peace'
              ? 'border-[#CBD5E1] p-3.5 sm:p-6 md:p-[1.5cm]'
              : 'border-[#E2E8F0] p-3.5 sm:p-6 md:p-[2cm]'
          }`}
        >
        {matrixAttachment &&
          matrixAttachment.position === 'start' &&
          matrixAttachment.rows.length > 0 && (
            <div className="mb-6 border-b-2 border-dashed border-slate-400 pb-5">
              <div className="text-center font-bold text-[#136F63]">
                {matrixAttachment.title ||
                  'BẢNG MA TRẬN & ĐẶC TẢ CHI TIẾT ĐỀ KIỂM TRA (CHUẨN BỘ GD&ĐT)'}
              </div>
              {matrixAttachment.summaryLine && (
                <div className="mt-0.5 text-center text-[11pt] italic text-slate-700">
                  {matrixAttachment.summaryLine}
                </div>
              )}
              <div className="mt-2.5 overflow-x-auto">
                <table className="w-full border-collapse border border-black text-[10.5pt] tabular-nums">
                  <thead>
                    <tr className="bg-[#136F63] text-white">
                      <th className="border border-black px-2 py-1 text-center">TT</th>
                      <th className="border border-black px-2 py-1 text-left">Chủ đề / Bài học</th>
                      <th className="border border-black px-2 py-1 text-center">Phần thi</th>
                      <th className="border border-black px-2 py-1 text-center">Mức độ</th>
                      <th className="border border-black px-2 py-1 text-center">Mã ID Chuẩn</th>
                      <th className="border border-black px-2 py-1 text-center">Số câu</th>
                      <th className="border border-black px-2 py-1 text-center">Số lệnh</th>
                      <th className="border border-black px-2 py-1 text-center">Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixAttachment.rows.map((r) => (
                      <tr key={r.stt}>
                        <td className="border border-black px-2 py-1 text-center">{r.stt}</td>
                        <td className="border border-black px-2 py-1 text-left">{r.lessonTitle}</td>
                        <td className="border border-black px-2 py-1 text-center">{r.partLabel}</td>
                        <td className="border border-black px-2 py-1 text-center font-bold">
                          {r.levelLabel}
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold text-[#0F4C81]">
                          {r.idTag}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {r.questionCount}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {r.commandCount}
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold">
                          {r.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {/* Header 1x2 Borderless Table */}
        <div
          className={`grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 ${
            layoutStyle === 'two_col_peace'
              ? 'rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3'
              : 'border-b border-slate-400'
          }`}
        >
          <div className="text-center leading-snug">
            <div className="font-bold text-[#0070C0]">{exam.department}</div>
            <div className="inline-block border-b border-[#0070C0] pb-0.5 font-bold text-[#0070C0]">
              {exam.schoolName}
            </div>
            <div className="mt-0.5 italic">(Đề thi có 04 trang)</div>
            <div>{exam.author}</div>
            <div className="text-[11.5pt] text-slate-700">{exam.sourceRepo}</div>
          </div>
          <div className="text-center leading-snug">
            <div className="font-bold text-[#0070C0]">{exam.examTitle}</div>
            <div className="font-bold">Môn thi: {exam.subject}</div>
            <div>Thời gian làm bài: {exam.durationMinutes} phút, Không kể thời gian phát đề</div>
            <div className="italic">
              (Đề có {exam.part1.length + exam.part2.length + exam.part3.length} câu trong{' '}
              {[exam.part1.length > 0, exam.part2.length > 0, exam.part3.length > 0].filter(Boolean).length || 1} Phần) —{' '}
              <span className="font-bold not-italic text-[#C00000]">Mã đề: {exam.examCode}</span>
            </div>
          </div>
        </div>

        {/* Candidate Line */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-400 pb-2">
          <div>
            <div className="font-bold text-[#1F497D]">Họ, tên thí sinh: ...................................................................</div>
            <div className="font-bold text-[#1F497D]">Số báo danh: ........................................................................</div>
          </div>
          <div className="rounded border border-[#C00000] px-3 py-1 font-bold text-[#C00000]">
            Mã đề: {exam.examCode}
          </div>
        </div>

        {/* Part I */}
        {exam.part1.length > 0 && (
        <div className="mt-4">
          <div
            className={`mb-2 font-bold ${
              layoutStyle === 'two_col_peace' ? 'rounded-[8px] bg-[#136F63] px-2.5 py-1 text-white' : 'text-black'
            }`}
          >
            PHẦN I. Thí sinh trả lời từ câu 1 đến câu {exam.part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.
          </div>

          <div className={layoutStyle === 'two_col_peace' ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'space-y-3'}>
            {exam.part1.map((q) => (
              <div
                key={q.id}
                className={
                  layoutStyle === 'two_col_peace'
                    ? 'rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3'
                    : ''
                }
              >
                <p className="text-justify">
                  <span className="font-bold">
                    Câu {q.number}
                    {viewMode === 'teacher' && (
                      <span className="ml-1 text-[11pt] font-semibold text-[#0F4C81]">
                        {q.tag}
                      </span>
                    )}
                    .{' '}
                  </span>
                  <MathText text={q.stem} />
                </p>

                {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                  <ExamDiagram kind={q.diagram} layer="stem" />
                )}

                {q.tableData && q.tableData.length > 0 ? (
                  <div className="my-2.5 overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-center text-sm">
                      <tbody>
                        {q.tableData.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="border border-slate-300 px-3 py-1.5 text-center">
                                <MathText text={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (q.image || q.imageUrl) ? (
                  <div className="my-2 flex justify-center">
                    <img
                      src={q.image || q.imageUrl}
                      alt="Hình minh họa đề bài"
                      className="max-w-full rounded border border-slate-300 shadow-sm"
                      style={{ maxHeight: '220px', objectFit: 'contain' }}
                    />
                  </div>
                ) : null}

                <div className="mt-1 space-y-0.5 pl-1">
                  {q.options.map((opt, idx) => {
                    const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, idx);
                    const isCorrect = idx === q.correctIndex;
                    const highlight = viewMode === 'teacher' && isCorrect;
                    return (
                      <div key={idx} className="text-justify leading-relaxed">
                        <span
                          className={`font-bold ${
                            highlight ? 'text-[#C00000] underline' : 'text-black'
                          }`}
                        >
                          {letter}.
                        </span>{' '}
                        <MathText text={cleanOpt} />
                      </div>
                    );
                  })}
                </div>

                {viewMode === 'teacher' && (
                  <div className="mt-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-justify">
                    <div className="font-bold text-[#136F63]">Lời giải:</div>
                    {q.diagram && !q.solutionImage && !q.image && !q.imageUrl && !q.id.startsWith('imp-') && (
                      <div className="my-1.5 flex justify-center">
                        <ExamDiagram kind={q.diagram} layer="sol" />
                      </div>
                    )}
                    {q.solutionImage && (
                      <div className="my-1.5 flex justify-center">
                        <img
                          src={q.solutionImage}
                          alt="Hình minh họa lời giải"
                          className="max-w-full rounded border border-slate-300 bg-white p-1 shadow-sm"
                          style={{ maxHeight: '220px', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    {normalizeSolutionSteps(q.solutionSteps).map((st, sIdx) => (
                      <div key={sIdx} className="mt-1 text-justify leading-relaxed">
                        <span className="font-bold text-[#136F63]">{st.label}</span>{' '}
                        <MathText text={st.body} />
                      </div>
                    ))}
                    {q.diagram === 'stat_table_12' && q.id === 'p1_12' && (
                      <div className="mt-2 rounded-[8px] border border-[#B91C1C] bg-[#FEE2E2] px-3 py-1.5 text-[11pt] font-semibold text-[#B91C1C]">
                        <MathText text="Nhóm tần số cao nhất $[70; 90)$ (12 HS) · Điểm cực đại $x = 7$ ($t = 70$ phút) $\Rightarrow H_{\max} = 148$." />
                      </div>
                    )}
                    <div className="mt-1.5 font-bold text-[#C00000]">
                      Kết luận: Chọn {letters[q.correctIndex]}.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Part II */}
        {exam.part2.length > 0 && (
        <div className="mt-5">
          <div
            className={`mb-2 font-bold ${
              layoutStyle === 'two_col_peace' ? 'rounded-[8px] bg-[#136F63] px-2.5 py-1 text-white' : 'text-black'
            }`}
          >
            PHẦN II. Thí sinh trả lời từ câu 1 đến câu {exam.part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.
          </div>

          <div className="space-y-3">
            {exam.part2.map((q) => (
              <div
                key={q.id}
                className={
                  layoutStyle === 'two_col_peace'
                    ? 'rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3'
                    : ''
                }
              >
                <p className="text-justify">
                  <span className="font-bold">
                    Câu {q.number}
                    {viewMode === 'teacher' && (
                      <span className="ml-1 text-[11pt] font-semibold text-[#0F4C81]">
                        {q.tag}
                      </span>
                    )}
                    .{' '}
                  </span>
                  <MathText text={q.stem} />
                </p>

                {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                  <ExamDiagram kind={q.diagram} layer="stem" />
                )}

                {q.tableData && q.tableData.length > 0 ? (
                  <div className="my-2.5 overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-center text-sm">
                      <tbody>
                        {q.tableData.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="border border-slate-300 px-3 py-1.5 text-center">
                                <MathText text={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (q.image || q.imageUrl) ? (
                  <div className="my-2 flex justify-center">
                    <img
                      src={q.image || q.imageUrl}
                      alt="Hình minh họa đề bài"
                      className="max-w-full rounded border border-slate-300 shadow-sm"
                      style={{ maxHeight: '220px', objectFit: 'contain' }}
                    />
                  </div>
                ) : null}

                <div className="mt-1 space-y-1 pl-1">
                  {q.statements.map((s) => {
                    const highlight = viewMode === 'teacher' && s.isTrue;
                    return (
                      <p key={s.label} className="text-justify">
                        <span
                          className={`font-bold ${
                            highlight ? 'text-[#B91C1C] underline' : 'text-black'
                          }`}
                        >
                          {s.label})
                        </span>{' '}
                        <MathText text={s.text} />
                      </p>
                    );
                  })}
                </div>

                {viewMode === 'teacher' && (
                  <div className="mt-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-justify">
                    <div className="font-bold text-[#136F63]">Lời giải:</div>
                    {q.diagram && !q.solutionImage && !q.image && !q.imageUrl && !q.id.startsWith('imp-') && (
                      <div className="my-1.5 flex justify-center">
                        <ExamDiagram kind={q.diagram} layer="sol" />
                      </div>
                    )}
                    {q.solutionImage && (
                      <div className="my-1.5 flex justify-center">
                        <img
                          src={q.solutionImage}
                          alt="Hình minh họa lời giải"
                          className="max-w-full rounded border border-slate-300 bg-white p-1 shadow-sm"
                          style={{ maxHeight: '220px', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    {q.statements.map((s, sIdx) => {
                      const normalized = normalizeSolutionStep(
                        {
                          stepTitle: s.stepTitle,
                          leadIn: s.leadIn,
                          content: s.explanation,
                        },
                        sIdx
                      );
                      return (
                        <div key={s.label} className="mt-1 text-justify leading-relaxed">
                          <span className="font-bold text-[#136F63]">{normalized.label}</span>{' '}
                          <MathText text={normalized.body} />{' '}
                          <span>
                            Vậy mệnh đề{' '}
                            <span
                              className={`font-bold ${
                                s.isTrue ? 'text-[#B91C1C] underline' : 'text-black'
                              }`}
                            >
                              {s.label})
                            </span>{' '}
                            <span className={`font-bold ${s.isTrue ? 'text-[#FF0000]' : 'text-[#0070C0]'}`}>
                              {s.isTrue ? 'Đúng.' : 'Sai.'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1.5 font-bold">
                      Kết luận:{' '}
                      {q.statements.map((s, idx) => (
                        <span key={s.label}>
                          <span className={s.isTrue ? 'text-[#C00000]' : 'text-[#0070C0]'}>
                            {s.label}) {s.isTrue ? 'Đúng' : 'Sai'}
                          </span>
                          {idx < 3 ? '; ' : '.'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Part III */}
        {exam.part3.length > 0 && (
        <div className="mt-5">
          <div
            className={`mb-2 font-bold ${
              layoutStyle === 'two_col_peace' ? 'rounded-[8px] bg-[#136F63] px-2.5 py-1 text-white' : 'text-black'
            }`}
          >
            PHẦN III. Thí sinh trả lời từ câu 1 đến câu {exam.part3.length}.
          </div>

          <div className="space-y-3">
            {exam.part3.map((q) => (
              <div
                key={q.id}
                className={
                  layoutStyle === 'two_col_peace'
                    ? 'rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3'
                    : ''
                }
              >
                <p className="text-justify">
                  <span className="font-bold">
                    Câu {q.number}
                    {viewMode === 'teacher' && (
                      <span className="ml-1 text-[11pt] font-semibold text-[#0F4C81]">
                        {q.tag}
                      </span>
                    )}
                    .{' '}
                  </span>
                  <MathText text={q.stem} />
                </p>

                {q.diagram && !q.image && !q.imageUrl && !q.tableData && !q.id.startsWith('imp-') && (
                  <ExamDiagram kind={q.diagram} layer="stem" />
                )}

                {q.tableData && q.tableData.length > 0 ? (
                  <div className="my-2.5 overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-center text-sm">
                      <tbody>
                        {q.tableData.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx === 0 ? 'bg-[#E8F1FA] font-bold text-[#1F497D]' : 'bg-white'}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="border border-slate-300 px-3 py-1.5 text-center">
                                <MathText text={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (q.image || q.imageUrl) ? (
                  <div className="my-2 flex justify-center">
                    <img
                      src={q.image || q.imageUrl}
                      alt="Hình minh họa đề bài"
                      className="max-w-full rounded border border-slate-300 shadow-sm"
                      style={{ maxHeight: '220px', objectFit: 'contain' }}
                    />
                  </div>
                ) : null}

                {viewMode === 'teacher' && (
                  <div className="mt-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-justify">
                    <div className="font-bold text-[#136F63]">Lời giải:</div>
                    {q.diagram && !q.solutionImage && !q.image && !q.imageUrl && !q.id.startsWith('imp-') && (
                      <div className="my-1.5 flex justify-center">
                        <ExamDiagram kind={q.diagram} layer="sol" />
                      </div>
                    )}
                    {q.solutionImage && (
                      <div className="my-1.5 flex justify-center">
                        <img
                          src={q.solutionImage}
                          alt="Hình minh họa lời giải"
                          className="max-w-full rounded border border-slate-300 bg-white p-1 shadow-sm"
                          style={{ maxHeight: '220px', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    {normalizeSolutionSteps(q.solutionSteps).map((st, sIdx) => (
                      <div key={sIdx} className="mt-1 text-justify leading-relaxed">
                        <span className="font-bold text-[#136F63]">{st.label}</span>{' '}
                        <MathText text={st.body} />
                      </div>
                    ))}
                    <div className="mt-1.5 font-bold text-[#C00000]">
                      <span>Đáp số / Kết luận: </span>
                      <MathText text={stripAnswerPrefix(q.answer)} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Summary Tables for Teacher */}
        {viewMode === 'teacher' && (
          <div className="mt-6 border-t-2 border-black pt-4">
            <div className="mb-3 text-center font-bold text-[#C00000]">
              BẢNG ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM TỔNG HỢP (MÃ ĐỀ {exam.examCode})
            </div>

            {exam.part1.length > 0 && (
              <>
                <div className="mb-1.5 font-bold">
                  1. Bảng đáp án Phần I ({exam.part1.length} câu trắc nghiệm nhiều lựa chọn – 3,0 điểm):
                </div>
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full border-collapse border border-black text-center text-[12pt] tabular-nums">
                    <tbody>
                      <tr>
                        {exam.part1.map((q) => (
                          <td key={q.id} className="border border-black bg-slate-100 px-1.5 py-1 font-bold">
                            C{q.number}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        {exam.part1.map((q) => (
                          <td key={q.id} className="border border-black px-1.5 py-1 font-bold text-[#C00000]">
                            {letters[q.correctIndex]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {exam.part2.length > 0 && (
              <>
                <div className="mb-1.5 font-bold">
                  2. Bảng đáp án Phần II ({exam.part2.length} câu trắc nghiệm Đúng/Sai – 4,0 điểm):
                </div>
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full border-collapse border border-black text-center text-[12pt]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-black px-2 py-1">Câu</th>
                        <th className="border border-black px-2 py-1">Mệnh đề a)</th>
                        <th className="border border-black px-2 py-1">Mệnh đề b)</th>
                        <th className="border border-black px-2 py-1">Mệnh đề c)</th>
                        <th className="border border-black px-2 py-1">Mệnh đề d)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.part2.map((q) => (
                        <tr key={q.id}>
                          <td className="border border-black px-2 py-1 font-bold">Câu {q.number}</td>
                          {q.statements.map((s) => (
                            <td
                              key={s.label}
                              className={`border border-black px-2 py-1 font-bold ${
                                s.isTrue ? 'text-[#C00000]' : 'text-[#0070C0]'
                              }`}
                            >
                              {s.isTrue ? 'Đúng' : 'Sai'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {exam.part3.length > 0 && (
              <>
                <div className="mb-1.5 font-bold">
                  3. Bảng đáp số Phần III ({exam.part3.length} câu trả lời ngắn – 3,0 điểm):
                </div>
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full border-collapse border border-black text-center text-[12pt] tabular-nums">
                    <tbody>
                      <tr>
                        {exam.part3.map((q) => (
                          <td key={q.id} className="border border-black bg-slate-100 px-2 py-1 font-bold">
                            Câu {q.number}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        {exam.part3.map((q) => (
                          <td key={q.id} className="border border-black px-2 py-1 font-bold text-[#C00000]">
                            <MathText text={stripAnswerPrefix(q.answer)} />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {matrixAttachment &&
          matrixAttachment.position === 'end' &&
          matrixAttachment.rows.length > 0 && (
            <div className="mt-6 border-t-2 border-dashed border-slate-400 pt-5">
              <div className="text-center font-bold text-[#136F63]">
                {matrixAttachment.title ||
                  'BẢNG MA TRẬN & ĐẶC TẢ CHI TIẾT ĐỀ KIỂM TRA (CHUẨN BỘ GD&ĐT)'}
              </div>
              {matrixAttachment.summaryLine && (
                <div className="mt-0.5 text-center text-[11pt] italic text-slate-700">
                  {matrixAttachment.summaryLine}
                </div>
              )}
              <div className="mt-2.5 overflow-x-auto">
                <table className="w-full border-collapse border border-black text-[10.5pt] tabular-nums">
                  <thead>
                    <tr className="bg-[#136F63] text-white">
                      <th className="border border-black px-2 py-1 text-center">TT</th>
                      <th className="border border-black px-2 py-1 text-left">Chủ đề / Bài học</th>
                      <th className="border border-black px-2 py-1 text-center">Phần thi</th>
                      <th className="border border-black px-2 py-1 text-center">Mức độ</th>
                      <th className="border border-black px-2 py-1 text-center">Mã ID Chuẩn</th>
                      <th className="border border-black px-2 py-1 text-center">Số câu</th>
                      <th className="border border-black px-2 py-1 text-center">Số lệnh</th>
                      <th className="border border-black px-2 py-1 text-center">Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixAttachment.rows.map((r) => (
                      <tr key={r.stt}>
                        <td className="border border-black px-2 py-1 text-center">{r.stt}</td>
                        <td className="border border-black px-2 py-1 text-left">{r.lessonTitle}</td>
                        <td className="border border-black px-2 py-1 text-center">{r.partLabel}</td>
                        <td className="border border-black px-2 py-1 text-center font-bold">
                          {r.levelLabel}
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold text-[#0F4C81]">
                          {r.idTag}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {r.questionCount}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {r.commandCount}
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold">
                          {r.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        <div className="mt-5 text-center font-bold">--- HẾT ---</div>
        </div>
      </SmartboardViewport>
    </div>
  );
};
