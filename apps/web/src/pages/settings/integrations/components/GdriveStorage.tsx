import { useState } from "react";
import {
  Cloud,
  ShieldCheck,
  Check,
  Loader2,
  Trash2,
  CloudOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog } from "@/components/ui/alert-dialog";
import {
  useGdriveStatus,
  useSaveGdrive,
  useTestGdrive,
  useDeleteGdrive,
} from "../hooks";

export function GdriveStorage() {
  const [gdriveToken, setGdriveToken] = useState("");
  const [deleteGdriveOpen, setDeleteGdriveOpen] = useState(false);
  const [gdriveTestResult, setGdriveTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data: gdriveStatus } = useGdriveStatus();
  const saveGdrive = useSaveGdrive();
  const testGdrive = useTestGdrive();
  const deleteGdrive = useDeleteGdrive();

  async function handleSaveAndTest() {
    if (!gdriveToken.trim()) return;
    await saveGdrive.mutateAsync(gdriveToken.trim());
    setGdriveToken("");
    setGdriveTestResult(null);
    const testResult = await testGdrive.mutateAsync();
    setGdriveTestResult(testResult);
  }

  async function handleTestGdrive() {
    setGdriveTestResult(null);
    const testResult = await testGdrive.mutateAsync();
    setGdriveTestResult(testResult);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-info/10 rounded-lg">
            <Cloud className="h-5 w-5 text-info" />
          </div>
          <div>
            <CardTitle className="text-lg">Storage Providers</CardTitle>
            <CardDescription>
              Configure external storage for your backups and files.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="border rounded-xl p-5 bg-muted/20 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-background flex items-center justify-center border shadow-sm shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.5 17.5L12.5 9H21.5L17.5 17.5Z" fill="#FFC107" />
                  <path
                    d="M6.5 17.5H17.5L12.5 9H6.5L17.5 17.5Z"
                    fill="#FFC107"
                  />
                  <path
                    d="M6.5 17.5L2.5 10.5L7.5 2H16.5L12.5 9L6.5 17.5Z"
                    fill="#2196F3"
                  />
                  <path d="M7.5 2L12.5 9H21.5L16.5 2H7.5Z" fill="#4CAF50" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold">Google Drive</p>
                <p className="text-xs text-muted-foreground">
                  Cloud storage for system and project backups
                </p>
              </div>
            </div>
            {gdriveStatus?.configured ? (
              <Badge variant="success" className="gap-1.5 px-3 py-1">
                <Check className="h-3.5 w-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground px-3 py-1"
              >
                Not Configured
              </Badge>
            )}
          </div>

          <div className="bg-background/50 border rounded-lg overflow-hidden">
            <details className="group">
              <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-between list-none">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Configuration Guide
                </div>
                <span className="transition-transform group-open:rotate-180">
                  &#9662;
                </span>
              </summary>
              <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground border-t">
                <p>
                  Run this command in your terminal to authorize Bedrock Forge
                  to access your Google Drive:
                </p>
                <div className="relative group/code">
                  <pre className="bg-muted/50 rounded-lg px-4 py-3 font-mono text-[11px] overflow-x-auto border">
                    docker exec -it bedrock-forge-forge-1 rclone authorize
                    &quot;drive&quot;
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover/code:opacity-100 transition-opacity"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        'docker exec -it bedrock-forge-forge-1 rclone authorize "drive"',
                      )
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </Button>
                </div>
                <p>
                  Follow the browser prompts, then copy/paste the resulting JSON
                  token below.
                </p>
              </div>
            </details>
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="gdrive-token"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {gdriveStatus?.configured
                ? "Update rclone JSON token"
                : "Paste rclone JSON token"}
            </Label>
            <Textarea
              id="gdrive-token"
              rows={4}
              className="font-mono text-[11px] resize-none bg-background shadow-inner"
              placeholder='{"access_token":"ya29.xxx", ...}'
              value={gdriveToken}
              onChange={(e) => {
                setGdriveToken(e.target.value);
                setGdriveTestResult(null);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              size="sm"
              className="transition-all shadow-md shadow-primary/15 active:scale-95"
              onClick={handleSaveAndTest}
              disabled={
                saveGdrive.isPending ||
                testGdrive.isPending ||
                gdriveToken.trim().length < 20
              }
            >
              {saveGdrive.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save & Test Connection"
              )}
            </Button>

            {gdriveStatus?.configured && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="transition-all active:scale-95"
                  onClick={handleTestGdrive}
                  disabled={testGdrive.isPending}
                >
                  {testGdrive.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Refresh Connection"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => setDeleteGdriveOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {gdriveTestResult && (
            <div
              className={`text-xs px-4 py-3 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                gdriveTestResult.success
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                  gdriveTestResult.success
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {gdriveTestResult.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <CloudOff className="h-4 w-4" />
                )}
              </div>
              <span className="font-medium">{gdriveTestResult.message}</span>
            </div>
          )}
        </div>

        <AlertDialog
          open={deleteGdriveOpen}
          onOpenChange={setDeleteGdriveOpen}
          title="Remove Google Drive Credentials"
          description="Google Drive credentials will be permanently removed. Future backups will be stored locally only. Are you sure?"
          confirmLabel="Yes, Remove Credentials"
          confirmVariant="destructive"
          onConfirm={async () => {
            await deleteGdrive.mutateAsync();
            setDeleteGdriveOpen(false);
            setGdriveTestResult(null);
          }}
          isPending={deleteGdrive.isPending}
        />
      </CardContent>
    </Card>
  );
}
