import React from "react";
import { useAutomationSettings, useUpdateSettingMutation } from "./hooks";
import { SafetySettings } from "./components/SafetySettings";
import { RetentionSettings } from "./components/RetentionSettings";
import { AdvancedAutomation } from "./components/AdvancedAutomation";

export function AutomationTab() {
  const { data, isLoading } = useAutomationSettings();
  const updateMutation = useUpdateSettingMutation();

  const handleUpdate = (key: string, value: string) => {
    updateMutation.mutate({ key, value });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <SafetySettings
        data={data}
        isLoading={isLoading}
        isPending={updateMutation.isPending}
        onUpdate={handleUpdate}
      />
      <RetentionSettings
        data={data}
        isLoading={isLoading}
        isPending={updateMutation.isPending}
        onUpdate={handleUpdate}
      />
      <AdvancedAutomation
        data={data}
        isLoading={isLoading}
        isPending={updateMutation.isPending}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
