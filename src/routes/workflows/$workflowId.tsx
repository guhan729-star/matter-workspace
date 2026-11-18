import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { WorkflowForm } from "@/client/components/WorkflowForm";
import { getWorkflow } from "@/serverFunctions/app";
import { BackToWorkflows } from "./new";

export const Route = createFileRoute("/workflows/$workflowId")({
  loader: ({ params }) => getWorkflow({ data: { id: params.workflowId } }),
  component: EditWorkflow,
});

function EditWorkflow() {
  const { id, ...values } = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader title="Edit workflow" backLink={<BackToWorkflows />} />
      <WorkflowForm key={id} id={id} initial={values} />
    </AppShell>
  );
}
