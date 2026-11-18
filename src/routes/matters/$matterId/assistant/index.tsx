import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { MessagesSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { errorMessage, formatDate } from "@/client/lib/format";
import { createThread, getThreads } from "@/serverFunctions/app";
import { useMatter } from "../route";

export const Route = createFileRoute("/matters/$matterId/assistant/")({
  loader: ({ params }) => getThreads({ data: { id: params.matterId } }),
  component: ThreadsTab,
});

function ThreadsTab() {
  const matter = useMatter();
  const { threads, canPost } = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function start() {
    setPending(true);
    try {
      const { id } = await createThread({ data: { matterId: matter.id } });
      await router.navigate({ to: "/matters/$matterId/assistant/$threadId", params: { matterId: matter.id, threadId: id } });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Threads</h2>
        {canPost ? (
          <Button data-testid="new-thread" pending={pending} onClick={() => void start()}>
            <Plus aria-hidden />
            New thread
          </Button>
        ) : null}
      </div>
      {threads.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No threads yet" description={canPost ? "Start one to ask about this matter's documents." : undefined} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {threads.map((t) => (
            <li key={t.id} data-testid="thread-row">
              <Link
                to="/matters/$matterId/assistant/$threadId"
                params={{ matterId: matter.id, threadId: t.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="truncate font-medium">{t.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t.author} · {formatDate(t.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
