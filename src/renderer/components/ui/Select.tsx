import React from 'react';
import { clsx } from 'clsx';

export interface SelectOption {
  label: string;
  value: string | number;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  error?: string;
  helperText?: string;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  options,
  children,
  error,
  helperText,
  placeholder,
  className,
  id,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          {label}
          {props.required && !label.trim().endsWith('*') && (
            <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={clsx(
          'w-full text-sm rounded-lg border bg-white dark:bg-slate-800 py-2 px-3 transition-colors appearance-none cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500',
          error
            ? 'border-rose-400 dark:border-rose-600 bg-rose-50/20 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200'
            : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100',
          'disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      >
        {placeholder && <option value="" className="dark:bg-slate-800 dark:text-slate-400">{placeholder}</option>}
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} className="dark:bg-slate-800 dark:text-slate-100">
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-slate-400 dark:text-slate-500">{helperText}</p>}
    </div>
  );
});

Select.displayName = 'Select';
