import React from 'react';
import { clsx } from 'clsx';
import { Search, Loader2 } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (val: any, item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string;
  isLoading?: boolean;
  loading?: boolean;
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  className?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor = (item: any, i: number) => item?.id || String(i),
  isLoading,
  loading,
  emptyState,
  emptyMessage = 'No records found',
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  actions,
  className,
  onRowClick,
}: DataTableProps<T>) {
  const isTableLoading = Boolean(isLoading || loading);

  return (
    <div className={clsx('space-y-3', className)}>
      {(onSearchChange !== undefined || actions) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3">
          {onSearchChange !== undefined ? (
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchValue || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          ) : <div />}
          {actions && <div className="flex items-center space-x-2 shrink-0">{actions}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider select-none">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={clsx(
                    'py-3 px-4 font-semibold',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isTableLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>Loading data from encrypted database...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  {emptyState || emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={keyExtractor(item, index)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={clsx(
                    'transition-colors',
                    onRowClick ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(
                        'py-3 px-4',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                        col.className
                      )}
                    >
                      {col.render
                        ? col.render((item as any)[col.key], item, index)
                        : (item as any)[col.key] !== undefined && (item as any)[col.key] !== null
                        ? String((item as any)[col.key])
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
