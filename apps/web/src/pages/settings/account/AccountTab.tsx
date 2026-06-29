import React from "react";
import { SecurityCredentialsForm } from "./components/SecurityCredentialsForm";
import { TwoFactorAuthForm } from "./components/TwoFactorAuthForm";
import { GlobalSshKeyForm } from "./components/GlobalSshKeyForm";
import { ActiveSessionsPanel } from "./components/ActiveSessionsPanel";

export function AccountTab() {
  return (
    <div className="space-y-6 w-full">
      <SecurityCredentialsForm />
      <TwoFactorAuthForm />
      <ActiveSessionsPanel />
      <GlobalSshKeyForm />
    </div>
  );
}
