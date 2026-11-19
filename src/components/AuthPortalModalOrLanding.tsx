import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Chrome,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Presentation,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { ConnectionStatusBadge, PWAInstallButton } from './PWAInstallButton';
import {
  AppUserRole,
  MasterDataStore,
  UserAccountRecord,
} from '../types/eduplan';
import {
  detectAutoRoleForEmail,
  getSchoolInviteCode,
  isOwnerAdminEmail,
  parseDeviceBrowser,
} from '../utils/cloudCacheAndCompression';

interface AuthPortalProps {
  open: boolean;
  isFullScreenGate: boolean;
  onClose?: () => void;
  currentAccount: UserAccountRecord | null;
  masterData: MasterDataStore;
  studentPortalRedirectUrl?: string;
  onGooglePopupLogin: (
    preferredRole?: 'teacher' | 'student',
    extraProfile?: {
      inviteCode?: string;
      studentClass?: string;
      studentCode?: string;
      customName?: string;
    }
  ) => Promise<void>;
  onCompleteRoleOnboarding: (
    role: AppUserRole,
    status: 'active' | 'pending',
    extra: {
      displayName: string;
      studentClass?: string;
      studentCode?: string;
      department?: string;
      inviteCodeUsed?: string;
    }
  ) => Promise<void>;
  onLogout?: () => Promise<void>;
  onEnterOfflineMode?: () => void;
  needsRoleSelection?: boolean;
}

