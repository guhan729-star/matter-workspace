import { Badge } from "@/client/components/ui/badge";

const LABEL = { running: "Running", done: "Done", failed: "Failed" } as const;

export function RunStatus({ status, testId }: { status: keyof typeof LABEL; testId?: string }) {
  return (
    <Badge data-testid={testId} variant={status === "failed" ? "destructive" : status === "done" ? "secondary" : "outline"}>
      {LABEL[status]}
    </Badge>
  );
}
