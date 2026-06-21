import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Pause, CheckCircle2, AlertTriangle, X, ShieldCheck,
  Download, Server, User,
  Calendar, Clock, ListChecks, Send,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate, timeAgo } from "@/components/common/format";
import { protocolRunsKeys, protocolRunsQuery, protocolTemplatesQuery } from "@/lib/protocols/queries";
import {
  addProtocolRunApproval, addProtocolRunComment, publicProtocolError, runProgress,
  setProtocolRunStatus, updateProtocolRunStep,
} from "@/lib/protocols/protocols";
import type { ProtocolRunStepPatch, ProtocolStatus } from "@/lib/protocols/types";
import { useRole, can } from "@/lib/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/protocols/$id")({
  head: () => ({ meta: [{ title: "Protocol Run · IT Knowledge Center" }] }),
  component: ProtocolRunPage,
});

const STATUS_LABEL: Record<ProtocolStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  waiting: "Waiting",
  waiting_approval: "Waiting Approval",
  completed: "Completed",
  completed_with_issues: "Completed with Issues",
  failed: "Failed",
  cancelled: "Cancelled",
};

function ProtocolRunPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const role = useRole();
  const canWrite = can("protocols.manage", role);
  const qc = useQueryClient();

  const runsQ = useQuery(protocolRunsQuery());
  const templatesQ = useQuery(protocolTemplatesQuery());
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);

  const run = runs.find((r) => r.id === id);
  const template = useMemo(() => run ? templates.find((t) => t.id === run.templateId) : null, [run, templates]);

  const [commentDraft, setCommentDraft] = useState("");
  const [tab, setTab] = useState("overview");
  const [confirmAction, setConfirmAction] = useState<"rejected" | "completed_with_issues" | "failed" | "cancelled" | null>(null);
  const [actionRationale, setActionRationale] = useState("");

  const invalidateRuns = () => qc.invalidateQueries({ queryKey: protocolRunsKeys.all });

  const statusMutation = useMutation({
    mutationFn: ({ runId, status }: { runId: string; status: ProtocolStatus }) => setProtocolRunStatus(runId, status),
    onSuccess: async (_data, vars) => { await invalidateRuns(); toast.success(`Status → ${STATUS_LABEL[vars.status]}`); },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const stepMutation = useMutation({
    mutationFn: ({ runId, stepId, patch }: { runId: string; stepId: string; patch: ProtocolRunStepPatch }) => updateProtocolRunStep(runId, stepId, patch),
    onSuccess: () => invalidateRuns(),
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ runId, decision, comment }: { runId: string; decision: "approved" | "rejected"; comment?: string }) => addProtocolRunApproval(runId, decision, comment),
    onSuccess: async (_data, vars) => {
      await invalidateRuns();
      if (vars.decision === "approved") toast.success("Approved");
      else toast.error("Rejected");
    },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const commentMutation = useMutation({
    mutationFn: ({ runId, body }: { runId: string; body: string }) => addProtocolRunComment(runId, body),
    onSuccess: () => invalidateRuns(),
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  if (runsQ.isError || templatesQ.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Protocol run unavailable"
        description="The shared protocols data could not be loaded."
        actionLabel="Retry"
        onAction={() => { void runsQ.refetch(); void templatesQ.refetch(); }}
      />
    );
  }

  if (runsQ.isLoading || templatesQ.isLoading) {
    return (
      <div>
        <PageHeader title="Protocol Run" />
        <EmptyState icon={ListChecks} title="Loading run" description="Loading protocol run data." />
      </div>
    );
  }

  if (!run || !template) {
    return (
      <div>
        <PageHeader title="Protocol Run" />
        <EmptyState icon={ListChecks} title="Run not found" description="This protocol run no longer exists." />
        <Button variant="outline" onClick={() => navigate({ to: "/protocols" })}><ArrowLeft className="mr-1.5 h-4 w-4" />Back to Protocols</Button>
      </div>
    );
  }

  const progress = runProgress(run);
  const completedSteps = run.steps.filter((s) => s.completed).length;
  const totalRequired = template.steps.filter((s) => s.required).length;
  const requiredDone = template.steps.filter((s) => s.required && run.steps.find((rs) => rs.stepId === s.id)?.completed).length;
  const allRequiredDone = requiredDone >= totalRequired;

  const setStatus = (st: ProtocolStatus) => statusMutation.mutate({ runId: run.id, status: st });
  const toggleStep = (stepId: string, completed: boolean) => {
    stepMutation.mutate({ runId: run.id, stepId, patch: { completed } });
  };

  const isTerminal = ["completed","completed_with_issues","failed","cancelled"].includes(run.status);

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/protocols" })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />All Protocols
        </Button>
      </div>

      <div className="mb-6 glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{run.runNumber}</span>
              <span>·</span>
              <Badge variant="outline">{template.category}</Badge>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{run.templateTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{run.assignedUser ?? "Unassigned"}</span>
              {run.team && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{run.team}</span>}
              {run.startedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Started {timeAgo(run.startedAt)}</span>}
              {run.dueDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due {formatDate(run.dueDate)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge label={STATUS_LABEL[run.status]} tone={statusTone(run.status)} />
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="font-mono text-xs text-muted-foreground">{progress}%</span>
            </div>
            <div className="text-xs text-muted-foreground">{completedSteps}/{run.steps.length} steps</div>
          </div>
        </div>

        {canWrite && !isTerminal && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
            {run.status === "planned" && <Button size="sm" onClick={() => setStatus("in_progress")}><Play className="mr-1.5 h-3.5 w-3.5" />Start</Button>}
            {run.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => setStatus("waiting")}><Pause className="mr-1.5 h-3.5 w-3.5" />Pause</Button>}
            {run.status === "waiting" && <Button size="sm" onClick={() => setStatus("in_progress")}><Play className="mr-1.5 h-3.5 w-3.5" />Resume</Button>}
            {template.approvalRequired && run.status === "in_progress" && allRequiredDone && (
              <Button size="sm" variant="outline" onClick={() => setStatus("waiting_approval")}><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Submit for Approval</Button>
            )}
            {run.status === "waiting_approval" && (
              <>
                <Button size="sm" onClick={() => approvalMutation.mutate({ runId: run.id, decision: "approved" })}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmAction("rejected")}><X className="mr-1.5 h-3.5 w-3.5" />Reject</Button>
              </>
            )}
            <Button size="sm" variant="outline" disabled={!allRequiredDone} onClick={() => setStatus("completed")}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Complete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmAction("completed_with_issues")}>
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Complete with Issues
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmAction("failed")}>Mark Failed</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmAction("cancelled")}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Step checklist */}
        <div className="space-y-3">
          {template.steps.map((step, i) => {
            const rs = run.steps.find((x) => x.stepId === step.id);
            const done = !!rs?.completed;
            return (
              <Card key={step.id} className={cn("p-4 transition-colors", done && "border-emerald-500/30 bg-emerald-500/5")}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={done}
                    onCheckedChange={(c) => toggleStep(step.id, !!c)}
                    disabled={!canWrite || isTerminal}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">Step {i + 1}</span>
                      <span className="font-medium">{step.title}</span>
                      {step.required ? <Badge variant="outline" className="text-[10px]">Required</Badge> : <Badge variant="secondary" className="text-[10px]">Optional</Badge>}
                      {step.approvalCheckpoint && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400"><ShieldCheck className="mr-1 h-2.5 w-2.5" />Checkpoint</Badge>}
                    </div>
                    {step.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{step.instructions}</p>}
                    {step.expectedResult && (
                      <div className="mt-2 rounded-md border border-border/40 bg-background/40 p-2 text-xs">
                        <span className="font-medium text-foreground">Expected:</span> <span className="text-muted-foreground">{step.expectedResult}</span>
                      </div>
                    )}
                    {step.snippet && (
                      <pre className="mt-2 overflow-x-auto rounded-md border border-border/40 bg-background/60 p-2 text-xs"><code>{step.snippet}</code></pre>
                    )}

                    {canWrite && !isTerminal && (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Textarea
                          placeholder="Notes..."
                          className="text-xs"
                          rows={2}
                          value={rs?.notes ?? ""}
                          onChange={(e) => stepMutation.mutate({ runId: run.id, stepId: step.id, patch: { notes: e.target.value } })}
                        />
                        {step.evidenceAllowed && (
                          <Input
                            placeholder="Evidence (URL / reference)"
                            className="text-xs"
                            value={rs?.evidence ?? ""}
                            onChange={(e) => stepMutation.mutate({ runId: run.id, stepId: step.id, patch: { evidence: e.target.value } })}
                          />
                        )}
                      </div>
                    )}
                    {(rs?.notes || rs?.evidence) && !canWrite && (
                      <div className="mt-2 space-y-1 text-xs">
                        {rs.notes && <div className="rounded-md bg-muted/30 p-2"><span className="font-medium">Notes:</span> {rs.notes}</div>}
                        {rs.evidence && <div className="rounded-md bg-muted/30 p-2"><span className="font-medium">Evidence:</span> {rs.evidence}</div>}
                      </div>
                    )}
                    {done && rs?.completedBy && (
                      <div className="mt-2 text-[11px] text-emerald-400">✓ Completed by {rs.completedBy} {rs.completedAt && timeAgo(rs.completedAt)}</div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Side panel */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1 dt-scroll">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="comments" className="flex-1">Comments</TabsTrigger>
              <TabsTrigger value="approvals" className="flex-1">Approvals</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-2">
              <Card className="p-3 text-xs">
                <div className="font-medium">Template</div>
                <div className="text-muted-foreground">{template.title}</div>
                <div className="mt-2 grid grid-cols-2 gap-y-1">
                  <span className="text-muted-foreground">Team</span><span>{run.team ?? "—"}</span>
                  <span className="text-muted-foreground">Est.</span><span>{template.estimatedMinutes}m</span>
                  <span className="text-muted-foreground">Recurrence</span><span className="capitalize">{template.recurrence}</span>
                  <span className="text-muted-foreground">Approval</span><span>{template.approvalRequired ? "Required" : "None"}</span>
                </div>
              </Card>
              {run.finalSummary && (
                <Card className="p-3 text-xs">
                  <div className="font-medium">Final Summary</div>
                  <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{run.finalSummary}</div>
                </Card>
              )}
              {isTerminal && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => {
                  const summary = `Protocol Run ${run.runNumber}\n${run.templateTitle}\nStatus: ${STATUS_LABEL[run.status]}\nCompleted by: ${run.assignedUser}\n\nSteps:\n${run.steps.map((s, i) => {
                    const st = template.steps.find((x) => x.id === s.stepId);
                    return `${i + 1}. [${s.completed ? "x" : " "}] ${st?.title}${s.notes ? `\n   Notes: ${s.notes}` : ""}`;
                  }).join("\n")}`;
                  const blob = new Blob([summary], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `${run.runNumber}.txt`; a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Summary exported");
                }}><Download className="mr-1.5 h-3.5 w-3.5" />Export Summary</Button>
              )}
            </TabsContent>
            <TabsContent value="comments" className="space-y-2">
              {run.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
              {run.comments.map((c) => (
                <Card key={c.id} className="p-2 text-xs">
                  <div className="flex justify-between text-muted-foreground"><span>{c.author}</span><span>{timeAgo(c.at)}</span></div>
                  <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
                </Card>
              ))}
              {canWrite && (
                <div className="flex gap-2">
                  <Textarea rows={2} placeholder="Add a comment..." value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} className="text-xs" />
                  <Button
                    size="sm"
                    aria-label="Add protocol comment"
                    disabled={commentMutation.isPending}
                    onClick={() => {
                      const body = commentDraft.trim();
                      if (!body) return;
                      commentMutation.mutate({ runId: run.id, body }, { onSuccess: () => setCommentDraft("") });
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="approvals" className="space-y-2">
              {run.approvals.length === 0 && <p className="text-xs text-muted-foreground">No approval activity.</p>}
              {run.approvals.map((a) => (
                <Card key={a.id} className="p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.decision === "approved" ? "✓ Approved" : "✗ Rejected"} · {a.by}</span>
                    <span className="text-muted-foreground">{timeAgo(a.at)}</span>
                  </div>
                  {a.comment && <div className="mt-1 text-muted-foreground">{a.comment}</div>}
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setActionRationale("");
          }
        }}
        title={confirmAction === "rejected"
          ? "Reject this protocol run?"
          : confirmAction === "completed_with_issues"
            ? "Complete this run with issues?"
            : confirmAction === "failed"
              ? "Mark this run as failed?"
              : "Cancel this protocol run?"}
        description="This changes the run lifecycle and may affect operational reporting. Review the run before continuing."
        confirmLabel={confirmAction === "rejected" ? "Reject run" : "Confirm status change"}
        destructive={confirmAction === "rejected" || confirmAction === "failed" || confirmAction === "cancelled"}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction === "rejected") {
            approvalMutation.mutate({ runId: run.id, decision: "rejected", comment: actionRationale.trim() || "Rejected" });
          } else {
            setStatus(confirmAction);
          }
          setConfirmAction(null);
          setActionRationale("");
        }}
      >
        {confirmAction === "rejected" && (
          <Textarea
            value={actionRationale}
            onChange={(event) => setActionRationale(event.target.value)}
            placeholder="Reason for rejection (optional)"
            rows={3}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
