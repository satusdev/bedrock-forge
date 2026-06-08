import React from "react";
import { SecurityCredentialsForm } from "./components/SecurityCredentialsForm";
import { GlobalSshKeyForm } from "./components/GlobalSshKeyForm";

export function AccountTab() {
  return (
    <div className="space-y-6 max-w-4xl">
      <SecurityCredentialsForm />
      <GlobalSshKeyForm />
    </div>
  );
}
