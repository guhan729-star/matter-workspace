import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatDate } from "@/client/lib/format";
import { createMatter, getMatters } from "@/serverFunctions/app";

export const Route = createFileRoute("/")({
  loader: () => getMatters({ data: {} }),
  component: MattersPage,
});

function MattersPage() {
  const matters = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Matters"
        actions={
          <Button data-testid="new-matter" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            New matter
          </Button>
        }
      />
      {matters.length === 0 ? (
        <EmptyState
          media="rows"
          icon={Briefcase}
          title="No matters yet"
          description="Create a matter to upload its documents and start working on them."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {matters.map((m) => (
            <li key={m.id} data-testid="matter-row">
              <Link
                to="/matters/$matterId"
                params={{ matterId: m.id }}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{m.client}</div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{m.mine ? "You own this" : m.owner}</div>
                  <div>{formatDate(m.createdAt)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open ? <NewMatterDialog onClose={() => setOpen(false)} /> : null}
    </AppShell>
  );
}

function NewMatterDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const { id } = await createMatter({
        data: {
          name: String(form.get("name") ?? ""),
          client: String(form.get("client") ?? ""),
          description: String(form.get("description") ?? ""),
        },
      });
      await router.navigate({ to: "/matters/$matterId", params: { matterId: id } });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New matter</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field id="matter-name" label="Name">
            <Input id="matter-name" name="name" required autoFocus />
          </Field>
          <Field id="matter-client" label="Client or reference">
            <Input id="matter-client" name="client" />
          </Field>
          <Field id="matter-description" label="Description">
            <Textarea id="matter-description" name="description" rows={3} />
          </Field>
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid="create-matter-submit">
              Create matter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
