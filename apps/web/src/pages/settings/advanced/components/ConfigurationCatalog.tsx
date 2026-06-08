import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Pencil, Trash2, X, Settings2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog } from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  useAdvancedSettings,
  useUpdateSettingMutation,
  useDeleteSettingMutation,
} from "../hooks";

const editSchema = z.object({ value: z.string().min(1, "Value is required") });
type EditForm = z.infer<typeof editSchema>;

export function ConfigurationCatalog() {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useAdvancedSettings();
  const updateMutation = useUpdateSettingMutation(() => setEditKey(null));
  const deleteMutation = useDeleteSettingMutation(() => setDeleteTarget(null));

  const {
    register: regEdit,
    handleSubmit: handleEdit,
    reset: resetEdit,
  } = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const entries = data ? Object.entries(data) : [];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary/70" />
              <CardTitle className="text-base font-bold">
                Configuration Keys
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground">
              <Info className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-tight">
                Read-Write
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="divide-y border-t">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-sm animate-pulse">
                  Fetching configuration catalog\u2026
                </p>
              </div>
            ) : entries.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No custom settings found</p>
              </div>
            ) : (
              entries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-mono text-xs font-bold text-muted-foreground">
                      {key}
                    </p>
                    {editKey === key ? (
                      <form
                        onSubmit={handleEdit((fd) =>
                          updateMutation.mutate({ key, value: fd.value }),
                        )}
                        className="flex items-center gap-2 mt-2"
                      >
                        <Input
                          {...regEdit("value")}
                          defaultValue={value}
                          className="flex-1 h-9 text-sm bg-background border-primary/30 focus-visible:ring-primary/20"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          disabled={updateMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setEditKey(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <p className="text-sm text-foreground mt-1 truncate max-w-md opacity-80">
                        {value}
                      </p>
                    )}
                  </div>
                  {editKey !== key && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-muted"
                        onClick={() => {
                          resetEdit({ value });
                          setEditKey(key);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => setDeleteTarget(key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Confirm Deletion"
        description={`The configuration key "${deleteTarget}" will be permanently removed. This might affect system behavior if the key is in use.`}
        confirmLabel="Delete Permanently"
        confirmVariant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
