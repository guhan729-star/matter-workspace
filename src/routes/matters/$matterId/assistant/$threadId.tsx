import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Field } from "@/client/components/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";
import {
  askQuestion,
  deleteThread,
  getAiStatus,
  getDocuments,
  getThread,
  renameThread,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/matters/$matterId/assistant/$threadId")({
  loader: async ({ params }) => {
    const [thread, docs, ai] = await Promise.all([
      getThread({ data: { id: params.threadId } }),
      getDocuments({ data: { id: params.matterId } }),
      getAiStatus({ data: {} }),
    ]);
    return { thread, docs, ai };
  },
  component: ThreadPage,
});

function ThreadPage() {
  const { thread, docs, ai } = Route.useLoaderData();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(
    thread.documentIds.length ? thread.documentIds.filter((id) => docs.some((d) => d.id === id)) : docs.map((d) => d.id),
  );
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [aiOff, setAiOff] = useState(ai.on ? null : ai.message);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    try {
      const { aiOff: off } = await askQuestion({ data: { threadId: thread.id, question, documentIds: selected } });
      if (off) setAiOff(off);
      else setQuestion("");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
    setAsking(false);
  }

  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/matters/$matterId/assistant"
          params={{ matterId: thread.matterId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Threads
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{thread.title}</h2>
          {thread.isAuthor ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" data-testid="rename-thread" onClick={() => setRenaming(true)}>
                <Pencil aria-hidden />
                Rename
              </Button>
              <Button variant="ghost" size="sm" data-testid="delete-thread" onClick={() => setDeleting(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          {thread.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ask a question about the chosen documents.</p>
          ) : null}
          {thread.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} data-testid="message-user" className="ml-auto max-w-[85%] rounded-lg bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div key={m.id} data-testid="message-assistant" className="space-y-3 rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.citations.length ? (
                  <ul className="space-y-2">
                    {m.citations.map((c, i) => (
                      <li key={i} data-testid="citation" className="border-l-2 border-primary pl-3 text-sm">
                        <a href={`/api/documents/${c.documentId}/file`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          {c.documentName}
                        </a>
                        <blockquote className="text-muted-foreground">“{c.quote}”</blockquote>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          )}
          {thread.canPost ? (
            <form onSubmit={ask} className="space-y-2">
              {aiOff ? (
                <Alert data-testid="ai-off">
                  <AlertDescription>{aiOff}</AlertDescription>
                </Alert>
              ) : null}
              <Textarea
                data-testid="composer"
                aria-label="Question"
                rows={3}
                placeholder="Ask about these documents"
                value={question}
                disabled={!!aiOff || asking}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <div className="flex justify-end">
                <Button type="submit" data-testid="send" pending={asking} disabled={!!aiOff || !question.trim() || selected.length === 0}>
                  <Send aria-hidden />
                  Ask
                </Button>
              </div>
            </form>
          ) : null}
        </div>
        <aside className="space-y-2">
          <h3 className="text-sm font-medium">Documents used</h3>
          {docs.length === 0 ? <p className="text-sm text-muted-foreground">This matter has no documents.</p> : null}
          {docs.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                data-testid="thread-doc"
                checked={selected.includes(d.id)}
                disabled={!thread.canPost}
                onCheckedChange={(on) => toggle(d.id, on)}
              />
              <span className="truncate">{d.name}</span>
            </label>
          ))}
        </aside>
      </div>

      {renaming ? <RenameThread id={thread.id} title={thread.title} onClose={() => setRenaming(false)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this thread?"
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await deleteThread({ data: { id: thread.id } });
              await router.navigate({ to: "/matters/$matterId/assistant", params: { matterId: thread.matterId } });
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        />
      ) : null}
    </section>
  );
}

function RenameThread({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename thread</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await renameThread({ data: { id, title: value } });
              await router.invalidate();
              onClose();
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <Field id="thread-name" label="Thread name">
            <Input id="thread-name" value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="submit" data-testid="rename-thread-submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
