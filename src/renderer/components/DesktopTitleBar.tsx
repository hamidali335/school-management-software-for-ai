import React, { useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import appLogo from '../assets/app-logo.png';
import { APP_METADATA } from '../../shared/constants';

interface DesktopTitleBarProps {
  schoolName?: string;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({ schoolName }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <div className="h-9 w-full bg-[#0F172A] border-b border-slate-800 flex items-center justify-between select-none z-50 text-slate-100 window-drag-region shrink-0">
      <div className="flex items-center space-x-2.5 pl-3.5 window-no-drag">
        <img src={appLogo} alt="School OS" className="w-5 h-5 object-contain" />
        <span className="font-semibold text-[13px] tracking-tight text-white">
          {APP_METADATA.APP_NAME}
        </span>
        {schoolName && (
          <span className="text-xs text-slate-400 font-normal truncate max-w-xs">
            — {schoolName}
          </span>
        )}
      </div>

      <div className="flex-1 h-full window-drag-region" />

      <div className="flex items-center h-full window-no-drag">
        <button
          type="button"
          onClick={() => window.desktopAPI?.minimizeWindow?.()}
          className="h-full px-3.5 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            window.desktopAPI?.maximizeWindow?.();
            setIsMaximized(!isMaximized);
          }}
          className="h-full px-3.5 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => window.desktopAPI?.closeWindow?.()}
          className="h-full px-3.5 hover:bg-[#E81123] text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
