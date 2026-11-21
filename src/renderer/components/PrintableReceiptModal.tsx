import React from 'react';
import { Printer, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import appLogo from '../assets/app-logo.png';

export interface PrintableReceiptData {
  receiptNo: string;
  provisionalReceiptNo?: string;
  isProvisional?: boolean;
  transactionId?: string;
  studentName: string;
  admissionNo?: string;
  invoiceNo?: string;
  amount: number;
  method: string;
  date: string;
  balanceAfter?: number;
  overpaid?: boolean;
  overpaidAmount?: number;
  schoolName?: string;
  syncStatus?: 'synced' | 'pending';
}

interface PrintableReceiptModalProps {
  receipt: PrintableReceiptData | null;
  onClose: () => void;
}

export const PrintableReceiptModal: React.FC<PrintableReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#181B24] rounded-[14px] border border-[#E5E7EB] dark:border-[#2A2F3D] w-full max-w-[480px] shadow-xl overflow-hidden">
        {/* Modal Header (hidden in print) */}
        <div className="no-print flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Fee Payment Receipt</h3>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 px-3 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold flex items-center space-x-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Receipt</span>
            </button>
            <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 space-y-4 text-sm text-slate-900 dark:text-slate-100 tabular-nums">
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <img src={appLogo} alt="Logo" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <h2 className="text-lg font-bold">{receipt.schoolName || 'School Management Software'}</h2>
            <p className="text-xs text-slate-500">Official Tuition Fee Payment Receipt</p>
            {receipt.isProvisional && (
              <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#FFFBEB] border border-amber-300 text-[#B45309] text-xs font-bold tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>PROVISIONAL RECEIPT — PENDING CLOUD SYNC</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-y-2 text-xs">
            <span className="text-slate-500">Receipt No:</span>
            <span className="font-mono font-bold text-right">{receipt.receiptNo}</span>

            {receipt.provisionalReceiptNo && receipt.provisionalReceiptNo !== receipt.receiptNo && (
              <>
                <span className="text-slate-500">Provisional Ref:</span>
                <span className="font-mono text-right text-slate-600">{receipt.provisionalReceiptNo}</span>
              </>
            )}

            <span className="text-slate-500">Date:</span>
            <span className="text-right">{receipt.date}</span>

            <span className="text-slate-500">Student:</span>
            <span className="font-semibold text-right">{receipt.studentName}</span>

            {receipt.admissionNo && (
              <>
                <span className="text-slate-500">Admission No:</span>
                <span className="text-right">{receipt.admissionNo}</span>
              </>
            )}

            {receipt.invoiceNo && (
              <>
                <span className="text-slate-500">Challan / Invoice:</span>
                <span className="text-right">{receipt.invoiceNo}</span>
              </>
            )}

            <span className="text-slate-500">Payment Method:</span>
            <span className="text-right capitalize">{receipt.method}</span>

            {receipt.transactionId && (
              <>
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono text-[10px] text-right truncate">{receipt.transactionId}</span>
              </>
            )}
          </div>

          <div className="border-t border-b border-dashed border-slate-300 dark:border-slate-700 py-3 flex items-center justify-between">
            <span className="font-semibold">Amount Paid</span>
            <span className="text-xl font-bold text-[#047857] dark:text-emerald-400">
              PKR {receipt.amount.toLocaleString()}
            </span>
          </div>

          {receipt.overpaid && (
            <div className="p-2.5 rounded-lg bg-[#FFFBEB] border border-amber-200 text-[#B45309] text-xs font-medium">
              Overpayment flagged for administrative review (+PKR {(receipt.overpaidAmount || 0).toLocaleString()}).
            </div>
          )}

          {receipt.syncStatus === 'pending' ? (
            <div className="flex items-center space-x-1.5 text-xs text-[#B45309]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Saved offline. An official receipt number will be confirmed once online.</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs text-[#047857]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Recorded in immutable payment ledger.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
