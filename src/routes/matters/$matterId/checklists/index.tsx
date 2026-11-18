import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
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
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { errorMessage } from "@/client/lib/format";
import { createChecklist, getChecklists, getDocuments } from "@/serverFunctions/app";
import { useMatter } from "../route";

export const Route = createFileRoute("/matters/$matterId/checklists/")({
  loader: async ({ params }) => {
    const [lists, docs] = await Promise.all([
      getChecklists({ data: { id: params.matterId } }),
      getDocuments({ data: { id: params.matterId } }),
    ]);
    return { ...lists, docs };
  },
  component: ChecklistsTab,
});

function ChecklistsTab() {
  const matter = useMatter();
  const { checklists, canEdit, docs } = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Checklists</h2>
        {canEdit ? (
          <Button data-testid="new-checklist" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            New checklist
          </Button>
        ) : null}
      </div>
      {checklists.length === 0 ? (
        <EmptyState icon={ListChecks} title="No checklists yet" description={canEdit ? "Start one by hand or draft it from documents." : undefined} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {checklists.map((c) => (
            <li key={c.id}>
              <Link
                to="/matters/$matterId/checklists/$checklistId"
                params={{ matterId: matter.id, checklistId: c.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground">
                  {c.done} / {c.total} done
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open ? <NewChecklist matterId={matter.id} docs={docs} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function NewChecklist({ matterId, docs, onClose }: { matterId: string; docs: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"blank" | "generate">("blank");
  const [selected, setSelected] = useState(docs.map((d) => d.id));
  const [pending, setPending] = useState(false);
  const [aiOff, setAiOff] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New checklist</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const { result, aiOff: off } = await createChecklist({
                data: { matterId, name, generateFrom: mode === "generate" ? selected : undefined },
              });
              if (off || !result) {
                if (off) 
                setAiOff(off);
                setPending(false);
                return;
              }
              await router.navigate({ to: "/matters/$matterId/checklists/$checklistId", params: { matterId, checklistId: result.id } });
            } catch (error) {
              toast.error(errorMessage(error));
              setPending(false);
            }
          }}
        >
          <Field id="checklist-name" label="Checklist name">
            <Input id="checklist-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field id="checklist-mode" label="Start from">
            <NativeSelect id="checklist-mode" data-testid="checklist-mode" className="w-full" value={mode} onChange={(e) => setMode(e.target.value as "blank" | "generate")}>
              <NativeSelectOption value="blank">An empty list</NativeSelectOption>
              <NativeSelectOption value="generate">A draft from documents</NativeSelectOption>
            </NativeSelect>
          </Field>
          {mode === "generate" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Documents</legend>
              {docs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(d.id)}
                    onCheckedChange={(on) => setSelected((s) => (on ? [...s, d.id] : s.filter((x) => x !== d.id)))}
                  />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {aiOff ? (
            <Alert data-testid="ai-off">
              <AlertDescription>{aiOff}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="submit" pending={pending} disabled={mode === "generate" && selected.length === 0} data-testid="create-checklist-submit">
              Create checklist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
