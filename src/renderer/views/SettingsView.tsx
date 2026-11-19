import React, { useState, useEffect } from 'react';
import {
  Database,
  ArrowLeft,
  Server,
  HardDriveDownload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Building2,
  Lock,
  FileCheck,
  Cloud,
  CloudOff,
  History,
  Check,
  Split,
  Eye,
  Key,
  HardDrive,
  UploadCloud,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  DatabaseStatus,
  SyncStatus,
  AppInfo,
  ConflictItem,
  SyncHistoryEntry,
  LicenseStatusInfo,
  BackupDestinationConfig,
  BackupHistoryEntry,
  RestorePreview,
  UpdateStatus,
  UpdateChannel,
} from '../../shared/types';
import { Button, Input, Select, Badge, Modal, ConfirmDialog, ErrorPanel } from '../components/ui';
import { useToast } from '../context/ToastContext';

interface SettingsViewProps {
  onBack: () => void;
  dbStatus: DatabaseStatus | null;
  syncStatus: SyncStatus | null;
  appInfo: AppInfo | null;
  sessionToken?: string | null;
  onTriggerBackup: () => void;
  onTriggerSync: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  dbStatus,
  syncStatus,
  appInfo,
  sessionToken,
  onTriggerBackup,
  onTriggerSync,
}) => {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'licensing' | 'backup' | 'updates' | 'security' | 'sync'>('profile');
  const [cloudUrl, setCloudUrl] = useState(syncStatus?.centralBackendUrl || '');
  const [urlSaveMsg, setUrlSaveMsg] = useState<string | null>(null);

  // Updates State
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [endpointInput, setEndpointInput] = useState('');

  // School Settings State
  const [schoolSettings, setSchoolSettings] = useState({
    contactEmail: '',
    contactPhone: '',
    address: '',
    motto: '',
    challanInstructions: '',
    gradingSystem: 'percentage',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Verified Backup State
  const [verifiedBackupLoading, setVerifiedBackupLoading] = useState(false);
  const [verifiedBackupResult, setVerifiedBackupResult] = useState<any | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Conflict Management State
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<ConflictItem | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [manualSyncLoading, setManualSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Licensing State
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusInfo | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseMsg, setLicenseMsg] = useState<string | null>(null);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);

  // Backup & Multi-Destination State
  const [destConfigs, setDestConfigs] = useState<BackupDestinationConfig[]>([]);
  const [backupHistoryList, setBackupHistoryList] = useState<BackupHistoryEntry[]>([]);
  const [selectedDest, setSelectedDest] = useState<'local' | 'cloud' | 'external'>('local');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupActionMsg, setBackupActionMsg] = useState<string | null>(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreFilePath, setRestoreFilePath] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreVerifying, setRestoreVerifying] = useState(false);
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadSchoolSettings() {
      if (!window.desktopAPI || !sessionToken) return;
      try {
        const data = await window.desktopAPI.getSchoolSettings(sessionToken);
        if (data) {
          setSchoolSettings({
            contactEmail: data.contactEmail || '',
            contactPhone: data.contactPhone || '',
            address: data.address || '',
            motto: data.motto || '',
            challanInstructions: data.challanInstructions || '',
            gradingSystem: data.gradingSystem || 'percentage',
          });
        }
      } catch (err) {
        console.error('Failed to load school profile:', err);
      }
    }
    loadSchoolSettings();
  }, [sessionToken]);

  useEffect(() => {
    if (activeTab === 'sync' && window.desktopAPI && sessionToken) {
      loadConflicts();
      loadHistory();
    }
    if (activeTab === 'licensing' && window.desktopAPI && sessionToken) {
      loadLicense();
    }
    if (activeTab === 'backup' && window.desktopAPI && sessionToken) {
      loadBackups();
    }
    if (activeTab === 'updates' && window.desktopAPI && sessionToken) {
      loadUpdateStatus();
    }
  }, [activeTab, sessionToken]);

  const loadUpdateStatus = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const data = await window.desktopAPI.getUpdateStatus(sessionToken);
      setUpdateStatus(data);
      if (data?.updateEndpoint && !endpointInput) {
        setEndpointInput(data.updateEndpoint);
      }
    } catch (err: any) {
      console.error('Failed to load update status:', err);
    }
  };

  const handleCheckUpdates = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setUpdateLoading(true);
    setUpdateMsg(null);
    try {
      const res = await window.desktopAPI.checkForUpdates(sessionToken, endpointInput || undefined);
      if (res.success) {
        if (res.data) {
          setUpdateMsg(`Update Available: Version ${res.data.version}`);
          toastInfo(`Update v${res.data.version} is available for installation.`, 'Software Update');
        } else {
          setUpdateMsg('Your application is running the latest version.');
          toastSuccess('Your desktop application is running the latest release.', 'Software Update');
        }
        await loadUpdateStatus();
      } else {
        setUpdateMsg(`Update check failed: ${res.error}`);
        toastError(`Update check failed: ${res.error}`, 'Update Error');
      }
    } catch (err: any) {
      setUpdateMsg(`Error: ${err.message}`);
      toastError(`Error checking updates: ${err.message}`, 'Update Error');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setUpdateLoading(true);
    setUpdateMsg(null);
    try {
      const res = await window.desktopAPI.downloadUpdate(sessionToken);
      if (res.success) {
        setUpdateMsg('Update installer downloaded and cryptographically verified (SHA-512 OK).');
        toastSuccess('Update installer downloaded and verified via SHA-512.', 'Update Downloaded');
        await loadUpdateStatus();
      } else {
        setUpdateMsg(`Download failed: ${res.error}`);
        toastError(`Download failed: ${res.error}`, 'Download Error');
      }
    } catch (err: any) {
      setUpdateMsg(`Download Error: ${err.message}`);
      toastError(`Download Error: ${err.message}`, 'Download Error');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setUpdateLoading(true);
    setUpdateMsg(null);
    try {
      const res = await window.desktopAPI.installUpdate(sessionToken);
      if (res.success) {
        setUpdateMsg('Pre-update safety backup created. Restarting application to apply update...');
        toastSuccess('Pre-update safety backup created. Relaunching app...', 'Updating Application');
      } else {
        setUpdateMsg(`Installation failed: ${res.error}`);
        toastError(`Installation failed: ${res.error}`, 'Install Error');
      }
    } catch (err: any) {
      setUpdateMsg(`Install Error: ${err.message}`);
      toastError(`Install Error: ${err.message}`, 'Install Error');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSetUpdateChannel = async (newChannel: UpdateChannel) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      await window.desktopAPI.setUpdateChannel(sessionToken, newChannel);
      await loadUpdateStatus();
      toastSuccess(`Update distribution channel switched to ${newChannel}.`, 'Update Channel');
    } catch (err: any) {
      toastError(`Failed to set update channel: ${err.message}`, 'Channel Switch Error');
    }
  };

  const loadLicense = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const data = await window.desktopAPI.getLicenseStatus(sessionToken);
      setLicenseStatus(data);
    } catch (err: any) {
      console.error('Failed to load license:', err);
    }
  };

  const loadBackups = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const [dests, hist] = await Promise.all([
        window.desktopAPI.getBackupDestinations(sessionToken),
        window.desktopAPI.getBackupHistory(sessionToken, 20),
      ]);
      setDestConfigs(dests || []);
      setBackupHistoryList(hist || []);
    } catch (err: any) {
      console.error('Failed to load backup data:', err);
    }
  };

  const handleActivateLicense = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLicenseLoading(true);
    setLicenseMsg(null);
    try {
      const res = await window.desktopAPI.activateLicense(sessionToken, { deviceName: 'Primary-School-Workstation' });
      if (res.success) {
        setLicenseMsg('Workstation license successfully activated and bound.');
        await loadLicense();
      } else {
        setLicenseMsg(`Activation Error: ${res.error}`);
      }
    } catch (err: any) {
      setLicenseMsg(`Error: ${err.message}`);
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleRevalidateLicense = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLicenseLoading(true);
    setLicenseMsg(null);
    try {
      const res = await window.desktopAPI.revalidateLicense(sessionToken);
      if (res.success) {
        setLicenseMsg('License successfully verified with server. Status refreshed.');
        await loadLicense();
      } else {
        setLicenseMsg(`Revalidation Error: ${res.error}`);
      }
    } catch (err: any) {
      setLicenseMsg(`Error: ${err.message}`);
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleConfirmDeactivateLicense = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLicenseLoading(true);
    setLicenseMsg(null);
    try {
      const res = await window.desktopAPI.deactivateLicense(sessionToken);
      if (res.success) {
        setLicenseMsg('Workstation deactivated successfully.');
        setIsDeactivateConfirmOpen(false);
        await loadLicense();
      } else {
        setLicenseMsg(`Deactivation Error: ${res.error}`);
      }
    } catch (err: any) {
      setLicenseMsg(`Error: ${err.message}`);
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleTriggerMultiBackup = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setBackupActionLoading(true);
    setBackupActionMsg(null);
    try {
      const res = await window.desktopAPI.createBackup(sessionToken, {
        destinationType: selectedDest,
        triggerType: 'manual',
        passphrase: backupPassphrase || undefined,
      });
      if (res.success) {
        const successMsg = `Encrypted backup created successfully (${selectedDest.toUpperCase()}): ${res.data?.fileName}`;
        setBackupActionMsg(successMsg);
        toastSuccess(successMsg, 'Backup Created');
        setBackupPassphrase('');
        await loadBackups();
      } else {
        setBackupActionMsg(`Backup Failed: ${res.error}`);
        toastError(`Backup Failed: ${res.error}`, 'Backup Error');
      }
    } catch (err: any) {
      setBackupActionMsg(`Backup Error: ${err.message}`);
      toastError(`Backup Error: ${err.message}`, 'Backup Error');
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleVerifyRestoreFile = async () => {
    if (!window.desktopAPI || !sessionToken || !restoreFilePath) return;
    setRestoreVerifying(true);
    setRestoreMsg(null);
    try {
      const res = await window.desktopAPI.verifyBackupFile(sessionToken, {
        filePath: restoreFilePath,
        passphrase: restorePassphrase || undefined,
      });
      if (res.success && res.data) {
        setRestorePreview(res.data);
      } else {
        setRestoreMsg(`Verification Failed: ${res.error}`);
      }
    } catch (err: any) {
      setRestoreMsg(`Verification Error: ${err.message}`);
    } finally {
      setRestoreVerifying(false);
    }
  };

  const handlePerformRestore = async () => {
    if (!window.desktopAPI || !sessionToken || !restoreFilePath || !restoreConfirmChecked) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const res = await window.desktopAPI.restoreBackup(sessionToken, {
        filePath: restoreFilePath,
        confirm: true,
        passphrase: restorePassphrase || undefined,
      });
      if (res.success) {
        setRestoreMsg(`Database successfully restored! Pre-restore safety backup: ${res.data?.preRestoreBackupPath}`);
        setRestorePreview(null);
        setRestoreFilePath('');
        setRestoreConfirmChecked(false);
        await loadBackups();
      } else {
        setRestoreMsg(`Restore Failed: ${res.error}`);
      }
    } catch (err: any) {
      setRestoreMsg(`Restore Error: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const loadConflicts = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const data = await window.desktopAPI.listConflicts(sessionToken, 'unresolved');
      setConflicts(data || []);
    } catch {}
  };

  const loadHistory = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const hist = await window.desktopAPI.getSyncHistory(sessionToken, 15);
      setSyncHistory(hist || []);
    } catch {}
  };

  const handleManualSync = async () => {
    if (!window.desktopAPI) return;
    setManualSyncLoading(true);
    setSyncFeedback(null);
    try {
      const res = await window.desktopAPI.triggerSync();
      if (res.success) {
        setSyncFeedback(`Sync Completed: ${res.syncedCount} changes synchronized.`);
        loadConflicts();
        loadHistory();
      } else {
        setSyncFeedback(`Sync Error: ${res.error || 'Failed to sync with central server'}`);
      }
    } catch (err: any) {
      setSyncFeedback(`Error: ${err.message}`);
    } finally {
      setManualSyncLoading(false);
    }
  };

  const handleResolveConflict = async (strategy: 'local_wins' | 'remote_wins' | 'merged') => {
    if (!selectedConflict || !window.desktopAPI || !sessionToken) return;
    setResolvingId(selectedConflict.id);
    try {
      const res = await window.desktopAPI.resolveConflict(sessionToken, {
        conflictId: selectedConflict.id,
        strategy,
        notes: `Manually resolved via settings UI using strategy: ${strategy}`,
      });
      if (res.success) {
        setSelectedConflict(null);
        loadConflicts();
        loadHistory();
        toastSuccess(`Sync conflict resolved using strategy: ${strategy}.`, 'Conflict Resolved');
      } else {
        toastError(res.error || 'Failed to resolve sync conflict', 'Sync Error');
      }
    } catch (err: any) {
      toastError(`Conflict resolution error: ${err.message}`, 'Sync Conflict Error');
    } finally {
      setResolvingId(null);
    }
  };

  const handleSaveBackendUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !window.desktopAPI) return;
    try {
      const res = await window.desktopAPI.setRemoteBackendUrl(sessionToken, cloudUrl);
      if (res.success) {
        setUrlSaveMsg('Central backend URL successfully updated.');
        toastSuccess('Central cloud backend URL successfully updated.', 'Settings Saved');
        setTimeout(() => setUrlSaveMsg(null), 3000);
      } else {
        setUrlSaveMsg(res.error || 'Failed to update backend URL');
        toastError(res.error || 'Failed to update backend URL', 'Configuration Error');
      }
    } catch (err: any) {
      setUrlSaveMsg(err.message || 'Failed to update backend URL');
      toastError(err.message || 'Failed to update backend URL', 'Configuration Error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !window.desktopAPI) return;
    setSettingsLoading(true);
    setSettingsMsg(null);
    try {
      const res = await window.desktopAPI.updateSchoolSettings(sessionToken, schoolSettings);
      if (res.success) {
        setSettingsMsg('Institutional profile and challan instructions successfully updated.');
        toastSuccess('Institutional profile and bank challan instructions updated.', 'Settings Saved');
        setTimeout(() => setSettingsMsg(null), 4000);
      } else {
        setSettingsMsg(res.error || 'Failed to update school settings');
        toastError(res.error || 'Failed to update school settings', 'Settings Error');
      }
    } catch (err: any) {
      setSettingsMsg(err.message || 'Failed to update school settings');
      toastError(err.message || 'Failed to update school settings', 'Settings Error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (!sessionToken || !window.desktopAPI) return;

    if (newPassword.length < 8) {
      const msg = 'Password must be at least 8 characters long';
      setPwdMsg({ type: 'error', text: msg });
      toastError(msg, 'Validation Error');
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'New passwords do not match';
      setPwdMsg({ type: 'error', text: msg });
      toastError(msg, 'Validation Error');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await window.desktopAPI.changePassword(sessionToken, {
        currentPassword,
        newPassword,
      });

      if (res.success) {
        setPwdMsg({ type: 'success', text: 'Password successfully updated in Scrypt vault' });
        toastSuccess('Administrator password securely updated.', 'Security Vault');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwdMsg({ type: 'error', text: res.error || 'Failed to update password' });
        toastError(res.error || 'Failed to update password', 'Security Vault Error');
      }
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err?.message || 'Password update failed' });
      toastError(err?.message || 'Password update failed', 'Security Vault Error');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">System Settings & Cloud Synchronization</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Institutional profile, verified SQLite backups, master credentials & bidirectional cloud sync
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 transition-colors ${activeTab === 'profile' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          School Profile & Challan
        </button>
        <button
          onClick={() => setActiveTab('licensing')}
          className={`pb-3 transition-colors flex items-center gap-1.5 ${activeTab === 'licensing' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <Key className="w-4 h-4" />
          <span>Subscription & Licensing</span>
          {licenseStatus && licenseStatus.state !== 'active' && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                licenseStatus.state === 'offline_grace'
                  ? 'bg-amber-500 text-white'
                  : 'bg-rose-600 text-white'
              }`}
            >
              {licenseStatus.state === 'offline_grace' ? `${licenseStatus.graceDaysRemaining}d` : '!'}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`pb-3 transition-colors flex items-center gap-1.5 ${activeTab === 'backup' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Automated Backup & Restore</span>
        </button>
        <button
          onClick={() => setActiveTab('updates')}
          className={`pb-3 transition-colors flex items-center gap-1.5 ${activeTab === 'updates' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <HardDriveDownload className="w-4 h-4" />
          <span>Application Updates</span>
          {updateStatus?.state === 'update_available' && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
              v{updateStatus.availableUpdate?.version}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 transition-colors ${activeTab === 'security' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Administrator Password
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`pb-3 transition-colors flex items-center gap-1.5 ${activeTab === 'sync' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <span>Cloud Sync & Conflicts</span>
          {conflicts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-bold animate-pulse">
              {conflicts.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SCHOOL PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              School Institutional Information & Bank Challan Customization
            </h3>
          </div>

          {settingsMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {settingsMsg}
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Official Contact Email"
                type="email"
                required
                value={schoolSettings.contactEmail}
                onChange={(e) => setSchoolSettings({ ...schoolSettings, contactEmail: e.target.value })}
                placeholder="office@school.edu.pk"
              />
              <Input
                label="Official Contact Phone"
                type="text"
                required
                value={schoolSettings.contactPhone}
                onChange={(e) => setSchoolSettings({ ...schoolSettings, contactPhone: e.target.value })}
                placeholder="+92 42 35789000"
              />
            </div>

            <Input
              label="Campus Address"
              type="text"
              required
              value={schoolSettings.address}
              onChange={(e) => setSchoolSettings({ ...schoolSettings, address: e.target.value })}
              placeholder="Full physical campus address for challans and official transcripts"
            />

            <Input
              label="School Motto / Vision"
              type="text"
              value={schoolSettings.motto}
              onChange={(e) => setSchoolSettings({ ...schoolSettings, motto: e.target.value })}
              placeholder="e.g. Knowledge, Integrity and Leadership"
            />

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Printed Challan Payment Terms & Instructions (Bank Copy, School Copy, Student Copy)
              </label>
              <textarea
                className="w-full text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                value={schoolSettings.challanInstructions}
                onChange={(e) => setSchoolSettings({ ...schoolSettings, challanInstructions: e.target.value })}
                placeholder="1. Pay at any designated Allied Bank branch nationwide.&#10;2. A late fee of Rs. 200 applies after the 10th of the month.&#10;3. Fee is non-refundable."
              />
            </div>

            <Button variant="primary" type="submit" loading={settingsLoading}>
              Save Institutional Profile
            </Button>
          </form>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTION & LICENSING */}
      {activeTab === 'licensing' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Subscription Plan & Workstation License Binding
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Device-bound asymmetric Ed25519 digital signature with offline grace period tracking
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleRevalidateLicense} loading={licenseLoading}>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Revalidate with Server
                </Button>
                <Button variant="primary" onClick={handleActivateLicense} loading={licenseLoading}>
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Activate Workstation
                </Button>
              </div>
            </div>

            {licenseMsg && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                {licenseMsg}
              </div>
            )}

            {/* State Status Banner */}
            {licenseStatus && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  licenseStatus.state === 'active'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : licenseStatus.state === 'offline_grace'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {licenseStatus.state === 'active' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600" />
                    )}
                    License Status: <span className="uppercase tracking-wide">{licenseStatus.state.replace('_', ' ')}</span>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 font-bold">
                    Plan: {licenseStatus.planName} ({licenseStatus.planCode})
                  </span>
                </div>
                <p>{licenseStatus.message || 'Operating under active cryptographic subscription license.'}</p>
              </div>
            )}

            {/* Details Grid */}
            {licenseStatus && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Authorized School</span>
                  <strong className="text-slate-800 dark:text-slate-200 block truncate">{licenseStatus.schoolName}</strong>
                  <span className="font-mono text-[10px] text-slate-400">Code: {licenseStatus.schoolCode}</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Bound Device Identity</span>
                  <strong className="text-slate-800 dark:text-slate-200 block font-mono truncate">{licenseStatus.deviceId}</strong>
                  <span className="font-mono text-[10px] text-slate-400">Grace: {licenseStatus.gracePeriodDays} Days</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">License Expiry</span>
                  <strong className="text-slate-800 dark:text-slate-200 block font-mono">
                    {licenseStatus.expiresAt ? new Date(licenseStatus.expiresAt).toLocaleDateString() : 'N/A'}
                  </strong>
                  <span className="text-[10px] text-slate-400">
                    Remaining: {licenseStatus.graceDaysRemaining} Days
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Last Server Verification</span>
                  <strong className="text-slate-800 dark:text-slate-200 block font-mono truncate">
                    {licenseStatus.lastServerVerification
                      ? new Date(licenseStatus.lastServerVerification).toLocaleString()
                      : 'Never'}
                  </strong>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Authoritative Cloud Timestamp</span>
                </div>
              </div>
            )}

            {/* Entitlements Checklist */}
            {licenseStatus && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/50 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Plan Entitlements & Included Modules:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {[
                    { key: 'core.students', label: 'Student Admissions & Records' },
                    { key: 'core.fees', label: 'Fees, Challans & Payment Ledger' },
                    { key: 'core.attendance', label: 'Daily Student Attendance Registers' },
                    { key: 'core.academics', label: 'Academic Sessions, Classes & Sections' },
                    { key: 'core.examinations', label: 'Examinations, Results & Report Cards' },
                    { key: 'core.staff', label: 'Staff Management & Attendance' },
                    { key: 'core.payroll', label: 'Staff Salary Structures & Monthly Payroll' },
                    { key: 'core.timetable', label: 'Timetable Scheduling & Conflict Engine' },
                    { key: 'core.reports', label: 'Institutional Reports & Analytics' },
                    { key: 'core.cloud_sync', label: 'Bidirectional Cloud Synchronization' },
                    { key: 'core.cloud_backup', label: 'Automated Encrypted Cloud Backups' },
                  ].map((feat) => {
                    const isEntitled = licenseStatus.entitlements.includes(feat.key);
                    return (
                      <div
                        key={feat.key}
                        className={`p-2 rounded-lg border flex items-center gap-2 ${
                          isEntitled
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                        }`}
                      >
                        {isEntitled ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="text-[11px] truncate">{feat.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
              <span>Need to transfer this license seat to another computer?</span>
              <Button variant="danger" size="sm" onClick={() => setIsDeactivateConfirmOpen(true)} loading={licenseLoading}>
                Deactivate This Workstation Seat
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATED MULTI-DESTINATION BACKUP & RESTORATION */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Destination Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {destConfigs.map((dest) => (
              <div
                key={dest.destinationType}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-2xs space-y-3 ${
                  selectedDest === dest.destinationType ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {dest.destinationType === 'local' && <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    {dest.destinationType === 'cloud' && <UploadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    {dest.destinationType === 'external' && <FolderOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">
                      {dest.destinationType === 'local'
                        ? '1. Local Application'
                        : dest.destinationType === 'cloud'
                          ? '2. Central Cloud'
                          : '3. External Drive / USB'}
                    </h4>
                  </div>
                  <Badge variant={dest.healthStatus === 'healthy' ? 'success' : dest.healthStatus === 'disabled' ? 'neutral' : 'danger'}>
                    {dest.healthStatus}
                  </Badge>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  <div>Path: <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{dest.destinationPath || 'Auto'}</span></div>
                  <div>Retention: <span className="font-semibold text-slate-800 dark:text-slate-200">{dest.retentionCount} Copies</span></div>
                  <div>Last Backup: <span className="font-mono text-slate-800 dark:text-slate-200">{dest.lastBackupAt ? new Date(dest.lastBackupAt).toLocaleString() : 'Never'}</span></div>
                </div>

                <Button
                  variant={selectedDest === dest.destinationType ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setSelectedDest(dest.destinationType)}
                >
                  {selectedDest === dest.destinationType ? 'Selected Destination' : 'Select Destination'}
                </Button>
              </div>
            ))}
          </div>

          {/* Backup Action Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <HardDriveDownload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Create Authenticated AES-256-GCM Encrypted Backup
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  WAL-consistent SQLite snapshot with scrypt key derivation and physical integrity verification
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRestoreModalOpen(true)}>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Restore from Backup File...
                </Button>
                <Button variant="primary" onClick={handleTriggerMultiBackup} loading={backupActionLoading}>
                  <HardDriveDownload className="w-4 h-4 mr-1.5" />
                  Create Backup Now ({selectedDest.toUpperCase()})
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Custom Encryption Passphrase (Optional - defaults to school master key)"
                type="password"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="Leave blank to use internal master key"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center pt-4">
                Selected Destination: <strong className="ml-1 text-slate-800 dark:text-slate-200 uppercase">{selectedDest}</strong>
              </div>
            </div>

            {backupActionMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {backupActionMsg}
              </div>
            )}
          </div>

          {/* Backup History Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Backup History & Disaster Recovery Ledger
            </h3>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5 font-semibold">Backup ID</th>
                    <th className="p-2.5 font-semibold">Destination</th>
                    <th className="p-2.5 font-semibold">File Name</th>
                    <th className="p-2.5 font-semibold">Size</th>
                    <th className="p-2.5 font-semibold">Checksum (SHA-256)</th>
                    <th className="p-2.5 font-semibold">Status</th>
                    <th className="p-2.5 font-semibold">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {backupHistoryList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400">
                        No backups generated yet. Create a backup above.
                      </td>
                    </tr>
                  ) : (
                    backupHistoryList.map((entry) => (
                      <tr key={entry.backupId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2.5 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">{entry.backupId.substring(0, 16)}...</td>
                        <td className="p-2.5 font-bold uppercase text-[10px] text-slate-700 dark:text-slate-300">{entry.destinationType}</td>
                        <td className="p-2.5 font-mono text-slate-700 dark:text-slate-300">{entry.fileName}</td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-400">{(entry.fileSizeBytes / 1024).toFixed(1)} KB</td>
                        <td className="p-2.5 font-mono text-slate-400 text-[10px]">{entry.checksumSha256.substring(0, 12)}...</td>
                        <td className="p-2.5">
                          <Badge variant={entry.status === 'completed' || entry.status === 'verified' ? 'success' : entry.status === 'restored' ? 'neutral' : 'danger'}>
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-slate-500 dark:text-slate-400">{new Date(entry.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE MODAL */}
      <Modal
        isOpen={restoreModalOpen}
        onClose={() => {
          setRestoreModalOpen(false);
          setRestorePreview(null);
          setRestoreMsg(null);
        }}
        title="Safe Database Restoration Sandbox"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400">
            Select an encrypted backup file to inspect in a sandbox temporary database first.
            Active database is never touched until explicit confirmation is provided.
          </p>

          <Input
            label="Backup File Absolute Path"
            type="text"
            required
            value={restoreFilePath}
            onChange={(e) => setRestoreFilePath(e.target.value)}
            placeholder="e.g. D:/SMS/backups/sms-backup-2026-11-14.enc.bak"
          />

          <Input
            label="Decryption Passphrase (if custom key was used)"
            type="password"
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            placeholder="Leave blank for school master key"
          />

          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={handleVerifyRestoreFile}
              loading={restoreVerifying}
              disabled={!restoreFilePath}
            >
              <Eye className="w-4 h-4 mr-1.5" />
              Verify & Inspect Backup Sandbox
            </Button>
          </div>

          {restorePreview && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Sandbox Verification Passed: Integrity Status "OK"
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                <div>Migration Version: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.schemaVersion} ({restorePreview.migrationCount} migrations)</strong></div>
                <div>Students Record Count: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.recordCounts.students}</strong></div>
                <div>Fee Invoices Count: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.recordCounts.invoices}</strong></div>
                <div>Fee Payments Count: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.recordCounts.payments}</strong></div>
                <div>Attendance Records: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.recordCounts.attendance}</strong></div>
                <div>Sync Outbox Events: <strong className="font-mono text-slate-900 dark:text-white">{restorePreview.recordCounts.outboxEvents}</strong></div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Pre-Restore Safety Guarantee
                </div>
                <p>
                  A pre-restore safety snapshot of the active database will be taken automatically before replacing.
                </p>
                <label className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={restoreConfirmChecked}
                    onChange={(e) => setRestoreConfirmChecked(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  I explicitly confirm replacing the active database with this validated backup.
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="danger"
                  onClick={handlePerformRestore}
                  loading={restoring}
                  disabled={!restoreConfirmChecked}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Confirm & Replace Active Database
                </Button>
              </div>
            </div>
          )}

          {restoreMsg && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              {restoreMsg}
            </div>
          )}
        </div>
      </Modal>

      {/* TAB: APPLICATION UPDATES & RELEASE MANAGEMENT */}
      {activeTab === 'updates' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <HardDriveDownload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Windows Desktop Release & Auto-Updates</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Manage software updates, release channels, and automated pre-update safety snapshots
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCheckUpdates}
                  loading={updateLoading}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  <span>Check for Updates</span>
                </Button>
              </div>
            </div>

            {updateMsg && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{updateMsg}</span>
              </div>
            )}

            {/* Current Release Details */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Installed Version</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">v{updateStatus?.currentVersion || appInfo?.version || '1.0.0'}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Commercial Desktop Build</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Update Channel</div>
                <div className="flex items-center gap-2">
                  <select
                    value={updateStatus?.channel || 'stable'}
                    onChange={(e) => handleSetUpdateChannel(e.target.value as UpdateChannel)}
                    className="text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-800 dark:text-slate-200"
                  >
                    <option value="stable">Stable (Recommended)</option>
                    <option value="beta">Beta / Early Access</option>
                  </select>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {updateStatus?.channel === 'stable' ? 'Production verified releases' : 'Pre-release testing channel'}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Target Platform</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Windows 10 / 11 (x64)</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">NSIS Professional Installer</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Last Checked</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {updateStatus?.lastCheckedAt ? new Date(updateStatus.lastCheckedAt).toLocaleString() : 'Never checked'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Authoritative feed status</div>
              </div>
            </div>
          </div>

          {/* Update Available Banner & Action */}
          {updateStatus?.availableUpdate && (
            <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 dark:from-indigo-950/40 dark:to-emerald-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                    v{updateStatus.availableUpdate.version}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      School Management Software Update Available — v{updateStatus.availableUpdate.version}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Released: {new Date(updateStatus.availableUpdate.releaseDate).toLocaleDateString()} • Size: {(updateStatus.availableUpdate.windows.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                      {updateStatus.availableUpdate.mandatory && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                          Mandatory Update
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {updateStatus.state === 'ready_to_install' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleInstallUpdate}
                      loading={updateLoading}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <ShieldCheck className="w-4 h-4 mr-1.5" />
                      <span>Restart & Install Now</span>
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleDownloadUpdate}
                      loading={updateLoading}
                    >
                      <HardDriveDownload className="w-4 h-4 mr-1.5" />
                      <span>Download Update</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Release Notes */}
              <div className="border border-indigo-100 dark:border-indigo-900 bg-white/80 dark:bg-slate-850/80 rounded-lg p-3 space-y-1">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">Release Notes:</div>
                <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line font-mono max-h-32 overflow-y-auto">
                  {updateStatus.availableUpdate.releaseNotes}
                </div>
              </div>

              {/* Download Progress Bar */}
              {updateStatus.state === 'downloading' && updateStatus.downloadProgress && (
                <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold">
                    <span>Downloading update package...</span>
                    <span>{updateStatus.downloadProgress.percent}% ({(updateStatus.downloadProgress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB / {(updateStatus.downloadProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB)</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${updateStatus.downloadProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Ready to install notification */}
              {updateStatus.state === 'ready_to_install' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Installer downloaded and verified. Clicking "Restart & Install Now" will perform an automated SQLite WAL flush, take a pre-update safety backup, and launch the installer cleanly.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Up to Date Confirmation */}
          {(!updateStatus?.availableUpdate && updateStatus?.state === 'update_not_available') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Application is Up to Date</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  You are running the latest release (v{updateStatus?.currentVersion || '1.0.0'}) on the {updateStatus?.channel || 'stable'} channel.
                </div>
              </div>
            </div>
          )}

          {/* Configuration Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Update Feed Endpoint Configuration</h4>
            <div className="flex gap-2 max-w-xl">
              <Input
                label="Update Manifest Feed URL"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder="http://localhost:5000/api/v1/updates/desktop"
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (window.desktopAPI && sessionToken && endpointInput) {
                      window.desktopAPI.checkForUpdates(sessionToken, endpointInput);
                      loadUpdateStatus();
                    }
                  }}
                >
                  Save & Check
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Default points to the authorized School OS central backend update endpoint.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: ADMIN PASSWORD */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-2xs max-w-lg space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Change Administrator Password</h3>
          </div>

          {pwdMsg && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                pwdMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
              }`}
            >
              {pwdMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
              <span>{pwdMsg.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <Input
              label="Current Master Password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            <Input
              label="New Master Password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Input
              label="Confirm New Password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
            />
            <Button variant="primary" type="submit" loading={pwdLoading}>
              Update Master Credentials
            </Button>
          </form>
        </div>
      )}

      {/* TAB 5: DIAGNOSTICS & CLOUD SYNC */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          {/* Top Cards: Engine & Sync Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Embedded SQLite Database</h3>
                </div>
                <Badge variant="success">WAL Mode Active</Badge>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Engine</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">better-sqlite3 (C++ Native)</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Database File</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={dbStatus?.path}>
                    {dbStatus?.path || 'school_local.db'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Size</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {dbStatus ? `${(dbStatus.sizeBytes / 1024).toFixed(1)} KB` : '...'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Foreign Keys</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Enforced (ON)</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Server className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cloud Synchronization Engine</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {syncStatus?.network === 'online' ? (
                    <Badge variant="success">Online</Badge>
                  ) : (
                    <Badge variant="warning">Offline Mode</Badge>
                  )}
                  {conflicts.length > 0 && <Badge variant="danger">{conflicts.length} Conflicts</Badge>}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">State</span>
                  <span className="font-semibold capitalize text-indigo-700 dark:text-indigo-400">{syncStatus?.state || 'synced'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Last Synced</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{syncStatus?.lastSyncedAt || 'Never'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Pending Outbox</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{syncStatus?.pendingChangesCount || 0} queued mutations</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Tenant School ID</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{syncStatus?.schoolId || 'school_default'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sync Trigger & Remote URL Config */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Central Backend Server Configuration</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Configure remote School OS endpoint for bidirectional change exchange</p>
              </div>
              <Button
                variant="primary"
                onClick={handleManualSync}
                loading={manualSyncLoading}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Trigger Full Sync Now
              </Button>
            </div>

            {syncFeedback && (
              <div className={`p-3 rounded-lg text-xs font-semibold ${syncFeedback.includes('Error') ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'}`}>
                {syncFeedback}
              </div>
            )}

            <form onSubmit={handleSaveBackendUrl} className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  label="Central Backend Base URL"
                  type="url"
                  required
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://your-domain/api/v1"
                />
              </div>
              <div className="pt-5">
                <Button variant="secondary" type="submit">
                  Save URL
                </Button>
              </div>
            </form>
            {urlSaveMsg && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{urlSaveMsg}</p>}
          </div>

          {/* Unresolved Conflicts Banner & List */}
          {conflicts.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>{conflicts.length} Unresolved Synchronization Conflicts Detected</span>
                </div>
                <span className="text-xs text-rose-700 dark:text-rose-400">Administrator Review Required</span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300">
                Concurrent offline modifications were detected. Inspect conflicting attributes and select an authorized resolution strategy.
              </p>

              <div className="divide-y divide-rose-200/80 dark:divide-rose-900/60 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-900/60">
                {conflicts.map((cnf) => (
                  <div key={cnf.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">{cnf.entityType}</Badge>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">ID: {cnf.entityId}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-600 dark:text-slate-400">{cnf.conflictReason}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Conflicting Fields: <strong className="text-rose-700 dark:text-rose-400">{cnf.conflictingFields.join(', ')}</strong> | Detected: {cnf.createdAt}
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setSelectedConflict(cnf)}
                    >
                      <Split className="w-3.5 h-3.5 mr-1" />
                      Review & Resolve
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync History / Audit Activity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Recent Synchronization Activity Log
              </h4>
              <span className="text-xs text-slate-400">Last 15 Execution Runs</span>
            </div>

            {syncHistory.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">No synchronization runs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-3 font-semibold">Run ID</th>
                      <th className="py-2 px-3 font-semibold">Direction</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold text-right">Uploaded</th>
                      <th className="py-2 px-3 font-semibold text-right">Downloaded</th>
                      <th className="py-2 px-3 font-semibold text-right">Conflicts</th>
                      <th className="py-2 px-3 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {syncHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">{h.runId.substring(0, 12)}...</td>
                        <td className="py-2 px-3 font-medium capitalize text-slate-700 dark:text-slate-300">{h.direction}</td>
                        <td className="py-2 px-3">
                          <Badge variant={h.status === 'success' ? 'success' : h.status === 'conflict' ? 'warning' : 'danger'}>
                            {h.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-800 dark:text-slate-200">{h.uploadedCount}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-800 dark:text-slate-200">{h.downloadedCount}</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-bold">{h.conflictCount}</td>
                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-[11px]">{h.startedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFLICT RESOLUTION MODAL */}
      {selectedConflict && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedConflict(null)}
          title={`Resolve Synchronization Conflict: ${selectedConflict.entityType}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-300 space-y-1">
              <div className="font-bold">Reason: {selectedConflict.conflictReason}</div>
              <div>Entity ID: <strong className="font-mono">{selectedConflict.entityId}</strong></div>
              <div>Conflicting Fields: <strong className="font-mono text-rose-700 dark:text-rose-400">{selectedConflict.conflictingFields.join(', ')}</strong></div>
            </div>

            {/* Side-by-side Payload Inspection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex justify-between">
                  <span>Local Workstation Version</span>
                  <Badge variant="primary">v{selectedConflict.localVersion}</Badge>
                </div>
                <pre className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-mono overflow-auto max-h-48 text-slate-800 dark:text-slate-200">
                  {JSON.stringify(selectedConflict.localPayload, null, 2)}
                </pre>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex justify-between">
                  <span>Remote Central Server Version</span>
                  <Badge variant="neutral">v{selectedConflict.remoteVersion}</Badge>
                </div>
                <pre className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-mono overflow-auto max-h-48 text-slate-800 dark:text-slate-200">
                  {JSON.stringify(selectedConflict.remotePayload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Select resolution rule to apply to local database:</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleResolveConflict('local_wins')}
                  loading={resolvingId === selectedConflict.id}
                >
                  Keep Local Data
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleResolveConflict('remote_wins')}
                  loading={resolvingId === selectedConflict.id}
                >
                  Accept Remote Data
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleResolveConflict('merged')}
                  loading={resolvingId === selectedConflict.id}
                >
                  Merge Safe Fields
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* CONFIRM DEACTIVATE LICENSE */}
      <ConfirmDialog
        isOpen={isDeactivateConfirmOpen}
        onClose={() => setIsDeactivateConfirmOpen(false)}
        onConfirm={handleConfirmDeactivateLicense}
        title="Deactivate Workstation License Seat"
        message="Are you sure you want to deactivate this workstation license seat? Local operations will be restricted until reactivated."
        confirmText="Confirm Deactivation"
        variant="danger"
        loading={licenseLoading}
      />
    </div>
  );
};
