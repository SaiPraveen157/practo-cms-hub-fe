"use client"

import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { forceMoveWorkflow, unlockScriptContent } from "@/lib/users-api"
import { useAuthStore } from "@/store"
import { toast } from "sonner"

const FORCE_STAGES = [
  "DRAFT",
  "CONTENT_BRAND_REVIEW",
  "AGENCY_PRODUCTION",
  "MEDICAL_REVIEW",
  "CONTENT_BRAND_APPROVAL",
  "CONTENT_APPROVER_REVIEW",
  "LOCKED",
] as const

export default function WorkflowToolsPage() {
  const token = useAuthStore((s) => s.token)
  const [scriptId, setScriptId] = useState("")
  const [targetStage, setTargetStage] =
    useState<(typeof FORCE_STAGES)[number]>("LOCKED")
  const [forceLoading, setForceLoading] = useState(false)
  const [unlockLoading, setUnlockLoading] = useState(false)

  async function handleForceMove() {
    if (!token) {
      toast.error("Not signed in")
      return
    }
    const id = scriptId.trim()
    if (!id) {
      toast.error("Enter a script ID")
      return
    }
    setForceLoading(true)
    try {
      const res = await forceMoveWorkflow(token, id, targetStage)
      if (res.success === false && res.message) {
        toast.error(res.message)
      } else {
        toast.success(res.message ?? "Workflow updated")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed")
    } finally {
      setForceLoading(false)
    }
  }

  async function handleUnlock() {
    if (!token) {
      toast.error("Not signed in")
      return
    }
    const id = scriptId.trim()
    if (!id) {
      toast.error("Enter a script ID")
      return
    }
    setUnlockLoading(true)
    try {
      const res = await unlockScriptContent(token, id)
      if (res.success === false && res.message) {
        toast.error(res.message)
      } else {
        toast.success(res.message ?? "Script unlocked")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed")
    } finally {
      setUnlockLoading(false)
    }
  }

  return (
    <AdminPageShell maxWidth="6xl">
      <div className="space-y-8">
        <AdminPageHeader
          title="Workflow tools"
          description="Emergency actions for Super Admin only. Skips normal validation — use with care."
        />

        <Card className="border-amber-500/40 bg-amber-500/5 shadow-none">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div>
              <CardTitle className="text-base">Before you continue</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Force move can place a script in any stage regardless of rules.
                Unlock only works when the script is LOCKED and moves it to
                CONTENT_APPROVER_REVIEW.
              </p>
            </div>
          </CardHeader>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Script ID</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paste the script UUID. Same ID is used for force move and unlock.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="wf-script-id">Script ID</Label>
              <Input
                id="wf-script-id"
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value)}
                placeholder="e.g. uuid from URL or content library"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium">Force move workflow</p>
              <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <div className="space-y-2">
                  <Label>Target stage</Label>
                  <Select
                    value={targetStage}
                    onValueChange={(v) =>
                      setTargetStage(
                        (v ?? "LOCKED") as (typeof FORCE_STAGES)[number]
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORCE_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={forceLoading}
                  onClick={() => void handleForceMove()}
                  className="w-full sm:w-auto"
                >
                  {forceLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Force move"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium">Unlock script</p>
              <p className="text-xs text-muted-foreground">
                LOCKED → CONTENT_APPROVER_REVIEW (emergency reopen).
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={unlockLoading}
                onClick={() => void handleUnlock()}
              >
                {unlockLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Unlock script"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  )
}
