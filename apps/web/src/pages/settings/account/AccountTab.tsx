import React from "react";
import { SecurityCredentialsForm } from "./components/SecurityCredentialsForm";
import { TwoFactorAuthForm } from "./components/TwoFactorAuthForm";
import { GlobalSshKeyForm } from "./components/GlobalSshKeyForm";
import { ActiveSessionsPanel } from "./components/ActiveSessionsPanel";

export function AccountTab() {
  return (
    <div className="space-y-6 max-w-4xl">
      <SecurityCredentialsForm />
      <TwoFactorAuthForm />
      <ActiveSessionsPanel />
      <GlobalSshKeyForm />
    </div>
  );
}
