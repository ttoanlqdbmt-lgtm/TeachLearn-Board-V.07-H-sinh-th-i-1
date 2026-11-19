import React, { useEffect, useRef } from 'react';
import { CornerDownLeft, Delete, Eraser, Keyboard, X } from 'lucide-react';

export const SHORT_ANSWER_MAX_LEN = 4;

/**
 * Chuẩn hóa đáp án Phần III (Trả lời ngắn) theo chuẩn phiếu tô trắc nghiệm 2025 của Bộ GD&ĐT:
 * - Tối đa 4 ký tự (tính cả dấu âm '-' ở đầu và dấu phẩy thập phân ',').
 * - Chỉ cho phép chữ số 0-9, dấu '-' ở đầu tiên, và tối đa một dấu thập phân (',' hoặc '.', tự chuẩn hóa '.').
 */
export function sanitizeShortAnswerValue(raw: string): string {
  if (!raw) return '';
  let out = '';
  let hasDecimal = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (out.length >= SHORT_ANSWER_MAX_LEN) break;

    if (ch === '-') {
      if (out.length === 0) {
        out += '-';
      }
      continue;
    }

    if (ch === ',' || ch === '.') {
      if (!hasDecimal && out.length > 0 && out !== '-') {
        out += ',';
        hasDecimal = true;
      }
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }

  return out;
}

export interface FloatingMathKeypadProps {
  open: boolean;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  onNext?: () => void;
  onClose: () => void;
  hasNext?: boolean;
}

