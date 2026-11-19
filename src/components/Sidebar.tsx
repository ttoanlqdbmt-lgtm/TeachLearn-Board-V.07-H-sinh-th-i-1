import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Box,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Presentation,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { ModuleId } from '../types/eduplan';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  collapsed: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export interface TeachingToolNavItem {
  key: string;
  moduleId: ModuleId;
  matchModules: ModuleId[];
  shortLabel: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export const TEACHLEARN_BOARD_TOOLS: TeachingToolNavItem[] = [
  {
    key: 'smartboard',
    moduleId: 'teaching_smartboard',
    matchModules: ['teaching_smartboard'],
    shortLabel: '1. Bảng trắng tương tác',
    label: '1. Bảng trắng tương tác (Smartboard Canvas)',
    description:
      'Bộ bút viết nét mượt, gạt nhanh Liền / Đứt (— / - -), bắt dính đầu mút/trung điểm, 16 mẫu Hình 2D/3D & Conic, Đèn rọi, Rèm che, Bút AI & OCR, xuất PDF và Đăng lên Sổ Ghi Chép Cổng Học sinh.',
    icon: PenTool,
  },
  {
    key: 'function_plot',
    moduleId: 'teaching_function_plot',
    matchModules: ['teaching_function_plot'],
    shortLabel: '2. Khảo sát & Đồ thị',
    label: '2. Khảo sát & Vẽ đồ thị hàm số',
    description:
      'Khảo sát sự biến thiên, dựng Bảng biến thiên chuẩn SGK Kết nối tri thức và vẽ đồ thị hàm số trực quan.',
    icon: TrendingUp,
  },
  {
    key: 'geometry_3d',
    moduleId: 'teaching_geometry_3d',
    matchModules: ['teaching_geometry_3d'],
    shortLabel: '3. Hình học 3D động',
    label: '3. Không gian Hình học 3D động',
    description:
      'Kho mô hình 3D xoay 360 độ (Chóp, Lăng trụ, Khối tròn xoay, Hệ trục Oxyz), tùy chỉnh thông số và Đưa sang Bảng trắng Giảng dạy.',
    icon: Box,
  },
  {
    key: 'classroom',
    moduleId: 'teaching_classroom',
    matchModules: ['teaching_classroom'],
    shortLabel: '4. Lớp học & Gọi trả bài',
    label: '4. Lớp học & Gọi trả bài theo Ma trận',
    description:
      'Gọi ngẫu nhiên học sinh lên bảng chọn gói bài làm (đọc trực tiếp kho câu hỏi & danh sách lớp từ Cloud Firestore, đẩy điểm về Sổ điểm SMAS).',
    icon: Users,
  },
  {
    key: 'slides_realworld',
    moduleId: 'teaching_slides',
    matchModules: ['teaching_slides', 'teaching_realworld'],
    shortLabel: '5. Bài giảng',
    label: '5. Bài giảng (Liên thông App Chính · File · Google Drive)',
    description:
      'Kết nối trực tiếp bộ sưu tập lessons từ App Chính (Cloud Firestore), tải file .docx/.pdf/.json hoặc nhập link Google Drive; trình chiếu 3 phần chuẩn sư phạm (I. Lý thuyết trọng tâm · II. Ví dụ minh họa · III. Bài tập vận dụng) kèm nút Đưa sang Bảng trắng.',
    icon: BookOpen,
  },
];

interface TooltipState {
  title: string;
  description: string;
  left: number;
  centerY: number;
  arrowOffset: number;
}

export function getBreadcrumbForModule(moduleId: ModuleId): {
  parentLabel?: string;
  currentLabel: string;
} {
  const found = TEACHLEARN_BOARD_TOOLS.find((t) => t.matchModules.includes(moduleId));
  if (found) {
    return {
      parentLabel: 'TeachLearn Board (65–86 inch)',
      currentLabel: found.shortLabel,
    };
  }
  return {
    parentLabel: 'TeachLearn Board (65–86 inch)',
    currentLabel: '1. Bảng trắng tương tác',
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  compact,
  onToggleCompact,
  mobileOpen,
  onCloseMobile,
}) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const clearTooltip = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltip(null);
  };

  const scheduleTooltip = (
    el: HTMLElement,
    title: string,
    description: string,
    isMobileDrawer: boolean
  ) => {
    if (isMobileDrawer) return;
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    ) {
      return;
    }
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const rect = el.getBoundingClientRect();
    const asideRect = asideRef.current?.getBoundingClientRect();
    hoverTimerRef.current = window.setTimeout(() => {
      const vh = window.innerHeight || 800;
      const vw = window.innerWidth || 1280;
      const rawCenterY = rect.top + rect.height / 2;
      const clampedCenterY = Math.max(56, Math.min(vh - 56, rawCenterY));
      const arrowOffset = Math.max(-24, Math.min(24, rawCenterY - clampedCenterY));
      const anchorRight = asideRect ? asideRect.right : rect.right;
      const left = Math.min(vw - 260, anchorRight + 10);
      setTooltip({
        title,
        description,
        left,
        centerY: clampedCenterY,
        arrowOffset,
      });
    }, 180);
  };

  const handleSelectTool = (id: ModuleId) => {
    clearTooltip();
    onSelectModule(id);
    onCloseMobile();
  };

  const renderHeader = (isCompactView: boolean, isMobileDrawer: boolean) => (
    <div className="shrink-0 border-b border-white/15">
      <div
        className={`flex h-[52px] items-center ${
          isCompactView ? 'justify-center px-1.5' : 'justify-between gap-2 px-3'
        }`}
      >
        {!isCompactView && (
          <button
            type="button"
            onClick={() => handleSelectTool('teaching_smartboard')}
            className="flex min-w-0 items-center gap-2 text-left focus:outline-none"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-white text-[#136F63] shadow-xs">
              <Presentation className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold tracking-tight text-white">
                TeachLearn Board
              </div>
              <div className="truncate text-[10.5px] text-emerald-100/85">
                Smartboard 65–86 inch
              </div>
            </div>
          </button>
        )}

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-white/85 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              clearTooltip();
              onToggleCompact();
            }}
            title={
              isCompactView
                ? 'Mở rộng thanh công cụ đứng lớp'
                : 'Thu gọn thanh điều hướng (56px) nhường 95% diện tích bảng viết'
            }
            aria-label={isCompactView ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            {isCompactView ? (
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            ) : (
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        )}
      </div>
    </div>
  );

  const renderNavItems = (isCompactView: boolean, isMobileDrawer: boolean) => (
    <nav
      aria-label="5 Công cụ Giảng dạy TeachLearn Board"
      onScroll={clearTooltip}
      onMouseLeave={clearTooltip}
      className="flex-1 space-y-1.5 overflow-y-auto px-1.5 py-2.5"
    >
      {TEACHLEARN_BOARD_TOOLS.map((item) => {
        const Icon = item.icon;
        const isActive = item.matchModules.includes(activeModule);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => handleSelectTool(item.moduleId)}
            onMouseEnter={(e) =>
              isCompactView &&
              scheduleTooltip(e.currentTarget, item.label, item.description, isMobileDrawer)
            }
            onMouseLeave={clearTooltip}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-h-[44px] w-full items-center rounded-[8px] transition-colors focus-visible:outline-none ${
              isCompactView ? 'justify-center px-0' : 'gap-2.5 px-3 text-left'
            } ${
              isActive
                ? 'bg-white font-semibold text-[#136F63] shadow-xs'
                : 'font-medium text-white/90 hover:bg-white/15 hover:text-white'
            }`}
          >
            <Icon
              className={`h-[19px] w-[19px] shrink-0 ${
                isActive ? 'text-[#136F63]' : 'text-white'
              }`}
              strokeWidth={2}
            />
            {!isCompactView && (
              <span className="truncate whitespace-nowrap text-[13px]">{item.shortLabel}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const renderFooter = (isCompactView: boolean) => (
    <div className="shrink-0 border-t border-white/15 px-2 py-2 text-center text-[10.5px] text-white/75">
      {isCompactView ? '65–86"' : 'TeachLearn Board · SMAS 4.0'}
    </div>
  );

  return (
    <>
      {/* Desktop Compact Sidebar (56px default for 95% canvas area) */}
      {!collapsed && (
        <aside
          ref={asideRef}
          className={`no-print relative hidden h-screen shrink-0 flex-col bg-[#136F63] text-white transition-[width] duration-200 select-none md:flex ${
            compact ? 'w-[56px]' : 'w-[228px]'
          }`}
        >
          {renderHeader(compact, false)}
          {renderNavItems(compact, false)}
          {renderFooter(compact)}
        </aside>
      )}

      {/* Compact-mode Hover Tooltip */}
      {tooltip &&
        !collapsed &&
        compact &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              left: `${tooltip.left}px`,
              top: `${tooltip.centerY}px`,
            }}
            className="sidebar-rich-tooltip pointer-events-none fixed z-[9999] hidden -translate-y-1/2 md:block"
          >
            <div className="relative max-w-[260px] rounded-[6px] border border-[#0F594F] bg-[#0B3B35] px-3 py-2 text-white shadow-lg">
              <span
                aria-hidden="true"
                style={{ top: `calc(50% + ${tooltip.arrowOffset}px)` }}
                className="absolute -left-[5px] h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-[#0F594F] bg-[#0B3B35]"
              />
              <div className="text-[13px] font-semibold leading-snug text-emerald-200">
                {tooltip.title}
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-white/85">
                {tooltip.description}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile Slide-Out Drawer (< 768px) */}
      <div
        className={`no-print md:hidden ${
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onCloseMobile}
          className={`fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="5 Công cụ Giảng dạy TeachLearn Board"
          className={`fixed inset-y-0 left-0 z-50 flex w-[250px] max-w-[85vw] flex-col bg-[#136F63] text-white shadow-2xl select-none transition-transform duration-200 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {renderHeader(false, true)}
          {renderNavItems(false, true)}
          {renderFooter(false)}
        </aside>
      </div>
    </>
  );
};
