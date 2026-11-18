import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Table2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
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
import { errorMessage, formatDate } from "@/client/lib/format";
import { createReview, getDocuments, getReviews } from "@/serverFunctions/app";
import { useMatter } from "../route";

export const Route = createFileRoute("/matters/$matterId/reviews/")({
  loader: async ({ params }) => {
    const [list, docs] = await Promise.all([
      getReviews({ data: { id: params.matterId } }),
      getDocuments({ data: { id: params.matterId } }),
    ]);
    return { ...list, docs };
  },
  component: ReviewsTab,
});

function ReviewsTab() {
  const matter = useMatter();
  const { reviews, canEdit, templates, docs } = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {canEdit ? (
          <Button data-testid="new-review" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            New review
          </Button>
        ) : null}
      </div>
      {reviews.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No reviews yet"
          description={canEdit ? "A review puts documents in rows and your questions in columns." : undefined}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link
                to="/matters/$matterId/reviews/$reviewId"
                params={{ matterId: matter.id, reviewId: r.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {r.createdBy} · {formatDate(r.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open ? <NewReview matterId={matter.id} docs={docs} templates={templates} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function NewReview({
  matterId,
  docs,
  templates,
  onClose,
}: {
  matterId: string;
  docs: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(docs.map((d) => d.id));
  const [templateId, setTemplateId] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const { id } = await createReview({
                data: { matterId, name, documentIds: selected, templateId: templateId || undefined },
              });
              await router.navigate({ to: "/matters/$matterId/reviews/$reviewId", params: { matterId, reviewId: id } });
            } catch (error) {
              toast.error(errorMessage(error));
              setPending(false);
            }
          }}
        >
          <Field id="review-name" label="Review name">
            <Input id="review-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field id="review-template" label="Columns from a template">
            <NativeSelect id="review-template" data-testid="review-template" className="w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <NativeSelectOption value="">None</NativeSelectOption>
              {templates.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Documents</legend>
            {docs.length === 0 ? <p className="text-sm text-muted-foreground">Upload documents to the matter first.</p> : null}
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
          <DialogFooter>
            <Button type="submit" pending={pending} disabled={selected.length === 0} data-testid="create-review-submit">
              Create review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
