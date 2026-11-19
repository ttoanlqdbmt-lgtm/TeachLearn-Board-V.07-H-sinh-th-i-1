import React, { useState } from 'react';
import {
  FileDown,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { MathText } from '../components/MathText';
import {
  KNTT_MATH_CURRICULUM,
  REVIEW_105_LESSONS_12,
  REVIEW_28_TOPICS,
  SAMPLE_CURRICULUM_ROWS,
} from '../data/curriculumKNTT';
import { CurriculumRow, LessonPlan5512 } from '../types/eduplan';
import { exportCurriculumToDocx, exportLessonPlanToDocx } from '../utils/docxExporter';

export const EduPlanModule: React.FC = () => {
  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [rows, setRows] = useState<CurriculumRow[]>(SAMPLE_CURRICULUM_ROWS);
  const [newLesson, setNewLesson] = useState('');

  const visibleRows = rows.filter((r) => (gradeFilter === 'all' ? true : r.grade === gradeFilter));

  const handleAddRow = () => {
    if (!newLesson.trim()) return;
    setRows((prev) => [
      ...prev,
      {
        stt: prev.length + 1,
        grade: gradeFilter === 'all' ? '12' : gradeFilter,
        chapter: 'Bổ sung',
        lesson: newLesson.trim(),
        periods: 2,
        objectives: 'Đạt chuẩn kiến thức, kỹ năng theo Chương trình GDPT 2018.',
        digitalCompetency: '1.1.NC1a: Khai thác học liệu số và công cụ vẽ hình tương tác.',
        aiCompetency: '10.AI.1: Kiểm tra và phản biện lời giải bằng trợ lý AI.',
        stemIntegration: 'Có',
      },
    ]);
    setNewLesson('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(['all', '10', '11', '12'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  gradeFilter === g
                    ? 'bg-[#136F63] text-white'
                    : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {g === 'all' ? 'Tất cả khối' : `Khối ${g}`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newLesson}
              onChange={(e) => setNewLesson(e.target.value)}
              placeholder="Thêm tên bài học mới..."
              className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              onClick={handleAddRow}
              className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="mr-1 inline h-3.5 w-3.5 text-[#136F63]" />
              Thêm dòng
            </button>
            <button
              onClick={() => exportCurriculumToDocx(visibleRows, 'KẾ HOẠCH GIÁO DỤC MÔN TOÁN (CV 5512 & QĐ 2422)')}
              className="rounded-[8px] bg-[#136F63] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0F594F]"
            >
              <FileDown className="mr-1 inline h-3.5 w-3.5" />
              Xuất Kế hoạch (.docx)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-700">
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="bg-[#136F63] text-white">
              <tr>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 font-semibold">STT</th>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left font-semibold">Bài học (KNTT)</th>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 font-semibold">Số tiết</th>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left font-semibold">Yêu cầu cần đạt</th>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left font-semibold">Năng lực số (TT 02/2025)</th>
                <th className="border-b border-r border-[#0F594F] px-2.5 py-2.5 text-left font-semibold">Năng lực AI</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5 font-semibold">STEM</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.stt} className="odd:bg-white even:bg-[#F8FAFC] hover:bg-[#F1F5F9] dark:odd:bg-slate-900 dark:even:bg-slate-800/40">
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-[#334155] tabular-nums dark:border-slate-700 dark:text-slate-200">{r.stt}</td>
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 font-semibold text-[#0F172A] dark:border-slate-700 dark:text-white">{r.lesson}</td>
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 text-center font-semibold text-[#334155] tabular-nums dark:border-slate-700 dark:text-slate-200">{r.periods}</td>
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 text-[#334155] dark:border-slate-700 dark:text-slate-200">
                    <MathText text={r.objectives} />
                  </td>
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 text-[#0369A1] dark:border-slate-700 dark:text-[#BAE6FD]">{r.digitalCompetency}</td>
                  <td className="border-b border-r border-[#E2E8F0] px-2.5 py-2 text-[#334155] dark:border-slate-700 dark:text-slate-200">{r.aiCompetency}</td>
                  <td className="border-b border-[#E2E8F0] px-2.5 py-2 text-center text-[#334155] dark:border-slate-700 dark:text-slate-200">{r.stemIntegration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const LessonPlanModule: React.FC = () => {
  const [grade, setGrade] = useState<'10' | '11' | '12'>('12');
  const [lessonTitle, setLessonTitle] = useState(
    KNTT_MATH_CURRICULUM.find((c) => c.grade === '12')?.lessons[0] || 'Bài 1: Tính đơn điệu và cực trị của hàm số'
  );
  const [periods, setPeriods] = useState(3);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<LessonPlan5512>({
    id: 'lp-5512-1',
    title: 'Bài 1: Tính đơn điệu và cực trị của hàm số',
    subject: 'Toán học',
    grade: '12',
    periods: 3,
    track: 'Lớp đại trà (Mục tiêu 6.5–8.0)',
    objectives: {
      knowledge: 'Nhận biết tính đơn điệu qua dấu đạo hàm $f\'(x)$ và lập bảng biến thiên.',
      competencies: 'Tư duy và lập luận toán học; Mô hình hóa bài toán tối ưu thực tế Đắk Lắk.',
      qualities: 'Chăm chỉ, trung thực, trách nhiệm trong thảo luận nhóm.',
      digitalAi: 'Sử dụng GeoGebra vẽ đồ thị hàm số và Casio fx-580VN X kiểm tra cực trị.',
    },
    activities: [
      {
        name: 'Hoạt động 1: Khởi động (Mở đầu)',
        duration: '10 phút',
        goal: 'Tạo tâm thế tiếp cận khái niệm đồng biến, nghịch biến từ biểu đồ lợi nhuận.',
        content: 'Quan sát đồ thị hàm số $P(x) = -x^3 + 12x^2 + 60x - 80$.',
        product: 'Câu trả lời xác định khoảng tăng/giảm của học sinh.',
        execution: 'GV chiếu hình, HS thảo luận cặp đôi trong 3 phút.',
      },
      {
        name: 'Hoạt động 2: Hình thành kiến thức mới',
        duration: '35 phút',
        goal: 'Phát biểu định lý dấu đạo hàm và quy trình tìm cực trị.',
        content: 'Xét dấu $f\'(x)$ và lập bảng biến thiên cho hàm bậc 3 và phân thức $2/1$.',
        product: 'Phiếu học tập số 1 hoàn thiện bảng biến thiên.',
        execution: 'GV hướng dẫn quy trình 4 bước, chuẩn hóa ký hiệu SGK KNTT.',
      },
      {
        name: 'Hoạt động 3: Luyện tập',
        duration: '30 phút',
        goal: 'Vận dụng tìm cực trị có chứa tham số $m$.',
        content: 'Giải bài tập trắc nghiệm 4 lựa chọn và Đúng/Sai.',
        product: 'Bài giải trình bày bảng nhóm.',
        execution: 'HS thực hiện cá nhân kết hợp chấm chéo.',
      },
      {
        name: 'Hoạt động 4: Vận dụng',
        duration: '15 phút',
        goal: 'Giải quyết bài toán thực tế tối ưu doanh thu/thể tích.',
        content: 'Cắt tấm nhôm hình vuông cạnh $18\\text{ cm}$ tạo hộp không nắp thể tích lớn nhất.',
        product: 'Báo cáo kết quả $V_{\\max} = 432\\text{ cm}^3$.',
        execution: 'Giao nhiệm vụ về nhà và kiểm tra qua EduPlan Online.',
      },
    ],
    createdAt: new Date().toISOString(),
  });

  const insertSnippet = (snippetType: 'bbt' | 'graph' | '3d' | 'stat') => {
    const snippets: Record<typeof snippetType, string> = {
      bbt: '\n[Chèn Bảng biến thiên SVG chuẩn SGK: $x \\in (-\\infty; +\\infty)$, dấu $f\'(x)$ đổi dấu tại $x_0$]',
      graph: '\n[Chèn Đồ thị hàm phân thức bậc 2/1 & đường tiệm cận xiên $y = ax + b$]',
      '3d': '\n[Chèn Mô hình Hình học Không gian 3D có đủ 3 trục $Ox, Oy, Oz$]',
      stat: '\n[Chèn Bảng số liệu thống kê ghép nhóm rộng 15,5 cm tính $Q_1, Q_3$]',
    };
    setPlan((prev) => ({
      ...prev,
      activities: prev.activities.map((a, idx) =>
        idx === 1 ? { ...a, content: a.content + snippets[snippetType] } : a
      ),
    }));
  };

  const generatePlanAI = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Toán',
          grade,
          lessonTitle,
          periods,
          track: plan.track,
        }),
      });
      const data = await res.json();
      if (res.ok && data.lessonPlan?.activities) {
        setPlan((prev) => ({
          ...prev,
          title: lessonTitle,
          grade,
          periods,
          objectives: data.lessonPlan.objectives || prev.objectives,
          activities: data.lessonPlan.activities,
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">Thông số Giáo án 5512</h3>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#334155] dark:text-slate-300">Khối lớp</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as '10' | '11' | '12')}
              className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#334155] dark:text-slate-300">Tên bài dạy</label>
            <input
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#334155] dark:text-slate-300">Số tiết thực hiện</label>
            <input
              type="number"
              min={1}
              max={8}
              value={periods}
              onChange={(e) => setPeriods(Number(e.target.value))}
              className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] tabular-nums focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            onClick={generatePlanAI}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Đang soạn giáo án AI...' : 'Soạn Giáo án Chuẩn CV 5512 (AI)'}
          </button>
          <button
            onClick={() => exportLessonPlanToDocx(plan)}
            className="w-full rounded-[8px] border border-[#CBD5E1] bg-white py-2.5 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <FileDown className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
            Xuất Word Giáo án (.docx)
          </button>
        </div>

        <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
            <span className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
              Thanh chèn nhanh học liệu Toán học:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => insertSnippet('bbt')} className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]">+ BBT SGK</button>
              <button onClick={() => insertSnippet('graph')} className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]">+ Đồ thị &amp; BPT</button>
              <button onClick={() => insertSnippet('3d')} className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]">+ Hình 3D</button>
              <button onClick={() => insertSnippet('stat')} className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD]">+ Thống kê</button>
            </div>
          </div>

          <div className="a4-paper space-y-3 rounded-[8px] border border-[#E2E8F0] p-5">
            <div className="text-center font-bold text-[#0070C0]">
              KẾ HOẠCH BÀI DẠY CHUẨN CÔNG VĂN 5512 — {plan.title.toUpperCase()}
            </div>
            <div className="text-center text-sm italic">
              Môn: {plan.subject} · Khối {plan.grade} · Thời lượng: {plan.periods} tiết
            </div>

            <div>
              <div className="font-bold text-[#0F4C81]">I. MỤC TIÊU DẠY HỌC</div>
              <p><strong>1. Kiến thức:</strong> <MathText text={plan.objectives.knowledge} /></p>
              <p><strong>2. Năng lực:</strong> <MathText text={plan.objectives.competencies} /></p>
              <p><strong>3. Phẩm chất:</strong> <MathText text={plan.objectives.qualities} /></p>
              <p><strong>4. Năng lực số &amp; AI:</strong> <MathText text={plan.objectives.digitalAi} /></p>
            </div>

            <div>
              <div className="font-bold text-[#0F4C81]">II. TIẾN TRÌNH DẠY HỌC (4 HOẠT ĐỘNG)</div>
              <div className="mt-2 space-y-3">
                {plan.activities.map((act, idx) => (
                  <div key={idx} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <div className="font-bold text-[#0070C0]">
                      {act.name} ({act.duration})
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-[12pt]">
                      <div><strong>a) Mục tiêu:</strong> <MathText text={act.goal} /></div>
                      <div><strong>b) Nội dung:</strong> <MathText text={act.content} /></div>
                      <div><strong>c) Sản phẩm:</strong> <MathText text={act.product} /></div>
                      <div><strong>d) Tổ chức thực hiện:</strong> <MathText text={act.execution} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Review5512Module: React.FC = () => {
  const [selectedLesson, setSelectedLesson] = useState(REVIEW_105_LESSONS_12[16]);
  const [duration, setDuration] = useState('3T');
  const [track, setTrack] = useState<'standard' | 'advanced' | 'basic'>('advanced');

  const trackLabel =
    track === 'standard'
      ? 'Lớp đại trà (Mục tiêu 6.5–8.0)'
      : track === 'advanced'
      ? 'Lớp mũi nhọn 12A1–12A3 (Mục tiêu 8.0+ · Chứa tham số m)'
      : 'Nhóm cơ bản (Mục tiêu 5.0–6.5)';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
            Khung PPCT 105 Tiết Toán 12 (35 Bài)
          </h3>
          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {REVIEW_105_LESSONS_12.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedLesson(item)}
                className={`flex w-full items-center justify-between rounded-[8px] border px-3 py-2 text-left text-[13.5px] transition-colors ${
                  selectedLesson.id === item.id
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <span className="truncate font-semibold">{item.title}</span>
                <span className="ml-2 shrink-0 text-[12px] tabular-nums opacity-85">{item.periodRange}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#334155] dark:text-slate-300">Thời lượng ôn tập (1T – 8T)</div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {['1T', '2T', '3T', '4T', '5T', '6T', '7T', '8T'].map((t) => (
                <button
                  key={t}
                  onClick={() => setDuration(t)}
                  className={`rounded-[8px] py-1.5 text-[12.5px] font-semibold transition-colors ${
                    duration === t
                      ? 'bg-[#136F63] text-white'
                      : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#334155] dark:text-slate-300">Phân hóa 3 Nhóm Đối Tượng</div>
            <div className="space-y-1.5">
              {[
                { id: 'standard', label: 'Lớp đại trà (Mục tiêu 6.5–8.0)' },
                { id: 'advanced', label: 'Lớp mũi nhọn 12A1–12A3 (8.0+ · Tham số m)' },
                { id: 'basic', label: 'Nhóm cơ bản (Mục tiêu 5.0–6.5)' },
              ].map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => setTrack(tr.id as 'standard' | 'advanced' | 'basic')}
                  className={`w-full rounded-[8px] border px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${
                    track === tr.id
                      ? 'border-[#136F63] bg-[#136F63]/10 font-semibold text-[#136F63] dark:bg-teal-950/50 dark:text-teal-300'
                      : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="a4-paper rounded-[8px] border border-[#E2E8F0] p-6 shadow-xs">
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="font-bold text-[#0070C0]">
                  KẾ HOẠCH BÀI DẠY ÔN THI TỐT NGHIỆP THPT MÔN TOÁN 12 (CV 5512)
                </div>
                <div className="text-[11.5pt] text-slate-700">
                  {selectedLesson.title} · Thời lượng: {duration} ({selectedLesson.periodRange})
                </div>
              </div>
              <button
                onClick={() =>
                  exportLessonPlanToDocx({
                    id: `rev-${selectedLesson.id}`,
                    title: selectedLesson.title,
                    subject: 'Toán 12',
                    grade: '12',
                    periods: Number(duration.replace('T', '')),
                    track: trackLabel,
                    objectives: {
                      knowledge: `Hệ thống hóa kiến thức ${selectedLesson.title}.`,
                      competencies: 'Vận dụng giải nhanh câu hỏi chuẩn BGD 2025–2027.',
                      qualities: 'Tự giác, kiên trì luyện tập.',
                      digitalAi: 'Bấm máy Casio fx-580VN X và đối chiếu mô hình đồ thị.',
                    },
                    activities: [
                      {
                        name: 'Hoạt động 1: Ôn tập lý thuyết trọng tâm',
                        duration: '20 phút',
                        goal: 'Nắm vững công thức lõi.',
                        content: selectedLesson.chapter,
                        product: 'Sơ đồ tư duy công thức.',
                        execution: 'GV hệ thống hóa.',
                      },
                    ],
                    createdAt: new Date().toISOString(),
                  })
                }
                className="no-print rounded-[8px] bg-[#136F63] px-3 py-1.5 font-sans text-[13px] font-medium text-white transition-colors hover:bg-[#0F594F]"
              >
                <FileDown className="mr-1 inline h-3.5 w-3.5" />
                Xuất Word (.docx)
              </button>
            </div>
            <p className="font-bold text-[#0F4C81]">Đối tượng áp dụng: {trackLabel}</p>
            <p className="mt-2">
              <strong>I. Mục tiêu:</strong> Củng cố vững chắc chuyên đề <em>{selectedLesson.title}</em>,
              {track === 'advanced'
                ? ' rèn luyện kỹ năng biện luận tham số $m$ và bài toán thực tế vận dụng cao (mức 8,0–9,5 điểm).'
                : track === 'standard'
                ? ' giải thành thạo các câu hỏi Nhận biết – Thông hiểu – Vận dụng mức 7,0–8,0 điểm.'
                : ' nắm chắc các công thức cơ bản và kỹ năng bấm máy Casio fx-580VN X đạt chắc chắn 5,5–6,5 điểm.'}
            </p>
            <p className="mt-2">
              <strong>II. Tiến trình 4 hoạt động chuẩn CV 5512:</strong> Chuyển giao nhiệm vụ → Thực hiện → Báo cáo thảo luận → Kết luận &amp; Đánh giá trên hệ thống Đề tương tự 22 câu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ReviewTnMathModule: React.FC = () => {
  const [selected, setSelected] = useState(REVIEW_28_TOPICS[5]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-2 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between text-[15px] font-semibold text-[#1E293B] dark:text-white">
            <span>Cây Chuyên Đề Trọng Tâm (28 Dạng bài)</span>
            <span className="rounded-[8px] bg-[#E0F2FE] px-2 py-0.5 text-[12px] font-semibold text-[#0369A1]">10% · 20% · 70%</span>
          </div>
          {REVIEW_28_TOPICS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full rounded-[8px] border p-3 text-left transition-colors ${
                selected.id === t.id
                  ? 'border-[#136F63] bg-[#136F63] text-white'
                  : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-[#F1F5F9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <div className="text-[12px] font-medium opacity-80">{t.weight}</div>
              <div className="text-[13.5px] font-semibold">{t.title}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7">
          <div className="a4-paper space-y-4 rounded-[8px] border border-[#E2E8F0] p-6 shadow-xs">
            <div className="border-b border-slate-300 pb-2 text-center">
              <div className="font-bold text-[#0070C0]">TÀI LIỆU CHUYÊN ĐỀ ÔN THI TỐT NGHIỆP THPT</div>
              <div className="font-bold">{selected.title}</div>
            </div>
            <div>
              <div className="font-bold text-[#0F4C81]">I. LÝ THUYẾT &amp; CÔNG THỨC TRỌNG TÂM</div>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                {selected.keyFormulas.map((f, idx) => (
                  <li key={idx}>
                    <MathText text={f} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE]/50 p-4">
              <div className="font-bold text-[#C00000]">II. MẸO BẤM MÁY CASIO fx-580VN X / fx-880BTG</div>
              <p className="mt-1">
                <MathText text={selected.casioTip} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
