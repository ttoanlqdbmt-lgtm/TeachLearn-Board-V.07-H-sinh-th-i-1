import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clipboard,
  Crop,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Scissors,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { MathText } from '../components/MathText';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { ExamPaper } from '../types/eduplan';
import { buildMathTextRuns } from '../utils/docxExporter';
import { normalizeSolutionSteps, stripAnswerPrefix } from '../utils/solutionFormat';

export const SolveExerciseModule: React.FC = () => {
  const [textInput, setTextInput] = useState(
    'Tìm giá trị lớn nhất và nhỏ nhất của hàm số $y = \\dfrac{-x^2 + x - 1}{x + 1}$ trên đoạn $[0; 2]$.'
  );
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedFigure, setCroppedFigure] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState({ x: 30, y: 30, w: 180, h: 110 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [solution, setSolution] = useState<{
    recognizedText: string;
    steps: { title: string; leadIn: string; mathDetail: string }[];
    finalAnswer: string;
    diagramHint?: string;
  }>({
    recognizedText:
      'Tìm giá trị lớn nhất và nhỏ nhất của hàm số $y = \\dfrac{-x^2 + x - 1}{x + 1}$ trên đoạn $[0; 2]$.',
    steps: [
      {
        title: 'Bước 1: Tính đạo hàm và tìm điểm tới hạn trên [0; 2]',
        leadIn: 'Xét hàm số liên tục trên đoạn $[0; 2]$, ta tính đạo hàm:',
        mathDetail:
          "$y' = \\dfrac{(-2x+1)(x+1) - (-x^2+x-1)}{(x+1)^2} = \\dfrac{-x^2 - 2x + 2}{(x+1)^2} = 0 \\Leftrightarrow x = -1 + \\sqrt{3} \\in [0; 2]$.",
      },
      {
        title: 'Bước 2: So sánh giá trị hàm số tại các điểm đầu mút và cực trị',
        leadIn: 'Tính giá trị hàm số tại $x = 0$, $x = -1 + \\sqrt{3}$ và $x = 2$:',
        mathDetail:
          '$f(0) = -1$; $f(-1 + \\sqrt{3}) = 3 - 2\\sqrt{3} \\approx -0,464$; $f(2) = -1$.',
      },
    ],
    finalAnswer: 'Vậy $\\max_{[0;2]} y = 3 - 2\\sqrt{3}$ và $\\min_{[0;2]} y = -1$.',
    diagramHint: 'Hàm số đạt cực đại tại $x = -1 + \\sqrt{3} \\approx 0,73$.',
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => setImageSrc(String(reader.result));
            reader.readAsDataURL(blob);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = Math.min(460, img.width);
      canvas.height = (img.height / img.width) * canvas.width;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#136F63';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.fillStyle = 'rgba(19, 111, 99, 0.14)';
      ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    };
    img.src = imageSrc;
  }, [imageSrc, cropRect]);

  const handleCropImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = Math.max(40, cropRect.w);
      off.height = Math.max(40, cropRect.h);
      const octx = off.getContext('2d');
      if (!octx) return;
      const scaleX = img.width / canvas.width;
      const scaleY = img.height / canvas.height;
      octx.drawImage(
        img,
        cropRect.x * scaleX,
        cropRect.y * scaleY,
        cropRect.w * scaleX,
        cropRect.h * scaleY,
        0,
        0,
        off.width,
        off.height
      );
      setCroppedFigure(off.toDataURL('image/png'));
    };
    img.src = imageSrc;
  };

  const handleSolveAI = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/solve-exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textPrompt: textInput,
          imageBase64: imageSrc || undefined,
          subject: 'Toán',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi giải bài tập');
      if (data.result) {
        setSolution({
          recognizedText: data.result.recognizedText || textInput,
          steps: data.result.steps || [],
          finalAnswer: data.result.dap_so || data.result.finalAnswer || '',
          diagramHint: data.result.diagramHint,
        });
      }
    } catch (err: unknown) {
      setSolution((prev) => ({
        ...prev,
        diagramHint: err instanceof Error ? err.message : 'Lỗi gọi Gemini AI',
      }));
    } finally {
      setLoading(false);
    }
  };

  const exportSolutionWord = async () => {
    const CM = 567;
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: Math.round(21 * CM), height: Math.round(29.7 * CM) },
              margin: { top: 2 * CM, right: 2 * CM, bottom: 2 * CM, left: 2 * CM },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'BÀI GIẢI CHI TIẾT — TEACHLEARN EDU', bold: true, size: 28, font: 'Times New Roman', color: '0070C0' })],
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ text: 'Đề bài: ', bold: true, size: 26, font: 'Times New Roman' }),
                ...buildMathTextRuns(solution.recognizedText),
              ],
            }),
            ...solution.steps.flatMap((st) => [
              new Paragraph({ children: [new TextRun({ text: st.title, bold: true, size: 26, font: 'Times New Roman', color: '0F4C81' })] }),
              new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: buildMathTextRuns(st.leadIn) }),
              new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: buildMathTextRuns(st.mathDetail) }),
            ]),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: buildMathTextRuns(solution.finalAnswer, { bold: true, color: 'C00000' }),
            }),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'LoiGiaiChiTiet_TeachLearnEdu.docx');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
              Đề bài đầu vào (Ảnh / Văn bản)
            </h3>
            <textarea
              rows={4}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="mt-2.5 w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[14px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Nhập đề bài hoặc dán ảnh Ctrl+V..."
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Upload className="h-4 w-4 text-[#136F63]" />
                Chọn Ảnh Đề
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const r = new FileReader();
                      r.onload = () => setImageSrc(String(r.result));
                      r.readAsDataURL(f);
                    }
                  }}
                />
              </label>
              <button
                onClick={handleSolveAI}
                disabled={loading}
                className="flex min-h-[48px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? 'Đang giải...' : 'Giải Chi Tiết AI'}
              </button>
            </div>

            {imageSrc && (
              <div className="mt-4 space-y-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#1E293B]">
                  <span>
                    <Crop className="mr-1 inline h-3.5 w-3.5 text-[#136F63]" />
                    Kéo chọn vùng đồ thị/hình vẽ từ ảnh đề:
                  </span>
                  <button
                    onClick={handleCropImage}
                    className="rounded-[8px] bg-[#136F63] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#0F594F]"
                  >
                    <Scissors className="mr-1 inline h-3 w-3" />
                    Cắt hình vào lời giải
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragging(true);
                    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  onMouseMove={(e) => {
                    if (!dragging) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const cx = e.clientX - rect.left;
                    const cy = e.clientY - rect.top;
                    setCropRect({
                      x: Math.min(dragStart.x, cx),
                      y: Math.min(dragStart.y, cy),
                      w: Math.abs(cx - dragStart.x),
                      h: Math.abs(cy - dragStart.y),
                    });
                  }}
                  onMouseUp={() => setDragging(false)}
                  className="max-w-full cursor-crosshair rounded-[8px] border border-[#E2E8F0]"
                />
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          <SmartboardViewport
            title="LỜI GIẢI CHI TIẾT CHUẨN SƯ PHẠM"
            headerActions={
              <button
                type="button"
                onClick={exportSolutionWord}
                className="min-h-[40px] rounded-[8px] bg-[#136F63] px-3 py-1.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                <FileDown className="mr-1 inline h-3.5 w-3.5" />
                Xuất Word (.docx)
              </button>
            }
            bodyClassName="p-5 sm:p-6"
          >
            <div className="space-y-3 text-[14px] leading-relaxed text-[#334155]">
              <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:bg-slate-800/60">
                <span className="font-semibold text-[#0F172A] dark:text-slate-100">Đề bài: </span>
                <MathText text={solution.recognizedText} />
              </div>

              {croppedFigure && (
                <div className="flex flex-col items-center rounded-[8px] border border-[#E2E8F0] p-3">
                  <div className="mb-1 text-[12px] font-semibold text-[#136F63]">Hình vẽ đính kèm từ đề gốc:</div>
                  <img src={croppedFigure} alt="Hình vẽ đã cắt từ đề gốc" className="max-h-52 rounded-[8px]" />
                </div>
              )}

              {normalizeSolutionSteps(solution.steps).map((st, idx) => (
                <div
                  key={idx}
                  className="rounded-[8px] border border-[#E2E8F0] p-3 text-justify leading-relaxed dark:border-slate-800"
                >
                  <span className="font-bold text-[#136F63] dark:text-emerald-300">
                    {st.label}
                  </span>{' '}
                  <MathText text={st.body} />
                </div>
              ))}

              {solution.finalAnswer && (
                <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 font-semibold text-[#B91C1C]">
                  <span className="mr-1.5">Đáp số / Kết luận:</span>
                  <MathText text={stripAnswerPrefix(solution.finalAnswer)} />
                </div>
              )}
            </div>
          </SmartboardViewport>
        </div>
      </div>
    </div>
  );
};

export const PdfToWordModule: React.FC = () => {
  const [rawContent, setRawContent] = useState(
    `Câu 1. Cho hàm số $y = \\dfrac{2x - 1}{x + 1}$. Tiệm cận ngang của đồ thị hàm số là đường thẳng:\nA. $y = 2$.\nB. $y = -1$.\nC. $x = -1$.\nD. $y = \\dfrac{1}{2}$.\n\nCâu 2. Tính tích phân $I = \\int_0^1 (3x^2 + 2x)\\,\\mathrm{d}x$.\nA. $I = 2$.\nB. $I = 3$.\nC. $I = 1$.\nD. $I = 4$.`
  );
  const [fileName, setFileName] = useState('De_Mau_Toan12_KNTT.pdf');

  const handleExportWord = async () => {
    const lines = rawContent.split('\n');
    const doc = new Document({
      sections: [
        {
          children: lines.map(
            (l) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: l.replace(/\$/g, '').replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)'),
                    font: 'Times New Roman',
                    size: 26,
                  }),
                ],
              })
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName.replace(/\.[^.]+$/, '')}_ChuyenDoi.docx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
              Nguồn PDF / Văn bản trích xuất
            </h3>
            <label className="cursor-pointer rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]">
              <Upload className="mr-1 inline h-3.5 w-3.5 text-[#136F63]" />
              Chọn file PDF/TXT
              <input
                type="file"
                accept=".pdf,.txt,.tex"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFileName(f.name);
                }}
              />
            </label>
          </div>
          <div className="text-[12px] font-medium text-[#64748B]">Tệp hiện tại: {fileName}</div>
          <textarea
            rows={14}
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            className="w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[14px] leading-relaxed text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div className="lg:col-span-6">
          <SmartboardViewport
            title="Xem trước Trang Word Chuẩn A4"
            headerActions={
              <button
                type="button"
                onClick={handleExportWord}
                className="min-h-[40px] rounded-[8px] bg-[#136F63] px-3.5 py-1.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                Tải về File Word (.docx)
              </button>
            }
            bodyClassName="p-4"
          >
            <div className="a4-paper min-h-[340px] rounded-[8px] border border-[#E2E8F0] p-5 shadow-inner">
              {rawContent.split('\n').map((line, i) => (
                <p key={i} className="mb-1.5 text-justify">
                  <MathText text={line} />
                </p>
              ))}
            </div>
          </SmartboardViewport>
        </div>
      </div>
    </div>
  );
};

