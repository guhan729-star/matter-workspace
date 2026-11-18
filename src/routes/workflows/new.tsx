import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { EMPTY_WORKFLOW, WorkflowForm } from "@/client/components/WorkflowForm";

export const Route = createFileRoute("/workflows/new")({
  component: () => (
    <AppShell>
      <PageHeader title="New workflow" backLink={<BackToWorkflows />} />
      <WorkflowForm initial={EMPTY_WORKFLOW} />
    </AppShell>
  ),
});

export function BackToWorkflows() {
  return (
    <Link to="/workflows" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden />
      Workflows
    </Link>
  );
}
