import React, { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useBackupSchedule,
  useSaveBackupScheduleMutation,
  useDeleteBackupScheduleMutation,
} from "../hooks";

const FREQ_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BackupScheduleConfig() {
  const { data: existingSchedule } = useBackupSchedule();

  const [scheduleFreq, setScheduleFreq] = useState<
    "hourly" | "daily" | "weekly" | "monthly"
  >("daily");
  const [scheduleHour, setScheduleHour] = useState(3);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(0);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleRetentionCount, setScheduleRetentionCount] = useState("");
  const [scheduleRetentionDays, setScheduleRetentionDays] = useState("");

  useEffect(() => {
    if (!existingSchedule) return;
    setScheduleFreq(existingSchedule.frequency);
    setScheduleHour(existingSchedule.hour);
    setScheduleMinute(existingSchedule.minute);
    setScheduleDayOfWeek(existingSchedule.day_of_week ?? 0);
    setScheduleDayOfMonth(existingSchedule.day_of_month ?? 1);
    setScheduleEnabled(existingSchedule.enabled);
    setScheduleRetentionCount(
      existingSchedule.retention_count != null
        ? String(existingSchedule.retention_count)
        : "",
    );
    setScheduleRetentionDays(
      existingSchedule.retention_days != null
        ? String(existingSchedule.retention_days)
        : "",
    );
  }, [existingSchedule]);

  const saveSchedule = useSaveBackupScheduleMutation();
  const deleteSchedule = useDeleteBackupScheduleMutation();

  const handleSave = () => {
    saveSchedule.mutate({
      frequency: scheduleFreq,
      hour: scheduleHour,
      minute: scheduleMinute,
      ...(scheduleFreq === "weekly" ? { day_of_week: scheduleDayOfWeek } : {}),
      ...(scheduleFreq === "monthly"
        ? { day_of_month: scheduleDayOfMonth }
        : {}),
      enabled: scheduleEnabled,
      retention_count: scheduleRetentionCount
        ? Number(scheduleRetentionCount)
        : null,
      retention_days: scheduleRetentionDays
        ? Number(scheduleRetentionDays)
        : null,
    });
  };

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Backup Schedule
        </h3>
        <Switch
          checked={scheduleEnabled}
          onCheckedChange={setScheduleEnabled}
          aria-label="Enable backup schedule"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Frequency</Label>
          <select
            className="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
            value={scheduleFreq}
            onChange={(e) =>
              setScheduleFreq(e.target.value as typeof scheduleFreq)
            }
          >
            {Object.entries(FREQ_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {scheduleFreq !== "hourly" && (
          <div className="space-y-1">
            <Label>Time (UTC)</Label>
            <div className="flex gap-1 items-center">
              <Input
                type="number"
                min={0}
                max={23}
                value={scheduleHour}
                onChange={(e) => setScheduleHour(Number(e.target.value))}
                className="w-16 text-center"
                placeholder="HH"
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={scheduleMinute}
                onChange={(e) => setScheduleMinute(Number(e.target.value))}
                className="w-16 text-center"
                placeholder="MM"
              />
            </div>
          </div>
        )}

        {scheduleFreq === "hourly" && (
          <div className="space-y-1">
            <Label>Minute</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={scheduleMinute}
              onChange={(e) => setScheduleMinute(Number(e.target.value))}
              className="w-20"
            />
          </div>
        )}

        {scheduleFreq === "weekly" && (
          <div className="space-y-1 col-span-2">
            <Label>Day of week</Label>
            <div className="flex gap-1 flex-wrap">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setScheduleDayOfWeek(i)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    scheduleDayOfWeek === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {scheduleFreq === "monthly" && (
          <div className="space-y-1">
            <Label>Day of month</Label>
            <Input
              type="number"
              min={1}
              max={28}
              value={scheduleDayOfMonth}
              onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
              className="w-20"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <div className="space-y-1">
          <Label>Keep last N backups</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={scheduleRetentionCount}
            onChange={(e) => setScheduleRetentionCount(e.target.value)}
            placeholder="unlimited"
            className="w-28"
          />
        </div>
        <div className="space-y-1">
          <Label>Delete after N days</Label>
          <Input
            type="number"
            min={1}
            max={365}
            value={scheduleRetentionDays}
            onChange={(e) => setScheduleRetentionDays(e.target.value)}
            placeholder="never"
            className="w-28"
          />
        </div>
      </div>

      {existingSchedule?.last_run_at && (
        <p className="text-xs text-muted-foreground">
          Last run: {new Date(existingSchedule.last_run_at).toLocaleString()}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saveSchedule.isPending}
        >
          {saveSchedule.isPending ? "Saving…" : "Save Schedule"}
        </Button>
        {existingSchedule && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => deleteSchedule.mutate()}
            disabled={deleteSchedule.isPending}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
