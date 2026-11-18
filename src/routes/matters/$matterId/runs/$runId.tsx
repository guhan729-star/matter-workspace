import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { RunStatus } from "@/client/components/RunStatus";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatDateTime } from "@/client/lib/format";
import { getRun } from "@/serverFunctions/app";

export const Route = createFileRoute("/matters/$matterId/runs/$runId")({
  loader: ({ params }) => getRun({ data: { id: params.runId } }),
  component: RunPage,
});

function RunPage() {
  const run = Route.useLoaderData();
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/matters/$matterId/workflows"
          params={{ matterId: run.matterId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Run history
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{run.workflowName}</h2>
          <RunStatus status={run.status} testId="run-status" />
        </div>
        <p className="text-sm text-muted-foreground">
          {run.author} · {formatDateTime(run.createdAt)}
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {run.inputs.map((input) => (
          <div key={input.slot} className="contents">
            <dt className="text-muted-foreground">{input.slot}</dt>
            <dd>
              <a href={`/api/documents/${input.documentId}/file`} target="_blank" rel="noreferrer" className="hover:underline">
                {input.documentName}
              </a>
            </dd>
          </div>
        ))}
        {run.context ? (
          <div className="contents">
            <dt className="text-muted-foreground">Extra context</dt>
            <dd className="whitespace-pre-wrap">{run.context}</dd>
          </div>
        ) : null}
      </dl>
      {run.status === "failed" ? (
        <Alert variant="destructive">
          <AlertDescription>{run.error ?? "The run failed."}</AlertDescription>
        </Alert>
      ) : null}
      {run.status === "done" ? (
        <div data-testid="run-output" className="rounded-lg border border-border bg-card">
          {run.table ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {run.table.fields.map((f) => (
                    <TableHead key={f}>{f}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.table.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((value, j) => (
                      <TableCell key={j} className="align-top whitespace-normal">
                        {value}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-4 py-3 text-sm whitespace-pre-wrap">{run.report}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
