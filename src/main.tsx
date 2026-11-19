import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import 'katex/dist/katex.min.css';
import App from './App.tsx';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Đã xảy ra sự cố hiển thị giao diện.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('TeachLearn Board UI error:', error);
  }

  handleHardReset = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // Ignore cleanup failures and reload
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] p-6 text-[#334155]">
          <div className="w-full max-w-md rounded-[8px] border border-[#E2E8F0] bg-white p-6 shadow-lg">
            <h1 className="text-[18px] font-semibold text-[#0F172A]">
              TeachLearn Board đang cần làm mới bộ nhớ đệm
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#334155]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.handleHardReset}
              className="btn-glossy-3d-active mt-4 inline-flex items-center justify-center rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
            >
              Xóa bộ nhớ đệm &amp; Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onOfflineReady() {
        try {
          localStorage.setItem('tl_board_pwa_offline_ready', '1');
        } catch {
          // Ignore storage restrictions
        }
      },
      onRegisterError(err) {
        console.warn('PWA Service Worker registration warning:', err);
      },
    });
  } else if ('serviceWorker' in navigator) {
    // Clean up any stale dev SW that could serve mismatched cached ES modules
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((r) => {
          r.unregister().catch(() => {});
        });
      })
      .catch(() => {});
  }
} catch {
  // Fallback safely if SW registration is restricted in iframe
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
