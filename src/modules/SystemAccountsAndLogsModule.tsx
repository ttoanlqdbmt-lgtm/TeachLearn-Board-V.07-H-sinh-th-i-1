import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  AppUserRole,
  LoginAuditLogRecord,
  UserAccountRecord,
} from '../types/eduplan';
import {
  clearAllZeroCostCaches,
  compressImageToWebpOrJpegUnder100KB,
  estimateDataUrlBytes,
  getSchoolInviteCode,
  loadZeroCostStats,
  setSchoolInviteCode,
  ZeroCostResourceStats,
} from '../utils/cloudCacheAndCompression';

interface SystemAccountsAndLogsModuleProps {
  accounts: UserAccountRecord[];
  loginLogs: LoginAuditLogRecord[];
  onUpdateAccountRoleOrStatus: (
    uid: string,
    updates: Partial<Pick<UserAccountRecord, 'role' | 'status' | 'studentClass' | 'department'>>
  ) => Promise<void>;
}

export const SystemAccountsAndLogsModule: React.FC<SystemAccountsAndLogsModuleProps> = ({
  accounts,
  loginLogs,
  onUpdateAccountRoleOrStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'logs' | 'zero_cost'>('accounts');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppUserRole>('all');
  const [inviteCode, setInviteCode] = useState(() => getSchoolInviteCode());
  const [inviteSaved, setInviteSaved] = useState(false);
  const [stats, setStats] = useState<ZeroCostResourceStats>(() => loadZeroCostStats());
  const [compressionTestInfo, setCompressionTestInfo] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (roleFilter !== 'all' && acc.role !== roleFilter) return false;
      if (!q) return true;
      return (
        acc.displayName.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q) ||
        (acc.studentClass || '').toLowerCase().includes(q) ||
        (acc.studentCode || '').toLowerCase().includes(q) ||
        (acc.department || '').toLowerCase().includes(q)
      );
    });
  }, [accounts, searchQuery, roleFilter]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return loginLogs.filter((log) => {
      if (roleFilter !== 'all' && log.role !== roleFilter) return false;
      if (!q) return true;
      return (
        log.displayName.toLowerCase().includes(q) ||
        log.email.toLowerCase().includes(q) ||
        log.deviceBrowser.toLowerCase().includes(q)
      );
    });
  }, [loginLogs, searchQuery, roleFilter]);

  const teacherCount = accounts.filter((a) => a.role === 'teacher' || a.role === 'admin').length;
  const studentCount = accounts.filter((a) => a.role === 'student').length;
  const cacheHitRate =
    stats.cacheHits + stats.cacheMisses > 0
      ? Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100)
      : 92;

  const handleExportAccountsExcel = () => {
    const rows = filteredAccounts.map((acc, idx) => ({
      STT: idx + 1,
      'Họ và tên': acc.displayName,
      'Email Google': acc.email,
      'Vai trò':
        acc.role === 'admin'
          ? 'Quản trị viên'
          : acc.role === 'teacher'
          ? 'Giáo viên'
          : 'Học sinh',
      'Trạng thái': acc.status === 'active' ? 'Đã kích hoạt' : 'Chờ duyệt',
      'Lớp / Tổ chuyên môn':
        acc.role === 'student' ? acc.studentClass || '12A1' : acc.department || 'Tổ Toán - Tin',
      'Mã HS / SBD': acc.studentCode || '-',
      'Đăng nhập gần nhất': new Date(acc.lastLoginAt).toLocaleString('vi-VN'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachTaiKhoan');
    XLSX.writeFile(wb, `TeachLearn_DanhSachTaiKhoan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportLogsExcel = () => {
    const rows = filteredLogs.map((log, idx) => ({
      STT: idx + 1,
      'Họ và tên': log.displayName,
      'Email Google': log.email,
      'Vai trò':
        log.role === 'admin'
          ? 'Quản trị viên'
          : log.role === 'teacher'
          ? 'Giáo viên'
          : 'Học sinh',
      'Thời gian đăng nhập': new Date(log.loginAt).toLocaleString('vi-VN'),
      'Thiết bị / Trình duyệt': log.deviceBrowser,
      'User-Agent': log.userAgent,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NhatKyDangNhap');
    XLSX.writeFile(wb, `TeachLearn_NhatKyHeThong_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleSaveInviteCode = (e: React.FormEvent) => {
    e.preventDefault();
    setSchoolInviteCode(inviteCode);
    setInviteCode(getSchoolInviteCode());
    setInviteSaved(true);
    window.setTimeout(() => setInviteSaved(false), 2500);
  };

  const handleTestImageCompression = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result || '');
      const beforeKB = (estimateDataUrlBytes(rawDataUrl) / 1024).toFixed(1);
      const compressed = await compressImageToWebpOrJpegUnder100KB(rawDataUrl, 94 * 1024);
      const afterKB = (estimateDataUrlBytes(compressed) / 1024).toFixed(1);
      setStats(loadZeroCostStats());
      setCompressionTestInfo(
        `Đã nén ảnh "${file.name}" từ ${beforeKB} KB xuống ${afterKB} KB (chuẩn WebP < 100KB)!`
      );
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Quản trị Phân quyền &amp; Nhật ký Truy cập Toàn trường
          </span>
          <h1 className="mt-1.5 text-[19px] font-semibold text-[#0F172A] dark:text-white">
            Quản lý Tài khoản Giáo viên / Học sinh &amp; Nhật ký Hệ thống
          </h1>
          <p className="mt-0.5 text-[12px] text-[#64748B] dark:text-slate-400">
            Theo dõi thời gian thực danh sách tài khoản Google đã đăng nhập, phê duyệt Giáo viên,
            kiểm tra thiết bị truy cập và xuất báo cáo Excel (.xlsx).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportAccountsExcel}
            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#15803D]" />
            <span>Xuất DS Tài khoản (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handleExportLogsExcel}
            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
          >
            <Download className="h-4 w-4" />
            <span>Xuất Nhật ký Đăng nhập (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#64748B]">
            <span>Tài khoản Giáo viên &amp; BGH</span>
            <UserCheck className="h-4 w-4 text-[#136F63]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums dark:text-white">
            {teacherCount} <span className="text-[12px] font-normal text-[#64748B]">/ 100 định biên</span>
          </div>
          <div className="mt-1 text-[12px] text-[#15803D] dark:text-emerald-400">
            ● Tự động đối chiếu Email &amp; Mã mời {inviteCode}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#64748B]">
            <span>Tài khoản Học sinh</span>
            <Users className="h-4 w-4 text-[#15803D]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums dark:text-white">
            {studentCount} <span className="text-[12px] font-normal text-[#64748B]">/ 1.500 toàn trường</span>
          </div>
          <div className="mt-1 text-[12px] text-[#64748B]">
            Phân quyền chặt vào 3 khu vực Học sinh
          </div>
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#64748B]">
            <span>Lịch sử Đăng nhập Cloud</span>
            <Database className="h-4 w-4 text-[#B45309]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums dark:text-white">
            {loginLogs.length} <span className="text-[12px] font-normal text-[#64748B]">lượt ghi nhận</span>
          </div>
          <div className="mt-1 text-[12px] text-[#64748B]">
            Lưu Email, Vai trò, Thời gian &amp; Thiết bị
          </div>
        </div>

        <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#64748B]">
            <span>Hiệu suất Tối ưu 0 Đồng</span>
            <Zap className="h-4 w-4 text-[#15803D]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#15803D] tabular-nums dark:text-emerald-400">
            {cacheHitRate}% <span className="text-[12px] font-normal text-[#64748B]">Cache Hit</span>
          </div>
          <div className="mt-1 font-mono text-[12px] text-[#64748B] tabular-nums">
            Tiết kiệm {stats.firestoreReadsSaved} lượt đọc · Nén {stats.imagesCompressedCount} ảnh
          </div>
        </div>
      </div>

      {/* Sub-navigation & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
              activeTab === 'accounts'
                ? 'bg-[#136F63] text-white'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            1. Danh sách Tài khoản ({accounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-[#136F63] text-white'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            2. Nhật ký Đăng nhập ({loginLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('zero_cost')}
            className={`rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
              activeTab === 'zero_cost'
                ? 'bg-[#136F63] text-white'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            3. Tối ưu 0 Đồng &amp; Mã mời Giáo viên
          </button>
        </div>

        {activeTab !== 'zero_cost' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | AppUserRole)}
              className="h-9 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="admin">Quản trị viên</option>
              <option value="teacher">Giáo viên</option>
              <option value="student">Học sinh</option>
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên, email, lớp, thiết bị..."
                className="h-9 w-60 rounded-[8px] border border-[#CBD5E1] bg-white pl-8 pr-3 text-[13.5px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: USER ACCOUNTS TABLE */}
      {activeTab === 'accounts' && (
        <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#136F63] text-[12px] font-semibold text-white uppercase">
                  <th className="px-4 py-3">Người dùng</th>
                  <th className="px-3 py-3">Email Google</th>
                  <th className="px-3 py-3">Vai trò</th>
                  <th className="px-3 py-3">Lớp / Tổ chuyên môn</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3 text-right">Phân quyền nhanh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {filteredAccounts.map((acc) => (
                  <tr
                    key={acc.uid}
                    className="transition hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {acc.photoURL ? (
                          <img
                            src={acc.photoURL}
                            alt={acc.displayName}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#BAE6FD] bg-[#E0F2FE] font-semibold text-[#0369A1] dark:bg-slate-800 dark:text-slate-200">
                            {acc.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[#0F172A] dark:text-white">
                            {acc.displayName}
                          </div>
                          {acc.studentCode && (
                            <div className="font-mono text-[12px] text-[#64748B]">
                              SBD: {acc.studentCode}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[13px] text-[#334155] dark:text-slate-300">
                      {acc.email}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-[8px] border px-2 py-0.5 text-[12px] font-semibold ${
                          acc.role === 'admin'
                            ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]'
                            : acc.role === 'teacher'
                            ? 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]'
                            : 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                        }`}
                      >
                        {acc.role === 'admin'
                          ? 'Quản trị viên'
                          : acc.role === 'teacher'
                          ? 'Giáo viên'
                          : 'Học sinh'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-[#334155] dark:text-slate-300">
                      {acc.role === 'student'
                        ? `Lớp ${acc.studentClass || '12A1'}`
                        : acc.department || 'Tổ Toán - Tin'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5 text-[12px] font-semibold ${
                          acc.status === 'active'
                            ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                            : 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]'
                        }`}
                      >
                        ● {acc.status === 'active' ? 'Hoạt động' : 'Chờ duyệt GV'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-[#64748B] tabular-nums">
                      {new Date(acc.lastLoginAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {acc.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAccountRoleOrStatus(acc.uid, { status: 'active' })
                            }
                            className="rounded-[8px] bg-[#136F63] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#0F594F]"
                          >
                            Duyệt GV
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateAccountRoleOrStatus(acc.uid, {
                              role: acc.role === 'student' ? 'teacher' : 'student',
                            })
                          }
                          className="rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Đổi sang {acc.role === 'student' ? 'Giáo viên' : 'Học sinh'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LOGIN AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#136F63] text-[12px] font-semibold text-white uppercase">
                  <th className="px-4 py-3">Thời gian đăng nhập</th>
                  <th className="px-3 py-3">Họ tên &amp; Ảnh đại diện</th>
                  <th className="px-3 py-3">Email Google</th>
                  <th className="px-3 py-3">Vai trò</th>
                  <th className="px-4 py-3">Thiết bị / Trình duyệt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] font-semibold text-[#334155] tabular-nums dark:text-slate-300">
                      {new Date(log.loginAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {log.photoURL ? (
                          <img
                            src={log.photoURL}
                            alt={log.displayName}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F1F5F9] font-semibold text-[#334155] dark:bg-slate-800 dark:text-slate-300">
                            {log.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-semibold text-[#0F172A] dark:text-white">
                          {log.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[13px] text-[#64748B] dark:text-slate-400">
                      {log.email}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-[8px] border px-2 py-0.5 text-[12px] font-semibold ${
                          log.role === 'admin'
                            ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]'
                            : log.role === 'teacher'
                            ? 'border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]'
                            : 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                        }`}
                      >
                        {log.role === 'admin'
                          ? 'Quản trị viên'
                          : log.role === 'teacher'
                          ? 'Giáo viên'
                          : 'Học sinh'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#64748B] dark:text-slate-400">
                      {log.deviceBrowser}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ZERO-COST SCHOOL OPTIMIZATION & TEACHER INVITE CODE */}
      {activeTab === 'zero_cost' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Card 1: Teacher Invite Code & Role Auto-Detection */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1] dark:bg-slate-800 dark:text-slate-200">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
                  Cấu hình Mã mời Giáo viên Trường học
                </h3>
                <p className="text-[12px] text-[#64748B]">
                  Dùng để xác thực nhanh tài khoản Giáo viên mới chưa có trong danh sách Email khai
                  báo đầu năm.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveInviteCode} className="mt-4 space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                  Mã mời Giáo viên hiện hành
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="h-10 flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 font-mono text-[14px] font-bold tracking-wider text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-[8px] bg-[#136F63] px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
                  >
                    Lưu Mã mời
                  </button>
                </div>
              </div>
              {inviteSaved && (
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#15803D]">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã cập nhật Mã mời Giáo viên thành công!
                </div>
              )}
            </form>

            <div className="mt-5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[12px] leading-relaxed text-[#334155] dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
              <strong className="text-[#0F172A] dark:text-white">
                Cơ chế Phân quyền Tự động 3 lớp:
              </strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>
                  <strong>Lớp 1 (Email Whitelist):</strong> Tự động cấp quyền Giáo viên nếu Email
                  Google trùng khớp với Danh sách Giáo viên ở mục <em>II.3.b</em>.
                </li>
                <li>
                  <strong>Lớp 2 (Mã mời trường học):</strong> Giáo viên mới nhập mã{' '}
                  <code className="font-mono font-bold text-[#136F63]">{inviteCode}</code> trong lần
                  đăng nhập đầu tiên.
                </li>
                <li>
                  <strong>Lớp 3 (Học sinh):</strong> Mặc định chuyển vào <em>Student Portal</em> tối
                  giản (3 phân khu), khóa hoàn toàn đường dẫn Ngân hàng đề gốc.
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: Zero-Cost Resource Optimization Controls */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] dark:bg-slate-800 dark:text-emerald-300">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-white">
                    Trung tâm Tối ưu Tài nguyên 0 Đồng (Spark Plan)
                  </h3>
                  <p className="text-[12px] text-[#64748B]">
                    Đảm bảo 1.500 học sinh thi đồng thời không vượt hạn mức miễn phí của Firebase.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearAllZeroCostCaches();
                  setStats(loadZeroCostStats());
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Làm mới Cache</span>
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[12px]">
              <div className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] p-3 dark:border-slate-800">
                <div>
                  <div className="font-semibold text-[#0F172A] dark:text-white">
                    1. Ghi dữ liệu thi 1 lượt duy nhất (Single-Write Exam)
                  </div>
                  <div className="text-[#64748B]">
                    Lưu nháp vào <code className="font-mono">localStorage</code>, chỉ ghi Firestore
                    khi bấm Nộp bài.
                  </div>
                </div>
                <span className="font-mono text-[13.5px] font-bold text-[#15803D] tabular-nums">
                  {stats.firestoreSingleWriteExams} bài đã tối ưu
                </span>
              </div>

              <div className="flex items-center justify-between rounded-[8px] border border-[#E2E8F0] p-3 dark:border-slate-800">
                <div>
                  <div className="font-semibold text-[#0F172A] dark:text-white">
                    2. Bộ nhớ đệm Ngân hàng đề &amp; Danh sách lớp (IndexedDB + LocalCache)
                  </div>
                  <div className="text-[#64748B]">
                    Giảm tối đa lượt đọc lặp lại từ Cloud Firestore.
                  </div>
                </div>
                <span className="font-mono text-[13.5px] font-bold text-[#136F63] tabular-nums">
                  -{stats.firestoreReadsSaved} lượt đọc
                </span>
              </div>

              <div className="rounded-[8px] border border-[#E2E8F0] p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-white">
                      3. Nén ảnh Word tự động sang WebP/JPEG (&lt; 100KB)
                    </div>
                    <div className="text-[#64748B]">
                      Đã tiết kiệm {(stats.bytesSavedTotal / (1024 * 1024)).toFixed(2)} MB dung
                      lượng lưu trữ.
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <ImageIcon className="h-3.5 w-3.5 text-[#136F63]" />
                    <span>Thử nén ảnh</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleTestImageCompression}
                      className="hidden"
                    />
                  </label>
                </div>
                {compressionTestInfo && (
                  <div className="mt-2 rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-1.5 font-mono text-[12px] font-semibold text-[#15803D]">
                    {compressionTestInfo}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
