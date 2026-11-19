import React from 'react';
import { LoginView } from './LoginView';

interface InitialSetupViewProps {
  onSetupComplete: () => void;
  defaultSchoolName?: string;
}

/**
 * Legacy InitialSetupView wrapper.
 * Replaced independent school registration with unified SaaS Cloud Authentication & Workstation Activation.
 */
export const InitialSetupView: React.FC<InitialSetupViewProps> = ({ onSetupComplete, defaultSchoolName }) => {
  return (
    <LoginView
      isProvisioned={false}
      schoolName={defaultSchoolName}
      onLoginSuccess={() => onSetupComplete()}
      onProvisionComplete={() => onSetupComplete()}
    />
  );
};
