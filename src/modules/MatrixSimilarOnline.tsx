import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Eye,
  FileDown,
  FileText,
  Globe,
  Keyboard,
  LayoutList,
  ListChecks,
  Loader2,
  Play,
  Plus,
  QrCode,
  ShieldAlert,
  Sliders,
  Sparkles,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { ExamA4Preview } from '../components/ExamA4Preview';
import { MathText } from '../components/MathText';
import { QuestionBankPanel } from '../components/QuestionBankPanel';
import { SmartboardViewport } from '../components/SmartboardViewport';
import {
  FloatingMathKeypad,
  sanitizeShortAnswerValue,
  SHORT_ANSWER_MAX_LEN,
} from '../components/FloatingMathKeypad';
import { BankQuestion, ExamPaper, ExamSubmission, OnlineExamRoom, ViewMode } from '../types/eduplan';
import { buildMathTextRuns } from '../utils/docxExporter';
import {
  examPaperToBankQuestions,
  extractTextFromDocxArrayBuffer,
  loadBankQuestions,
  parseExamTextToBankQuestions,
} from '../utils/questionBankDb';
import {
  formatMcqOptionDisplay,
  normalizeRawSolutionStringToSteps,
} from '../utils/solutionFormat';
import { tactile3dClass } from '../utils/uiStyles';

interface MatrixExamModuleProps {
  currentExam: ExamPaper;
  onUpdateExam: (e: ExamPaper) => void;
  bankItems?: BankQuestion[];
  onChangeBankItems?: (items: BankQuestion[]) => void;
  initialTab?: 'matrix' | 'preview' | 'bank';
  onOpenWorksheet?: () => void;
}

