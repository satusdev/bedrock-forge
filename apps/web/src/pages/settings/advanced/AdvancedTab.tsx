import React from "react";
import { QuickRegisterForm } from "./components/QuickRegisterForm";
import { ConfigurationCatalog } from "./components/ConfigurationCatalog";

export function AdvancedTab() {
  return (
    <div className="space-y-6 max-w-4xl">
      <QuickRegisterForm />
      <ConfigurationCatalog />
    </div>
  );
}
