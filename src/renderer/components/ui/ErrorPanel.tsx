import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './Button';

export interface ErrorPanelProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'card';
  className?: string;
}

export const ErrorPanel: React.FC<ErrorPanelProps> = ({
  title,
  message,
  onRetry,
  onDismiss,
  variant = 'inline',
  className,
}) => {
  if (variant === 'card') {
    return (
      <div
        className={clsx(
          'p-6 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col items-center text-center space-y-3',
          className
        )}
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {title || 'Operation Could Not Complete'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
            {message}
          </p>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={onRetry}
          >
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150',
        className
      )}
    >
      <div className="flex items-center space-x-2.5 min-w-0">
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
        <div className="truncate">
          {title && <span className="font-bold mr-1.5">{title}:</span>}
          <span>{message}</span>
        </div>
      </div>
      <div className="flex items-center space-x-1.5 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-[11px] font-semibold underline hover:text-rose-900 dark:hover:text-rose-100"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
