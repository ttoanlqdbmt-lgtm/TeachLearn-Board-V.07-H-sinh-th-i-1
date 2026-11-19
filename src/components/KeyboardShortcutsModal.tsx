import React, { useEffect } from 'react';
import { Keyboard, PenTool, ClipboardCheck, X } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

const WHITEBOARD_SHORTCUTS: ShortcutItem[] = [
  { keys: ['P'], description: 'Chọn Bút viết nét mượt (Low-Latency Smooth Ink)' },
  { keys: ['E'], description: 'Chọn Cục tẩy (tẩy theo nét / tẩy vùng)' },
  { keys: ['L'], description: 'Chọn công cụ Vẽ Đoạn thẳng (co giãn & bắt dính 2 đầu)' },
  { keys: ['D'], description: 'Bật / Tắt nhanh Nét liền (—) ↔ Nét đứt (- -)' },
  { keys: ['Ctrl', 'Z'], description: 'Hoàn tác nét vẽ vừa thực hiện (Undo)' },
  { keys: ['Ctrl', 'Y'], description: 'Làm lại nét vẽ đã hoàn tác (Redo)' },
  { keys: ['F11'], description: 'Phóng to / Thoát chế độ Toàn màn hình giảng dạy' },
  { keys: ['Alt', 'F'], description: 'Phím tắt dự phòng Phóng to / Thoát Toàn màn hình' },
  { keys: ['?'], description: 'Mở / Đóng nhanh Bảng hướng dẫn Phím tắt này' },
];

const EXAM_SHORTCUTS: ShortcutItem[] = [
  { keys: ['1', '2', '3', '4'], description: 'Chọn nhanh đáp án A, B, C, D cho câu hiện tại' },
  { keys: ['A', 'B', 'C', 'D'], description: 'Chọn nhanh đáp án A, B, C, D (tương đương 1–4)' },
  { keys: ['←', '→'], description: 'Chuyển nhanh sang Câu trước / Câu tiếp theo' },
  { keys: ['Ctrl', 'Enter'], description: 'Nộp bài & Chấm điểm ngay lập tức' },
  { keys: ['Enter'], description: 'Chuyển sang ô Trả lời ngắn (Phần III) tiếp theo' },
  { keys: ['Esc'], description: 'Đóng Bàn phím số ảo hoặc hộp thoại đang mở' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const renderRow = (item: ShortcutItem, idx: number) => (
    <div
      key={idx}
      className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] py-2.5 last:border-b-0 dark:border-slate-800"
    >
      <span className="text-[13.5px] text-[#334155] dark:text-slate-200">{item.description}</span>
      <div className="flex shrink-0 items-center gap-1">
        {item.keys.map((k, kIdx) => (
          <React.Fragment key={k}>
            {kIdx > 0 && item.keys.length === 2 && (item.keys[0] === 'Ctrl' || item.keys[0] === 'Alt') && (
              <span className="text-[11px] font-semibold text-[#64748B]">+</span>
            )}
            <kbd className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-2 font-mono text-[12px] font-bold text-[#0F172A] shadow-[0_1px_0_0_#CBD5E1] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_1px_0_0_#334155]">
              {k}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={onClose}
      className="no-print fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[10px] border border-[#CBD5E1] bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#136F63] px-5 py-3.5 text-white dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-white/15">
              <Keyboard className="h-5 w-5 text-white" />
            </span>
            <div>
              <h2 id="shortcuts-modal-title" className="text-[16px] font-bold leading-tight">
                Hệ thống Phím tắt Toàn diện — TeachLearn Board
              </h2>
              <p className="text-[12px] text-emerald-100">
                Thao tác siêu tốc trên Bảng trắng 65–86&quot;, Phòng thi Online &amp; Gọi trả bài
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng phím tắt"
            className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-5 md:grid-cols-2">
          {/* Group 1: Interactive Whiteboard & Teaching */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-[#136F63] dark:text-teal-400">
              <PenTool className="h-4 w-4 shrink-0" />
              <span>Bảng trắng Tương tác &amp; Giảng dạy</span>
            </div>
            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC]/60 px-3.5 py-1 dark:border-slate-800 dark:bg-slate-950/40">
              {WHITEBOARD_SHORTCUTS.map(renderRow)}
            </div>
          </section>

          {/* Group 2: Exam / Homework / Live Student Quiz */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-[#136F63] dark:text-teal-400">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              <span>Làm bài thi · Bài tập · Gọi trả bài</span>
            </div>
            <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC]/60 px-3.5 py-1 dark:border-slate-800 dark:bg-slate-950/40">
              {EXAM_SHORTCUTS.map(renderRow)}
            </div>

            <div className="mt-3 rounded-[8px] border border-[#CBD5E1] bg-[#F0FDFA] p-3 text-[12.5px] leading-relaxed text-[#334155] dark:border-teal-900 dark:bg-teal-950/30 dark:text-slate-300">
              <strong className="text-[#136F63] dark:text-teal-300">Mẹo Bàn phím số ảo Phần III:</strong>{' '}
              Chạm hoặc bấm vào bất kỳ ô <strong>Trả lời ngắn</strong> nào để tự động bật bàn phím số
              nổi cỡ lớn (48×48px), tự giới hạn tối đa 4 ký tự theo chuẩn phiếu tô 2025.
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          <span className="text-[12px] text-[#64748B] dark:text-slate-400">
            Phím tắt tự động tạm nghỉ khi bạn đang nhập liệu trong ô tìm kiếm hoặc soạn thảo văn bản.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-[8px] bg-[#136F63] px-5 py-2 text-[13.5px] font-semibold text-white transition hover:bg-[#0F594F]"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
