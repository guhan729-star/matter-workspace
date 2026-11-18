import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, FileText, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { errorMessage, formatBytes, formatDate } from "@/client/lib/format";
import { deleteDocument, getDocuments, renameDocument } from "@/serverFunctions/app";
import { useMatter } from "./route";

export const Route = createFileRoute("/matters/$matterId/")({
  loader: ({ params }) => getDocuments({ data: { id: params.matterId } }),
  component: DocumentsTab,
});

type Doc = Awaited<ReturnType<typeof getDocuments>>[number];

function DocumentsTab() {
  const matter = useMatter();
  const docs = Route.useLoaderData();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState<Doc | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/matters/${matter.id}/documents`, { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? `Couldn't upload ${file.name}`);
      }
    }
    if (input.current) input.current.value = "";
    setUploading(false);
    await router.invalidate();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        {matter.canEdit ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="sr-only"
              data-testid="upload-input"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button pending={uploading} onClick={() => input.current?.click()}>
              <Upload aria-hidden />
              Upload
            </Button>
          </>
        ) : null}
      </div>
      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={matter.canEdit ? "Upload PDF, DOCX or TXT files up to 20 MB." : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id} data-testid="document-row">
                  <TableCell className="max-w-72">
                    <a
                      href={`/api/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="document-open"
                      className="block truncate font-medium hover:underline"
                    >
                      {doc.name}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.kind.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatBytes(doc.size)}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.uploader}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Download ${doc.name}`}
                        render={<a href={`/api/documents/${doc.id}/file?download=1`} />}
                      >
                        <Download aria-hidden />
                      </Button>
                      {matter.canEdit ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Rename ${doc.name}`}
                            data-testid="document-rename"
                            onClick={() => setRenaming(doc)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${doc.name}`}
                            data-testid="document-delete"
                            onClick={() => setDeleting(doc)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {renaming ? <RenameDialog doc={renaming} onClose={() => setRenaming(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteDocument({ data: { id: deleting.id } });
              setDeleting(null);
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          Its review cells go with it.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function RenameDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(doc.name);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await renameDocument({ data: { id: doc.id, name } });
      await router.invalidate();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field id="document-name" label="Document name">
            <Input id="document-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid="rename-submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
