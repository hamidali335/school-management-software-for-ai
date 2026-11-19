import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading,
  loading,
}) => {
  const isDialogLoading = Boolean(isLoading || loading);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isDialogLoading}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isDialogLoading}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex items-start space-x-3 py-1">
        <div
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
            variant === 'danger'
              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
              : variant === 'warning'
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
              : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {variant === 'danger' || variant === 'warning' ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Info className="w-4 h-4" />
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1.5">{message}</p>
      </div>
    </Modal>
  );
};
