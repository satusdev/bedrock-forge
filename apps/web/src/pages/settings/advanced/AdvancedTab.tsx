import React from "react";
import { QuickRegisterForm } from "./components/QuickRegisterForm";
import { ConfigurationCatalog } from "./components/ConfigurationCatalog";

export function AdvancedTab() {
  return (
    <div className="space-y-6 w-full">
      <QuickRegisterForm />
      <ConfigurationCatalog />
    </div>
  );
}
