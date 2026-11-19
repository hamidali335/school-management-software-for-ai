import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DesktopTitleBar } from './components/DesktopTitleBar';
import { Sidebar } from './components/Sidebar';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { DashboardView } from './views/DashboardView';
import { StudentsView } from './views/StudentsView';
import { AttendanceView } from './views/AttendanceView';
import { FeesView } from './views/FeesView';
import { AcademicsView } from './views/AcademicsView';
import { ExamsView } from './views/ExamsView';
import { StaffView } from './views/StaffView';
import { TimetableView } from './views/TimetableView';
import { AccountsView } from './views/AccountsView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { SubscriptionExpiredView } from './views/SubscriptionExpiredView';
import {
  DashboardMetrics,
  DatabaseStatus,
  SyncStatus,
  AppInfo,
  UserProfile,
  LicenseStatusInfo,
} from '../shared/types';
import { Logo } from './components/Logo';

const AppContent: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [hasAdmin, setHasAdmin] = useState<boolean>(false);
  const [schoolName, setSchoolName] = useState<string>('');

  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  // Listen for subscription status changes broadcast from main process
  useEffect(() => {
    if (window.desktopAPI?.onSubscriptionStatusChanged) {
      const cleanup = window.desktopAPI.onSubscriptionStatusChanged((status) => {
        setLicenseStatus(status);
      });
      return cleanup;
    }
  }, []);

  // Restore session from localStorage if valid & check provisioning
  useEffect(() => {
    async function checkExistingSession() {
      if (window.desktopAPI) {
        try {
          const prov = await window.desktopAPI.getProvisioningStatus();
          setHasAdmin(prov.hasAdmin);
          if (prov.schoolName) {
            setSchoolName(prov.schoolName);
          }
        } catch (err) {
          console.error('Provisioning check error:', err);
        }

        const storedToken = localStorage.getItem('sms_desktop_session_token');
        if (storedToken) {
          try {
            const res = await window.desktopAPI.getCurrentSession(storedToken);
            if (res.isValid && res.user) {
              setCurrentUser(res.user);
              setSessionToken(storedToken);
            } else {
              localStorage.removeItem('sms_desktop_session_token');
            }
          } catch {
            localStorage.removeItem('sms_desktop_session_token');
          }
        }
      }
      setAuthLoading(false);
    }
    checkExistingSession();
  }, []);

  const refreshData = useCallback(async () => {
    if (window.desktopAPI && sessionToken) {
      try {
        const [m, db, s, info, lic] = await Promise.all([
          window.desktopAPI.getDashboardMetrics(sessionToken).catch(() => null),
          window.desktopAPI.getDatabaseStatus(sessionToken).catch(() => null),
          window.desktopAPI.getSyncStatus(sessionToken).catch(() => null),
          window.desktopAPI.getAppInfo().catch(() => null),
          window.desktopAPI.getLicenseStatus(sessionToken).catch(() => null),
        ]);
        if (m) setMetrics(m);
        if (db) setDbStatus(db);
        if (s) setSyncStatus(s);
        if (info) setAppInfo(info);
        if (lic) setLicenseStatus(lic);
      } catch (err) {
        console.error('Failed to load application data:', err);
      }
    }
  }, [sessionToken]);

  useEffect(() => {
    if (currentUser && sessionToken) {
      refreshData();
    }
  }, [currentUser, sessionToken, refreshData]);

  const handleLoginSuccess = (user: UserProfile, token: string) => {
    setCurrentUser(user);
    if (user.schoolName) {
      setSchoolName(user.schoolName);
    }
    setSessionToken(token);
    try {
      localStorage.setItem('sms_desktop_session_token', token);
    } catch {}
    toastSuccess(`Welcome back, ${user.name}!`, 'Signed In');
  };

  const handleLogout = async () => {
    if (sessionToken && window.desktopAPI) {
      try {
        await window.desktopAPI.logout(sessionToken);
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    try {
      localStorage.removeItem('sms_desktop_session_token');
    } catch {}
    setCurrentUser(null);
    setSessionToken(null);
    setCurrentView('dashboard');
  };

  const handleTriggerSync = async () => {
    if (!window.desktopAPI || isSyncing) return;
    setIsSyncing(true);
    try {
      await window.desktopAPI.triggerSync(sessionToken || undefined);
      await refreshData();
      toastSuccess('Synchronization completed successfully.', 'Cloud Sync');
    } catch (err: any) {
      console.error('Sync failed:', err);
      toastInfo('Sync deferred: changes are saved locally and will sync when server is reachable.', 'Offline Notice');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (!window.desktopAPI) return;
    try {
      await window.desktopAPI.triggerLocalBackup(sessionToken || undefined);
      await refreshData();
      toastSuccess('Encrypted local backup created successfully.', 'Backup Completed');
    } catch (err: any) {
      console.error('Backup failed:', err);
      toastError(err?.message || 'Failed to create backup snapshot.', 'Backup Error');
    }
  };

  // 1. Initial Loading State (Clean, professional, without technical diagnostics)
  if (authLoading) {
    return (
      <div className="h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none">
        <DesktopTitleBar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <Logo size="lg" />
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Starting School Management Software...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Render Redesigned Split-Screen Login View
  if (!currentUser || !sessionToken) {
    return (
      <div className="h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950 select-none overflow-hidden">
        <DesktopTitleBar schoolName={schoolName || undefined} />
        <div className="flex-1 overflow-hidden">
          <LoginView
            onLoginSuccess={handleLoginSuccess}
            schoolName={schoolName || undefined}
            isProvisioned={hasAdmin}
            onProvisionComplete={(newSchoolName) => {
              setHasAdmin(true);
              if (newSchoolName) setSchoolName(newSchoolName);
            }}
          />
        </div>
      </div>
    );
  }

  // 3. Subscription Expired / Locked Screen
  const isSubscriptionLocked =
    licenseStatus &&
    (licenseStatus.state === 'expired' ||
      licenseStatus.state === 'grace_expired' ||
      licenseStatus.state === 'clock_tampered' ||
      licenseStatus.state === 'device_mismatch' ||
      licenseStatus.state === 'revoked');

  if (isSubscriptionLocked) {
    return (
      <div className="h-screen w-full flex flex-col bg-slate-900 select-none overflow-hidden">
        <DesktopTitleBar schoolName={schoolName || undefined} />
        <div className="flex-1 overflow-y-auto">
          <SubscriptionExpiredView
            licenseStatus={licenseStatus}
            sessionToken={sessionToken}
            onRenewSuccess={() => {
              refreshData();
            }}
            onLogout={handleLogout}
          />
        </div>
      </div>
    );
  }

  // 4. Authenticated Application Shell with Icon-Only Rail Sidebar & Header
  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none">
      {/* Custom Desktop Title Bar with minimize, maximize, and close controls */}
      <DesktopTitleBar schoolName={schoolName || undefined} />

      {/* Main Layout: 72px Sidebar on left + Content view on right */}
      <div className="flex-1 flex overflow-hidden">
        {/* 72px Icon-Only Sidebar Rail */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Content Container (Header + Scrollable View + Footer) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
          {/* Application Header */}
          <AppHeader
            currentView={currentView}
            onNavigate={(view) => setCurrentView(view)}
            syncStatus={syncStatus}
            currentUser={currentUser}
            isSyncing={isSyncing}
            onTriggerSync={handleTriggerSync}
          />

          {/* Scrollable View Area with Error Boundary per Module */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 focus:outline-none">
            <div className="max-w-7xl mx-auto w-full">
              {currentView === 'dashboard' && (
                <ErrorBoundary moduleName="Dashboard" onNavigateHome={() => setCurrentView('dashboard')}>
                  <DashboardView
                    metrics={metrics}
                    onNavigate={(view) => setCurrentView(view)}
                  />
                </ErrorBoundary>
              )}

              {currentView === 'students' && (
                <ErrorBoundary moduleName="Students & Admissions" onNavigateHome={() => setCurrentView('dashboard')}>
                  <StudentsView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'attendance' && (
                <ErrorBoundary moduleName="Daily Attendance" onNavigateHome={() => setCurrentView('dashboard')}>
                  <AttendanceView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'fees' && (
                <ErrorBoundary moduleName="Fees & Invoicing" onNavigateHome={() => setCurrentView('dashboard')}>
                  <FeesView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'academics' && (
                <ErrorBoundary moduleName="Sessions & Classes" onNavigateHome={() => setCurrentView('dashboard')}>
                  <AcademicsView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'examinations' && (
                <ErrorBoundary moduleName="Examinations & Marks" onNavigateHome={() => setCurrentView('dashboard')}>
                  <ExamsView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'staff' && (
                <ErrorBoundary moduleName="Faculty & Staff" onNavigateHome={() => setCurrentView('dashboard')}>
                  <StaffView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'timetable' && (
                <ErrorBoundary moduleName="Timetable & Scheduling" onNavigateHome={() => setCurrentView('dashboard')}>
                  <TimetableView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'accounts' && (
                <ErrorBoundary moduleName="Accounts & Expenses" onNavigateHome={() => setCurrentView('dashboard')}>
                  <AccountsView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'reports' && (
                <ErrorBoundary moduleName="Reports & Export" onNavigateHome={() => setCurrentView('dashboard')}>
                  <ReportsView onBack={() => setCurrentView('dashboard')} sessionToken={sessionToken} />
                </ErrorBoundary>
              )}

              {currentView === 'settings' && (
                <ErrorBoundary moduleName="System & Settings" onNavigateHome={() => setCurrentView('dashboard')}>
                  <SettingsView
                    onBack={() => setCurrentView('dashboard')}
                    dbStatus={dbStatus}
                    syncStatus={syncStatus}
                    appInfo={appInfo}
                    sessionToken={sessionToken}
                    onTriggerBackup={handleTriggerBackup}
                    onTriggerSync={handleTriggerSync}
                  />
                </ErrorBoundary>
              )}
            </div>
          </main>

          {/* Clean User-Facing Status Footer */}
          <AppFooter
            currentUser={currentUser}
            syncStatus={syncStatus}
            schoolName={schoolName || currentUser.schoolName}
          />
        </div>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
};
