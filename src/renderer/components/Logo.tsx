import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
  variant = 'auto',
}) => {
  const sizeMap = {
    sm: { box: 'w-7 h-7', icon: 16, text: 'text-sm' },
    md: { box: 'w-9 h-9', icon: 20, text: 'text-base' },
    lg: { box: 'w-12 h-12', icon: 26, text: 'text-lg' },
    xl: { box: 'w-16 h-16', icon: 34, text: 'text-2xl' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`inline-flex items-center space-x-2.5 select-none ${className}`}>
      {/* Brand Icon SVG Emblem */}
      <div
        className={`${currentSize.box} rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 flex items-center justify-center text-white shadow-xs border border-indigo-500/30 shrink-0 transition-transform hover:scale-105`}
        title="School Management Software"
      >
        <svg
          width={currentSize.icon}
          height={currentSize.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-xs"
        >
          {/* Graduation Cap Crest */}
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col text-left leading-tight">
          <span className={`font-bold tracking-tight text-slate-900 dark:text-white ${currentSize.text}`}>
            School Management Software
          </span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 dark:text-indigo-400">
            Enterprise Desktop Edition
          </span>
        </div>
      )}
    </div>
  );
};