export const AuthPortalModalOrLanding: React.FC<AuthPortalProps> = ({
  open,
  isFullScreenGate,
  onClose,
  currentAccount,
  masterData,
  studentPortalRedirectUrl = 'https://teachlearn-edu.web.app',
  onGooglePopupLogin,
  onCompleteRoleOnboarding,
  onLogout,
  onEnterOfflineMode,
  needsRoleSelection = false,
}) => {
  const isOnline = useOnlineStatus();
  const [selectedRoleChoice, setSelectedRoleChoice] = useState<'teacher' | 'student'>(
    currentAccount?.role === 'student' ? 'student' : 'teacher'
  );
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('Tổ Toán - Tin');
  const [displayNameInput, setDisplayNameInput] = useState(
    currentAccount?.displayName || ''
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [networkAuthFailed, setNetworkAuthFailed] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  if (!open && !isFullScreenGate) return null;

  const schoolInviteCode = getSchoolInviteCode();
  const deviceLabel = parseDeviceBrowser();
  const isCurrentOwnerAdmin = isOwnerAdminEmail(currentAccount?.email);
  const isBlockedStudent =
    currentAccount?.role === 'student' || selectedRoleChoice === 'student';

  const handleGoogleSignInClick = async () => {
    if (selectedRoleChoice === 'student') {
      setFeedbackMsg({
        type: 'error',
        text: 'Thiết bị này là Bảng Tương Tác Giảng Dạy (TeachLearn Board) dành riêng cho Giáo viên. Học sinh vui lòng chuyển sang Cổng Học sinh!',
      });
      return;
    }
    if (!isOnline) {
      setNetworkAuthFailed(true);
      setFeedbackMsg({
        type: 'info',
        text: 'Thiết bị đang không có kết nối Internet. Vui lòng bấm nút "Vào dạy Ngoại tuyến (Offline Mode)" để mở thẳng vào Bảng trắng tương tác.',
      });
      return;
    }
    setAuthLoading(true);
    setFeedbackMsg(null);
    setNetworkAuthFailed(false);
    try {
      await onGooglePopupLogin('teacher', {
        inviteCode: inviteCodeInput.trim(),
        customName: displayNameInput.trim(),
      });
      setFeedbackMsg({
        type: 'success',
        text: 'Đăng nhập Google và xác thực phân quyền Bảng tương tác thành công!',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isNetErr =
        !navigator.onLine ||
        /network|offline|timeout|failed to fetch|auth\/network-request-failed/i.test(msg);
      if (isNetErr) {
        setNetworkAuthFailed(true);
      }
      setFeedbackMsg({
        type: 'error',
        text: isNetErr
          ? 'Không thể kết nối máy chủ Firebase Auth do mất mạng. Thầy/Cô có thể bấm "Vào dạy Ngoại tuyến (Offline Mode)" để mở thẳng vào Bảng trắng ngay lập tức.'
          : err instanceof Error
            ? `Không thể hoàn tất đăng nhập Google (${err.message}). Vui lòng cho phép cửa sổ bật lên (Popup) và thử lại.`
            : 'Không thể đăng nhập Google. Vui lòng thử lại.',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMsg(null);

    if (selectedRoleChoice === 'student' || currentAccount?.role === 'student') {
      setFeedbackMsg({
        type: 'error',
        text: 'Tài khoản Học sinh bị chặn truy cập vào TeachLearn Board. Vui lòng nhấn nút Chuyển hướng sang Cổng Học sinh bên dưới.',
      });
      return;
    }

    const cleanInvite = inviteCodeInput.trim().toUpperCase();
    const autoCheck = currentAccount?.email
      ? detectAutoRoleForEmail(currentAccount.email, masterData.teachers)
      : { matchedRole: null };

    if (autoCheck.matchedRole === 'admin') {
      await onCompleteRoleOnboarding('admin', 'active', {
        displayName:
          displayNameInput.trim() || currentAccount?.displayName || 'Thầy Lê Trọng Toàn',
        department: departmentInput,
        inviteCodeUsed: 'OWNER_ADMIN',
      });
      return;
    }

    if (
      autoCheck.matchedRole === 'teacher' ||
      cleanInvite === schoolInviteCode ||
      cleanInvite === 'TEACH2026' ||
      cleanInvite === 'LQD2026'
    ) {
      await onCompleteRoleOnboarding('teacher', 'active', {
        displayName:
          displayNameInput.trim() || currentAccount?.displayName || 'Giáo viên Mượn bảng',
        department: departmentInput,
        inviteCodeUsed: cleanInvite || 'TEACHER_LIST',
      });
    } else {
      setFeedbackMsg({
        type: 'error',
        text: 'Mã mời mượn Bảng tương tác chưa chính xác. Giáo viên trong trường vui lòng nhập đúng Mã mời để mở Chế độ Chỉ Xem & Giảng dạy (Read-Only Mode).',
      });
    }
  };

  const content = (
    <div className="relative w-full max-w-5xl overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white shadow-xl">
      {!isFullScreenGate && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cổng đăng nhập"
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition hover:bg-[#F1F5F9]"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Strict Owner-Only Protection & Read-Only Architecture Highlights */}
        <div className="relative flex flex-col justify-between bg-[#0B3B35] p-6 text-white sm:p-8 lg:col-span-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#136F63] text-white">
                <Sigma className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">
                  TeachLearn Board
                </div>
                <div className="text-[12px] font-medium text-teal-200">
                  Bảng Tương Tác &amp; Trình Chiếu Thông Minh 65–86 inch
                </div>
              </div>
            </div>

            <div className="mt-6">
              <span className="inline-block rounded-[8px] border border-white/20 bg-white/10 px-2.5 py-1 text-[12px] font-medium tracking-wide text-white uppercase">
                {masterData.profile.departmentName} · {masterData.profile.schoolName}
              </span>
              <h2 className="mt-3 text-[20px] font-semibold leading-snug text-white">
                Cơ Chế Bảo Vệ Độc Quyền &amp; Chống Can Thiệp Dữ Liệu
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-slate-200">
                Bảo vệ tuyệt đối cơ sở dữ liệu gốc của <strong>Thầy Lê Trọng Toàn</strong> trên
                Cloud Firestore, đồng thời hỗ trợ Giáo viên trong trường mượn bảng dạy học an toàn.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 rounded-[8px] border border-white/15 bg-white/5 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#DCFCE7]" />
                <div className="text-[13px] leading-relaxed text-slate-100">
                  <strong className="text-white">Quản trị viên Độc quyền (Owner-Only):</strong> Chỉ
                  duy nhất email tác giả (<code className="text-teal-200">ttoanlqd@gmail.com</code>,{' '}
                  <code className="text-teal-200">thaytoanlqd1@gmail.com</code>) mới được phép Cấu
                  hình hệ thống, Nạp đề <code className="text-teal-200">.json</code> và ghi dữ liệu
                  lên Cloud Firestore.
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[8px] border border-white/15 bg-white/5 p-3">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[#E0F2FE]" />
                <div className="text-[13px] leading-relaxed text-slate-100">
                  <strong className="text-white">Chế độ Chỉ Xem &amp; Giảng dạy (Read-Only):</strong>{' '}
                  Giáo viên khác đăng nhập bằng Mã mời được dùng bộ bút viết bảng, hình 3D/Conic,
                  chiếu bài giảng và xuất PDF về máy cá nhân (lưu tạm trong phiên trình duyệt, không
                  bao giờ ghi đè dữ liệu gốc).
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[8px] border border-rose-400/30 bg-rose-950/40 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <div className="text-[13px] leading-relaxed text-rose-100">
                  <strong className="text-white">Chặn hoàn toàn tài khoản Học sinh:</strong> Học
                  sinh không được phép truy cập vào ứng dụng Bảng tương tác của Giáo viên và được
                  chuyển hướng trực tiếp sang Cổng Học sinh.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-white/15 pt-4 text-[12px] text-slate-300">
            <div className="flex items-center justify-between">
              <span>Thiết bị hiện tại:</span>
              <span className="font-medium text-white">{deviceLabel}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Trạng thái kết nối:</span>
              {isOnline ? (
                <span className="font-medium text-[#DCFCE7]">● Đang trực tuyến (Đồng bộ Cloud)</span>
              ) : (
                <span className="font-medium text-orange-300">● Ngoại tuyến (Chạy cục bộ PWA)</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Google Sign-In & Strict Access Gate */}
        <div className="flex flex-col justify-between bg-white p-6 sm:p-8 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-4">
              <div>
                <h3 className="text-[18px] font-semibold text-[#0F172A]">
                  {currentAccount?.role === 'student'
                    ? 'Truy cập bị chặn — Tài khoản Học sinh'
                    : needsRoleSelection
                      ? 'Xác thực Mã mời Mượn Bảng Tương Tác'
                      : 'Cổng Đăng Nhập Bảng Tương Tác (Giáo viên)'}
                </h3>
                <p className="text-[12px] text-[#64748B]">
                  Xác thực qua Google Auth · Phân quyền tự động Chủ sở hữu (Admin) và Giáo viên
                  mượn bảng (Read-Only).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ConnectionStatusBadge alwaysShowFullLabel />
                <PWAInstallButton />
                {currentAccount && (
                  <span
                    className={`rounded-[8px] px-2.5 py-1 text-[12px] font-semibold ${
                      isCurrentOwnerAdmin
                        ? 'bg-emerald-100 text-[#136F63]'
                        : currentAccount.role === 'student'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {isCurrentOwnerAdmin
                      ? 'Chủ sở hữu · Admin Toàn Quyền'
                      : currentAccount.role === 'student'
                        ? 'Học sinh (Đã chặn)'
                        : 'Giáo viên · Chế độ Chỉ Xem (Read-Only)'}
                  </span>
                )}
              </div>
            </div>

            {/* OFFLINE BYPASS MODE: Immediate 1-tap entry to Smartboard when offline or network auth failed */}
            {(!isOnline || networkAuthFailed) && onEnterOfflineMode && !isBlockedStudent && (
              <div className="mt-4 rounded-[8px] border-2 border-orange-400 bg-orange-50/90 p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-orange-500 text-white">
                    <WifiOff className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold text-orange-950">
                      Chế độ Ngoại tuyến sẵn sàng (Không cần Internet)
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-orange-900">
                      Phát hiện thiết bị đang mất kết nối mạng. Bấm 1 chạm để mở thẳng vào{' '}
                      <strong>Bảng trắng tương tác</strong> và sử dụng đầy đủ{' '}
                      <strong>kho câu hỏi, danh sách lớp</strong> đã lưu trong IndexedDB / tệp{' '}
                      <code>.json</code> mà không bị kẹt ở màn hình chờ Firebase.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEnterOfflineMode()}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2.5 rounded-[8px] bg-orange-600 px-4 text-[14.5px] font-bold text-white shadow-xs transition hover:bg-orange-700 active:translate-y-px"
                >
                  <Presentation className="h-5 w-5 shrink-0" />
                  <span>Vào dạy Ngoại tuyến (Offline Mode)</span>
                </button>
              </div>
            )}

            {/* Step 1: Role Selector */}
            <div className="mt-5">
              <label className="block text-[14.5px] font-semibold text-[#1E293B]">
                1. Xác nhận đối tượng truy cập
              </label>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRoleChoice('teacher');
                    setFeedbackMsg(null);
                  }}
                  className={`flex items-start gap-3 rounded-[8px] border p-3.5 text-left transition ${
                    selectedRoleChoice === 'teacher' && currentAccount?.role !== 'student'
                      ? 'border-[#136F63] bg-[#F8FAFC] ring-1 ring-[#136F63]'
                      : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] ${
                      selectedRoleChoice === 'teacher' && currentAccount?.role !== 'student'
                        ? 'bg-[#136F63] text-white'
                        : 'bg-[#F1F5F9] text-[#334155]'
                    }`}
                  >
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#0F172A]">
                        Tôi là Giáo viên
                      </span>
                      {selectedRoleChoice === 'teacher' && currentAccount?.role !== 'student' && (
                        <CheckCircle2 className="h-4 w-4 text-[#136F63]" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-[#64748B]">
                      Admin Tác giả (Toàn quyền) hoặc Giáo viên mượn bảng dạy học (Chế độ Read-Only).
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRoleChoice('student')}
                  className={`flex items-start gap-3 rounded-[8px] border p-3.5 text-left transition ${
                    isBlockedStudent
                      ? 'border-rose-600 bg-rose-50/70 ring-1 ring-rose-600'
                      : 'border-[#E2E8F0] bg-white hover:bg-rose-50/30'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] ${
                      isBlockedStudent
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#F1F5F9] text-[#334155]'
                    }`}
                  >
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#0F172A]">
                        Tôi là Học sinh
                      </span>
                      {isBlockedStudent && <AlertOctagon className="h-4 w-4 text-rose-600" />}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-rose-700">
                      Không truy cập Bảng tương tác. Nhấn để chuyển hướng sang Cổng Học sinh.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* STRICT STUDENT BLOCKING SCREEN */}
            {isBlockedStudent ? (
              <div className="mt-5 rounded-[8px] border-2 border-rose-500 bg-rose-50 p-5 text-rose-950">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-rose-600 text-white">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-[15.5px] font-bold text-rose-900">
                      Chặn Truy Cập Học Sinh — Ứng dụng Dành Riêng Cho Bảng Tương Tác Giáo Viên
                    </h4>
                    <p className="mt-1 text-[13px] leading-relaxed text-rose-800">
                      Đường link này là phần mềm <strong>TeachLearn Board (65–86 inch)</strong> phục
                      vụ Giáo viên đứng lớp giảng dạy. Tài khoản Học sinh hoàn toàn không được phép
                      đăng nhập hoặc thao tác trên hệ thống này để bảo vệ dữ liệu bài giảng và sổ
                      điểm.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                  <a
                    href={studentPortalRedirectUrl}
                    target="_top"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-bold text-white shadow-xs transition hover:bg-[#0F594F]"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span>Chuyển hướng sang Cổng Học sinh (TeachLearn Edu)</span>
                  </a>

                  {currentAccount && onLogout ? (
                    <button
                      type="button"
                      onClick={() => onLogout()}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-rose-300 bg-white px-4 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Đăng xuất ({currentAccount.email})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedRoleChoice('teacher')}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <span>Quay lại cổng Giáo viên</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Teacher & Owner Admin Verification Form */
              <form onSubmit={handleConfirmOnboarding} className="mt-4 space-y-3">
                <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#1E293B]">
                      <KeyRound className="h-3.5 w-3.5 text-[#136F63]" />
                      Xác thực Giáo viên (Tự động mở Toàn quyền cho Admin hoặc nhập Mã mời mượn bảng)
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[12px] font-medium text-[#64748B]">
                        Mã mời mượn bảng (Dành cho Giáo viên khác trong trường)
                      </label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value)}
                        placeholder="Nhập mã mời (không bắt buộc với Admin tác giả)..."
                        className="mt-1 h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#64748B]">
                        Tổ chuyên môn
                      </label>
                      <select
                        value={departmentInput}
                        onChange={(e) => setDepartmentInput(e.target.value)}
                        className="mt-1 h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
                      >
                        <option value="Tổ Toán - Tin">Tổ Toán - Tin</option>
                        <option value="Tổ Vật lý - KTCN">Tổ Vật lý - KTCN</option>
                        <option value="Tổ Hóa - Sinh">Tổ Hóa - Sinh</option>
                        <option value="Tổ Ngữ văn">Tổ Ngữ văn</option>
                        <option value="Tổ Ngoại ngữ">Tổ Ngoại ngữ</option>
                        <option value="Tổ Sử - Địa - GDKT&PL">Tổ Sử - Địa - GDKT&amp;PL</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 text-[11.5px] text-[#64748B]">
                    • <strong>Chủ sở hữu (ttoanlqd@gmail.com, thaytoanlqd1@gmail.com):</strong> Tự
                    động kích hoạt quyền Quản trị viên (Admin) mà không cần nhập mã mời.
                    <br />• <strong>Giáo viên khác trong trường:</strong> Nhập mã mời để mở{' '}
                    <strong>Chế độ Chỉ Xem &amp; Giảng dạy (Read-Only Mode)</strong>.
                  </div>
                </div>

                {/* Primary Google Sign-In Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={authLoading || !isOnline}
                    onClick={handleGoogleSignInClick}
                    className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[8px] bg-[#136F63] px-4 text-[14px] font-semibold text-white transition hover:bg-[#0F594F] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Chrome className="h-4 w-4 shrink-0" />
                    <span>
                      {!isOnline
                        ? 'Đăng nhập Google (Cần kết nối Internet — Hãy dùng nút Ngoại tuyến phía trên)'
                        : authLoading
                          ? 'Đang xác thực Google Auth & Quyền truy cập...'
                          : 'Đăng nhập bằng tài khoản Google (Giáo viên / Quản trị viên)'}
                    </span>
                  </button>
                </div>

                {needsRoleSelection && currentAccount && (
                  <button
                    type="submit"
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-semibold text-white transition hover:bg-[#0F594F]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {isCurrentOwnerAdmin
                        ? 'Vào hệ thống với quyền Quản trị viên Độc quyền (Admin)'
                        : 'Xác nhận Mã mời & Vào Chế độ Chỉ Xem & Giảng dạy (Read-Only)'}
                    </span>
                  </button>
                )}

                {currentAccount && onLogout && (
                  <button
                    type="button"
                    onClick={() => onLogout()}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#FEE2E2] px-4 text-[13.5px] font-medium text-[#B91C1C] transition hover:opacity-90"
                  >
                    <span>Đăng xuất tài khoản ({currentAccount.email})</span>
                  </button>
                )}
              </form>
            )}

            {feedbackMsg && (
              <div
                className={`mt-3 rounded-[8px] border px-3.5 py-2.5 text-[13.5px] font-medium ${
                  feedbackMsg.type === 'error'
                    ? 'border-[#FEE2E2] bg-[#FEE2E2] text-[#B91C1C]'
                    : feedbackMsg.type === 'success'
                      ? 'border-[#DCFCE7] bg-[#DCFCE7] text-[#15803D]'
                      : 'border-[#E0F2FE] bg-[#E0F2FE] text-[#0369A1]'
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}
          </div>

          {/* Security Note Footer */}
          <div className="mt-5 border-t border-[#E2E8F0] pt-4">
            <div className="flex items-center gap-1.5 text-[12px] text-[#64748B]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#136F63]" />
              <span>
                <strong>Bảo vệ Độc quyền (Strict Owner-Only):</strong> Mọi thao tác viết vẽ của Giáo
                viên mượn bảng chỉ lưu tạm trên trình duyệt, tuyệt đối không ghi đè hay làm thay đổi
                dữ liệu bài giảng, kho đề và sổ điểm gốc trên Cloud Firestore.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isFullScreenGate) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F1F5F9] p-4">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      {content}
    </div>
  );
};
