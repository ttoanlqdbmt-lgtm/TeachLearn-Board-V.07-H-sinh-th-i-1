import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Activity,
  Award,
  BarChart3,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  Filter,
  History,
  Lock,
  Plus,
  Printer,
  RotateCw,
  Scale,
  Search,
  Shuffle,
  Unlock,
  Users,
} from 'lucide-react';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { LEGAL_DOCUMENTS } from '../data/curriculumKNTT';
import {
  ExamSubmission,
  HistoryRecord,
  OnlineExamRoom,
  StudentRecord,
} from '../types/eduplan';
import { loadFeatureUsageMetrics } from '../utils/cloudCacheAndCompression';

interface DashboardProps {
  submissions: ExamSubmission[];
  rooms: OnlineExamRoom[];
  mode: 'exam_stats' | 'overview';
  onToggleRoomSolutions?: (roomId: string) => void;
}

export const AnalyticsDashboardModule: React.FC<DashboardProps> = ({
  submissions,
  rooms,
  mode,
  onToggleRoomSolutions,
}) => {
  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [inspectingSub, setInspectingSub] = useState<ExamSubmission | null>(null);

  const featureMetrics = useMemo(() => loadFeatureUsageMetrics(), []);

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>(['12A1', '12A2', '11A1', '10A1']);
    submissions.forEach((s) => {
      if (s.studentClass) set.add(s.studentClass);
    });
    return Array.from(set).sort();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return submissions.filter((s) => {
      const detectedGrade = s.grade || (s.studentClass?.match(/^(10|11|12)/)?.[1] as '10' | '11' | '12' | undefined) || '12';
      if (gradeFilter !== 'all' && detectedGrade !== gradeFilter) return false;
      if (classFilter !== 'all' && s.studentClass !== classFilter) return false;
      if (roomFilter !== 'all' && s.roomId !== roomFilter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.studentClass.toLowerCase().includes(q) ||
        (s.studentCode || '').toLowerCase().includes(q) ||
        (s.examCode || '').toLowerCase().includes(q)
      );
    });
  }, [submissions, gradeFilter, classFilter, roomFilter, searchText]);

  const total = filteredSubmissions.length;
  const avg = total
    ? filteredSubmissions.reduce((acc, s) => acc + s.score, 0) / total
    : 0;
  const passCount = filteredSubmissions.filter((s) => s.score >= 5.0).length;
  const passRate = total ? Math.round((passCount / total) * 100) : 0;
  const cheatAlerts = filteredSubmissions.filter((s) => s.tabSwitches > 0).length;

  const bins = [
    { label: '0 – 4,9 (Chưa đạt)', count: filteredSubmissions.filter((s) => s.score < 5).length },
    { label: '5,0 – 6,4 (Đạt)', count: filteredSubmissions.filter((s) => s.score >= 5 && s.score < 6.5).length },
    { label: '6,5 – 7,9 (Khá)', count: filteredSubmissions.filter((s) => s.score >= 6.5 && s.score < 8).length },
    { label: '8,0 – 8,9 (Tốt)', count: filteredSubmissions.filter((s) => s.score >= 8 && s.score < 9).length },
    { label: '9,0 – 10 (Xuất sắc)', count: filteredSubmissions.filter((s) => s.score >= 9).length },
  ];
  const maxBin = Math.max(1, ...bins.map((b) => b.count));

  // Class Ranking Table
  const classRankings = useMemo(() => {
    const map = new Map<string, { className: string; count: number; sumScore: number; passCount: number }>();
    filteredSubmissions.forEach((s) => {
      const cls = s.studentClass || '12A1';
      const cur = map.get(cls) || { className: cls, count: 0, sumScore: 0, passCount: 0 };
      cur.count += 1;
      cur.sumScore += s.score;
      if (s.score >= 5) cur.passCount += 1;
      map.set(cls, cur);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgScore: item.count > 0 ? item.sumScore / item.count : 0,
        passPct: item.count > 0 ? Math.round((item.passCount / item.count) * 100) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [filteredSubmissions]);

  const handleExportSubmissionsExcel = () => {
    const rows = filteredSubmissions.map((s, idx) => {
      const roomObj = rooms.find((r) => r.id === s.roomId);
      const p1Summary = s.answersPayload?.part1
        ? Object.entries(s.answersPayload.part1)
            .map(([k, v]) => `${Number(k) + 1}:${v}`)
            .join(' ')
        : 'Đầy đủ';
      return {
        STT: idx + 1,
        'Họ và tên học sinh': s.studentName,
        'Mã HS / SBD': s.studentCode || `HS${s.studentClass}0${idx + 1}`,
        Lớp: s.studentClass,
        'Khối': s.grade || s.studentClass.slice(0, 2) || '12',
        'Kỳ thi / Phòng thi': s.roomTitle || roomObj?.title || 'Đề kiểm tra định kỳ',
        'Mã đề': s.examCode || '0107',
        'Điểm Phần I': s.part1Score ?? 3.0,
        'Điểm Phần II': s.part2Score ?? 3.5,
        'Điểm Phần III': s.part3Score ?? 2.0,
        'Tổng điểm (/10)': Number(s.score.toFixed(2)),
        'Số lần thoát Tab': s.tabSwitches,
        'Đáp án đã chọn (Phần I)': p1Summary,
        'Thời điểm nộp bài': new Date(s.submittedAt).toLocaleString('vi-VN'),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KetQuaThiToanTruong');
    XLSX.writeFile(
      wb,
      `TeachLearn_ThongKeKetQuaThi_${classFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Excel Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-[18px] font-semibold text-[#0F172A] dark:text-white">
            {mode === 'exam_stats'
              ? 'Bảng Điều Khiển Thống Kê Điểm Thi & Lịch Sử Làm Bài Toàn Trường'
              : 'Tổng Quan Tiến Độ, Xếp Hạng Khối/Lớp & Tần Suất Sử Dụng Hệ Thống'}
          </h2>
          <p className="text-[12px] text-[#64748B] dark:text-slate-400">
            Lưu trữ vĩnh viễn lịch sử từng câu trả lời trên Cloud Firestore — Hỗ trợ lọc theo Khối /
            Lớp / Kỳ thi và xuất báo cáo Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-800">
            <Filter className="h-3.5 w-3.5 text-[#136F63]" />
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as 'all' | '10' | '11' | '12')}
              className="bg-transparent font-medium text-[#334155] focus:outline-none dark:text-slate-200"
            >
              <option value="all">Tất cả Khối</option>
              <option value="12">Khối 12</option>
              <option value="11">Khối 11</option>
              <option value="10">Khối 10</option>
            </select>
          </div>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-9 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">Tất cả Lớp</option>
            {uniqueClasses.map((c) => (
              <option key={c} value={c}>
                Lớp {c}
              </option>
            ))}
          </select>

          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="h-9 max-w-[200px] truncate rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">Tất cả Kỳ thi</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm tên HS, mã đề..."
              className="h-9 w-44 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-2.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={handleExportSubmissionsExcel}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-[#0F594F]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
            Tổng bài thi đã nộp
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#136F63] tabular-nums dark:text-[#BAE6FD]">
            {total} <span className="text-[12px] font-normal text-[#64748B]">bài làm</span>
          </div>
        </div>
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
            Điểm trung bình toàn diện
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#0F172A] tabular-nums dark:text-white">
            {avg.toFixed(2).replace('.', ',')} <span className="text-[12px] font-normal text-[#64748B]">/ 10</span>
          </div>
        </div>
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
            Tỷ lệ Hoàn thành Đạt chuẩn (≥ 5,0)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#15803D] tabular-nums">
            {passRate}%
          </div>
        </div>
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
            Cảnh báo Vi phạm Thoát Tab
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#B91C1C] tabular-nums">
            {cheatAlerts} <span className="text-[12px] font-normal text-[#64748B]">trường hợp</span>
          </div>
        </div>
      </div>

      {/* Histogram + Class Ranking */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
              <BarChart3 className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
              Biểu đồ Cột Phổ Điểm (Thang 0 – 10)
            </h3>
            <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
              Mẫu khảo sát: n = {total}
            </span>
          </div>
          <div className="flex h-48 items-end gap-4 border-b border-[#E2E8F0] pb-2 dark:border-slate-800">
            {bins.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="font-mono text-[12px] font-semibold text-[#136F63] tabular-nums dark:text-[#BAE6FD]">
                  {b.count}
                </span>
                <div
                  style={{ height: `${Math.max(10, (b.count / maxBin) * 136)}px` }}
                  className="w-full max-w-[56px] rounded-t-[6px] bg-[#136F63] transition-all"
                />
                <span className="text-center text-[12px] font-medium text-[#334155] dark:text-slate-300">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1E293B] dark:text-white">
            <Award className="mr-1.5 inline h-4 w-4 text-[#B45309]" />
            Bảng Xếp Hạng Điểm Trung Bình Theo Lớp
          </h3>
          <div className="space-y-2.5">
            {classRankings.map((rk, idx) => (
              <div
                key={rk.className}
                className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[13px] dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                      idx === 0
                        ? 'bg-[#B45309] text-white'
                        : idx === 1
                        ? 'bg-[#136F63] text-white'
                        : 'bg-[#E2E8F0] text-[#334155] dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-white">
                      Lớp {rk.className}
                    </div>
                    <div className="font-mono text-[11px] text-[#64748B]">
                      {rk.count} bài nộp · Đạt chuẩn {rk.passPct}%
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[14px] font-bold text-[#136F63] tabular-nums dark:text-[#BAE6FD]">
                    {rk.avgScore.toFixed(2)} đ
                  </div>
                  <div className="text-[11px] text-[#64748B]">Điểm TB</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Usage Frequency Telemetry + Solution Unlock Control */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1E293B] dark:text-white">
            <Activity className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
            Thống Kê Tần Suất Sử Dụng Tính Năng (Giáo Viên &amp; Học Sinh)
          </h3>
          <div className="space-y-2.5">
            {featureMetrics.map((m) => {
              const maxUsage = Math.max(100, ...featureMetrics.map((x) => x.count));
              const pct = Math.min(100, Math.round((m.count / maxUsage) * 100));
              return (
                <div key={m.featureId} className="text-[13px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-[#334155] dark:text-slate-200">
                      <span
                        className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          m.role === 'teacher'
                            ? 'bg-[#E0F2FE] text-[#0369A1] dark:bg-slate-800 dark:text-[#BAE6FD]'
                            : 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {m.role === 'teacher' ? 'GV' : 'HS'}
                      </span>
                      {m.featureName}
                    </span>
                    <span className="font-mono font-semibold text-[#334155] tabular-nums dark:text-slate-300">
                      {m.count} lượt
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9] dark:bg-slate-800">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full ${
                        m.role === 'teacher' ? 'bg-[#136F63]' : 'bg-[#15803D]'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1E293B] dark:text-white">
            Mở Khóa Đáp Án &amp; Lời Giải Cho Học Sinh
          </h3>
          <p className="mb-3 text-[12px] text-[#64748B]">
            Khi mở khóa, học sinh có thể xem lại đáp án đúng và lời giải từng bước trong mục{' '}
            <em>Lịch sử &amp; Kết quả Học tập</em>.
          </p>
          <div className="space-y-2.5">
            {rooms.map((r) => {
              const unlocked = r.allowReviewSolutions !== false;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] p-3 text-[13px] dark:border-slate-800"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate font-semibold text-[#0F172A] dark:text-white">
                      {r.title}
                    </div>
                    <div className="font-mono text-[11px] text-[#64748B]">
                      PIN: {r.pinCode} · {r.durationMinutes} phút
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRoomSolutions && onToggleRoomSolutions(r.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-medium transition ${
                      unlocked
                        ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {unlocked ? (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Đã mở lời giải</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        <span>Đang khóa lời giải</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Permanent Student Submissions History Table */}
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
            Lịch Sử Kết Quả Thực Hiện Của Học Sinh ({filteredSubmissions.length} bản ghi Cloud)
          </h3>
          <span className="font-mono text-[12px] text-[#64748B]">
            Bấm &quot;Chi tiết câu chọn&quot; để xem đáp án từng câu của học sinh
          </span>
        </div>
        <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
          <table className="w-full border-collapse text-left text-[13.5px] tabular-nums">
            <thead>
              <tr className="bg-[#136F63] text-[12px] font-semibold text-white uppercase">
                <th className="px-3 py-2.5">Họ và tên HS</th>
                <th className="px-3 py-2.5">Lớp · SBD</th>
                <th className="px-3 py-2.5">Mã đề</th>
                <th className="px-3 py-2.5 text-right">Điểm P.I / P.II / P.III</th>
                <th className="px-3 py-2.5 text-right">Tổng điểm</th>
                <th className="px-3 py-2.5 text-center">Thoát Tab</th>
                <th className="px-3 py-2.5">Thời điểm nộp bài</th>
                <th className="px-3 py-2.5 text-right">Bài làm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
              {filteredSubmissions.map((s) => (
                <tr
                  key={s.id}
                  className="transition hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2.5 font-semibold text-[#0F172A] dark:text-white">
                    {s.studentName}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    <span className="font-medium text-[#334155] dark:text-slate-200">
                      {s.studentClass}
                    </span>
                    {s.studentCode && (
                      <span className="ml-1.5 text-[11px] text-[#64748B]">({s.studentCode})</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#0369A1] dark:text-[#BAE6FD]">
                    {s.examCode || '0107'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#64748B] dark:text-slate-400">
                    {s.part1Score ?? 3.0} · {s.part2Score ?? 3.5} · {s.part3Score ?? 2.0}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[14px] font-bold text-[#136F63] dark:text-[#BAE6FD]">
                    {s.score.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono">
                    <span
                      className={`inline-flex rounded-[6px] px-2 py-0.5 text-[11px] font-semibold ${
                        s.tabSwitches > 0
                          ? 'bg-[#FEE2E2] text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {s.tabSwitches} lần
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[#64748B]">
                    {new Date(s.submittedAt).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setInspectingSub(s)}
                      className="inline-flex items-center gap-1 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-medium text-[#0369A1] hover:bg-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-[#BAE6FD]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Chi tiết câu chọn</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Student Answer Inspection Modal */}
      {inspectingSub && (
        <SmartboardViewport
          isModal
          onCloseModal={() => setInspectingSub(null)}
          maxWidthClass="max-w-2xl"
          title={`Phiếu Trả Lời Chi Tiết · ${inspectingSub.studentName} (Lớp ${inspectingSub.studentClass})`}
          subtitle={`Mã đề: ${inspectingSub.examCode || '0107'} · Tổng điểm: ${inspectingSub.score} / 10 · Nộp lúc ${new Date(inspectingSub.submittedAt).toLocaleString('vi-VN')}`}
          bodyClassName="p-5"
        >
          <div className="space-y-4 text-[13px]">
            <div>
              <div className="font-semibold text-[#1E293B] uppercase dark:text-slate-300">
                Phần I. Đáp án trắc nghiệm 4 lựa chọn đã chọn
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {Array.from({ length: 12 }).map((_, idx) => {
                  const ans =
                    inspectingSub.answersPayload?.part1?.[idx] ||
                    ['B', 'C', 'D', 'B', 'A', 'C', 'C', 'D', 'C', 'C', 'D', 'B'][idx];
                  return (
                    <div
                      key={idx}
                      className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-center font-mono dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <span className="text-[#64748B]">Câu {idx + 1}:</span>{' '}
                      <strong className="text-[#136F63] dark:text-[#BAE6FD]">{ans}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold text-[#1E293B] uppercase dark:text-slate-300">
                Phần III. Đáp án trả lời ngắn đã điền
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {Array.from({ length: 6 }).map((_, idx) => {
                  const ans =
                    inspectingSub.answersPayload?.part3?.[idx] ||
                    ['2,4', '218', '10', '160', '46,8', '324'][idx];
                  return (
                    <div
                      key={idx}
                      className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-center font-mono dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <span className="text-[#64748B]">C.{idx + 1}:</span>{' '}
                      <strong className="text-[#15803D] dark:text-emerald-400">{ans}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </SmartboardViewport>
      )}
    </div>
  );
};

interface HomeroomProps {
  students: StudentRecord[];
  onUpdateStudents: (list: StudentRecord[]) => void;
}

export const HomeroomBookModule: React.FC<HomeroomProps> = ({
  students,
  onUpdateStudents,
}) => {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.parentPhone.includes(search) ||
      s.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddStudent = () => {
    if (!newName.trim()) return;
    const idx = students.length;
    onUpdateStudents([
      ...students,
      {
        id: `hs-${Date.now()}`,
        fullName: newName.trim(),
        dob: '01/01/2009',
        studentPhone: '0912000000',
        parentName: 'Phụ huynh',
        parentPhone: newParentPhone || '0987000000',
        role: 'Thành viên',
        seatRow: Math.floor(idx / 4),
        seatCol: idx % 4,
        pinned: false,
        conductScore: 90,
      },
    ]);
    setNewName('');
    setNewParentPhone('');
  };

  const exportCsv = () => {
    const header = 'STT,HoTen,NgaySinh,SDT_HS,PhuHuynh,SDT_PH,ChucVu,DiemThiDua\n';
    const body = students
      .map(
        (s, idx) =>
          `${idx + 1},"${s.fullName}",${s.dob},${s.studentPhone},"${s.parentName}",${s.parentPhone},"${s.role}",${s.conductScore}`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SoChuNhiem_12A1.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Họ tên học sinh mới..."
              className="rounded-[8px] border border-[#E2E8F0] px-3 py-1.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              value={newParentPhone}
              onChange={(e) => setNewParentPhone(e.target.value)}
              placeholder="SĐT phụ huynh..."
              className="w-40 rounded-[8px] border border-[#E2E8F0] px-3 py-1.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              onClick={handleAddStudent}
              className="rounded-[8px] bg-[#136F63] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0F594F]"
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              Thêm HS
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, SĐT, chức vụ..."
              className="rounded-[8px] border border-[#E2E8F0] px-3 py-1.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              onClick={exportCsv}
              className="rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Download className="mr-1 inline h-3.5 w-3.5 text-[#136F63]" />
              Xuất CSV/Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[8px] border border-[#E2E8F0] dark:border-slate-800">
          <table className="w-full border-collapse text-[13.5px] tabular-nums">
            <thead className="bg-[#136F63] text-[12.5px] font-semibold text-white">
              <tr>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5">STT</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5 text-left">Họ và tên</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5">Ngày sinh</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5">Chức vụ</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5 text-left">Phụ huynh</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5">SĐT Phụ huynh</th>
                <th className="border-b border-[#0F594F] px-2.5 py-2.5">Điểm thi đua</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
              {filtered.map((s, idx) => (
                <tr key={s.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40">
                  <td className="px-2.5 py-2 text-center text-[#64748B]">{idx + 1}</td>
                  <td className="px-2.5 py-2 font-semibold text-[#0F172A] dark:text-white">{s.fullName}</td>
                  <td className="px-2.5 py-2 text-center text-[#334155] dark:text-slate-300">{s.dob}</td>
                  <td className="px-2.5 py-2 text-center font-medium text-[#0369A1] dark:text-[#BAE6FD]">{s.role}</td>
                  <td className="px-2.5 py-2 text-[#334155] dark:text-slate-300">{s.parentName}</td>
                  <td className="px-2.5 py-2 text-center text-[#334155] tabular-nums dark:text-slate-300">{s.parentPhone}</td>
                  <td className="px-2.5 py-2 text-center font-bold text-[#15803D]">{s.conductScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const SeatingChartModule: React.FC<HomeroomProps> = ({
  students,
  onUpdateStudents,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = 4;
  const cols = 4;

  const swapOrSelect = (studentId: string) => {
    if (!selectedId) {
      setSelectedId(studentId);
      return;
    }
    if (selectedId === studentId) {
      setSelectedId(null);
      return;
    }
    const a = students.find((s) => s.id === selectedId);
    const b = students.find((s) => s.id === studentId);
    if (!a || !b) return;
    onUpdateStudents(
      students.map((s) => {
        if (s.id === a.id) return { ...s, seatRow: b.seatRow, seatCol: b.seatCol };
        if (s.id === b.id) return { ...s, seatRow: a.seatRow, seatCol: a.seatCol };
        return s;
      })
    );
    setSelectedId(null);
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateStudents(students.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  };

  const shuffleUnpinned = () => {
    const unpinned = students.filter((s) => !s.pinned);
    const coords = unpinned.map((s) => ({ r: s.seatRow, c: s.seatCol }));
    for (let i = coords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coords[i], coords[j]] = [coords[j], coords[i]];
    }
    let idx = 0;
    onUpdateStudents(
      students.map((s) => {
        if (s.pinned) return s;
        const pos = coords[idx++];
        return { ...s, seatRow: pos.r, seatCol: pos.c };
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-medium text-[#334155] dark:text-slate-300">
            {selectedId ? 'Đang chọn 1 học sinh — Hãy chạm vào học sinh thứ 2 để hoán đổi.' : 'Chạm vào ô học sinh để đổi chỗ hoặc bấm Ghim cố định.'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={shuffleUnpinned}
              className="rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#0F594F]"
            >
              <Shuffle className="mr-1.5 inline h-3.5 w-3.5" />
              Trộn chỗ (1-click)
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Printer className="mr-1.5 inline h-3.5 w-3.5 text-[#136F63]" />
              In sơ đồ
            </button>
          </div>
        </div>

        <div className="mx-auto mb-5 max-w-md rounded-[8px] border-2 border-[#136F63] bg-[#F8FAFC] py-2.5 text-center text-[14px] font-semibold tracking-wide text-[#136F63] dark:bg-slate-800 dark:text-[#BAE6FD]">
          BẢNG TỪ / BỤC GIẢNG
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: rows * cols }, (_, index) => {
            const r = Math.floor(index / cols);
            const c = index % cols;
            const stu = students.find((s) => s.seatRow === r && s.seatCol === c);
            if (!stu) {
              return (
                <div
                  key={index}
                  className="flex h-20 items-center justify-center rounded-[8px] border border-dashed border-[#CBD5E1] text-[12px] text-[#64748B]"
                >
                  Trống
                </div>
              );
            }
            const isSel = selectedId === stu.id;
            return (
              <div
                key={stu.id}
                onClick={() => swapOrSelect(stu.id)}
                className={`relative cursor-pointer rounded-[8px] border p-3 transition-all ${
                  isSel
                    ? 'border-[#136F63] bg-[#136F63] text-white shadow-md'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#136F63] dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                <button
                  onClick={(e) => togglePin(stu.id, e)}
                  title={stu.pinned ? 'Bỏ ghim' : 'Ghim cố định'}
                  className="absolute top-2 right-2 rounded p-1 hover:bg-black/10"
                >
                  {stu.pinned ? <Lock className="h-3.5 w-3.5 text-[#B45309]" /> : <Unlock className="h-3.5 w-3.5 opacity-50" />}
                </button>
                <div className="pr-5 text-[14px] font-semibold">{stu.fullName}</div>
                <div className={`mt-1 text-[12px] ${isSel ? 'text-white/90' : 'text-[#64748B] dark:text-slate-300'}`}>
                  {stu.role} · Điểm: {stu.conductScore}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const LuckyWheelModule: React.FC<HomeroomProps> = ({
  students,
  onUpdateStudents,
}) => {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<StudentRecord | null>(null);

  const sliceAngle = 360 / Math.max(1, students.length);
  const colors = ['#136F63', '#0F594F', '#1E7E72', '#0369A1', '#2B8A7E', '#0B3B35'];

  const spinWheel = () => {
    if (spinning || students.length === 0) return;
    setSpinning(true);
    const chosenIdx = Math.floor(Math.random() * students.length);
    const extraSpins = 360 * 5;
    const targetAngle = extraSpins + (360 - chosenIdx * sliceAngle - sliceAngle / 2);
    setRotation((prev) => prev + targetAngle);
    setTimeout(() => {
      setSpinning(false);
      setWinner(students[chosenIdx]);
    }, 3200);
  };

  const addBonus = (pts: number) => {
    if (!winner) return;
    onUpdateStudents(
      students.map((s) =>
        s.id === winner.id ? { ...s, conductScore: Math.max(0, s.conductScore + pts) } : s
      )
    );
    setWinner((w) => (w ? { ...w, conductScore: Math.max(0, w.conductScore + pts) } : null));
  };

  const topStudents = [...students].sort((a, b) => b.conductScore - a.conductScore).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col items-center justify-center rounded-[8px] border border-[#0F594F] bg-gradient-to-br from-[#0B3B35] to-[#136F63] p-6 text-white shadow-sm lg:col-span-7">
          <div className="text-[20px] font-semibold tracking-wide text-white">
            ĐI TÌM NGƯỜI MAY MẮN
          </div>
          <div className="mt-1 text-[12px] text-white/80">Hôm nay ai sẽ là người tỏa sáng?</div>

          <div className="relative my-5 flex items-center justify-center">
            {/* Pointer */}
            <div className="absolute -top-3 z-10 h-0 w-0 border-x-8 border-t-[16px] border-x-transparent border-t-[#FEF3C7]" />
            <svg
              viewBox="-110 -110 220 220"
              className="h-64 w-64 drop-shadow-xl"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? 'transform 3.1s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
              }}
            >
              {students.map((s, idx) => {
                const startRad = ((idx * sliceAngle - 90) * Math.PI) / 180;
                const endRad = (((idx + 1) * sliceAngle - 90) * Math.PI) / 180;
                const x1 = 100 * Math.cos(startRad);
                const y1 = 100 * Math.sin(startRad);
                const x2 = 100 * Math.cos(endRad);
                const y2 = 100 * Math.sin(endRad);
                const largeArc = sliceAngle > 180 ? 1 : 0;
                const midAngle = idx * sliceAngle + sliceAngle / 2 - 90;
                return (
                  <g key={s.id}>
                    <path
                      d={`M 0 0 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[idx % colors.length]}
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                    <text
                      x="58"
                      y="3"
                      fill="#ffffff"
                      fontSize="6.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      transform={`rotate(${midAngle}, 0, 0)`}
                    >
                      {s.fullName.split(' ').slice(-2).join(' ')}
                    </text>
                  </g>
                );
              })}
              <circle cx="0" cy="0" r="14" fill="#ffffff" />
            </svg>
          </div>

          <button
            onClick={spinWheel}
            disabled={spinning}
            className="rounded-[8px] bg-white px-6 py-2.5 text-[14px] font-semibold text-[#136F63] shadow-lg transition-transform hover:scale-105 hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            <RotateCw className={`mr-1.5 inline h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
            {spinning ? 'ĐANG QUAY...' : 'BẮT ĐẦU QUAY'}
          </button>

          {winner && (
            <div className="mt-4 w-full max-w-md rounded-[8px] border border-white/25 bg-white/15 p-3 text-center">
              <div className="text-[14px] font-semibold text-[#FEF3C7]">
                Chúc mừng: {winner.fullName} ({winner.conductScore}đ)
              </div>
              <div className="mt-2 flex justify-center gap-2">
                <button onClick={() => addBonus(2)} className="rounded-[6px] bg-[#DCFCE7] px-3 py-1 text-[12px] font-semibold text-[#15803D]">+2 điểm</button>
                <button onClick={() => addBonus(5)} className="rounded-[6px] bg-[#E0F2FE] px-3 py-1 text-[12px] font-semibold text-[#0369A1]">+5 điểm</button>
                <button onClick={() => addBonus(-1)} className="rounded-[6px] bg-[#FEE2E2] px-3 py-1 text-[12px] font-semibold text-[#B91C1C]">-1 điểm</button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-sm lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
            <Award className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
            Bảng Xếp Hạng Thi Đua Top 6
          </h3>
          <div className="space-y-2">
            {topStudents.map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13.5px] dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#136F63] text-xs font-semibold text-white">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-[#0F172A] dark:text-white">{s.fullName}</span>
                </div>
                <span className="text-[14px] font-bold text-[#136F63] tabular-nums dark:text-[#BAE6FD]">
                  {s.conductScore} đ
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const LegalDocsModule: React.FC = () => {
  const [query, setQuery] = useState('');
  const filtered = LEGAL_DOCUMENTS.filter(
    (d) =>
      d.code.toLowerCase().includes(query.toLowerCase()) ||
      d.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
            <Scale className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
            Bộ Luật, Thông Tư &amp; Công Văn Hiện Hành ({filtered.length})
          </h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm số hiệu (15/2026, 22/2021, 5512, 3456)..."
            className="w-64 rounded-[8px] border border-[#E2E8F0] px-3 py-1.5 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="space-y-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[14px] font-semibold text-[#136F63] dark:text-[#BAE6FD]">{doc.code}</div>
                <span className="text-[12px] font-medium text-[#64748B]">
                  {doc.category} · Ban hành: {doc.issuedDate}
                </span>
              </div>
              <div className="mt-1 text-[14px] font-semibold text-[#0F172A] dark:text-slate-100">{doc.title}</div>
              <p className="mt-1 text-[13.5px] text-[#334155] dark:text-slate-300">{doc.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-[#334155] dark:text-slate-200">
                {doc.keyPoints.map((kp, idx) => (
                  <li key={idx}>{kp}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface HistoryArchiveProps {
  history: HistoryRecord[];
  onLoadExam: (rec: HistoryRecord) => void;
}

export const HistoryArchiveModule: React.FC<HistoryArchiveProps> = ({
  history,
  onLoadExam,
}) => {
  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all');
  const filtered = history.filter((h) => (gradeFilter === 'all' ? true : h.grade === gradeFilter));

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
            <History className="mr-1.5 inline h-4 w-4 text-[#136F63]" />
            Kho Lưu Trữ Học Liệu ({filtered.length})
          </h3>
          <div className="flex gap-1.5">
            {(['all', '10', '11', '12'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`rounded-[8px] border px-3 py-1.5 text-[12px] font-medium ${
                  gradeFilter === g
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {g === 'all' ? 'Tất cả' : `Khối ${g}`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div>
                <div className="text-[14px] font-semibold text-[#0F172A] dark:text-white">{item.title}</div>
                <div className="mt-0.5 text-[12px] text-[#64748B] dark:text-slate-300">
                  Lớp {item.grade} · {item.subject} {item.examCode ? `· Mã đề ${item.examCode}` : ''} ·{' '}
                  {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
              {item.examData && (
                <button
                  onClick={() => onLoadExam(item)}
                  className="rounded-[8px] bg-[#136F63] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0F594F]"
                >
                  <FileDown className="mr-1 inline h-3.5 w-3.5" />
                  Mở trên Khung A4
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
