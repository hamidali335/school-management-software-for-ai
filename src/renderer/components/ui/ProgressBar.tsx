import React from 'react';
import { clsx } from 'clsx';

export interface ProgressBarProps {
  value: number; // 0 to 100
  label?: string;
  showPercent?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  showPercent = false,
  variant = 'primary',
  size = 'md',
  className,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  const variants = {
    primary: 'bg-indigo-600 dark:bg-indigo-500',
    success: 'bg-emerald-600 dark:bg-emerald-500',
    warning: 'bg-amber-500 dark:bg-amber-400',
    danger: 'bg-rose-600 dark:bg-rose-500',
  };

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
  };

  return (
    <div className={clsx('w-full space-y-1', className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
          {label && <span>{label}</span>}
          {showPercent && <span className="font-mono">{Math.round(clampedValue)}%</span>}
        </div>
      )}
      <div className={clsx('w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden', heights[size])}>
        <div
          className={clsx('h-full transition-all duration-300 rounded-full', variants[variant])}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
};
