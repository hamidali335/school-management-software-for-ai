import React, { useState } from 'react';
import { Minus, Square, X, School } from 'lucide-react';
import { APP_METADATA } from '../../shared/constants';

interface DesktopTitleBarProps {
  schoolName?: string;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({ schoolName }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () => {
    if (window.desktopAPI?.minimizeWindow) {
      window.desktopAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.desktopAPI?.maximizeWindow) {
      window.desktopAPI.maximizeWindow();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (window.desktopAPI?.closeWindow) {
      window.desktopAPI.closeWindow();
    }
  };

  return (
    <div className="h-8 w-full bg-white dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between select-none z-50 text-slate-700 dark:text-slate-300 window-drag-region shrink-0 text-xs">
      {/* Left: Brand Crest & Application Title */}
      <div className="flex items-center space-x-2 pl-3 window-no-drag">
        <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-white">
          <School className="w-2.5 h-2.5" />
        </div>
        <span className="font-semibold text-[11px] text-slate-800 dark:text-slate-200">
          {APP_METADATA.APP_NAME}
        </span>
        {schoolName && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal truncate max-w-xs">
            — {schoolName}
          </span>
        )}
      </div>

      {/* Center: Subtle Draggable Area */}
      <div className="flex-1 h-full window-drag-region" />

      {/* Right: Window Controls */}
      <div className="flex items-center h-full window-no-drag">
        <button
          type="button"
          onClick={handleMinimize}
          className="h-full px-3.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className="h-full px-3.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors"
          title={isMaximized ? 'Restore Down' : 'Maximize'}
        >
          <Square className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="h-full px-4 hover:bg-rose-600 text-slate-500 hover:text-white dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
