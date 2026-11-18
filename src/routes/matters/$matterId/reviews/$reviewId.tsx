import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Lock, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Progress } from "@/client/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import {
  addReviewColumn,
  deleteReviewColumn,
  editReviewCell,
  getReview,
  lockReviewCell,
  markCellReviewed,
  runReviewCells,
  saveReviewTemplate,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/matters/$matterId/reviews/$reviewId")({
  loader: ({ params }) => getReview({ data: { id: params.reviewId } }),
  component: ReviewPage,
});

type Review = Awaited<ReturnType<typeof getReview>>;
type Cell = Review["cells"][number];
type Format = Review["columns"][number]["format"];

const FORMATS: { value: Format; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "yes_no", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "choice", label: "One of a list" },
];

function ReviewPage() {
  const review = Route.useLoaderData();
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [aiOff, setAiOff] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [openCell, setOpenCell] = useState<{ columnId: string; documentId: string } | null>(null);
  const [sort, setSort] = useState<{ columnId: string; dir: 1 | -1 } | null>(null);
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const cellAt = useMemo(() => {
    const map = new Map(review.cells.map((c) => [`${c.columnId}:${c.documentId}`, c]));
    return (columnId: string, documentId: string) => map.get(`${columnId}:${documentId}`);
  }, [review.cells]);

  const rows = useMemo(() => {
    let docs = review.documents;
    const filterCol = review.columns.find((c) => c.label === filterColumn);
    if (filterCol && filterValue.trim()) {
      const want = filterValue.trim().toLowerCase();
      docs = docs.filter((d) => (cellAt(filterCol.id, d.id)?.answer ?? "").toLowerCase().includes(want));
    }
    if (sort) {
      const col = review.columns.find((c) => c.id === sort.columnId);
      docs = [...docs].sort((a, b) => {
        const x = cellAt(sort.columnId, a.id)?.answer ?? "";
        const y = cellAt(sort.columnId, b.id)?.answer ?? "";
        if (col?.format === "number") return (Number(x) - Number(y)) * sort.dir;
        if (col?.format === "date") return (Date.parse(x) - Date.parse(y) || 0) * sort.dir;
        return x.localeCompare(y) * sort.dir;
      });
    }
    return docs;
  }, [review, cellAt, sort, filterColumn, filterValue]);

  const total = review.documents.length * review.columns.length;
  const reviewed = review.cells.filter((c) => c.reviewedBy).length;

  async function run(key: string, data: { columnId?: string; documentId?: string }) {
    setRunning(key);
    try {
      const { aiOff: off } = await runReviewCells({ data: { reviewId: review.id, ...data } });
      setAiOff(off);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
    setRunning(null);
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Link
          to="/matters/$matterId/reviews"
          params={{ matterId: review.matterId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Reviews
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{review.name}</h2>
          {review.canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" data-testid="save-template" disabled={!review.columns.length} onClick={() => setSavingTemplate(true)}>
                Save as template
              </Button>
              <Button variant="outline" data-testid="add-column" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                Add column
              </Button>
              <Button data-testid="run-all" pending={running === "all"} disabled={!review.columns.length || !!running} onClick={() => void run("all", {})}>
                <Play aria-hidden />
                Run all
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {aiOff ? (
        <Alert data-testid="ai-off">
          <AlertDescription>{aiOff}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-48 flex-1 items-center gap-3" data-testid="review-progress">
          <Progress value={total ? (reviewed / total) * 100 : 0} className="max-w-48" aria-label="Reviewed" />
          <span className="text-sm text-muted-foreground">
            Reviewed {reviewed} / {total}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Filter column" data-testid="filter-column" value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)}>
            <NativeSelectOption value="">Filter by column</NativeSelectOption>
            {review.columns.map((c) => (
              <NativeSelectOption key={c.id} value={c.label}>
                {c.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            aria-label="Filter value"
            data-testid="filter-value"
            className="h-8 w-40"
            placeholder="Contains"
            value={filterValue}
            disabled={!filterColumn}
            onChange={(e) => setFilterValue(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Document</TableHead>
              {review.columns.map((c) => (
                <TableHead key={c.id} className="min-w-52 align-top">
                  <div className="flex items-center gap-1 py-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                      title={c.prompt}
                      onClick={() =>
                        setSort((s) => (s?.columnId === c.id ? (s.dir === 1 ? { columnId: c.id, dir: -1 } : null) : { columnId: c.id, dir: 1 }))
                      }
                    >
                      {c.label}
                      {sort?.columnId === c.id ? sort.dir === 1 ? <ArrowUp className="size-3.5" aria-label="ascending" /> : <ArrowDown className="size-3.5" aria-label="descending" /> : null}
                    </button>
                    <Badge variant="outline" className="font-normal">
                      {FORMATS.find((f) => f.value === c.format)?.label}
                    </Badge>
                    {review.canEdit ? (
                      <span className="ml-auto flex">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Run ${c.label}`}
                          data-testid="run-column"
                          disabled={!!running}
                          onClick={() => void run(c.id, { columnId: c.id })}
                        >
                          <Play aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${c.label}`}
                          onClick={async () => {
                            try {
                              await deleteReviewColumn({ data: { id: c.id } });
                              await router.invalidate();
                            } catch (error) {
                              toast.error(errorMessage(error));
                            }
                          }}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id} data-testid="review-row">
                <TableCell className="max-w-56 align-top">
                  <div className="flex items-center gap-1">
                    <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                      {d.name}
                    </a>
                    {review.canEdit && review.columns.length ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Run ${d.name}`}
                        data-testid="run-row"
                        disabled={!!running}
                        onClick={() => void run(d.id, { documentId: d.id })}
                      >
                        <Play aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
                {review.columns.map((c) => {
                  const cell = cellAt(c.id, d.id);
                  return (
                    <TableCell key={c.id} className="align-top whitespace-normal">
                      <button
                        type="button"
                        data-testid="cell"
                        data-column={c.label}
                        data-document={d.name}
                        className="block w-full rounded-md p-1 text-left text-sm hover:bg-muted/60"
                        onClick={() => setOpenCell({ columnId: c.id, documentId: d.id })}
                      >
                        {cell ? (
                          <span className="flex items-start gap-1">
                            <span className={cell.status === "error" ? "text-destructive" : "line-clamp-3"}>
                              {cell.status === "error" ? "Failed" : cell.answer || "—"}
                            </span>
                            {cell.locked ? <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-label="Locked" /> : null}
                            {cell.reviewedBy ? <Badge variant="secondary" className="ml-auto shrink-0">Reviewed</Badge> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={review.columns.length + 1} className="py-8 text-center text-muted-foreground">
                  No documents match the filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {review.columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a column with a question to ask of every document.</p>
      ) : null}

      {adding ? <AddColumn reviewId={review.id} onClose={() => setAdding(false)} /> : null}
      {savingTemplate ? <SaveTemplate reviewId={review.id} onClose={() => setSavingTemplate(false)} /> : null}
      {openCell ? (
        <CellDialog
          review={review}
          column={review.columns.find((c) => c.id === openCell.columnId)!}
          doc={review.documents.find((d) => d.id === openCell.documentId)!}
          cell={cellAt(openCell.columnId, openCell.documentId)}
          onClose={() => setOpenCell(null)}
        />
      ) : null}
    </section>
  );
}

function CellDialog({
  review,
  column,
  doc,
  cell,
  onClose,
}: {
  review: Review;
  column: Review["columns"][number];
  doc: { id: string; name: string };
  cell: Cell | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState(cell?.answer ?? "");
  const key = { columnId: column.id, documentId: doc.id };
  const locked = !!cell?.locked;
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{column.label}</DialogTitle>
          <DialogDescription>{column.prompt}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <Field id="cell-answer" label="Answer">
            <Textarea
              id="cell-answer"
              data-testid="cell-answer"
              rows={2}
              value={answer}
              disabled={locked || !review.canEdit}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </Field>
          {cell?.reasoning ? (
            <div className="space-y-1">
              <div className="font-medium">Reasoning</div>
              <p className="text-muted-foreground">{cell.reasoning}</p>
            </div>
          ) : null}
          {cell?.quote ? (
            <div className="space-y-1">
              <div className="font-medium">Source</div>
              <blockquote className="border-l-2 border-primary pl-3 text-muted-foreground">“{cell.quote}”</blockquote>
            </div>
          ) : null}
          <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-block font-medium hover:underline">
            {doc.name}
          </a>
          <div className="space-y-0.5 text-muted-foreground">
            {cell?.editedBy ? <div>Edited by {cell.editedBy}</div> : null}
            {cell?.reviewedBy ? (
              <div>
                Reviewed by {cell.reviewedBy} · {formatDateTime(cell.reviewedAt)}
              </div>
            ) : null}
            {locked ? <div>Locked: unlock to edit or rerun.</div> : null}
          </div>
        </div>
        {review.canEdit ? (
          <DialogFooter className="flex-wrap gap-2">
            {cell ? (
              <>
                <Button variant="outline" data-testid="mark-reviewed" onClick={() => void act(() => markCellReviewed({ data: { ...key, on: !cell.reviewedBy } }))}>
                  {cell.reviewedBy ? "Mark not reviewed" : "Mark reviewed"}
                </Button>
                <Button variant="outline" data-testid="lock-cell" onClick={() => void act(() => lockReviewCell({ data: { ...key, on: !locked } }))}>
                  {locked ? "Unlock" : "Lock"}
                </Button>
              </>
            ) : null}
            <Button
              data-testid="save-cell"
              disabled={locked || answer === (cell?.answer ?? "")}
              onClick={() => void act(() => editReviewCell({ data: { ...key, answer } }))}
            >
              Save answer
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddColumn({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("text");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setPending(true);
            try {
              await addReviewColumn({
                data: {
                  reviewId,
                  column: {
                    label: String(form.get("label") ?? ""),
                    prompt: String(form.get("prompt") ?? ""),
                    format,
                    choices: String(form.get("choices") ?? "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                },
              });
              await router.invalidate();
              onClose();
            } catch (error) {
              toast.error(errorMessage(error));
              setPending(false);
            }
          }}
        >
          <Field id="column-label" label="Label">
            <Input id="column-label" name="label" required />
          </Field>
          <Field id="column-prompt" label="Prompt">
            <Textarea id="column-prompt" name="prompt" rows={3} required />
          </Field>
          <Field id="column-format" label="Format">
            <NativeSelect id="column-format" data-testid="column-format" className="w-full" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              {FORMATS.map((f) => (
                <NativeSelectOption key={f.value} value={f.value}>
                  {f.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {format === "choice" ? (
            <Field id="column-choices" label="Choices">
              <Input id="column-choices" name="choices" placeholder="Separate with commas" required />
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid="save-column">
              Add column
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplate({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>Everyone in the organization can start a review from it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await saveReviewTemplate({ data: { reviewId, name } });
              toast.success("Template saved");
              onClose();
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <Field id="template-name" label="Template name">
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="submit" data-testid="save-template-submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
