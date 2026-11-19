import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

interface ToolErrorBoundaryProps {
  toolName: string;
  children: React.ReactNode;
  onClose?: () => void;
  compact?: boolean;
}

interface ToolErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Isolated Error Boundary for auxiliary tools (Scientific Calculator, 3D Lab,
 * Function Grapher, GeoGebra Quick Plotter) so any sub-tool runtime error never
 * crashes or blanks the main Smartboard workspace.
 */
export class ToolErrorBoundary extends React.Component<
  ToolErrorBoundaryProps,
  ToolErrorBoundaryState
> {
  constructor(props: ToolErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ToolErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Công cụ tạm thời gặp sự cố hiển thị.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ToolErrorBoundary: ${this.props.toolName}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.compact) {
      return (
        <div className="no-print fixed right-5 bottom-20 z-[75] w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-[10px] border border-amber-300 bg-white text-slate-800 shadow-2xl">
          <div className="flex items-center justify-between bg-[#136F63] px-3 py-2 text-white">
            <div className="flex items-center gap-1.5 text-[12.5px] font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span className="truncate">{this.props.toolName}</span>
            </div>
            {this.props.onClose && (
              <button
                type="button"
                onClick={this.props.onClose}
                aria-label="Đóng công cụ"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#0F594F]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-2.5 p-3.5">
            <p className="text-[12.5px] leading-relaxed text-slate-600">
              Công cụ gặp lỗi tạm thời nhưng <strong>Bảng trắng chính vẫn an toàn</strong>. Thầy có thể khởi động lại công cụ này ngay:
            </p>
            <div className="rounded bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] text-amber-900">
              {this.state.errorMessage}
            </div>
            <div className="flex items-center justify-end gap-2">
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="rounded-[6px] border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              )}
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0F594F]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Khởi động lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[8px] border border-amber-200 bg-white p-6 text-slate-800 shadow-xs dark:border-amber-900/50 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
              {this.props.toolName} tạm thời gặp sự cố hiển thị
            </h3>
            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              Các tính năng khác và Bảng trắng chính của TeachLearn Board vẫn hoạt động bình thường. Nhấn nút bên dưới để tải lại công cụ này.
            </p>
            <div className="rounded-[6px] border border-amber-200 bg-amber-50/70 px-3 py-1.5 font-mono text-[11.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#0F594F]"
            >
              <RotateCcw className="h-4 w-4" />
              Tải lại {this.props.toolName}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
