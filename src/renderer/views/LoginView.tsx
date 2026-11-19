import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  CalendarCheck2,
  ReceiptText,
  Building,
  KeyRound,
  X,
} from 'lucide-react';
import { UserProfile } from '../../shared/types';
import { APP_METADATA } from '../../shared/constants';
import { Logo } from '../components/Logo';

interface LoginViewProps {
  onLoginSuccess: (user: UserProfile, token: string) => void;
  schoolName?: string;
  isProvisioned?: boolean;
  onProvisionComplete?: (schoolName?: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  schoolName = '',
  isProvisioned = false,
  onProvisionComplete,
}) => {
  const [identifier, setIdentifier] = useState(() => {
    try {
      return localStorage.getItem('sms_remembered_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState(() => {
    try {
      return localStorage.getItem('sms_remembered_school_code') || '';
    } catch {
      return '';
    }
  });
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem('sms_remember_me') === 'true';
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hidden internal configuration modal for deployment engineers
  const [showDeployConfig, setShowDeployConfig] = useState(false);
  const [isTechAuthorized, setIsTechAuthorized] = useState(false);
  const [techPin, setTechPin] = useState('');
  const [techToken, setTechToken] = useState<string | null>(null);
  const [techPinError, setTechPinError] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState('');
  const [deploySaveLoading, setDeploySaveLoading] = useState(false);
  const [deploySaveSuccess, setDeploySaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDeployConfig(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Please enter both your username/email and account password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    // Save or clear remember-me preference
    try {
      if (rememberMe) {
        localStorage.setItem('sms_remember_me', 'true');
        localStorage.setItem('sms_remembered_username', identifier.trim());
        if (schoolCode.trim()) {
          localStorage.setItem('sms_remembered_school_code', schoolCode.trim().toUpperCase());
        }
      } else {
        localStorage.removeItem('sms_remember_me');
        localStorage.removeItem('sms_remembered_username');
        localStorage.removeItem('sms_remembered_school_code');
      }
    } catch {}

    try {
      if (window.desktopAPI) {
        // Backend URL is resolved authoritative-first in the main process via DeploymentConfigService
        const result = await window.desktopAPI.login({
          identifier: identifier.trim(),
          password,
          schoolCode: schoolCode.trim() ? schoolCode.trim().toUpperCase() : undefined,
        });

        if (result.success && result.user && result.token) {
          if (onProvisionComplete && result.schoolName) {
            onProvisionComplete(result.schoolName);
          }
          onLoginSuccess(result.user, result.token);
        } else {
          setErrorMessage(result.error || 'Authentication failed. Please verify your credentials.');
        }
      } else {
        setErrorMessage('Desktop API unavailable. Please launch from the desktop application.');
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Unable to connect to the authentication service. Please check your network connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorizeTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!techPin.trim()) {
      setTechPinError('Please enter technician authorization key.');
      return;
    }
    setTechPinError(null);

    if (window.desktopAPI?.verifyTechnicianAccess) {
      try {
        const res = await window.desktopAPI.verifyTechnicianAccess(techPin.trim());
        if (res.success && res.token) {
          setTechToken(res.token);
          setIsTechAuthorized(true);
          setTechPinError(null);
          // Query current resolved configuration from main process
          const cfgRes = await window.desktopAPI.getDeploymentConfig(res.token);
          if (cfgRes?.success && cfgRes.config?.cloudApiBaseUrl) {
            setDeployUrl(cfgRes.config.cloudApiBaseUrl);
          }
        } else {
          setTechPinError(res.error || 'Technician authorization failed.');
        }
      } catch (err: any) {
        setTechPinError(err?.message || 'Verification service error.');
      }
    } else {
      setTechPinError('Desktop API unavailable.');
    }
  };

  const handleSaveDeployConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployUrl.trim()) return;
    setDeploySaveLoading(true);
    setTechPinError(null);

    try {
      if (window.desktopAPI?.setDeploymentConfig && techToken) {
        const res = await window.desktopAPI.setDeploymentConfig(techToken, deployUrl.trim());
        if (res.success && res.config) {
          setDeploySaveSuccess(`Backend URL configured: ${res.config.cloudApiBaseUrl}`);
          setTimeout(() => {
            setShowDeployConfig(false);
            setIsTechAuthorized(false);
            setTechPin('');
            setTechToken(null);
            setTechPinError(null);
            setDeploySaveSuccess(null);
          }, 1200);
        } else {
          setTechPinError(res.error || 'Failed to update deployment configuration.');
        }
      } else {
        setShowDeployConfig(false);
        setIsTechAuthorized(false);
        setTechPin('');
        setTechToken(null);
      }
    } catch (err: any) {
      setTechPinError(err?.message || 'Error updating deployment configuration.');
    } finally {
      setDeploySaveLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-slate-50 dark:bg-slate-950 select-none overflow-hidden font-sans">
      {/* ─── LEFT SPLIT: BRAND & INSTITUTIONAL SHOWCASE (45% Width on Desktop) ─── */}
      <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white p-12 flex-col justify-between relative overflow-hidden shrink-0">
        {/* Subtle Decorative Shapes */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        {/* Top: Logo & Title */}
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15">
            <Logo size="md" />
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm text-white tracking-tight">
                {APP_METADATA.APP_NAME}
              </span>
              <span className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">
                Enterprise Desktop Edition
              </span>
            </div>
          </div>
        </div>

        {/* Middle: Value Proposition & Feature Highlights */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 mb-3">
              Comprehensive Educational Management
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
              Unified Administrative & Academic Operations
            </h2>
            <p className="mt-3 text-sm text-indigo-100/90 leading-relaxed">
              Engineered for school owners, headmasters, teachers, and accountants. Manage admissions,
              attendance, tuition billing, examination gazettes, and payroll seamlessly.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-3.5 pt-2">
            <div className="flex items-center space-x-3 text-xs text-indigo-100">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-indigo-300">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span>Permanent Student Records, Admissions & Session Rollovers</span>
            </div>

            <div className="flex items-center space-x-3 text-xs text-indigo-100">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-indigo-300">
                <ReceiptText className="w-4 h-4" />
              </div>
              <span>Automated Fee Challans, Reconciled Cash Collections & Receipts</span>
            </div>

            <div className="flex items-center space-x-3 text-xs text-indigo-100">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-indigo-300">
                <CalendarCheck2 className="w-4 h-4" />
              </div>
              <span>Daily Student Attendance & Staff Payroll Registers</span>
            </div>
          </div>
        </div>

        {/* Bottom: Security & Durability Seal */}
        <div className="relative z-10 border-t border-white/10 pt-4 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Encrypted Offline-First Storage with Cloud Sync</span>
          </div>
          <span className="text-[11px] font-mono opacity-80">v{APP_METADATA.VERSION}</span>
        </div>
      </div>

      {/* ─── RIGHT SPLIT: CLEAN & FOCUSED AUTHENTICATION FORM ─── */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto bg-white dark:bg-slate-900 transition-colors">
        <div className="max-w-md w-full mx-auto my-auto py-4">
          
          {/* Header */}
          <div className="mb-6">
            <div className="lg:hidden mb-4">
              <Logo size="md" showText={true} />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sign In to Your Workstation
            </h1>

            {isProvisioned && schoolName ? (
              <div className="mt-1.5 flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <Building className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{schoolName}</span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enter your registered school account credentials to access your workspace.
              </p>
            )}
          </div>

          {/* Dismissible Error Alert */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-start justify-between space-x-2 animate-in fade-in duration-150">
              <div className="flex items-start space-x-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug break-words">{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 p-0.5 rounded shrink-0"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Username or Registered Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. admin@school.edu.pk or admin"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition shadow-2xs"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Input with Show/Hide */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center space-x-1 focus:outline-none"
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition shadow-2xs"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* School Code (Optional for multi-school or campus accounts) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                School Code <span className="text-slate-400 dark:text-slate-500 font-normal">(Optional for single schools)</span>
              </label>
              <input
                type="text"
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                placeholder="e.g. SCH01"
                className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition uppercase shadow-2xs"
                disabled={loading}
              />
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  disabled={loading}
                />
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Remember my username
                </span>
              </label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-xs transition-all shadow-sm disabled:opacity-50 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Clean Footer */}
        <div className="max-w-md w-full mx-auto pt-6 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Authorized Institutional Access Only</span>
          </div>

          {/* Discreet deployment configuration gear for technicians */}
          <button
            type="button"
            onClick={() => setShowDeployConfig(true)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[10px] font-mono transition"
            title="Deployment Connection Settings"
          >
            Server Config
          </button>
        </div>
      </div>

      {/* ─── PROTECTED ADMINISTRATIVE DEPLOYMENT CONFIGURATION MODAL ─── */}
      {showDeployConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Deployment Server Configuration
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Configure central cloud endpoint for this workstation installation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeployConfig(false);
                  setIsTechAuthorized(false);
                  setTechPin('');
                  setTechPinError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isTechAuthorized ? (
              <form onSubmit={handleAuthorizeTech} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Technician Security Passkey
                  </label>
                  <input
                    type="password"
                    value={techPin}
                    onChange={(e) => setTechPin(e.target.value)}
                    placeholder="Enter technician authorization key"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
                    required
                    autoFocus
                  />
                  {techPinError && (
                    <p className="text-[11px] text-rose-500 font-medium mt-1.5">{techPinError}</p>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Access restricted to authorized installation technicians and IT deployment engineers.
                  </p>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeployConfig(false);
                      setIsTechAuthorized(false);
                      setTechPin('');
                      setTechToken(null);
                      setTechPinError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Unlock Configuration
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveDeployConfig} className="space-y-4">
                {deploySaveSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{deploySaveSuccess}</span>
                  </div>
                )}
                {techPinError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{techPinError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Authoritative Cloud API Base URL
                  </label>
                  <input
                    type="text"
                    value={deployUrl}
                    onChange={(e) => setDeployUrl(e.target.value)}
                    placeholder="https://your-domain/api/v1"
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
                    required
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Managed central deployment endpoint. Mandates secure HTTPS transport in production installations.
                  </p>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    disabled={deploySaveLoading}
                    onClick={() => {
                      setShowDeployConfig(false);
                      setIsTechAuthorized(false);
                      setTechPin('');
                      setTechToken(null);
                      setTechPinError(null);
                      setDeploySaveSuccess(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deploySaveLoading}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {deploySaveLoading ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Configuration</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
