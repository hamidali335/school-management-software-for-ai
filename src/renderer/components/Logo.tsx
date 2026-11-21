import React from 'react';
import appLogo from '../assets/app-logo.png';

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
}) => {
  const sizeMap = {
    sm: { box: 'w-9 h-9', text: 'text-base' },
    md: { box: 'w-11 h-11', text: 'text-lg' },
    lg: { box: 'w-14 h-14', text: 'text-xl' },
    xl: { box: 'w-20 h-20', text: 'text-2xl' },
  };
  const currentSize = sizeMap[size];

  return (
    <div className={`inline-flex items-center space-x-2.5 select-none ${className}`}>
      <img
        src={appLogo}
        alt="School OS"
        className={`${currentSize.box} object-contain shrink-0`}
        title="School Management Software"
      />
      {showText && (
        <div className="flex flex-col text-left leading-tight">
          <span className={`font-bold tracking-tight text-slate-900 dark:text-white ${currentSize.text}`}>
            School OS
          </span>
          <span className="text-xs uppercase tracking-wider font-semibold text-[#2563EB] dark:text-blue-400">
            Desktop Edition
          </span>
        </div>
      )}
    </div>
  );
};
