import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  prefixIcon,
  className,
  id,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          {label}
          {props.required && !label.trim().endsWith('*') && (
            <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <div className="relative rounded-lg">
        {prefixIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            {prefixIcon}
          </div>
        )}
        <input
          id={inputId}
          ref={ref}
          className={clsx(
            'w-full text-sm rounded-lg border bg-white dark:bg-slate-800 py-2 px-3 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500',
            prefixIcon ? 'pl-9' : 'pl-3',
            error
              ? 'border-rose-400 dark:border-rose-600 bg-rose-50/20 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 focus:border-rose-500 focus:ring-rose-400/20'
              : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500',
            'disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-slate-400 dark:text-slate-500">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';