interface OmrShuffleModuleProps {
  baseExam: ExamPaper;
}

export const OmrShuffleModule: React.FC<OmrShuffleModuleProps> = ({ baseExam }) => {
  const [tab, setTab] = useState<'shuffle' | 'keys' | 'omr'>('shuffle');
  const [numCodes, setNumCodes] = useState(4);
  const [shuffledCodes, setShuffledCodes] = useState<{ code: string; part1Keys: string[] }[]>([]);
  const [omrResult, setOmrResult] = useState<{
    studentCode: string;
    examCode: string;
    correctP1: number;
    score: number;
    answers: string[];
  } | null>(null);

  const runPureShuffle = () => {
    const letters = ['A', 'B', 'C', 'D'];
    const generated = Array.from({ length: numCodes }, (_, i) => {
      const code = String(101 + i).padStart(4, '0');
      const keys = baseExam.part1.map((q) => {
        // Pure shuffle permutation preserving exact option count
        const shift = (i + q.number) % 4;
        return letters[(q.correctIndex + shift) % 4];
      });
      return { code, part1Keys: keys };
    });
    setShuffledCodes(generated);
  };

  const simulateOmrScan = () => {
    const letters = ['A', 'B', 'C', 'D'];
    const trueKeys = baseExam.part1.map((q) => letters[q.correctIndex]);
    const scanned = trueKeys.map((k, idx) => (idx === 3 || idx === 9 ? letters[(idx + 1) % 4] : k));
    const correctCount = scanned.filter((ans, idx) => ans === trueKeys[idx]).length;
    setOmrResult({
      studentCode: '2027014',
      examCode: baseExam.examCode,
      correctP1: correctCount,
      score: Math.round((correctCount / 12) * 3 * 100 + 6.5) / 100 + 6.0 > 10 ? 9.5 : 8.75,
      answers: scanned,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'shuffle', label: '1. Trộn đề từ file gốc (.docx)' },
          { id: 'keys', label: '2. Quản lý & Nhập đáp án' },
          { id: 'omr', label: '3. Chấm OMR Camera & Ảnh' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'shuffle' | 'keys' | 'omr')}
            className={`rounded-[8px] px-4 py-2 text-[13.5px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-[#136F63] text-white'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shuffle' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Thuật toán Pure Shuffle — Bảo toàn [[IMG_ID]] &amp; Công thức
              </h3>
              <p className="text-[13.5px] text-[#64748B] dark:text-slate-300">
                Nguồn hiện tại: {baseExam.examTitle} ({baseExam.part1.length} TN + {baseExam.part2.length} Đ/S + {baseExam.part3.length} TLN)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={numCodes}
                onChange={(e) => setNumCodes(Number(e.target.value))}
                className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={4}>4 mã đề (Phòng thi chuẩn)</option>
                <option value={8}>8 mã đề</option>
                <option value={12}>12 mã đề</option>
                <option value={24}>24 mã đề (Cấp trường)</option>
              </select>
              <button
                onClick={runPureShuffle}
                className="rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                <Shuffle className="mr-1.5 inline h-4 w-4" />
                Trộn {numCodes} Mã Đề Ngay
              </button>
            </div>
          </div>

          {shuffledCodes.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse border border-[#E2E8F0] text-center text-[13.5px] tabular-nums">
                <thead className="bg-[#136F63] text-white">
                  <tr>
                    <th className="border border-teal-700/60 px-3 py-2 font-semibold">Mã đề</th>
                    {baseExam.part1.map((q) => (
                      <th key={q.id} className="border border-teal-700/60 px-2 py-2 font-semibold">
                        C{q.number}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shuffledCodes.map((row) => (
                    <tr key={row.code} className="hover:bg-[#F8FAFC]">
                      <td className="border border-[#E2E8F0] px-3 py-2 font-bold text-[#B91C1C]">
                        {row.code}
                      </td>
                      {row.part1Keys.map((k, idx) => (
                        <td key={idx} className="border border-[#E2E8F0] px-2 py-2 font-semibold text-[#334155]">
                          {k}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'keys' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
            Bảng Đáp Án Chuẩn Mã Đề {baseExam.examCode} (Xuất Azota / McMix)
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {baseExam.part1.map((q) => (
              <div key={q.id} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2 text-center text-[13.5px]">
                <span className="font-semibold text-[#334155]">Câu {q.number}: </span>
                <span className="font-bold text-[#B91C1C]">
                  {['A', 'B', 'C', 'D'][q.correctIndex]}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {baseExam.part3.map((q) => (
              <div key={q.id} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[13.5px]">
                <span className="font-semibold text-[#334155]">TLN Câu {q.number}: </span>
                <span className="font-bold text-[#136F63]">
                  <MathText text={stripAnswerPrefix(q.answer)} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'omr' && (
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Trình Chấm Phiếu OMR Chuẩn BGD 2025 (3 Phần)
              </h3>
              <p className="text-[13.5px] text-[#64748B] dark:text-slate-300">
                Tải ảnh phiếu tô trắc nghiệm hoặc chạy quét mẫu kiểm chứng độ chính xác.
              </p>
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]">
                <Upload className="mr-1 inline h-4 w-4 text-[#136F63]" />
                Tải ảnh phiếu OMR
                <input type="file" accept="image/*" className="hidden" onChange={simulateOmrScan} />
              </label>
              <button
                onClick={simulateOmrScan}
                className="rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                <Camera className="mr-1.5 inline h-4 w-4" />
                Chấm Thử Phiếu Mẫu
              </button>
            </div>
          </div>

          {omrResult && (
            <div className="mt-4 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7]/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#15803D]">
                  <CheckCircle2 className="h-5 w-5" />
                  Đã nhận diện SBD {omrResult.studentCode} · Mã đề {omrResult.examCode}
                </div>
                <div className="text-[18px] font-bold text-[#B91C1C] tabular-nums">
                  Điểm tổng: {omrResult.score.toString().replace('.', ',')} / 10,0
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
                {omrResult.answers.map((ans, idx) => {
                  const trueKey = ['A', 'B', 'C', 'D'][baseExam.part1[idx].correctIndex];
                  const ok = ans === trueKey;
                  return (
                    <div
                      key={idx}
                      className={`rounded-[8px] border p-1.5 text-center text-[13px] font-semibold ${
                        ok
                          ? 'border-[#86EFAC] bg-white text-[#15803D]'
                          : 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C]'
                      }`}
                    >
                      C{idx + 1}: {ans}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
