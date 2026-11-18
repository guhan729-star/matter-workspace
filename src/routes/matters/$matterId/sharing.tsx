import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { errorMessage } from "@/client/lib/format";
import { deleteMatter, getSharing, shareMatter, unshareMatter } from "@/serverFunctions/app";
import { useMatter } from "./route";

export const Route = createFileRoute("/matters/$matterId/sharing")({
  loader: ({ params }) => getSharing({ data: { id: params.matterId } }),
  component: SharingTab,
});

function SharingTab() {
  const matter = useMatter();
  const sharing = Route.useLoaderData();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>, done?: string) {
    try {
      await action();
      if (done) toast.success(done);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">People</h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        <li className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="truncate">{sharing.owner}</span>
          <span className="text-sm text-muted-foreground">Owner</span>
        </li>
        {sharing.shares.map((s) => (
          <li key={s.userId} data-testid="share-row" className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate">{s.email}</span>
            {matter.isOwner ? (
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label={`Role for ${s.email}`}
                  data-testid="share-row-role"
                  value={s.role}
                  onChange={(e) =>
                    void run(
                      () => shareMatter({ data: { matterId: matter.id, userId: s.userId, role: e.target.value as "editor" | "viewer" } }),
                      "Role updated",
                    )
                  }
                >
                  <NativeSelectOption value="editor">Editor</NativeSelectOption>
                  <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
                </NativeSelect>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${s.email}`}
                  data-testid="share-remove"
                  onClick={() => void run(() => unshareMatter({ data: { matterId: matter.id, userId: s.userId } }))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{s.role === "editor" ? "Editor" : "Viewer"}</span>
            )}
          </li>
        ))}
      </ul>

      {matter.isOwner ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!userId) return;
            setPending(true);
            await run(() => shareMatter({ data: { matterId: matter.id, userId, role } }));
            setUserId("");
            setPending(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="share-user">Share with</Label>
            <NativeSelect id="share-user" data-testid="share-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-64">
              <NativeSelectOption value="">
                {sharing.candidates.length ? "Choose a person" : "No one else has opened the app"}
              </NativeSelectOption>
              {sharing.candidates.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.email}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-role">Role</Label>
            <NativeSelect id="share-role" data-testid="share-role" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}>
              <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
              <NativeSelectOption value="editor">Editor</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={!userId} pending={pending} data-testid="share-submit">
            Share
          </Button>
        </form>
      ) : null}

      {matter.isOwner ? (
        <div className="space-y-2 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Delete matter</h2>
          <Button variant="destructive" data-testid="delete-matter" onClick={() => setDeleting(true)}>
            Delete matter
          </Button>
        </div>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${matter.name}?`}
          confirmLabel="Delete matter"
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await deleteMatter({ data: { id: matter.id } });
              await router.navigate({ to: "/" });
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          Its documents, chats, reviews, workflow runs and checklists are deleted too.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
