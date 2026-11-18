import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { errorMessage } from "@/client/lib/format";
import { deleteWorkflow, getWorkflows } from "@/serverFunctions/app";

export const Route = createFileRoute("/workflows/")({
  loader: () => getWorkflows({ data: {} }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const workflows = Route.useLoaderData();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  return (
    <AppShell>
      <PageHeader
        title="Workflows"
        actions={
          <Button render={<Link to="/workflows/new" />} data-testid="new-workflow">
            <Plus aria-hidden />
            New workflow
          </Button>
        }
      />
      {workflows.length === 0 ? (
        <EmptyState
          media="rows"
          icon={Workflow}
          title="No workflows yet"
          description="Write the steps once, then run them on any matter's documents."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {workflows.map((w) => (
            <li key={w.id} data-testid="workflow-row" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{w.name}</span>
                  <Badge variant={w.published ? "secondary" : "outline"}>{w.published ? "Published" : "Private"}</Badge>
                </div>
                {w.description ? <div className="truncate text-sm text-muted-foreground">{w.description}</div> : null}
                <div className="text-xs text-muted-foreground">
                  {w.author} · {w.slots.join(", ")} · {w.outputFormat === "table" ? "Table" : "Report"}
                </div>
              </div>
              {w.canManage ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${w.name}`}
                    render={<Link to="/workflows/$workflowId" params={{ workflowId: w.id }} />}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${w.name}`}
                    data-testid="delete-workflow"
                    onClick={() => setDeleting(w)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteWorkflow({ data: { id: deleting.id } });
              setDeleting(null);
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}
