import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const recentMessagesRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration: number = 4500) => {
      if (!message) return;

      // Deduplication check: prevent identical error/toast flooding within 3.5 seconds
      const dedupeKey = `${type}:${message}`;
      const now = Date.now();
      const lastSeen = recentMessagesRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < 3500) {
        return;
      }
      recentMessagesRef.current.set(dedupeKey, now);

      const id = `toast_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // keep max 5 toasts visible

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast('success', message, title),
    [showToast]
  );
  const error = useCallback(
    (message: string, title?: string) => showToast('error', message, title),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title?: string) => showToast('warning', message, title),
    [showToast]
  );
  const info = useCallback(
    (message: string, title?: string) => showToast('info', message, title),
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        success,
        error,
        warning,
        info,
        dismissToast,
        clearAllToasts,
      }}
    >
      {children}

      {/* Floating Toast Notification Container */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none select-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const typeConfig = {
            success: {
              bg: 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-slate-100',
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
              borderAccent: 'border-l-4 border-l-emerald-500',
            },
            error: {
              bg: 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-800 text-slate-800 dark:text-slate-100',
              icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
              borderAccent: 'border-l-4 border-l-rose-500',
            },
            warning: {
              bg: 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800 text-slate-800 dark:text-slate-100',
              icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
              borderAccent: 'border-l-4 border-l-amber-500',
            },
            info: {
              bg: 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 text-slate-800 dark:text-slate-100',
              icon: <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
              borderAccent: 'border-l-4 border-l-indigo-500',
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start space-x-2.5 transition-all duration-200 animate-in slide-in-from-bottom-2 ${typeConfig.bg} ${typeConfig.borderAccent}`}
            >
              <div className="mt-0.5">{typeConfig.icon}</div>
              <div className="flex-1 min-w-0 pr-1">
                {toast.title && (
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs leading-snug text-slate-600 dark:text-slate-300 break-words mt-0.5">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition"
                title="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
