import React from 'react';
import { clsx } from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'muted' | 'accent';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  ...props
}) => {
  const variants = {
    default: 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs',
    muted: 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-800 shadow-none',
    accent: 'bg-indigo-50/40 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/40 shadow-2xs',
  };

  return (
    <div
      className={clsx(
        'border rounded-xl transition-all',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={clsx('px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between', className)}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className,
  ...props
}) => (
  <h3 className={clsx('text-sm font-bold text-slate-900 dark:text-white', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className,
  ...props
}) => (
  <p className={clsx('text-xs text-slate-500 dark:text-slate-400 mt-1', className)} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={clsx('p-5 space-y-4', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={clsx(
      'px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 rounded-b-xl flex items-center justify-between',
      className
    )}
    {...props}
  >
    {children}
  </div>
);
