import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Database,
  Lock,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { LicenseStatusInfo } from '../../shared/types';

interface SubscriptionExpiredViewProps {
  licenseStatus: LicenseStatusInfo | null;
  sessionToken: string | null;
  onRenewSuccess: () => void;
  onLogout: () => void;
}

export const SubscriptionExpiredView: React.FC<SubscriptionExpiredViewProps> = ({
  licenseStatus,
  sessionToken,
  onRenewSuccess,
  onLogout,
}) => {
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isTampered = licenseStatus?.state === 'clock_tampered';
  const isGraceExpired = licenseStatus?.state === 'grace_expired';

  const handleRevalidate = async () => {
    if (!window.desktopAPI || !sessionToken || isRevalidating) return;
    setIsRevalidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.desktopAPI.revalidateLicense(sessionToken);
      if (res.success) {
        setSuccessMessage('Subscription successfully revalidated! Workstation unlocked.');
        setTimeout(() => {
          onRenewSuccess();
        }, 1200);
      } else {
        setErrorMessage(res.error || 'Server rejected revalidation. Please ensure subscription is active in platform admin.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to licensing server. Check internet connectivity.');
    } finally {
      setIsRevalidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 select-none">
      <div className="max-w-xl w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        
        {/* Status Header Badge */}
        <div className="flex items-center space-x-3 mb-6">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isTampered ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}>
            {isTampered ? (
              <AlertTriangle className="w-6 h-6 stroke-[2]" />
            ) : (
              <ShieldAlert className="w-6 h-6 stroke-[2]" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              {isTampered
                ? 'System Clock Verification Required'
                : isGraceExpired
                ? 'Offline Grace Period Expired'
                : 'School Subscription Expired'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Workstation Security & Data Protection Enforced
            </p>
          </div>
        </div>

        {/* Informative Explanation */}
        <div className="space-y-4 text-xs leading-relaxed text-slate-300">
          <p>
            {isTampered
              ? 'A backward system clock modification or abnormal time discrepancy was detected. To prevent license manipulation, the desktop application has entered a protected lock state.'
              : isGraceExpired
              ? 'This workstation has exceeded the maximum offline grace period without connecting to the cloud authentication service. Please connect to the internet to verify subscription status.'
              : 'The subscription for your educational institution has concluded. Normal read and write workspace operations are temporarily restricted until the subscription is renewed by the platform administrator.'}
          </p>

          {/* Data Safety Notice */}
          <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-4 flex items-start space-x-3">
            <Database className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-emerald-300 block mb-0.5">
                Local Database & Historical Records Intact
              </span>
              <p className="text-slate-400">
                All student profiles, fee ledgers, exam grades, and local SQLite data remain completely safe and preserved on this computer. No records have been deleted or altered.
              </p>
            </div>
          </div>

          {/* Workstation Details Card */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 space-y-1.5 font-mono text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Institution:</span>
              <span className="text-slate-200 font-sans font-semibold">{licenseStatus?.schoolName || 'School Workstation'}</span>
            </div>
            <div className="flex justify-between">
              <span>Device ID:</span>
              <span className="text-slate-300">{licenseStatus?.deviceId || 'Unregistered'}</span>
            </div>
            <div className="flex justify-between">
              <span>Plan / Status:</span>
              <span className="text-amber-400 uppercase font-semibold">{licenseStatus?.planName || licenseStatus?.state}</span>
            </div>
            {licenseStatus?.expiresAt && (
              <div className="flex justify-between">
                <span>Expiration Date:</span>
                <span className="text-slate-300">{new Date(licenseStatus.expiresAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Alerts / Error feedback */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleRevalidate}
            disabled={isRevalidating}
            className="w-full sm:flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 text-white font-medium text-xs rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
            <span>{isRevalidating ? 'Revalidating with Server...' : 'Revalidate & Renew Online'}</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full sm:w-auto py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Support Help */}
        <p className="mt-5 text-center text-[11px] text-slate-500">
          Need renewal assistance? Contact your platform administrator or visit the cloud management portal.
        </p>

      </div>
    </div>
  );
};
