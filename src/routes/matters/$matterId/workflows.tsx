import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { RunStatus } from "@/client/components/RunStatus";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import { getDocuments, getRuns, getWorkflows, runWorkflow } from "@/serverFunctions/app";
import { useMatter } from "./route";

export const Route = createFileRoute("/matters/$matterId/workflows")({
  loader: async ({ params }) => {
    const [runs, workflows, docs] = await Promise.all([
      getRuns({ data: { id: params.matterId } }),
      getWorkflows({ data: {} }),
      getDocuments({ data: { id: params.matterId } }),
    ]);
    return { ...runs, workflows, docs };
  },
  component: MatterWorkflowsTab,
});

function MatterWorkflowsTab() {
  const matter = useMatter();
  const { runs, canRun, workflows, docs } = Route.useLoaderData();
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [context, setContext] = useState("");
  const [pending, setPending] = useState(false);
  const [aiOff, setAiOff] = useState<string | null>(null);
  const workflow = workflows.find((w) => w.id === workflowId);
  const ready = workflow && workflow.slots.every((s) => inputs[s]);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!workflow) return;
    setPending(true);
    try {
      const { result, aiOff: off } = await runWorkflow({
        data: {
          matterId: matter.id,
          workflowId: workflow.id,
          inputs: workflow.slots.map((slot) => ({ slot, documentId: inputs[slot] ?? "" })),
          context,
        },
      });
      if (off || !result) {
        if (off) 
        setAiOff(off);
        setPending(false);
        return;
      }
      await router.navigate({ to: "/matters/$matterId/runs/$runId", params: { matterId: matter.id, runId: result.id } });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }

  return (
    <section className="space-y-8">
      {canRun ? (
        <form onSubmit={run} className="max-w-xl space-y-4">
          <h2 className="text-lg font-semibold">Run a workflow</h2>
          {aiOff ? (
            <Alert data-testid="ai-off">
              <AlertDescription>{aiOff}</AlertDescription>
            </Alert>
          ) : null}
          <Field id="run-workflow" label="Workflow">
            <NativeSelect
              id="run-workflow"
              data-testid="run-workflow-select"
              className="w-full"
              value={workflowId}
              onChange={(e) => {
                setWorkflowId(e.target.value);
                setInputs({});
              }}
            >
              <NativeSelectOption value="">{workflows.length ? "Choose a workflow" : "No workflows yet"}</NativeSelectOption>
              {workflows.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {workflow?.description ? <p className="text-sm text-muted-foreground">{workflow.description}</p> : null}
          {workflow?.slots.map((slot, i) => (
            <Field key={slot} id={`slot-${i}`} label={slot}>
              <NativeSelect
                id={`slot-${i}`}
                data-testid="slot-document"
                className="w-full"
                value={inputs[slot] ?? ""}
                onChange={(e) => setInputs((v) => ({ ...v, [slot]: e.target.value }))}
              >
                <NativeSelectOption value="">Choose a document</NativeSelectOption>
                {docs.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ))}
          {workflow ? (
            <Field id="run-context" label="Extra context">
              <Textarea id="run-context" rows={3} value={context} onChange={(e) => setContext(e.target.value)} />
            </Field>
          ) : null}
          <Button type="submit" data-testid="run-workflow" pending={pending} disabled={!ready}>
            <Play aria-hidden />
            Run
          </Button>
          {workflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Link to="/workflows/new" className="underline">
                Create a workflow
              </Link>{" "}
              to run it here.
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {runs.map((r) => (
              <li key={r.id} data-testid="run-row">
                <Link
                  to="/matters/$matterId/runs/$runId"
                  params={{ matterId: matter.id, runId: r.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="truncate font-medium">{r.workflowName}</span>
                  <span className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                    {r.author} · {formatDateTime(r.createdAt)}
                    <RunStatus status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
