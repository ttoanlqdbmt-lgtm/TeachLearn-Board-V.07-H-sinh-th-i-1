import React, { useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { BankQuestion, SubjectDirectoryItem } from '../types/eduplan';
import { SmartboardViewport } from './SmartboardViewport';
import { useOnlineStatus } from '../hooks/usePWAInstall';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const GUIDE_SECTIONS = [
  {
    id: 1,
    cat: 'Bảng tương tác 65–86"',
    title: 'Mục 1: Bảng trắng Tương tác Thông minh (Smartboard Canvas)',
    desc: 'Không gian viết vẽ chiếm 95% màn hình với bộ bút nét mượt, tự động bắt dính đầu mút/trung điểm và 16 mẫu Hình phẳng 2D, 3D & 3 Đường Conic.',
    steps: [
      'Bước 1: Dùng nút gạt nhanh Liền / Đứt (— / - -) để vẽ cạnh nhìn thấy hoặc cạnh khuất hình không gian.',
      'Bước 2: Bấm "+ Câu hỏi Ngân hàng đề" để chèn trực tiếp câu hỏi từ kho 11.554 câu hỏi trên Cloud Firestore hoặc file .json.',
      'Bước 3: Bấm "Đăng lên Sổ Ghi Chép Cổng Học sinh" để lưu bài giảng trực tiếp về lớp học trên hệ thống mẹ TeachLearn Edu.',
    ],
  },
  {
    id: 2,
    cat: 'Đồ thị & Bảng biến thiên',
    title: 'Mục 2: Khảo sát & Vẽ Đồ thị Hàm số Chuẩn SGK',
    desc: 'Tự động khảo sát tập xác định, đạo hàm, cực trị, tiệm cận và dựng Bảng biến thiên kèm đồ thị hàm bậc 3, bậc 4, phân thức 2/1.',
    steps: [
      'Bước 1: Chọn dạng hàm số hoặc nhập hệ số a, b, c, d trực tiếp trên thanh công cụ.',
      'Bước 2: Bấm Phóng to toàn màn hình hoặc chạm 2 ngón tay (Pinch-to-Zoom) để giảng chi tiết.',
    ],
  },
  {
    id: 3,
    cat: 'Hình học 3D WebGL',
    title: 'Mục 3: Không gian Hình học 3D Động & Đưa sang Bảng trắng',
    desc: 'Xoay 360 độ các khối chóp, lăng trụ, khối tròn xoay và hệ tọa độ Oxyz, tách khối (Explode) và chụp đưa trực tiếp sang Bảng trắng.',
    steps: [
      'Bước 1: Chọn mô hình 3D (Chóp S.ABCD, Lăng trụ, Khối tròn xoay, Mặt phẳng & Mặt cầu Oxyz).',
      'Bước 2: Bấm nút "Đưa sang Bảng trắng Giảng dạy" để chèn thẳng hình ảnh/mô hình sang trang bảng đang viết.',
    ],
  },
  {
    id: 4,
    cat: 'Gọi trả bài & SMAS',
    title: 'Mục 4: Lớp học & Gọi trả bài theo Ma trận (Đồng bộ SMAS)',
    desc: 'Đọc danh sách lớp và kho câu hỏi từ chung Cloud Firestore, gọi ngẫu nhiên học sinh lên bảng làm bài và đẩy điểm về Sổ điểm SMAS.',
    steps: [
      'Bước 1: Chọn lớp học đang giảng dạy và thiết lập Ma trận Yêu cầu Kiểm tra.',
      'Bước 2: Quay gọi ngẫu nhiên học sinh lên bảng cảm ứng chọn gói câu hỏi và chấm điểm tự động đẩy về Sổ điểm SMAS.',
    ],
  },
  {
    id: 5,
    cat: 'Slide & Toán thực tế',
    title: 'Mục 5: Trình chiếu Slide Tóm tắt & Mô hình hóa Toán thực tế',
    desc: 'Trình chiếu 4 Slide cốt lõi theo từng bài học SGK Kết nối tri thức và kho bài toán thực tế 4 bước.',
    steps: [
      'Bước 1: Chọn Khối 10/11/12, Chương và Bài học để mở ngay bộ Slide tóm tắt.',
      'Bước 2: Chuyển sang chế độ Trình chiếu lớp và dùng bút Smartboard viết trực tiếp lên Slide.',
    ],
  },
];

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState('');

  if (!open) return null;

  const filtered = GUIDE_SECTIONS.filter(
    (g) =>
      g.title.toLowerCase().includes(query.toLowerCase()) ||
      g.desc.toLowerCase().includes(query.toLowerCase())
  );
  const active = filtered.find((g) => g.id === selectedId) || filtered[0] || GUIDE_SECTIONS[0];

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-4xl"
      title={
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[#136F63]" />
          <span>Hướng Dẫn Sử Dụng TeachLearn Board (65–86 inch)</span>
        </div>
      }
      subtitle="5 Công cụ Giảng dạy & Trình chiếu Thông minh liên thông hệ sinh thái TeachLearn Edu"
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-1 md:grid-cols-12">
        <div className="border-r border-[#E2E8F0] bg-[#F1F5F9] p-3 md:col-span-4">
          <div className="relative mb-3">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[#64748B]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm công cụ..."
              className="w-full rounded-[8px] border border-[#CBD5E1] bg-white py-2 pr-3 pl-8 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
            />
          </div>
          <div className="space-y-1.5 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-[8px] border p-2.5 text-left transition-colors ${
                  active.id === item.id
                    ? 'border-[#136F63] bg-[#136F63] text-white'
                    : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <div
                  className={`text-[12px] ${
                    active.id === item.id ? 'text-white/85' : 'text-[#64748B]'
                  }`}
                >
                  {item.cat}
                </div>
                <div className="mt-0.5 text-[13.5px] font-semibold leading-snug">{item.title}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto bg-white p-5 md:col-span-8">
          <h3 className="text-[18px] font-semibold text-[#0F172A]">{active.title}</h3>
          <p className="mt-1 text-[14px] text-[#334155]">{active.desc}</p>

          <div className="mt-4 rounded-[8px] border border-[#E2E8F0] bg-[#136F63] p-5 text-center text-white">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
              <Play className="h-5 w-5 fill-white" />
            </div>
            <div className="mt-2.5 text-[15px] font-semibold">
              Tối ưu Cảm ứng Đa điểm 65–86 inch (95% Diện tích Bảng viết)
            </div>
            <p className="mt-1 text-[13px] text-white/90">
              Hỗ trợ cử chỉ chạm 2 ngón tay phóng to/thu nhỏ (Pinch-to-Zoom &amp; Pan), nút Đặt lại
              100% và Chế độ Toàn màn hình (F11).
            </p>
          </div>

          <div className="mt-5 space-y-2.5">
            <div className="text-[15px] font-semibold text-[#136F63]">
              Các bước thao tác nhanh tại lớp
            </div>
            {active.steps.map((st, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13.5px] text-[#334155]"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#136F63]" />
                <span>{st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SmartboardViewport>
  );
};

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  aiConfigured: boolean;
  subjects: SubjectDirectoryItem[];
  onToggleSubject: (id: string) => void;
  defaultSubject: string;
  onChangeDefaultSubject: (name: string) => void;
  userEmail: string | null;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  bankItemsCount?: number;
  cloudBankCount?: number;
  onImportJsonBankFile?: (file: File) => Promise<{ added: number; total: number }>;
  onExportJsonBankFile?: () => Promise<void>;
  onSyncCloudBankNow?: () => Promise<number>;
  mainAdminPortalUrl?: string;
  onChangeMainAdminPortalUrl?: (url: string) => void;
  isOfflineMode?: boolean;
}

export const SystemConfigModal: React.FC<ConfigModalProps> = ({
  open,
  onClose,
  aiConfigured,
  subjects,
  onToggleSubject,
  defaultSubject,
  onChangeDefaultSubject,
  userEmail,
  onGoogleLogin,
  onGoogleLogout,
  bankItemsCount = 0,
  cloudBankCount = 0,
  onImportJsonBankFile,
  onExportJsonBankFile,
  onSyncCloudBankNow,
  mainAdminPortalUrl = 'https://teachlearn-edu.web.app',
  onChangeMainAdminPortalUrl,
  isOfflineMode = false,
}) => {
  const isOnline = useOnlineStatus();
  const [tab, setTab] = useState<'backup_cloud' | 'system' | 'subjects'>('backup_cloud');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [importingJson, setImportingJson] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const [aiCacheEnabled, setAiCacheEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('teachlearn_ai_prompt_cache_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  if (!open) return null;

  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const toggleAiCache = () => {
    const next = !aiCacheEnabled;
    setAiCacheEnabled(next);
    try {
      localStorage.setItem('teachlearn_ai_prompt_cache_enabled', String(next));
    } catch {
      // ignore
    }
  };

  const handleSelectJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportJsonBankFile) return;
    setImportingJson(true);
    setStatusMsg('Đang đọc và nạp tệp kho câu hỏi dự phòng (.json)...');
    try {
      const res = await onImportJsonBankFile(file);
      setStatusMsg(
        `Đã nạp thành công tệp "${file.name}" (+${res.added.toLocaleString('vi-VN')} câu mới · Tổng kho hiện tại: ${res.total.toLocaleString('vi-VN')} câu hỏi)!`
      );
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Không thể đọc tệp .json. Vui lòng kiểm tra định dạng.'
      );
    } finally {
      setImportingJson(false);
    }
  };

  const handleTriggerCloudSync = async () => {
    if (!onSyncCloudBankNow) return;
    setSyncingCloud(true);
    setStatusMsg('Đang tải đồng bộ kho câu hỏi từ Cloud Firestore của hệ thống mẹ...');
    try {
      const count = await onSyncCloudBankNow();
      setStatusMsg(
        `Đồng bộ Cloud Firestore hoàn tất! Đang kết nối ${count.toLocaleString('vi-VN')} câu hỏi trong kho.`
      );
    } catch {
      setStatusMsg('Mạng yếu hoặc ngoại tuyến — Đang sử dụng kho câu hỏi lưu cục bộ IndexedDB.');
    } finally {
      setSyncingCloud(false);
    }
  };

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-3xl"
      title={
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#136F63]" />
          <span>Cấu hình API Key · Nạp Kho Đề Dự Phòng (.json) &amp; Đồng Bộ Cloud</span>
        </div>
      }
      subtitle="Dùng khi mạng yếu ở trường hoặc đồng bộ trực tiếp với Hệ thống Quản trị Tổng (TeachLearn Edu)"
      bodyClassName="p-0"
    >
      <div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleSelectJsonFile}
          className="hidden"
        />

        <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] bg-[#F1F5F9] px-5 pt-2">
          <button
            type="button"
            onClick={() => setTab('backup_cloud')}
            className={`border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors ${
              tab === 'backup_cloud'
                ? 'border-[#136F63] font-semibold text-[#136F63]'
                : 'border-transparent text-[#64748B] hover:text-[#334155]'
            }`}
          >
            Nạp Kho Đề Dự Phòng (.json) &amp; Cloud Firestore
          </button>
          <button
            type="button"
            onClick={() => setTab('system')}
            className={`border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors ${
              tab === 'system'
                ? 'border-[#136F63] font-semibold text-[#136F63]'
                : 'border-transparent text-[#64748B] hover:text-[#334155]'
            }`}
          >
            Cấu hình API &amp; Liên kết Hệ thống Tổng
          </button>
          <button
            type="button"
            onClick={() => setTab('subjects')}
            className={`border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors ${
              tab === 'subjects'
                ? 'border-[#136F63] font-semibold text-[#136F63]'
                : 'border-transparent text-[#64748B] hover:text-[#334155]'
            }`}
          >
            Danh mục Môn học ({subjects.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {statusMsg && (
            <div className="mb-4 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] font-semibold text-[#15803D]">
              {statusMsg}
            </div>
          )}

          {tab === 'backup_cloud' ? (
            <div className="space-y-4">
              {/* Offline Backup JSON Loader Card */}
              <div className="rounded-[8px] border-2 border-[#136F63] bg-[#F8FAFC] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <FileJson className="mt-0.5 h-6 w-6 shrink-0 text-[#136F63]" />
                    <div>
                      <div className="text-[15px] font-bold text-[#0F172A]">
                        Nạp Kho Đề Dự Phòng (.json) — Dạy học mượt khi mạng yếu ở trường
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#334155]">
                        Nạp trực tiếp tệp sao lưu Ngân hàng câu hỏi (<strong>.json</strong>, hỗ trợ
                        kho 11.554+ câu hỏi có hình vẽ và bảng biến thiên) vào bộ nhớ IndexedDB của
                        bảng tương tác để chèn câu hỏi và gọi trả bài tức thì không cần chờ mạng.
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-[8px] bg-[#136F63] px-3 py-1 text-[12.5px] font-bold text-white tabular-nums">
                    Kho sẵn sàng: {bankItemsCount.toLocaleString('vi-VN')} câu
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={importingJson}
                    onClick={() => jsonInputRef.current?.click()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-semibold text-white shadow-xs hover:bg-[#0F594F] disabled:opacity-50"
                  >
                    {importingJson ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>
                      {importingJson
                        ? 'Đang nạp tệp .json...'
                        : 'Chọn tệp Kho đề dự phòng (.json) từ máy'}
                    </span>
                  </button>

                  {onExportJsonBankFile && (
                    <button
                      type="button"
                      onClick={() => onExportJsonBankFile()}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#334155] hover:border-[#136F63] hover:text-[#136F63]"
                    >
                      <Download className="h-4 w-4 text-[#136F63]" />
                      <span>Tải bản sao lưu kho hiện tại (.json)</span>
                    </button>
                  )}

                  {onSyncCloudBankNow && !isOfflineMode && (
                    <button
                      type="button"
                      disabled={syncingCloud || !isOnline}
                      onClick={handleTriggerCloudSync}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE]/70 px-3.5 py-2 text-[13px] font-semibold text-[#0369A1] hover:bg-[#E0F2FE] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingCloud ? 'animate-spin' : ''}`} />
                      <span>
                        {!isOnline
                          ? 'Đang ngoại tuyến (Tạm dừng đồng bộ Cloud)'
                          : syncingCloud
                            ? 'Đang đồng bộ Cloud...'
                            : `Đồng bộ từ Cloud Firestore (${cloudBankCount > 0 ? `${cloudBankCount} câu cloud` : 'Trực tiếp'})`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Shared Cloud Firestore Connection Card */}
              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Database className="h-5 w-5 text-[#136F63]" />
                    <div>
                      <div className="text-[15px] font-semibold text-[#1E293B]">
                        Liên thông Cơ sở dữ liệu Cloud Firestore với TeachLearn Edu Tổng
                      </div>
                      <div className="text-[12.5px] text-[#64748B]">
                        {userEmail
                          ? `Đang kết nối chung tài khoản: ${userEmail} · Tự động đồng bộ Danh sách lớp, Sổ điểm SMAS & Sổ Ghi Chép Học sinh.`
                          : 'Đăng nhập Google để đồng bộ trực tiếp kho 11.554 câu hỏi, danh sách lớp và điểm gọi trả bài với hệ thống mẹ.'}
                      </div>
                    </div>
                  </div>
                  {userEmail ? (
                    <button
                      type="button"
                      onClick={onGoogleLogout}
                      className="rounded-[8px] bg-[#FEE2E2] px-3 py-1.5 text-[13px] font-medium text-[#B91C1C] hover:opacity-90"
                    >
                      <LogOut className="mr-1 inline h-3.5 w-3.5" />
                      Đổi tài khoản / Đăng xuất
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onGoogleLogin}
                      className="rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13.5px] font-medium text-white hover:bg-[#0F594F]"
                    >
                      Đăng nhập Google Đồng bộ
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : tab === 'system' ? (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-[#136F63]" />
                    <div>
                      <div className="text-[15px] font-semibold text-[#1E293B]">
                        Trạng thái Kết nối Gemini AI Server-Side (Bút AI &amp; Math OCR)
                      </div>
                      <div className="text-[12px] text-[#64748B]">
                        Khóa <code className="rounded bg-[#F1F5F9] px-1 py-0.5">GEMINI_API_KEY</code>{' '}
                        được cấu hình an toàn phía máy chủ giúp nhận diện chữ viết tay trên bảng
                        trắng sang công thức KaTeX sắc nét.
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-[8px] px-2.5 py-1 text-[12px] font-medium ${
                      aiConfigured
                        ? 'bg-[#DCFCE7] text-[#15803D]'
                        : 'bg-[#FEF3C7] text-[#B45309]'
                    }`}
                  >
                    {aiConfigured ? 'AI Sẵn sàng' : 'Chưa cấu hình Secret'}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13.5px] text-[#334155]">
                  <span>
                    <strong className="text-[#1E293B]">Bộ nhớ đệm phản hồi AI (Local Cache):</strong>{' '}
                    Lưu sẵn kết quả OCR &amp; Slide AI đã gọi để phản hồi tức thì khi đứng lớp.
                  </span>
                  <button
                    type="button"
                    onClick={toggleAiCache}
                    className={`ml-3 shrink-0 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition ${
                      aiCacheEnabled
                        ? 'bg-[#DCFCE7] text-[#15803D]'
                        : 'border border-[#CBD5E1] bg-white text-[#334155]'
                    }`}
                  >
                    {aiCacheEnabled ? 'Đang BẬT' : 'Đang TẮT'}
                  </button>
                </div>
              </div>

              {/* Main TeachLearn Edu Admin Portal URL Configuration */}
              <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#136F63]">
                  <Cloud className="h-5 w-5" />
                  <span>Đường dẫn Hệ thống Quản trị Tổng (TeachLearn Edu)</span>
                </div>
                <p className="mt-1 text-[12.5px] text-[#64748B]">
                  Cấu hình địa chỉ web của bản TeachLearn Edu đầy đủ (Ngân hàng đề, Khảo thí, Sổ
                  điểm SMAS, Hồ sơ) để mở nhanh từ nút trên thanh tiêu đề.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    value={mainAdminPortalUrl}
                    onChange={(e) => onChangeMainAdminPortalUrl?.(e.target.value)}
                    placeholder="https://teachlearn-edu.web.app"
                    className="min-w-[240px] flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none"
                  />
                  <a
                    href={mainAdminPortalUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#0F594F]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Mở Hệ thống Quản trị Tổng</span>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  placeholder="Tìm kiếm trong 29 môn học GDPT 2018..."
                  className="flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
                />
                <span className="rounded-[8px] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-medium text-[#0369A1]">
                  Đang bật: {subjects.filter((s) => s.enabled).length}/29 môn
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredSubjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-[13.5px] font-semibold text-[#1E293B]">
                        {sub.name}
                      </div>
                      <div className="text-[12px] text-[#64748B]">{sub.group}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChangeDefaultSubject(sub.name)}
                        className={`rounded-[8px] px-2.5 py-1 text-[12px] font-medium ${
                          defaultSubject === sub.name
                            ? 'bg-[#136F63] text-white'
                            : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {defaultSubject === sub.name ? 'Mặc định' : 'Chọn'}
                      </button>
                      <input
                        type="checkbox"
                        checked={sub.enabled}
                        onChange={() => onToggleSubject(sub.id)}
                        className="h-4 w-4 accent-[#136F63]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[8px] bg-[#136F63] px-5 py-2 text-[14px] font-medium text-white hover:bg-[#0F594F]"
          >
            Đóng &amp; Áp dụng
          </button>
        </div>
      </div>
    </SmartboardViewport>
  );
};