export const FloatingMathKeypad: React.FC<FloatingMathKeypadProps> = ({
  open,
  label,
  value,
  onChange,
  onNext,
  onClose,
  hasNext = true,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const safeValue = sanitizeShortAnswerValue(value);

  const handleDigit = (digit: string) => {
    if (safeValue.length >= SHORT_ANSWER_MAX_LEN) return;
    onChange(sanitizeShortAnswerValue(safeValue + digit));
  };

  const handleToggleNegative = () => {
    if (safeValue.startsWith('-')) {
      onChange(safeValue.slice(1));
      return;
    }
    if (safeValue.length >= SHORT_ANSWER_MAX_LEN) return;
    onChange(sanitizeShortAnswerValue('-' + safeValue));
  };

  const handleDecimal = () => {
    if (safeValue.length >= SHORT_ANSWER_MAX_LEN) return;
    if (safeValue.includes(',') || safeValue.includes('.')) return;
    if (safeValue.length === 0 || safeValue === '-') {
      // Nếu chưa nhập số trước dấu phẩy, tự chèn 0, nếu còn đủ chỗ (<= 4 ký tự)
      const candidate = safeValue + '0,';
      if (candidate.length <= SHORT_ANSWER_MAX_LEN) {
        onChange(candidate);
      }
      return;
    }
    onChange(sanitizeShortAnswerValue(safeValue + ','));
  };

  const handleBackspace = () => {
    if (safeValue.length === 0) return;
    onChange(safeValue.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      onClose();
    }
  };

  // Prevent button taps from blurring the active short-answer input
  const keepFocus = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
  };

  const slots = Array.from({ length: SHORT_ANSWER_MAX_LEN }, (_, idx) => safeValue[idx] || '');

  const numBtnClass =
    'flex h-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[18px] font-bold text-[#0F172A] tabular-nums shadow-2xs transition-colors hover:border-[#136F63] hover:bg-[#F0FDFA] hover:text-[#136F63] active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:border-teal-400 dark:hover:bg-slate-700';

  const utilBtnClass =
    'flex h-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[15px] font-bold text-[#334155] transition-colors hover:border-[#136F63] hover:bg-[#E0F2FE]/60 hover:text-[#136F63] active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700';

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Bàn phím số ảo Toán học"
      onMouseDown={keepFocus}
      className="no-print fixed right-4 bottom-4 z-[120] w-[308px] max-w-[calc(100vw-24px)] rounded-[10px] border-2 border-[#136F63] bg-white shadow-2xl dark:border-teal-500 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 rounded-t-[8px] bg-[#136F63] px-3 py-2 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Keyboard className="h-4 w-4 shrink-0 text-emerald-200" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12.5px] font-bold">Bàn phím Toán · {label}</div>
            <div className="text-[10.5px] text-emerald-100">
              Chuẩn phiếu tô 2025 · Tối đa 4 ký tự
            </div>
          </div>
        </div>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onClose}
          title="Đóng bàn phím số ảo (Esc)"
          aria-label="Đóng bàn phím số ảo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-white/15 text-white transition hover:bg-white/25"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 4-Character OMR Slot Preview */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex items-center gap-1.5">
          {slots.map((ch, idx) => (
            <div
              key={idx}
              className={`flex h-10 w-10 items-center justify-center rounded-[6px] border-2 font-mono text-[18px] font-extrabold tabular-nums transition-colors ${
                ch
                  ? 'border-[#136F63] bg-white text-[#136F63] dark:border-teal-400 dark:bg-slate-900 dark:text-teal-300'
                  : idx === safeValue.length
                    ? 'border-[#136F63]/50 bg-emerald-50/50 text-slate-400 dark:border-teal-700 dark:bg-slate-900'
                    : 'border-[#CBD5E1] bg-white/70 text-slate-300 dark:border-slate-700 dark:bg-slate-900/50'
              }`}
            >
              {ch || '·'}
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="font-mono text-[12px] font-bold text-[#136F63] tabular-nums dark:text-teal-300">
            {safeValue.length}/{SHORT_ANSWER_MAX_LEN}
          </div>
          <div className="text-[10px] text-[#64748B] dark:text-slate-400">ký tự</div>
        </div>
      </div>

      {/* 48x48 Touch Keypad Grid */}
      <div className="grid grid-cols-4 gap-2 p-3">
        {/* Row 1: 7 8 9 Backspace */}
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('7')} className={numBtnClass}>
          7
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('8')} className={numBtnClass}>
          8
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('9')} className={numBtnClass}>
          9
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={handleBackspace}
          title="Xóa lùi (Backspace)"
          aria-label="Xóa lùi"
          className="flex h-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] text-[#B45309] transition-colors hover:bg-[#FDE68A] active:scale-[0.97] dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200"
        >
          <Delete className="h-5 w-5" />
        </button>

        {/* Row 2: 4 5 6 Clear */}
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('4')} className={numBtnClass}>
          4
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('5')} className={numBtnClass}>
          5
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('6')} className={numBtnClass}>
          6
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={handleClear}
          title="Xóa hết (C)"
          aria-label="Xóa hết"
          className="flex h-12 min-h-[48px] min-w-[48px] items-center justify-center gap-1 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] text-[15px] font-extrabold text-[#B91C1C] transition-colors hover:bg-[#FECACA] active:scale-[0.97] dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200"
        >
          <Eraser className="h-4 w-4" />
          <span>C</span>
        </button>

        {/* Row 3: 1 2 3 Minus (Leading only) */}
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('1')} className={numBtnClass}>
          1
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('2')} className={numBtnClass}>
          2
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('3')} className={numBtnClass}>
          3
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={handleToggleNegative}
          title="Dấu âm '-' (chỉ đặt ở đầu số)"
          aria-label="Dấu âm"
          className={`${utilBtnClass} ${
            safeValue.startsWith('-')
              ? 'border-[#136F63] bg-[#136F63] text-white hover:bg-[#0F594F] hover:text-white'
              : ''
          }`}
        >
          <span className="text-[22px] leading-none font-bold">−</span>
        </button>

        {/* Row 4: 0 | , / . | Enter (Next) */}
        <button type="button" onMouseDown={keepFocus} onClick={() => handleDigit('0')} className={numBtnClass}>
          0
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={handleDecimal}
          disabled={safeValue.includes(',') || safeValue.includes('.') || safeValue.length >= SHORT_ANSWER_MAX_LEN}
          title="Dấu thập phân (,) / (.)"
          aria-label="Dấu thập phân"
          className={`${utilBtnClass} text-[16px] font-extrabold disabled:opacity-40`}
        >
          , / .
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={handleNext}
          title={hasNext ? 'Chuyển sang câu Trả lời ngắn tiếp theo (Enter)' : 'Xong & Đóng (Enter)'}
          className="col-span-2 flex h-12 min-h-[48px] items-center justify-center gap-1.5 rounded-[8px] bg-[#136F63] px-3 text-[13.5px] font-bold text-white shadow-xs transition-colors hover:bg-[#0F594F] active:scale-[0.98]"
        >
          <CornerDownLeft className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{hasNext ? 'Câu tiếp (Enter)' : 'Xong (Enter)'}</span>
        </button>
      </div>
    </div>
  );
};