export const MatrixExamModule: React.FC<MatrixExamModuleProps> = ({
  currentExam,
  onUpdateExam,
  bankItems: externalBankItems,
  onChangeBankItems: externalOnChangeBankItems,
  initialTab = 'matrix',
  onOpenWorksheet,
}) => {
  const [tab, setTab] = useState<'matrix' | 'preview' | 'bank'>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [viewMode, setViewMode] = useState<ViewMode>('teacher');
  const [nbCount, setNbCount] = useState(18);
  const [thCount, setThCount] = useState(6);
  const [vdCount, setVdCount] = useState(7);
  const [vdcCount, setVdcCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [localBankItems, setLocalBankItems] = useState<BankQuestion[]>(() =>
    examPaperToBankQuestions(currentExam, `Đề chuẩn ${currentExam.examCode}`)
  );

  const bankItems = externalBankItems ?? localBankItems;
  const setBankItems = externalOnChangeBankItems ?? setLocalBankItems;

  useEffect(() => {
    if (externalBankItems) return;
    loadBankQuestions(currentExam)
      .then((items) => {
        if (items.length > 0) setLocalBankItems(items);
      })
      .catch(() => {});
  }, [currentExam, externalBankItems]);

  const totalCommands = nbCount + thCount + vdCount + vdcCount;

  const handleGenerateByMatrix = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Toán',
          grade: '12',
          semester: 'Học kỳ 1',
          topic: 'Tổng hợp Ma trận Đề kiểm tra Cuối kì I (NB-TH-VD-VDC)',
          lesson: 'Đầy đủ 3 phần chuẩn BGD 2025–2027',
          part1Count: 12,
          part2Count: 4,
          part3Count: 6,
        }),
      });
      const data = await res.json();
      if (res.ok && data.exam?.part1?.length) {
        onUpdateExam({
          ...currentExam,
          ...data.exam,
          id: `matrix-${Date.now()}`,
        });
        setTab('preview');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {initialTab !== 'bank' && (
        <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible md:pb-0">
          {[
            { id: 'matrix', label: '1. Ma trận & Đặc tả 34 lệnh' },
            { id: 'preview', label: '2. Xem & Xuất Đề A4' },
            { id: 'bank', label: `3. Ngân hàng câu hỏi (${bankItems.length.toLocaleString('vi-VN')})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'matrix' | 'preview' | 'bank')}
              className={`shrink-0 whitespace-nowrap rounded-[8px] px-4 py-2 text-[13.5px] transition-all duration-150 ${tactile3dClass(
                tab === t.id
              )}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'matrix' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
              Ma trận Năng lực &amp; Mức độ Nhận thức (Chuẩn Bộ GD&amp;ĐT 2025–2027)
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Nhận biết (NB)', val: nbCount, set: setNbCount, pts: '4,5đ' },
                { label: 'Thông hiểu (TH)', val: thCount, set: setThCount, pts: '1,5đ' },
                { label: 'Vận dụng (VD)', val: vdCount, set: setVdCount, pts: '2,5đ' },
                { label: 'Vận dụng cao (VDC)', val: vdcCount, set: setVdcCount, pts: '1,5đ' },
              ].map((m) => (
                <div key={m.label} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="text-[12px] font-semibold text-[#334155] dark:text-slate-200">{m.label}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <input
                      type="number"
                      min={0}
                      max={34}
                      value={m.val}
                      onChange={(e) => m.set(Number(e.target.value))}
                      className="min-h-[40px] w-16 rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-1 text-[14px] font-semibold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <span className="text-[13px] font-semibold text-[#136F63] dark:text-teal-300">{m.pts}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto rounded-[8px] border border-[#E2E8F0]">
              <table className="w-full border-collapse text-[13.5px] tabular-nums">
                <thead className="bg-[#136F63] text-white">
                  <tr>
                    <th className="border-r border-white/15 px-3 py-2.5 text-left font-semibold">Phần thi</th>
                    <th className="border-r border-white/15 px-3 py-2.5 font-semibold">Số câu</th>
                    <th className="border-r border-white/15 px-3 py-2.5 font-semibold">Số lệnh hỏi</th>
                    <th className="border-r border-white/15 px-3 py-2.5 font-semibold">Điểm</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Quy chuẩn BGD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-[#334155] dark:divide-slate-800 dark:text-slate-200">
                  <tr>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 font-semibold text-[#0F172A] dark:border-slate-800 dark:text-white">Phần I (TN 4 lựa chọn)</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">12</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">12</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center font-semibold text-[#136F63] dark:border-slate-800 dark:text-teal-300">3,0 đ</td>
                    <td className="px-3 py-2.5">Cân bằng 3A – 3B – 3C – 3D</td>
                  </tr>
                  <tr className="bg-[#F8FAFC] dark:bg-slate-900/40">
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 font-semibold text-[#0F172A] dark:border-slate-800 dark:text-white">Phần II (Đúng / Sai)</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">4</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">16</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center font-semibold text-[#136F63] dark:border-slate-800 dark:text-teal-300">4,0 đ</td>
                    <td className="px-3 py-2.5">Cân bằng 8 Đúng – 8 Sai (1–3 ý đúng/câu)</td>
                  </tr>
                  <tr>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 font-semibold text-[#0F172A] dark:border-slate-800 dark:text-white">Phần III (Trả lời ngắn)</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">6</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center dark:border-slate-800">6</td>
                    <td className="border-r border-[#E2E8F0] px-3 py-2.5 text-center font-semibold text-[#136F63] dark:border-slate-800 dark:text-teal-300">3,0 đ</td>
                    <td className="px-3 py-2.5">Đáp số ≤ 4 ký tự, thập phân dùng dấu phẩy (,)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-[15px] font-semibold text-[#136F63] dark:text-teal-300">Tóm tắt Cấu hình</h3>
            <div className="space-y-2 text-[13.5px] text-[#334155] tabular-nums dark:text-slate-200">
              <div className="flex justify-between border-b border-[#E2E8F0] py-1.5 dark:border-slate-800">
                <span>Tổng số câu:</span>
                <span className="font-semibold text-[#0F172A] dark:text-white">22 câu</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] py-1.5 dark:border-slate-800">
                <span>Tổng lệnh hỏi:</span>
                <span className={`font-semibold ${totalCommands === 34 ? 'text-[#15803D]' : 'text-[#B45309]'}`}>
                  {totalCommands} / 34 lệnh
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] py-1.5 dark:border-slate-800">
                <span>Tổng điểm:</span>
                <span className="font-semibold text-[#136F63] dark:text-teal-300">10,0 điểm</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>Thời lượng:</span>
                <span className="font-semibold text-[#0F172A] dark:text-white">90 phút</span>
              </div>
            </div>

            <button
              onClick={handleGenerateByMatrix}
              disabled={loading}
              className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Đang sinh đề...' : 'Sinh Đề Theo Ma Trận (AI)'}
            </button>
            <button
              onClick={() => setTab('preview')}
              className="min-h-[44px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              Xem Đề Chuẩn 0107 Hiện Tại
            </button>
          </div>
        </div>
      )}

      {tab === 'preview' && (
        <ExamA4Preview exam={currentExam} viewMode={viewMode} onChangeViewMode={setViewMode} />
      )}

      {tab === 'bank' && (
        <QuestionBankPanel
          bankItems={bankItems}
          onChangeBankItems={setBankItems}
          currentExam={currentExam}
          onSelectExam22={(exam) => {
            onUpdateExam(exam);
            if (onOpenWorksheet) {
              onOpenWorksheet();
            } else {
              setTab('preview');
            }
          }}
        />
      )}
    </div>
  );
};

export const SimilarExamModule: React.FC = () => {
  const presets = [
    { id: 'cv7991', name: '1. Đề Kiểm tra định kỳ CV 7991', duration: '90 phút · Thang 10', desc: '12 TN + 4 Đ/S + 6 TLN chuẩn CV 7991' },
    { id: 'ts10', name: '2. Đề Tuyển sinh vào lớp 10', duration: '120 phút · Thang 10', desc: 'Cấu trúc Tự luận / Kết hợp Sở GD&ĐT' },
    { id: 'tn2027', name: '3. Đề Tốt nghiệp THPT 2026–2027 (Mã 0101)', duration: '90 phút · Thang 10', desc: 'Chuẩn đề minh họa BGD 2025–2027' },
    { id: 'hsg20', name: '4. Đề Học sinh giỏi (Thang điểm 20)', duration: '150 phút · Thang 20', desc: 'Tự luận chuyên sâu / Biện luận phân hóa cao' },
  ];
  const [preset, setPreset] = useState(presets[2]);
  const [sourceText, setSourceText] = useState(
    `KỲ THI TỐT NGHIỆP THPT NĂM 2027 - MÃ ĐỀ 0101\nCâu 1. Tập xác định của hàm số $y = \\log_2(x - 1)$ là A. $(1; +\\infty)$ B. $\\mathbb{R}$...\nCâu 2. Cho hình chóp $S.ABC$ có $SA \\perp (ABC)$, đáy vuông tại $B$...\nPhần II. Câu 1. Cho hàm số $y = \\dfrac{x^2 - 2x + 2}{x - 1}$...`
  );
  const [blueprint, setBlueprint] = useState<{
    examName: string;
    subjectGrade: string;
    durationMinutes: number;
    totalScore: number;
    cognitiveBreakdown: { NB: number; TH: number; VD: number; VDC: number };
    rows: { questionNo: string; part: string; topic: string; level: string; skill: string; score: number }[];
  }>({
    examName: 'ĐỀ TỐT NGHIỆP THPT 2026–2027 (MÃ ĐỀ 0101)',
    subjectGrade: 'Toán học — Lớp 12 (SGK KNTT)',
    durationMinutes: 90,
    totalScore: 10,
    cognitiveBreakdown: { NB: 45, TH: 15, VD: 25, VDC: 15 },
    rows: [
      { questionNo: 'Câu 1', part: 'Phần I', topic: 'Hàm số mũ & Lôgarit', level: 'NB', skill: 'Tìm tập xác định hàm lôgarit', score: 0.25 },
      { questionNo: 'Câu 2', part: 'Phần I', topic: 'Thể tích khối chóp', level: 'NB', skill: 'Tính thể tích khối chóp có cạnh bên vuông đáy', score: 0.25 },
      { questionNo: 'Câu 1 (P2)', part: 'Phần II', topic: 'Hàm phân thức bậc 2/1', level: 'VD', skill: 'Khảo sát tiệm cận xiên, cực trị & GTLN-GTNN', score: 1.0 },
    ],
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<
    { no: string; tag: string; part: string; stem: string; options?: string[]; answer: string; solution: string }[]
  >([
    {
      no: 'Câu 1',
      tag: '[11-C6-B20-NB]',
      part: 'Phần I',
      stem: 'Tập xác định của hàm số $y = \\log_3(2x - 4)$ là',
      options: ['A. $(2; +\\infty)$.', 'B. $[2; +\\infty)$.', 'C. $(-\\infty; 2)$.', 'D. $\\mathbb{R} \\setminus \\{2\\}$.'],
      answer: 'A',
      solution: 'Bước 1: Tìm điều kiện xác định\nĐiều kiện:\n$2x - 4 > 0 \\Leftrightarrow x > 2$. Vậy $D = (2; +\\infty)$. Chọn A.',
    },
    {
      no: 'Câu 2',
      tag: '[11-C7-B27-NB]',
      part: 'Phần I',
      stem: 'Cho khối chóp $S.ABC$ có $SA \\perp (ABC)$, đáy $ABC$ là tam giác vuông tại $B$ với $AB = 6$, $BC = 5$ và $SA = 4$. Thể tích khối chóp $S.ABC$ bằng',
      options: ['A. $40$.', 'B. $20$.', 'C. $60$.', 'D. $120$.'],
      answer: 'B',
      solution: 'Bước 1: Tính diện tích đáy\nTa có:\n$S_{\\triangle ABC} = \\dfrac{1}{2} \\cdot 6 \\cdot 5 = 15$.\nBước 2: Tính thể tích\nSuy ra:\n$V = \\dfrac{1}{3} \\cdot 4 \\cdot 15 = 20$. Chọn B.',
    },
  ]);
  const [rightTab, setRightTab] = useState<'tab1' | 'tab2' | 'tab3'>('tab1');
  const [loadingStep, setLoadingStep] = useState<0 | 1 | 2>(0);

  const runStep1 = async () => {
    setLoadingStep(1);
    try {
      const res = await fetch('/api/ai/blueprint-step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText, presetName: preset.name }),
      });
      const data = await res.json();
      if (res.ok && data.blueprint?.rows) {
        setBlueprint(data.blueprint);
        setRightTab('tab1');
      }
    } finally {
      setLoadingStep(0);
    }
  };

  const runStep2 = async () => {
    setLoadingStep(2);
    try {
      const res = await fetch('/api/ai/blueprint-step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintJson: blueprint, presetName: preset.name }),
      });
      const data = await res.json();
      if (res.ok && data.generated?.questions) {
        setGeneratedQuestions(data.generated.questions);
        setRightTab('tab2');
      }
    } finally {
      setLoadingStep(0);
    }
  };

  const exportBundle3in1 = async () => {
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
              children: [new TextRun({ text: `HỒ SƠ 3-IN-1: ${blueprint.examName}`, bold: true, size: 28, font: 'Times New Roman', color: '0070C0' })],
            }),
            new Paragraph({ children: [new TextRun({ text: 'PHẦN A: MA TRẬN & ĐẶC TẢ ĐỐI CHIẾU', bold: true, size: 26, font: 'Times New Roman', color: '0F4C81' })] }),
            ...blueprint.rows.map(
              (r) =>
                new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  children: buildMathTextRuns(`${r.questionNo} (${r.part}) - ${r.topic} [${r.level}]: ${r.skill} (${r.score}đ)`),
                })
            ),
            new Paragraph({ children: [new TextRun({ text: 'PHẦN B: ĐỀ THI TƯƠNG TỰ ĐẲNG CẤU & LỜI GIẢI CHI TIẾT', bold: true, size: 26, font: 'Times New Roman', color: 'C00000' })] }),
            ...generatedQuestions.flatMap((q) => [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: [
                  new TextRun({ text: `${q.no} ${q.tag}. `, bold: true, size: 26, font: 'Times New Roman' }),
                  ...buildMathTextRuns(q.stem),
                ],
              }),
              ...(q.options || []).map((o) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: buildMathTextRuns(o) })),
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: buildMathTextRuns(`Đáp án: ${q.answer} — ${q.solution}`, { color: '0F4C81' }),
              }),
            ]),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `BoHoSo_3in1_${preset.id}.docx`);
  };

  return (
    <div className="space-y-4">
      {/* 4 Presets */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((pr) => (
          <button
            key={pr.id}
            onClick={() => setPreset(pr)}
            className={`min-h-[48px] rounded-[8px] p-3 text-left transition-all duration-150 ${tactile3dClass(
              preset.id === pr.id
            )}`}
          >
            <div className="text-[13.5px] font-semibold">{pr.name}</div>
            <div className={`mt-1 text-[12px] font-normal ${preset.id === pr.id ? 'text-teal-100' : 'text-[#136F63] dark:text-teal-300'}`}>
              {pr.duration}
            </div>
            <div className={`mt-0.5 text-[12px] font-normal ${preset.id === pr.id ? 'text-teal-50' : 'text-[#64748B] dark:text-slate-400'}`}>
              {pr.desc}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Source + 2-Step Triggers */}
        <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
              Nguồn Đề Gốc (PDF / Word / Văn bản)
            </h3>
            <label className="cursor-pointer rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#334155] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Upload className="mr-1 inline h-3.5 w-3.5 text-[#136F63]" />
              Nạp file
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSourceText((prev) => `[Đã nạp tệp: ${f.name}]\n${prev}`);
                }}
              />
            </label>
          </div>
          <textarea
            rows={10}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="w-full rounded-[8px] border border-[#CBD5E1] bg-white p-3 text-[13.5px] leading-relaxed text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={runStep1}
              disabled={loadingStep !== 0}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {loadingStep === 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4 text-[#136F63]" />}
              Giai đoạn 1: Trích Blueprint
            </button>
            <button
              onClick={runStep2}
              disabled={loadingStep !== 0}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-[8px] bg-[#136F63] px-3 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F] disabled:opacity-60"
            >
              {loadingStep === 2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Giai đoạn 2: Sinh Đề Đẳng Cấu
            </button>
          </div>
        </div>

        {/* Right: 3 Tabs + 3-in-1 Export */}
        <SmartboardViewport
          title="Kết quả Ma trận, Đề tương tự & Thang điểm"
          subtitle="Phóng to toàn màn hình · Pinch-to-Zoom 2 ngón tay · Bút viết chú thích"
          className="lg:col-span-7"
          bodyClassName="space-y-3 p-4"
          headerActions={
            <button
              onClick={exportBundle3in1}
              className="min-h-[40px] rounded-[8px] bg-[#136F63] px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#0F594F]"
            >
              <FileDown className="mr-1 inline h-3.5 w-3.5" />
              Xuất Trọn Bộ 3-in-1 (.docx)
            </button>
          }
        >
          <div className="flex flex-col gap-2.5 border-b border-[#E2E8F0] pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:border-slate-800">
            <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible md:pb-0">
              {[
                { id: 'tab1', label: 'Tab 1: Ma trận & Đặc tả' },
                { id: 'tab2', label: 'Tab 2: Đề thi tương tự' },
                { id: 'tab3', label: 'Tab 3: Đáp án & Thang điểm' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setRightTab(t.id as 'tab1' | 'tab2' | 'tab3')}
                  className={`shrink-0 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] transition-all duration-150 ${tactile3dClass(
                    rightTab === t.id
                  )}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {rightTab === 'tab1' && (
            <div className="space-y-3">
              <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13.5px] dark:border-slate-800 dark:bg-slate-900/60">
                <div className="font-semibold text-[#0F172A] dark:text-white">{blueprint.examName}</div>
                <div className="mt-1 text-[#64748B] dark:text-slate-400">
                  {blueprint.subjectGrade} · {blueprint.durationMinutes} phút · Thang {blueprint.totalScore} điểm
                </div>
                <div className="mt-2 flex flex-wrap gap-3 font-semibold text-[#136F63] tabular-nums dark:text-teal-300">
                  <span>NB: {blueprint.cognitiveBreakdown.NB}%</span>
                  <span>TH: {blueprint.cognitiveBreakdown.TH}%</span>
                  <span>VD: {blueprint.cognitiveBreakdown.VD}%</span>
                  <span>VDC: {blueprint.cognitiveBreakdown.VDC}%</span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0]">
                <table className="w-full border-collapse text-[13.5px] tabular-nums">
                  <thead className="bg-[#136F63] text-white">
                    <tr>
                      <th className="border-r border-white/15 px-2.5 py-2 text-left font-semibold">Câu</th>
                      <th className="border-r border-white/15 px-2.5 py-2 font-semibold">Phần</th>
                      <th className="border-r border-white/15 px-2.5 py-2 text-left font-semibold">Chủ đề</th>
                      <th className="border-r border-white/15 px-2.5 py-2 font-semibold">Mức độ</th>
                      <th className="border-r border-white/15 px-2.5 py-2 text-left font-semibold">Đặc tả kỹ năng</th>
                      <th className="px-2.5 py-2 font-semibold">Điểm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[#334155] dark:divide-slate-800 dark:text-slate-200">
                    {blueprint.rows.map((r, i) => (
                      <tr key={i} className={i % 2 === 1 ? 'bg-[#F8FAFC] dark:bg-slate-900/40' : ''}>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 font-semibold text-[#0F172A] dark:border-slate-800 dark:text-white">{r.questionNo}</td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center dark:border-slate-800">{r.part}</td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 dark:border-slate-800">{r.topic}</td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-[#136F63] dark:border-slate-800 dark:text-teal-300">{r.level}</td>
                        <td className="border-r border-[#E2E8F0] px-2.5 py-2 dark:border-slate-800">{r.skill}</td>
                        <td className="px-2.5 py-2 text-center font-semibold">{r.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rightTab === 'tab2' && (
            <div className="a4-paper space-y-3 rounded-[8px] border border-[#E2E8F0] p-4">
              {generatedQuestions.map((q, idx) => (
                <div key={idx} className="border-b border-slate-100 pb-3 last:border-none">
                  <p className="text-justify">
                    <span className="font-bold">
                      {q.no} <span className="text-[11pt] text-[#136F63]">{q.tag}</span>.{' '}
                    </span>
                    <MathText text={q.stem} />
                  </p>
                  {q.options && (
                    <div className="mt-1 space-y-0.5 pl-2">
                      {q.options.map((o, oIdx) => {
                        const { letter, text: cleanOpt } = formatMcqOptionDisplay(o, oIdx);
                        return (
                          <div key={oIdx}>
                            <strong className="mr-1 text-[#136F63]">{letter}.</strong>
                            <MathText text={cleanOpt} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {rightTab === 'tab3' && (
            <div className="space-y-3">
              {generatedQuestions.map((q, idx) => (
                <div key={idx} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13.5px] dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#136F63] dark:text-teal-300">{q.no} {q.tag}</span>
                    <span className="font-semibold text-[#B91C1C] dark:text-red-300">Đáp án: {q.answer}</span>
                  </div>
                  <div className="mt-1 space-y-1 text-justify text-[13.5px] leading-relaxed text-[#334155] dark:text-slate-200">
                    {normalizeRawSolutionStringToSteps(q.solution).map((st, sIdx) => (
                      <div key={sIdx}>
                        <span className="font-bold text-[#136F63] dark:text-teal-300">
                          {st.label}
                        </span>{' '}
                        <MathText text={st.body} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SmartboardViewport>
      </div>
    </div>
  );
};

interface OnlinePdfExamModuleProps {
  rooms: OnlineExamRoom[];
  submissions?: ExamSubmission[];
  currentExam?: ExamPaper;
  onCreateRoom: (room: OnlineExamRoom) => void;
  onAddSubmission: (sub: ExamSubmission) => void;
}

type OnlineExamStepTab = 'rooms_monitor' | 'create_config' | 'answer_barem';

interface Part2KeyItem {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
}

const DEFAULT_PART2_KEYS: Part2KeyItem[] = [
  { a: true, b: true, c: true, d: false },
  { a: true, b: true, c: false, d: false },
  { a: true, b: true, c: false, d: true },
  { a: false, b: true, c: false, d: false },
];

/** Deterministic SVG QR-like matrix generator from PIN code for crisp classroom projection */
const PinQrSvg: React.FC<{ pin: string; size?: number }> = ({ pin, size = 140 }) => {
  const grid = 15;
  const seed = pin.split('').reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 17), 137);
  const isFinder = (r: number, c: number, r0: number, c0: number) => {
    const dr = r - r0;
    const dc = c - c0;
    if (dr < 0 || dr > 4 || dc < 0 || dc > 4) return null;
    if (dr === 0 || dr === 4 || dc === 0 || dc === 4) return true;
    if (dr >= 1 && dr <= 3 && dc >= 1 && dc <= 3) return dr === 2 && dc === 2;
    return false;
  };
  const cells: boolean[][] = Array.from({ length: grid }, (_, r) =>
    Array.from({ length: grid }, (__, c) => {
      const f1 = isFinder(r, c, 0, 0);
      if (f1 !== null) return f1;
      const f2 = isFinder(r, c, 0, grid - 5);
      if (f2 !== null) return f2;
      const f3 = isFinder(r, c, grid - 5, 0);
      if (f3 !== null) return f3;
      const hash = ((r * 31 + c * 17 + seed) * 2654435761) >>> 0;
      return hash % 11 < 5;
    })
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      className="rounded-[8px] border border-[#E2E8F0] bg-white p-1.5 shadow-xs"
      shapeRendering="crispEdges"
    >
      {cells.map((row, r) =>
        row.map((filled, c) =>
          filled ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0F172A" /> : null
        )
      )}
    </svg>
  );
};

export const OnlinePdfExamModule: React.FC<OnlinePdfExamModuleProps> = ({
  rooms,
  submissions = [],
  currentExam,
  onCreateRoom,
  onAddSubmission,
}) => {
  const [activeTab, setActiveTab] = useState<OnlineExamStepTab>('rooms_monitor');
  const [title, setTitle] = useState('Kiểm tra Cuối kì I Toán 12 — Đề Chuẩn 2025 (Mã 0107)');
  const [duration, setDuration] = useState(90);
  const [codesCount, setCodesCount] = useState(4);
  const [antiCheat, setAntiCheat] = useState(true);
  const [loginMode, setLoginMode] = useState<'google' | 'roster' | 'quick_name'>('quick_name');

  // 3-Part Answer Key Barem State (Chuẩn cấu trúc 2025)
  const [part1Keys, setPart1Keys] = useState<string[]>([
    'B', 'C', 'D', 'B', 'A', 'C', 'C', 'D', 'C', 'C', 'D', 'B',
  ]);
  const [part2Keys, setPart2Keys] = useState<Part2KeyItem[]>(DEFAULT_PART2_KEYS);
  const [part3Keys, setPart3Keys] = useState<string[]>(['2,4', '218', '10', '160', '46,8', '432']);
  const [solvingAI, setSolvingAI] = useState(false);

  // Batch Quick-String Entry Modal / Bar
  const [showQuickStringModal, setShowQuickStringModal] = useState(false);
  const [quickP1Input, setQuickP1Input] = useState('BCDBACCDC CDB');
  const [quickP2Input, setQuickP2Input] = useState('ĐĐĐS ĐĐSS ĐĐSĐ SĐSS');
  const [quickP3Input, setQuickP3Input] = useState('2,4; 218; 10; 160; 46,8; 432');
  const [baremNotice, setBaremNotice] = useState<string | null>(null);

  // Document Upload & Preview State (Tab 2 Left Column)
  const [uploadedFileName, setUploadedFileName] = useState<string>('De_Kiem_Tra_Cuoi_Ki_I_Toan_12_Ma0107.docx');
  const [uploadedFileType, setUploadedFileType] = useState<'pdf' | 'docx' | 'bank'>('bank');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [parsedDocxQuestions, setParsedDocxQuestions] = useState<BankQuestion[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Tab 1 UI Feedbacks & Modals
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [qrModalRoom, setQrModalRoom] = useState<OnlineExamRoom | null>(null);
  const [monitorRoom, setMonitorRoom] = useState<OnlineExamRoom | null>(null);

  // Live Student Simulator state
  const [simRoom, setSimRoom] = useState<OnlineExamRoom | null>(null);
  const [studentName, setStudentName] = useState('Nguyễn Văn An');
  const [studentClass, setStudentClass] = useState('12A1');
  const [studentP1, setStudentP1] = useState<string[]>(Array(12).fill(''));
  const [studentP2, setStudentP2] = useState<Part2KeyItem[]>(
    Array.from({ length: 4 }, () => ({ a: true, b: true, c: false, d: false }))
  );
  const [studentP3, setStudentP3] = useState<string[]>(Array(6).fill(''));
  const [tabSwitches, setTabSwitches] = useState(0);
  const [simSubmitted, setSimSubmitted] = useState<number | null>(null);
  const [simFocusIdx, setSimFocusIdx] = useState<number>(0);
  const [onlineKeypad, setOnlineKeypad] = useState<{
    mode: 'barem' | 'sim';
    index: number;
  } | null>(null);
  const baremP3Refs = useRef<Record<number, HTMLInputElement | null>>({});
  const simP3Refs = useRef<Record<number, HTMLInputElement | null>>({});
  const simSubmitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!simRoom || !simRoom.antiCheat || simSubmitted !== null) return;
    const onVis = () => {
      if (document.hidden) setTabSwitches((c) => c + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [simRoom, simSubmitted]);

  // Simulator Exam Keyboard Shortcuts (1-4/A-D, ←/→, Ctrl+Enter)
  useEffect(() => {
    if (!simRoom || simSubmitted !== null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        setOnlineKeypad(null);
        simSubmitRef.current();
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (e.ctrlKey || e.metaKey || e.altKey || isTextInput) return;

      const totalSimQ = 12 + 4 + 6;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        setSimFocusIdx((prev) => {
          const next = (prev + delta + totalSimQ) % totalSimQ;
          if (next >= 16) {
            const p3Idx = next - 16;
            setOnlineKeypad({ mode: 'sim', index: p3Idx });
            simP3Refs.current[p3Idx]?.focus();
          } else {
            setOnlineKeypad(null);
          }
          return next;
        });
        return;
      }

      const keyLower = e.key.toLowerCase();
      const letterMap: Record<string, string> = {
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
        if (simFocusIdx < 12) {
          e.preventDefault();
          setStudentP1((prev) => {
            const copy = [...prev];
            copy[simFocusIdx] = letterMap[keyLower];
            return copy;
          });
        } else if (simFocusIdx < 16) {
          e.preventDefault();
          const qIdx = simFocusIdx - 12;
          const subMap: Record<string, keyof Part2KeyItem> = {
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
          setStudentP2((prev) => {
            const copy = [...prev];
            copy[qIdx] = { ...copy[qIdx], [subKey]: !copy[qIdx][subKey] };
            return copy;
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [simRoom, simSubmitted, simFocusIdx]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const handleCopyPin = (room: OnlineExamRoom) => {
    navigator.clipboard?.writeText(room.pinCode);
    setCopiedPinId(room.id);
    setTimeout(() => {
      setCopiedPinId((prev) => (prev === room.id ? null : prev));
    }, 1800);
  };

  const handleExamFileSelect = async (file: File) => {
    setUploadingDoc(true);
    try {
      const lower = file.name.toLowerCase();
      setUploadedFileName(file.name);
      const cleanBaseTitle = file.name.replace(/\.(pdf|docx|doc)$/i, '').replace(/[_-]+/g, ' ');
      if (cleanBaseTitle.length > 4) {
        setTitle(cleanBaseTitle);
      }

      if (lower.endsWith('.pdf')) {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        const objUrl = URL.createObjectURL(file);
        setPdfPreviewUrl(objUrl);
        setUploadedFileType('pdf');
      } else if (lower.endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        const extractedText = await extractTextFromDocxArrayBuffer(buf);
        const questions = parseExamTextToBankQuestions(extractedText, file.name, '12');
        setParsedDocxQuestions(questions);
        setUploadedFileType('docx');

        // Auto-sync extracted keys into Barem if present
        const p1 = questions.filter((q) => q.partType === 'part1').slice(0, 12);
        if (p1.length > 0) {
          setPart1Keys((prev) =>
            prev.map((oldVal, idx) =>
              p1[idx] && typeof p1[idx].correctIndex === 'number'
                ? ['A', 'B', 'C', 'D'][p1[idx].correctIndex!] || oldVal
                : oldVal
            )
          );
        }
        const p2 = questions.filter((q) => q.partType === 'part2').slice(0, 4);
        if (p2.length > 0) {
          setPart2Keys((prev) =>
            prev.map((oldVal, idx) => {
              const st = p2[idx]?.statements;
              if (!st || st.length < 4) return oldVal;
              return {
                a: Boolean(st[0]?.isTrue),
                b: Boolean(st[1]?.isTrue),
                c: Boolean(st[2]?.isTrue),
                d: Boolean(st[3]?.isTrue),
              };
            })
          );
        }
        const p3 = questions.filter((q) => q.partType === 'part3').slice(0, 6);
        if (p3.length > 0) {
          setPart3Keys((prev) =>
            prev.map((oldVal, idx) => (p3[idx]?.answer ? p3[idx].answer!.replace(/\./g, ',') : oldVal))
          );
        }
      }
    } catch {
      // Keep current preview if file cannot be parsed
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleLoadFromBankExam = () => {
    if (!currentExam) return;
    setUploadedFileType('bank');
    setUploadedFileName(`Đề chuẩn Ngân hàng — Mã ${currentExam.examCode}.docx`);
    setTitle(`${currentExam.examTitle} — Mã ${currentExam.examCode}`);
    setPart1Keys(
      currentExam.part1.slice(0, 12).map((q) => ['A', 'B', 'C', 'D'][q.correctIndex] || 'A')
    );
    setPart2Keys(
      currentExam.part2.slice(0, 4).map((q) => ({
        a: Boolean(q.statements[0]?.isTrue),
        b: Boolean(q.statements[1]?.isTrue),
        c: Boolean(q.statements[2]?.isTrue),
        d: Boolean(q.statements[3]?.isTrue),
      }))
    );
    setPart3Keys(currentExam.part3.slice(0, 6).map((q) => q.answer.replace(/\./g, ',')));
  };

  const handleAutoSolveAI = async () => {
    setSolvingAI(true);
    setBaremNotice(null);
    try {
      const res = await fetch('/api/ai/pdf-auto-solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawExamText: title }),
      });
      const data = await res.json();
      if (res.ok && data.answerKey?.part1?.length) {
        setPart1Keys(data.answerKey.part1.slice(0, 12));
        if (data.answerKey.part2?.length) {
          setPart2Keys(data.answerKey.part2.slice(0, 4));
        }
        if (data.answerKey.part3?.length) {
          setPart3Keys(data.answerKey.part3.slice(0, 6));
        }
        setBaremNotice('Đã tự động giải & điền đầy đủ Barem đáp án 3 phần bằng AI!');
      }
    } finally {
      setSolvingAI(false);
    }
  };

  const handleApplyQuickAnswerString = () => {
    // Parse Part I: extract A/B/C/D sequence (supports "BCDB..." or "1B 2C 3D...")
    const p1Matches = quickP1Input.toUpperCase().match(/[ABCD]/g);
    if (p1Matches && p1Matches.length > 0) {
      setPart1Keys((prev) =>
        prev.map((oldVal, idx) => (p1Matches[idx] ? p1Matches[idx] : oldVal))
      );
    }

    // Parse Part II: extract Đ/S or D/S or T/F tokens in groups of 4
    const p2Tokens = quickP2Input
      .toUpperCase()
      .match(/[ĐDSTF]/g);
    if (p2Tokens && p2Tokens.length >= 4) {
      setPart2Keys((prev) =>
        prev.map((oldItem, qIdx) => {
          const base = qIdx * 4;
          const isTrueChar = (ch?: string) => ch === 'Đ' || ch === 'D' || ch === 'T';
          return {
            a: p2Tokens[base] !== undefined ? isTrueChar(p2Tokens[base]) : oldItem.a,
            b: p2Tokens[base + 1] !== undefined ? isTrueChar(p2Tokens[base + 1]) : oldItem.b,
            c: p2Tokens[base + 2] !== undefined ? isTrueChar(p2Tokens[base + 2]) : oldItem.c,
            d: p2Tokens[base + 3] !== undefined ? isTrueChar(p2Tokens[base + 3]) : oldItem.d,
          };
        })
      );
    }

    // Parse Part III: semicolon or space separated short numbers
    const p3Tokens = quickP3Input
      .split(/[;\n|]+/)
      .map((s) => s.trim().replace(/\./g, ',').slice(0, 4))
      .filter(Boolean);
    if (p3Tokens.length > 0) {
      setPart3Keys((prev) =>
        prev.map((oldVal, idx) => (p3Tokens[idx] !== undefined ? p3Tokens[idx] : oldVal))
      );
    }

    setShowQuickStringModal(false);
    setBaremNotice('Đã điền hàng loạt chuỗi đáp án cho Phần I, Phần II và Phần III!');
  };

  const handlePublishRoom = () => {
    const newRoom: OnlineExamRoom = {
      id: `room-${Date.now()}`,
      pinCode: String(Math.floor(100000 + Math.random() * 899999)),
      title,
      subject: 'Toán',
      durationMinutes: duration,
      examCodesCount: codesCount,
      antiCheat,
      loginMode,
      status: 'active',
      answerKey: {
        part1: part1Keys,
        part2: part2Keys,
        part3: part3Keys,
      },
      createdAt: new Date().toISOString(),
    };
    onCreateRoom(newRoom);
    setActiveTab('rooms_monitor');
  };

  const handleSubmitSim = () => {
    if (!simRoom) return;
    // Chuẩn tính điểm 2025: Phần I (12 câu x 0,25 = 3,0đ), Phần II (4 câu tối đa 4,0đ), Phần III (6 câu x 0,5 = 3,0đ)
    let p1Score = 0;
    simRoom.answerKey.part1.forEach((k, idx) => {
      if (studentP1[idx] === k) p1Score += 0.25;
    });

    let p2Score = 0;
    simRoom.answerKey.part2.forEach((k, idx) => {
      const st = studentP2[idx] || { a: false, b: false, c: false, d: false };
      let matchCount = 0;
      if (st.a === k.a) matchCount++;
      if (st.b === k.b) matchCount++;
      if (st.c === k.c) matchCount++;
      if (st.d === k.d) matchCount++;
      if (matchCount === 1) p2Score += 0.1;
      else if (matchCount === 2) p2Score += 0.25;
      else if (matchCount === 3) p2Score += 0.5;
      else if (matchCount === 4) p2Score += 1.0;
    });

    let p3Score = 0;
    simRoom.answerKey.part3.forEach((k, idx) => {
      const normKey = (k || '').trim().replace(/\./g, ',');
      const normAns = (studentP3[idx] || '').trim().replace(/\./g, ',');
      if (normKey && normAns === normKey) p3Score += 0.5;
    });

    const finalScore = Math.min(10, Math.round((p1Score + p2Score + p3Score) * 100) / 100);
    setSimSubmitted(finalScore);
    onAddSubmission({
      id: `sub-${Date.now()}`,
      roomId: simRoom.id,
      studentName,
      studentClass,
      score: finalScore,
      tabSwitches,
      submittedAt: new Date().toISOString(),
    });
  };

  const totalSubmissionsCount = submissions.length;
  const totalTabAlertsCount = submissions.reduce((acc, s) => acc + (s.tabSwitches > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-6 rounded-[8px] bg-[#F1F5F9] p-4 sm:p-6 dark:bg-slate-900/90">
      {/* Top Header & 3-Step Navigation Bar */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-center dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#136F63] text-white">
                <Globe className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight text-[#0F172A] dark:text-white">
                  Quản lý Phòng Thi Online &amp; Giám Sát Chống Gian Lận
                </h2>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Tổ chức thi trực tuyến từ file PDF/Word chuẩn cấu trúc 2025, cấp mã PIN/QR và giám sát thoát Tab thời gian thực
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-4 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-[13px] sm:flex dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#15803D]" />
                <span className="font-medium text-[#334155] dark:text-slate-300">Phòng đang mở:</span>
                <strong className="font-semibold text-[#0F172A] tabular-nums dark:text-white">{rooms.length}</strong>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[#136F63]" />
                <span className="font-medium text-[#334155] dark:text-slate-300">Đã nộp:</span>
                <strong className="font-semibold text-[#0F172A] tabular-nums dark:text-white">{totalSubmissionsCount}</strong>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-[#B91C1C]" />
                <span className="font-medium text-[#334155] dark:text-slate-300">Cảnh báo thoát Tab:</span>
                <strong className="font-semibold text-[#B91C1C] tabular-nums">{totalTabAlertsCount}</strong>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('create_config')}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-[8px] bg-[#136F63] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F] active:scale-[0.99]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Tạo Phòng Thi Mới</span>
            </button>
          </div>
        </div>

        {/* 3-Step Stepper Tabs */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              id: 'rooms_monitor' as OnlineExamStepTab,
              step: 'Bước 1',
              title: 'Danh sách Phòng thi & Giám sát',
              subtitle: `${rooms.length} phòng đang mở · Theo dõi thoát Tab trực tiếp`,
              icon: LayoutList,
            },
            {
              id: 'create_config' as OnlineExamStepTab,
              step: 'Bước 2',
              title: 'Tạo & Cấu hình Phòng thi',
              subtitle: 'Tải đề PDF/Word, xem trước & cài đặt chống gian lận',
              icon: Sliders,
            },
            {
              id: 'answer_barem' as OnlineExamStepTab,
              step: 'Bước 3',
              title: 'Bảng Nhập Barem Đáp Án Chuẩn 2025',
              subtitle: 'Phần I (12 câu) · Phần II (Đúng/Sai) · Phần III (Trả lời ngắn)',
              icon: ListChecks,
            },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group flex min-h-[56px] items-center gap-3.5 rounded-[8px] border p-3.5 text-left transition-all ${
                  isActive
                    ? 'border-[#136F63] bg-teal-50/70 ring-1 ring-[#136F63]/25 dark:border-teal-500 dark:bg-teal-950/40'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-teal-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/50'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#136F63] text-white'
                      : 'border border-[#E2E8F0] bg-white text-[#334155] group-hover:border-teal-300 group-hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        isActive
                          ? 'bg-[#136F63] text-white'
                          : 'bg-slate-200/80 text-[#334155] dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {item.step}
                    </span>
                    <span
                      className={`truncate text-[14px] font-semibold ${
                        isActive ? 'text-[#0F172A] dark:text-white' : 'text-[#334155] dark:text-slate-200'
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[#64748B] dark:text-slate-400">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: DANH SÁCH PHÒNG THI & GIÁM SÁT (DEFAULT SCREEN)
         ===================================================================== */}
      {activeTab === 'rooms_monitor' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {rooms.map((rm, idx) => {
              const roomSubs = submissions.filter((s) => s.roomId === rm.id);
              const activeDoingCount = rm.status === 'active' ? 3 + (idx % 3) * 2 : 0;
              const submittedCount = roomSubs.length;
              const alertSubs = roomSubs.filter((s) => s.tabSwitches > 0);
              const totalRoomAlerts = roomSubs.reduce((sum, s) => sum + s.tabSwitches, 0);

              return (
                <div
                  key={rm.id}
                  className="flex flex-col justify-between rounded-[8px] border border-[#E2E8F0] bg-white p-5 transition hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    {/* Top Row: Status badge & Login Mode */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1 text-[12px] font-semibold text-[#15803D] dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-[#15803D] animate-pulse" />
                          Đang mở thi
                        </span>
                        <span className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[12px] font-semibold text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {rm.examCodesCount} mã đề trộn
                        </span>
                      </div>

                      {rm.antiCheat ? (
                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#FCD34D] bg-[#FEF3C7] px-2.5 py-1 text-[12px] font-semibold text-[#B45309] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <ShieldAlert className="h-3.5 w-3.5 text-[#B45309]" />
                          Chống thoát Tab: BẬT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[12px] font-medium text-[#64748B]">
                          Chế độ tự do
                        </span>
                      )}
                    </div>

                    {/* Exam Room Title */}
                    <h3 className="mt-3 text-[15px] font-semibold text-[#0F172A] dark:text-white">
                      {rm.title}
                    </h3>

                    {/* Key Metrics Grid: PIN + QR, Active/Submitted, Duration & Warnings */}
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {/* PIN & Quick Copy + QR */}
                      <div className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/50">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                            Mã PIN Phòng Thi
                          </div>
                          <div className="mt-0.5 font-mono text-xl font-bold tracking-wider text-[#136F63] tabular-nums dark:text-teal-300">
                            {rm.pinCode}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyPin(rm)}
                            title="Sao chép mã PIN"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {copiedPinId === rm.id ? (
                              <Check className="h-4 w-4 text-[#15803D]" />
                            ) : (
                              <Copy className="h-4 w-4 text-[#136F63]" />
                            )}
                          </button>
                          <button
                            onClick={() => setQrModalRoom(rm)}
                            title="Hiển thị mã QR vào phòng thi"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <QrCode className="h-4 w-4 text-[#136F63]" />
                          </button>
                        </div>
                      </div>

                      {/* Candidate Counter */}
                      <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                          <Users className="h-3.5 w-3.5 text-[#136F63]" />
                          <span>Thí sinh dự thi</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-[16px] font-semibold text-[#15803D] tabular-nums">
                            {activeDoingCount} đang thi
                          </span>
                          <span className="text-xs text-slate-400">/</span>
                          <span className="text-[13.5px] font-semibold text-[#334155] tabular-nums dark:text-slate-200">
                            {submittedCount} đã nộp
                          </span>
                        </div>
                      </div>

                      {/* Time & Anti-Cheat Alert Count */}
                      <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[#64748B]" />
                            {rm.durationMinutes} phút
                          </span>
                          <span className="font-semibold text-[#B91C1C]">
                            {alertSubs.length} HS vi phạm
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`text-[13.5px] font-semibold tabular-nums ${
                              totalRoomAlerts > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                            }`}
                          >
                            {totalRoomAlerts > 0
                              ? `${totalRoomAlerts} lượt thoát Tab`
                              : '0 lượt thoát Tab'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Action Buttons */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#E2E8F0] pt-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleCopyPin(rm)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {copiedPinId === rm.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-[#15803D]" />
                            <span className="text-[#15803D]">Đã chép PIN</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-[#136F63]" />
                            <span>Sao chép PIN</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setQrModalRoom(rm)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <QrCode className="h-3.5 w-3.5 text-[#136F63]" />
                        <span>Mã QR</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setMonitorRoom(rm)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] px-3.5 py-2 text-[13.5px] font-semibold text-[#B45309] transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#B45309]" />
                        <span>Xem giám sát trực tiếp</span>
                      </button>

                      <button
                        onClick={() => {
                          setSimRoom(rm);
                          setSimSubmitted(null);
                          setTabSwitches(0);
                          setStudentP1(Array(12).fill(''));
                          setStudentP2(
                            Array.from({ length: 4 }, () => ({
                              a: true,
                              b: true,
                              c: false,
                              d: false,
                            }))
                          );
                          setStudentP3(Array(6).fill(''));
                        }}
                        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F]"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Thi thử (Học sinh)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: TẠO & CẤU HÌNH PHÒNG THI (2-COLUMN BALANCED LAYOUT)
         ===================================================================== */}
      {activeTab === 'create_config' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Drag & Drop Exam File + Document Preview */}
          <div className="flex flex-col justify-between space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
                    1. Tải lên Đề thi gốc &amp; Xem trước tài liệu
                  </h3>
                  <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                    Hỗ trợ kéo-thả tệp PDF (.pdf), Word (.docx) hoặc lấy đề trực tiếp từ Ngân hàng đề
                  </p>
                </div>
                {currentExam && (
                  <button
                    onClick={handleLoadFromBankExam}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <FileText className="h-3.5 w-3.5 text-[#136F63]" />
                    <span>Nạp Đề hiện hành (Mã {currentExam.examCode})</span>
                  </button>
                )}
              </div>

              {/* Drag and Drop Upload Box */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleExamFileSelect(file);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed p-5 text-center transition ${
                  isDraggingFile
                    ? 'border-[#136F63] bg-teal-50/70'
                    : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#136F63] hover:bg-teal-50/30 dark:border-slate-700 dark:bg-slate-800/40'
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleExamFileSelect(file);
                  }}
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#136F63]/10 text-[#136F63] dark:bg-teal-950 dark:text-teal-300">
                  {uploadingDoc ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#136F63]" />
                  ) : (
                    <Upload className="h-5 w-5 text-[#136F63]" />
                  )}
                </div>
                <div className="mt-2.5 text-[14px] font-semibold text-[#0F172A] dark:text-white">
                  Kéo-thả file đề thi (PDF hoặc Word .docx) vào đây, hoặc nhấn để chọn tệp
                </div>
                <div className="mt-1 text-[12px] text-[#64748B] dark:text-slate-400">
                  Đang gắn tài liệu:{' '}
                  <strong className="font-semibold text-[#136F63] dark:text-teal-300">{uploadedFileName}</strong>
                </div>
              </label>

              {/* Document Preview Frame */}
              <SmartboardViewport
                title={`Khung Xem Trước Tài Liệu Đề Thi (${uploadedFileName})`}
                subtitle="Sẵn sàng phát đề · Zoom 2 ngón tay · Bút viết chú thích"
                bodyClassName="max-h-[360px] overflow-y-auto p-4 bg-[#F8FAFC] dark:bg-slate-900/50"
                headerActions={
                  <span className="rounded-[6px] border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                    Sẵn sàng phát đề
                  </span>
                }
              >
                {uploadedFileType === 'pdf' && pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title="PDF Exam Preview"
                    className="h-[310px] w-full rounded-[8px] border border-[#E2E8F0] bg-white"
                  />
                ) : uploadedFileType === 'docx' && parsedDocxQuestions.length > 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-2 text-[12.5px] font-semibold text-[#0369A1]">
                      Đã bóc tách nguyên bản <strong>{parsedDocxQuestions.length} câu hỏi</strong> từ tệp Word và đồng bộ đáp án sang Bước 3.
                    </div>
                    {parsedDocxQuestions.slice(0, 6).map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-[13.5px] dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-semibold text-[#136F63] dark:text-teal-300">
                            Câu {idx + 1} ({q.partType === 'part1' ? 'Phần I' : q.partType === 'part2' ? 'Phần II' : 'Phần III'})
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#64748B]">
                            [{q.tag}]
                          </span>
                        </div>
                        <MathText text={q.stem} className="text-[#334155] dark:text-slate-200" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-2 text-[12.5px] text-[#0369A1] dark:bg-sky-950/60 dark:text-sky-200">
                      <span>
                        <strong>Đề thi chuẩn Cấu trúc 2025:</strong> 12 câu Phần I · 4 câu Phần II (Đúng/Sai) · 6 câu Phần III (Trả lời ngắn)
                      </span>
                      <span className="font-mono font-semibold">Mã đề: {currentExam?.examCode || '0107'}</span>
                    </div>
                    {(currentExam?.part1 || []).slice(0, 4).map((q) => (
                      <div
                        key={q.id}
                        className="rounded-[8px] border border-[#E2E8F0] bg-white p-3 text-[13.5px] dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-semibold text-[#136F63] dark:text-teal-300">
                            Câu {q.number} (Phần I - Trắc nghiệm 4 lựa chọn)
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#64748B] dark:bg-slate-800 dark:text-slate-300">
                            [{q.tag}]
                          </span>
                        </div>
                        <MathText text={q.stem} className="text-[#334155] dark:text-slate-200" />
                      </div>
                    ))}
                  </div>
                )}
              </SmartboardViewport>
            </div>
          </div>

          {/* RIGHT COLUMN: Room Settings & Anti-Cheat Switch */}
          <div className="flex flex-col justify-between space-y-5 rounded-[8px] border border-[#E2E8F0] bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
                  2. Thiết lập Thông số &amp; Giám sát Phòng thi
                </h3>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Cấu hình thời gian, số mã đề trộn và chế độ định danh thí sinh
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                  Tên kỳ thi / Bài kiểm tra
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tên kỳ thi..."
                  className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[14px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                    Thời gian làm bài (Phút)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[14px] font-semibold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <span className="pointer-events-none absolute right-3 top-2.5 text-[12px] font-medium text-[#64748B]">
                      phút
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                    Số lượng mã đề
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCodesCount(n)}
                        className={`min-h-[42px] rounded-[8px] py-2 text-[14px] font-semibold tabular-nums transition-all ${
                          codesCount === n
                            ? 'bg-[#136F63] text-white'
                            : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Login Mode Selection */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                  Phương thức thí sinh vào thi
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { id: 'google', label: 'Google Auth', desc: 'Xác thực Gmail' },
                    { id: 'roster', label: 'Chọn theo DS lớp', desc: 'Đúng sĩ số lớp' },
                    { id: 'quick_name', label: 'Nhập tên nhanh', desc: 'Vào nhanh bằng PIN' },
                  ].map((m) => {
                    const active = loginMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLoginMode(m.id as 'google' | 'roster' | 'quick_name')}
                        className={`min-h-[48px] rounded-[8px] border p-2.5 text-left transition-all ${
                          active
                            ? 'border-[#136F63] bg-teal-50/70 text-[#0F172A] ring-1 ring-[#136F63]/25 dark:border-teal-500 dark:bg-teal-950/40 dark:text-white'
                            : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-[13px] font-semibold">{m.label}</div>
                        <div className="mt-0.5 text-[11.5px] text-[#64748B] dark:text-slate-400">
                          {m.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Anti-Cheat Toggle Switch */}
              <div className="flex items-center justify-between rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2]/60 p-4 dark:border-red-900 dark:bg-red-950/30">
                <div className="pr-3">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#B91C1C] dark:text-red-300">
                    <ShieldAlert className="h-4 w-4 text-[#B91C1C]" />
                    <span>Giám sát chống thoát Tab &amp; rời màn hình</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#B91C1C]/90 dark:text-red-300/90">
                    Tự động phát hiện và đếm số lần học sinh chuyển cửa sổ trình duyệt để tra cứu tài liệu, gửi cảnh báo đỏ về màn hình Giáo viên.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheat}
                  onClick={() => setAntiCheat((v) => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    antiCheat ? 'bg-[#B91C1C]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                      antiCheat ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Step 2 Bottom Actions */}
            <div className="space-y-2.5 border-t border-[#E2E8F0] pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('answer_barem')}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] py-3 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F]"
              >
                <span>Tiếp tục: Kiểm tra &amp; Nhập Barem Đáp Án (Bước 3)</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handlePublishRoom}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] border border-[#CBD5E1] bg-white py-2.5 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <Globe className="h-4 w-4 text-[#136F63]" />
                <span>Mở Phòng Thi &amp; Cấp Mã PIN Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: BẢNG NHẬP BAREM ĐÁP ÁN CHUẨN 2025 (3 PHẦN RÕ RỆT)
         ===================================================================== */}
      {activeTab === 'answer_barem' && (
        <div className="space-y-6">
          {/* Top Action Bar for Barem */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
                Bảng Nhập Barem Đáp Án Chuẩn Cấu Trúc 2025 — {title}
              </h3>
              <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                Tổng điểm toàn bài: <strong>10,0 điểm</strong> · Phần I (3,0đ) · Phần II (4,0đ) · Phần III (3,0đ)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowQuickStringModal((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <Keyboard className="h-4 w-4 text-[#136F63]" />
                <span>Nhập nhanh chuỗi đáp án</span>
              </button>

              <button
                type="button"
                onClick={handleAutoSolveAI}
                disabled={solvingAI}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {solvingAI ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#136F63]" />
                ) : (
                  <Sparkles className="h-4 w-4 text-[#136F63]" />
                )}
                <span>Tự động giải &amp; điền đáp án AI</span>
              </button>

              <button
                type="button"
                onClick={handlePublishRoom}
                className="inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F]"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Hoàn tất &amp; Mở Phòng Thi Ngay</span>
              </button>
            </div>
          </div>

          {baremNotice && (
            <div className="flex items-center justify-between rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-4 py-3 text-[13.5px] font-semibold text-[#15803D]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#15803D]" />
                <span>{baremNotice}</span>
              </div>
              <button onClick={() => setBaremNotice(null)} className="text-[#15803D] hover:underline">
                Đóng
              </button>
            </div>
          )}

          {/* Quick String Paste Panel */}
          {showQuickStringModal && (
            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3">
                <div className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
                  Nhập nhanh chuỗi đáp án hàng loạt (Copy / Paste)
                </div>
                <button
                  onClick={() => setShowQuickStringModal(false)}
                  className="rounded-[8px] p-1.5 text-[#64748B] hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                    Chuỗi Phần I (12 chữ cái A/B/C/D)
                  </label>
                  <input
                    value={quickP1Input}
                    onChange={(e) => setQuickP1Input(e.target.value)}
                    placeholder="VD: BCDBACCDBADA"
                    className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-[13px] font-semibold uppercase focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                    Chuỗi Phần II (4 nhóm Đ/S cho Câu 1–4)
                  </label>
                  <input
                    value={quickP2Input}
                    onChange={(e) => setQuickP2Input(e.target.value)}
                    placeholder="VD: ĐĐĐS ĐĐSS ĐĐSĐ SĐSS"
                    className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-[13px] font-semibold uppercase focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                    Chuỗi Phần III (6 đáp số cách nhau dấu ;)
                  </label>
                  <input
                    value={quickP3Input}
                    onChange={(e) => setQuickP3Input(e.target.value)}
                    placeholder="VD: 2,4; 218; 10; 160; 46,8; 432"
                    className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-[13px] font-semibold focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyQuickAnswerString}
                  className="min-h-[44px] rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-[#0F594F]"
                >
                  Áp dụng chuỗi đáp án vào bảng
                </button>
              </div>
            </div>
          )}

          {/* SECTION 1: PHẦN I (TRẮC NGHIỆM 4 LỰA CHỌN - 12 CÂU) */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div>
                <h4 className="text-[15px] font-semibold uppercase tracking-wide text-[#0F172A] dark:text-white">
                  PHẦN I. Trắc nghiệm nhiều phương án lựa chọn (Câu 1 đến Câu 12)
                </h4>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Mỗi câu trả lời đúng thí sinh được <strong>0,25 điểm</strong> (Tổng Phần I: 3,0 điểm)
                </p>
              </div>
              <span className="rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-1 font-mono text-[12px] font-semibold text-[#0369A1] dark:bg-sky-950 dark:text-sky-200">
                Chuỗi hiện tại: {part1Keys.join('')}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {part1Keys.map((val, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 transition hover:border-teal-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <span className="font-mono text-[13px] font-semibold text-[#0F172A] dark:text-white">
                    Câu {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                      const selected = val === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const copy = [...part1Keys];
                            copy[idx] = opt;
                            setPart1Keys(copy);
                          }}
                          className={`h-9 w-9 rounded-full text-[13px] font-semibold transition-all ${
                            selected
                              ? 'bg-[#136F63] text-white'
                              : 'border border-[#CBD5E1] bg-white text-[#334155] hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 2: PHẦN II (TRẮC NGHIỆM ĐÚNG / SAI - 4 CÂU x 4 Ý a, b, c, d) */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div>
                <h4 className="text-[15px] font-semibold uppercase tracking-wide text-[#0F172A] dark:text-white">
                  PHẦN II. Trắc nghiệm Đúng / Sai (Câu 1 đến Câu 4 — mỗi câu 4 ý a, b, c, d)
                </h4>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Đúng 1 ý: <strong>0,1đ</strong> · Đúng 2 ý: <strong>0,25đ</strong> · Đúng 3 ý: <strong>0,5đ</strong> · Đúng cả 4 ý: <strong>1,0đ</strong> (Tổng Phần II: 4,0 điểm)
                </p>
              </div>
              <span className="rounded-[6px] border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1 text-[12px] font-semibold text-[#15803D] dark:bg-emerald-950 dark:text-emerald-300">
                Đã cấu hình đủ 16 lệnh hỏi a, b, c, d
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {part2Keys.map((item, qIdx) => (
                <div
                  key={qIdx}
                  className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] pb-2 dark:border-slate-800">
                    <span className="text-[14px] font-semibold text-[#0F172A] dark:text-white">
                      Câu {qIdx + 1} (Phần II)
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-[#64748B] dark:text-slate-400">
                      {(['a', 'b', 'c', 'd'] as const)
                        .map((k) => (item[k] ? 'Đ' : 'S'))
                        .join(' - ')}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {(['a', 'b', 'c', 'd'] as const).map((subKey) => {
                      const isTrue = item[subKey];
                      return (
                        <div
                          key={subKey}
                          className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <span className="font-mono text-[13px] font-semibold text-[#334155] dark:text-slate-200">
                            Ý {subKey})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...part2Keys];
                                next[qIdx] = { ...next[qIdx], [subKey]: true };
                                setPart2Keys(next);
                              }}
                              className={`min-h-[36px] rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition ${
                                isTrue
                                  ? 'bg-[#136F63] text-white'
                                  : 'bg-slate-100 text-[#64748B] hover:bg-teal-50 hover:text-[#136F63] dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...part2Keys];
                                next[qIdx] = { ...next[qIdx], [subKey]: false };
                                setPart2Keys(next);
                              }}
                              className={`min-h-[36px] rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition ${
                                !isTrue
                                  ? 'bg-[#B91C1C] text-white'
                                  : 'bg-slate-100 text-[#64748B] hover:bg-red-50 hover:text-[#B91C1C] dark:bg-slate-800 dark:text-slate-300'
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
              ))}
            </div>
          </div>

          {/* SECTION 3: PHẦN III (TRẮC NGHIỆM TRẢ LỜI NGẮN - 6 CÂU) */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div>
                <h4 className="text-[15px] font-semibold uppercase tracking-wide text-[#0F172A] dark:text-white">
                  PHẦN III. Trắc nghiệm trả lời ngắn (Câu 1 đến Câu 6)
                </h4>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Mỗi câu trả lời đúng được <strong>0,5 điểm</strong> · Tối đa 4 ký tự, tự động chuẩn hóa dấu phẩy thập phân (,)
                </p>
              </div>
              <span className="rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-1 font-mono text-[12px] font-semibold text-[#0369A1] dark:bg-sky-950 dark:text-sky-200">
                Tổng Phần III: 3,0 điểm
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {part3Keys.map((v, idx) => (
                <div
                  key={idx}
                  className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-center transition focus-within:border-[#136F63] focus-within:bg-white dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <label className="mb-1.5 block font-mono text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                    Câu {idx + 1}
                  </label>
                  <input
                    ref={(el) => {
                      baremP3Refs.current[idx] = el;
                    }}
                    maxLength={SHORT_ANSWER_MAX_LEN}
                    value={v}
                    onFocus={() => setOnlineKeypad({ mode: 'barem', index: idx })}
                    onClick={() => setOnlineKeypad({ mode: 'barem', index: idx })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        if (idx + 1 < part3Keys.length) {
                          setOnlineKeypad({ mode: 'barem', index: idx + 1 });
                          baremP3Refs.current[idx + 1]?.focus();
                        } else {
                          setOnlineKeypad(null);
                        }
                      }
                    }}
                    onChange={(e) => {
                      const copy = [...part3Keys];
                      copy[idx] = sanitizeShortAnswerValue(e.target.value);
                      setPart3Keys(copy);
                    }}
                    placeholder="0,0"
                    className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-2 text-center font-mono text-[15px] font-semibold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: MÃ QR & PIN VÀO PHÒNG THI CHO HỌC SINH
         ===================================================================== */}
      {qrModalRoom && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setQrModalRoom(null)}
          maxWidthClass="max-w-md"
          title={qrModalRoom.title}
          subtitle="Cổng vào phòng thi trực tuyến — Chiếu lên Smartboard cho học sinh quét QR"
          bodyClassName="p-6 text-center"
        >
          <div className="my-3 flex flex-col items-center justify-center">
            <PinQrSvg pin={qrModalRoom.pinCode} size={200} />
            <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-[#64748B]">
              Mã PIN vào phòng thi
            </div>
            <div className="mt-1 font-mono text-3xl font-bold tracking-widest text-[#136F63] tabular-nums dark:text-teal-300">
              {qrModalRoom.pinCode}
            </div>
            <p className="mt-2 text-[13px] text-[#64748B]">
              Học sinh quét mã QR trên màn chiếu hoặc nhập mã PIN để bắt đầu làm bài ({qrModalRoom.durationMinutes} phút)
            </p>
          </div>

          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => handleCopyPin(qrModalRoom)}
              className="min-h-[48px] flex-1 rounded-[8px] bg-[#136F63] py-2.5 text-[13.5px] font-medium text-white hover:bg-[#0F594F]"
            >
              <Copy className="mr-1.5 inline h-3.5 w-3.5" />
              Sao chép Mã PIN ({qrModalRoom.pinCode})
            </button>
            <button
              onClick={() => setQrModalRoom(null)}
              className="min-h-[48px] rounded-[8px] border border-[#CBD5E1] bg-white px-4 py-2.5 text-[13.5px] font-medium text-[#334155] hover:bg-slate-50"
            >
              Đóng
            </button>
          </div>
        </SmartboardViewport>
      )}

      {/* =====================================================================
          MODAL 2: XEM GIÁM SÁT TRỰC TIẾP (THEO DÕI CẢNH BÁO THOÁT TAB)
         ===================================================================== */}
      {monitorRoom && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setMonitorRoom(null)}
          maxWidthClass="max-w-3xl"
          title={`Giám sát phòng thi: ${monitorRoom.title}`}
          subtitle={`PIN: ${monitorRoom.pinCode} · Theo dõi thoát Tab thời gian thực`}
          bodyClassName="p-6"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#15803D] animate-pulse" />
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#15803D]">
              Giám sát phòng thi thời gian thực
            </span>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-[#136F63] text-white uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Họ và tên thí sinh</th>
                  <th className="px-4 py-3 font-semibold">Lớp</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 text-center font-semibold">Cảnh báo thoát Tab</th>
                  <th className="px-4 py-3 text-right font-semibold">Điểm số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {submissions
                  .filter((s) => s.roomId === monitorRoom.id)
                  .map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-white">
                        {sub.studentName}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#334155] dark:text-slate-300">
                        {sub.studentClass}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-0.5 text-[12px] font-semibold text-[#15803D]">
                          Đã nộp bài
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sub.tabSwitches > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#FCA5A5] bg-[#FEE2E2] px-2.5 py-1 font-mono text-[12px] font-semibold text-[#B91C1C]">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Thoát Tab {sub.tabSwitches} lần
                          </span>
                        ) : (
                          <span className="font-semibold text-[#15803D]">An toàn (0)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[14px] font-bold text-[#136F63] tabular-nums dark:text-teal-300">
                        {sub.score.toFixed(2)} đ
                      </td>
                    </tr>
                  ))}
                {/* Live Simulated Active Students in Room */}
                <tr className="bg-[#F8FAFC] dark:bg-slate-800/30">
                  <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-white">
                    Phạm Minh Tuấn
                  </td>
                  <td className="px-4 py-3 font-medium text-[#334155] dark:text-slate-300">12A1</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0369A1] animate-ping" />
                      Đang làm bài (Câu 9/22)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-semibold text-[#15803D]">An toàn (0)</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SmartboardViewport>
      )}

      {/* =====================================================================
          MODAL 3: THI THỬ (HỌC SINH) ĐẦY ĐỦ 3 PHẦN CHUẨN 2025
         ===================================================================== */}
      {simRoom && (
        <SmartboardViewport
          isModal
          showPenToolbarByDefault
          onCloseModal={() => setSimRoom(null)}
          maxWidthClass="max-w-4xl"
          title={simRoom.title}
          subtitle={`Mã PIN: ${simRoom.pinCode} · Cảnh báo rời Tab: ${tabSwitches} lần`}
          bodyClassName="p-6"
        >
          {simSubmitted !== null ? (
            <div className="my-6 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#15803D]" />
              <div className="mt-3 text-[20px] font-semibold text-[#15803D]">
                Nộp bài thành công! Tổng điểm: {simSubmitted} / 10,0
              </div>
              <p className="mt-1.5 text-[13.5px] text-[#15803D]">
                Bài làm của thí sinh <strong>{studentName}</strong> ({studentClass}) đã được chấm tự động theo Barem 2025 và lưu vào bảng Giám sát.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">Họ và tên thí sinh</label>
                  <input
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Họ tên học sinh"
                    className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] px-3 py-2 text-[13.5px] font-medium dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#64748B]">Lớp</label>
                  <input
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    placeholder="Lớp"
                    className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] px-3 py-2 text-[13.5px] font-medium dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Simulator Part I */}
              <div>
                <div className="mb-2 text-[13px] font-semibold uppercase text-[#136F63]">
                  Phần I. Trắc nghiệm 4 lựa chọn (12 câu)
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 12 }, (_, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSimFocusIdx(idx)}
                      className={`flex items-center justify-between rounded-[8px] border px-3 py-2 text-[13px] transition ${
                        simFocusIdx === idx
                          ? 'border-[#136F63] bg-[#F0FDFA] ring-1 ring-[#136F63]/30'
                          : 'border-[#E2E8F0] bg-[#F8FAFC]'
                      }`}
                    >
                      <span className="font-mono font-semibold text-[#0F172A]">C{idx + 1}</span>
                      <div className="flex gap-1.5">
                        {['A', 'B', 'C', 'D'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              const next = [...studentP1];
                              next[idx] = opt;
                              setStudentP1(next);
                            }}
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold transition ${
                              studentP1[idx] === opt
                                ? 'bg-[#136F63] text-white'
                                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-slate-50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulator Part II */}
              <div>
                <div className="mb-2 text-[13px] font-semibold uppercase text-[#136F63]">
                  Phần II. Trắc nghiệm Đúng / Sai (4 câu)
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {studentP2.map((stItem, qIdx) => (
                    <div key={qIdx} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px]">
                      <div className="mb-2 font-semibold text-[#0F172A]">Câu {qIdx + 1}</div>
                      <div className="space-y-1.5">
                        {(['a', 'b', 'c', 'd'] as const).map((subKey) => (
                          <div key={subKey} className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-[#334155]">Ý {subKey})</span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = [...studentP2];
                                  copy[qIdx] = { ...copy[qIdx], [subKey]: true };
                                  setStudentP2(copy);
                                }}
                                className={`min-h-[48px] min-w-[54px] rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                                  stItem[subKey] ? 'bg-[#136F63] text-white' : 'border border-[#CBD5E1] bg-white text-[#334155]'
                                }`}
                              >
                                Đúng
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = [...studentP2];
                                  copy[qIdx] = { ...copy[qIdx], [subKey]: false };
                                  setStudentP2(copy);
                                }}
                                className={`min-h-[48px] min-w-[54px] rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                                  !stItem[subKey] ? 'bg-[#B91C1C] text-white' : 'border border-[#CBD5E1] bg-white text-[#334155]'
                                }`}
                              >
                                Sai
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulator Part III */}
              <div>
                <div className="mb-2 text-[13px] font-semibold uppercase text-[#136F63]">
                  Phần III. Trả lời ngắn (6 câu)
                </div>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                  {studentP3.map((val, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSimFocusIdx(16 + idx)}
                      className={`rounded-[8px] border p-2.5 text-center transition ${
                        simFocusIdx === 16 + idx ||
                        (onlineKeypad?.mode === 'sim' && onlineKeypad.index === idx)
                          ? 'border-[#136F63] bg-[#F0FDFA] ring-1 ring-[#136F63]/30'
                          : 'border-[#E2E8F0] bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="mb-1 text-[12px] font-semibold text-[#334155]">Câu {idx + 1}</div>
                      <input
                        ref={(el) => {
                          simP3Refs.current[idx] = el;
                        }}
                        maxLength={SHORT_ANSWER_MAX_LEN}
                        value={val}
                        onFocus={() => {
                          setSimFocusIdx(16 + idx);
                          setOnlineKeypad({ mode: 'sim', index: idx });
                        }}
                        onClick={() => {
                          setSimFocusIdx(16 + idx);
                          setOnlineKeypad({ mode: 'sim', index: idx });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            if (idx + 1 < studentP3.length) {
                              setSimFocusIdx(16 + idx + 1);
                              setOnlineKeypad({ mode: 'sim', index: idx + 1 });
                              simP3Refs.current[idx + 1]?.focus();
                            } else {
                              setOnlineKeypad(null);
                            }
                          }
                        }}
                        onChange={(e) => {
                          const copy = [...studentP3];
                          copy[idx] = sanitizeShortAnswerValue(e.target.value);
                          setStudentP3(copy);
                        }}
                        placeholder="0,0"
                        className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white py-1 text-center font-mono text-[14px] font-semibold text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {simRoom.antiCheat && (
                <div className="flex items-center gap-2 rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] p-3 text-[13px] font-semibold text-[#B45309]">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#B45309]" />
                  <span>
                    Hệ thống đang bật giám sát chống thoát Tab. Mọi thao tác rời cửa sổ thi đều được ghi nhận trực tiếp.
                  </span>
                </div>
              )}

              <button
                onClick={() => {
                  setOnlineKeypad(null);
                  handleSubmitSim();
                }}
                ref={() => {
                  simSubmitRef.current = handleSubmitSim;
                }}
                className="min-h-[48px] w-full rounded-[8px] bg-[#136F63] py-3 text-[14px] font-medium text-white transition hover:bg-[#0F594F]"
              >
                Nộp Bài &amp; Chấm Điểm Chuẩn 2025 Ngay
              </button>
            </div>
          )}
        </SmartboardViewport>
      )}

      {/* Auto-popping Floating Math Keypad for Part III Barem / Simulator Inputs */}
      {onlineKeypad && onlineKeypad.mode === 'barem' && (
        <FloatingMathKeypad
          open={true}
          label={`Đáp án Câu ${onlineKeypad.index + 1} (Phần III)`}
          value={part3Keys[onlineKeypad.index] || ''}
          hasNext={onlineKeypad.index + 1 < part3Keys.length}
          onChange={(nextVal) => {
            const copy = [...part3Keys];
            copy[onlineKeypad.index] = sanitizeShortAnswerValue(nextVal);
            setPart3Keys(copy);
          }}
          onNext={() => {
            if (onlineKeypad.index + 1 < part3Keys.length) {
              const nextIdx = onlineKeypad.index + 1;
              setOnlineKeypad({ mode: 'barem', index: nextIdx });
              baremP3Refs.current[nextIdx]?.focus();
            } else {
              setOnlineKeypad(null);
            }
          }}
          onClose={() => setOnlineKeypad(null)}
        />
      )}

      {onlineKeypad && onlineKeypad.mode === 'sim' && simRoom && simSubmitted === null && (
        <FloatingMathKeypad
          open={true}
          label={`Câu ${onlineKeypad.index + 1} · Phần III (Thi thử)`}
          value={studentP3[onlineKeypad.index] || ''}
          hasNext={onlineKeypad.index + 1 < studentP3.length}
          onChange={(nextVal) => {
            const copy = [...studentP3];
            copy[onlineKeypad.index] = sanitizeShortAnswerValue(nextVal);
            setStudentP3(copy);
          }}
          onNext={() => {
            if (onlineKeypad.index + 1 < studentP3.length) {
              const nextIdx = onlineKeypad.index + 1;
              setSimFocusIdx(16 + nextIdx);
              setOnlineKeypad({ mode: 'sim', index: nextIdx });
              simP3Refs.current[nextIdx]?.focus();
            } else {
              setOnlineKeypad(null);
            }
          }}
          onClose={() => setOnlineKeypad(null)}
        />
      )}
    </div>
  );
};
