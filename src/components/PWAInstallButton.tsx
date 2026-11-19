import React, { useState } from 'react';
import { Download, Share, Wifi, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, showIOSPrompt, isInstalled, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!canInstall && !showIOSPrompt)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={canInstall ? () => void install() : () => setShowIOSGuide(true)}
        title="Cài đặt ứng dụng TeachLearn Board (Chạy ngoại tuyến PWA)"
        aria-label="Cài đặt ứng dụng TeachLearn Board"
        className="btn-glossy-3d-inactive inline-flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-[6px] text-[12px] font-semibold transition-all duration-150 sm:w-auto sm:gap-1.5 sm:px-2.5"
      >
        <Download className="h-3.5 w-3.5 shrink-0 text-[#136F63]" strokeWidth={2} />
        <span className="hidden xl:inline">Cài PWA</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-[#1E293B]">
                Cài đặt TeachLearn Board lên Màn hình chính
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Đóng hướng dẫn"
                className="btn-glossy-3d-inactive flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[13.5px] leading-relaxed text-[#334155]">
              Để cài TeachLearn Board thành ứng dụng chạy ngoại tuyến trên iPhone hoặc iPad:
            </p>
            <ol className="space-y-2.5 text-[13.5px] text-[#334155]">
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  1
                </span>
                <span>
                  Nhấn biểu tượng <strong>Chia sẻ</strong>{' '}
                  <Share className="inline h-3.5 w-3.5 text-[#136F63]" /> ở thanh công cụ Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  2
                </span>
                <span>
                  Cuộn xuống chọn <strong>Thêm vào Màn hình chính</strong> (Add to Home Screen).
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  3
                </span>
                <span>
                  Nhấn <strong>Thêm</strong> để sử dụng TeachLearn Board toàn màn hình &amp; ngoại tuyến 100%.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

interface ConnectionStatusBadgeProps {
  isOfflineBypass?: boolean;
  isLocalMode?: boolean;
  onClick?: () => void;
  alwaysShowFullLabel?: boolean;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  isOfflineBypass = false,
  isLocalMode = false,
  onClick,
  alwaysShowFullLabel = false,
}) => {
  const isOnline = useOnlineStatus();
  const showOfflineStyle = !isOnline || isOfflineBypass;
  const showLocalOnlineStyle = isOnline && !isOfflineBypass && isLocalMode;

  const fullText = showOfflineStyle
    ? 'Ngoại tuyến (Cục bộ)'
    : showLocalOnlineStyle
      ? 'Giảng dạy Cục bộ'
      : 'Đồng bộ Cloud';
  const shortText = showOfflineStyle
    ? 'Ngoại tuyến'
    : showLocalOnlineStyle
      ? 'Cục bộ'
      : 'Cloud';

  const tooltip = !isOnline
    ? 'Chế độ Ngoại tuyến (Chạy cục bộ) — Toàn bộ Bảng viết, Đồ thị, Hình 3D & Kho đề IndexedDB hoạt động mượt không cần Internet'
    : showLocalOnlineStyle || isOfflineBypass
      ? 'Đang ở Chế độ Giảng dạy Cục bộ (Local Mode) — Dùng ngay toàn bộ công cụ không cần đăng nhập. Bấm nút Đăng nhập Google để bật Đồng bộ Cloud Firestore.'
      : 'Đang trực tuyến (Đồng bộ Cloud) — Tự động lưu bộ nhớ đệm PWA & đồng bộ Cloud Firestore';

  const baseClass = showOfflineStyle
    ? 'border-orange-300/90 bg-orange-50 text-orange-800 hover:bg-orange-100/80 dark:border-orange-700/70 dark:bg-orange-950/60 dark:text-orange-200'
    : showLocalOnlineStyle
      ? 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300';

  const content = (
    <>
      <span className="relative flex h-2 w-2 shrink-0">
        {showOfflineStyle ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
        ) : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            showOfflineStyle
              ? 'bg-orange-500'
              : showLocalOnlineStyle
                ? 'bg-teal-600'
                : 'bg-emerald-500'
          }`}
        />
      </span>
      {showOfflineStyle ? (
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
      ) : (
        <Wifi
          className={`h-3.5 w-3.5 shrink-0 ${
            showLocalOnlineStyle
              ? 'text-teal-600 dark:text-teal-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        />
      )}
      {alwaysShowFullLabel ? (
        <span className="whitespace-nowrap">{fullText}</span>
      ) : (
        <>
          <span className="hidden whitespace-nowrap xl:inline">{fullText}</span>
          <span className="whitespace-nowrap xl:hidden">{shortText}</span>
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        role="status"
        aria-live="polite"
        title={tooltip}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-[11px] font-semibold transition-colors ${baseClass}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      title={tooltip}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-[11px] font-semibold ${baseClass}`}
    >
      {content}
    </span>
  );
};

export const OfflineIndicator: React.FC = () => {
  // Status is displayed compactly in the top header corner via ConnectionStatusBadge
  // to preserve maximum 95% display height for the 65–86 inch Smartboard canvas.
  return null;
};
