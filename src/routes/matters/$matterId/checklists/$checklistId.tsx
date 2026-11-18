import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { z } from "zod";
import { errorMessage, formatDateTime } from "@/client/lib/format";
import type { updateItemInput } from "@/server/checklists";
import {
  addChecklistColumn,
  addChecklistItem,
  deleteChecklistItem,
  getChecklist,
  moveChecklistItem,
  updateChecklistItem,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/matters/$matterId/checklists/$checklistId")({
  loader: ({ params }) => getChecklist({ data: { id: params.checklistId } }),
  component: ChecklistPage,
});

type List = Awaited<ReturnType<typeof getChecklist>>;
type Activity = List["activity"][number];

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
] as const;
type Status = (typeof STATUSES)[number]["value"];
const statusLabel = (v: string | null) => STATUSES.find((s) => s.value === v)?.label ?? v;

function describe(a: Activity): string {
  if (!a.field) return a.itemTitle ? `${a.action} “${a.itemTitle}”` : a.action;
  const show = (v: string | null) => (a.field === "status" ? statusLabel(v) : v) || "empty";
  return `${a.field} of “${a.itemTitle}”: ${show(a.oldValue)} → ${show(a.newValue)}`;
}

function ChecklistPage() {
  const list = Route.useLoaderData();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [title, setTitle] = useState("");
  const [column, setColumn] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const items = useMemo(
    () =>
      list.items.filter(
        (i) => (!statusFilter || i.status === statusFilter) && (!ownerFilter || (ownerFilter === "none" ? !i.ownerId : i.ownerId === ownerFilter)),
      ),
    [list.items, statusFilter, ownerFilter],
  );

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  const update = (id: string, change: Omit<z.input<typeof updateItemInput>, "id">) =>
    act(() => updateChecklistItem({ data: { id, ...change } }));
  const edit = list.canEdit;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/matters/$matterId/checklists"
          params={{ matterId: list.matterId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Checklists
        </Link>
        <h2 className="text-lg font-semibold">{list.name}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Filter by status" data-testid="filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filter by owner" data-testid="filter-owner" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <NativeSelectOption value="">All owners</NativeSelectOption>
          <NativeSelectOption value="none">No owner</NativeSelectOption>
          {list.people.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.email}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Source</TableHead>
              {list.columns.map((c) => (
                <TableHead key={c.id}>{c.name}</TableHead>
              ))}
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <Fragment key={item.id}>
                <TableRow data-testid="item-row">
                  <TableCell className="align-top whitespace-normal">
                    {edit ? (
                      <div className="space-y-1">
                        <Input
                          aria-label="Title"
                          className="h-8"
                          defaultValue={item.title}
                          onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && void update(item.id, { title: e.target.value })}
                        />
                        <Input
                          aria-label="Description"
                          className="h-8 text-muted-foreground"
                          placeholder="Description"
                          defaultValue={item.description}
                          onBlur={(e) => e.target.value !== item.description && void update(item.id, { description: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      </div>
                    )}
                    {/* Shown as text too, so the row reads without the inputs. */}
                    <span className="sr-only">
                      {item.title} {item.description}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <NativeSelect
                      aria-label="Status"
                      data-testid="item-status"
                      value={item.status}
                      disabled={!edit}
                      onChange={(e) => void update(item.id, { status: e.target.value as Status })}
                    >
                      {STATUSES.map((s) => (
                        <NativeSelectOption key={s.value} value={s.value}>
                          {s.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell className="align-top">
                    <NativeSelect
                      aria-label="Owner"
                      data-testid="item-owner"
                      value={item.ownerId ?? ""}
                      disabled={!edit}
                      onChange={(e) => void update(item.id, { ownerId: e.target.value || null })}
                    >
                      <NativeSelectOption value="">No owner</NativeSelectOption>
                      {list.people.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.email}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="date"
                      aria-label="Due date"
                      className="h-8 w-36"
                      value={item.dueDate ?? ""}
                      disabled={!edit}
                      onChange={(e) => void update(item.id, { dueDate: e.target.value || null })}
                    />
                  </TableCell>
                  <TableCell className="align-top text-sm whitespace-normal">
                    {item.sourceDocumentId ? (
                      <a href={`/api/documents/${item.sourceDocumentId}/file`} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.sourceDocumentName}
                      </a>
                    ) : null}
                    {item.sourceRef ? <div className="text-muted-foreground">{item.sourceRef}</div> : null}
                  </TableCell>
                  {list.columns.map((c) => (
                    <TableCell key={c.id} className="align-top">
                      <Input
                        aria-label={c.name}
                        className="h-8 w-40"
                        defaultValue={item.custom[c.id] ?? ""}
                        disabled={!edit}
                        onBlur={(e) =>
                          e.target.value !== (item.custom[c.id] ?? "") && void update(item.id, { custom: { columnId: c.id, value: e.target.value } })
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell className="align-top">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon-sm" aria-label="History" onClick={() => setHistoryFor(historyFor === item.id ? null : item.id)}>
                        <History aria-hidden />
                      </Button>
                      {edit ? (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => void act(() => moveChecklistItem({ data: { id: item.id, direction: "up" } }))}>
                            <ArrowUp aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Move down"
                            disabled={index === items.length - 1}
                            onClick={() => void act(() => moveChecklistItem({ data: { id: item.id, direction: "down" } }))}
                          >
                            <ArrowDown aria-hidden />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Delete item" onClick={() => void act(() => deleteChecklistItem({ data: { id: item.id } }))}>
                            <Trash2 aria-hidden />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                {historyFor === item.id ? (
                  <TableRow>
                    <TableCell colSpan={6 + list.columns.length} className="bg-muted/40 whitespace-normal">
                      <ActivityList entries={list.activity.filter((a) => a.itemId === item.id)} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + list.columns.length} className="py-8 text-center text-muted-foreground">
                  {list.items.length ? "No items match the filters." : "No items yet."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {edit ? (
        <div className="flex flex-wrap gap-6">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void act(() => addChecklistItem({ data: { checklistId: list.id, title } })).then(() => setTitle(""));
            }}
          >
            <Input aria-label="New item" data-testid="new-item-title" className="w-64" placeholder="New item" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button type="submit" variant="outline" data-testid="add-item">
              <Plus aria-hidden />
              Add item
            </Button>
          </form>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!column.trim()) return;
              void act(() => addChecklistColumn({ data: { checklistId: list.id, name: column } })).then(() => setColumn(""));
            }}
          >
            <Input aria-label="New column" data-testid="add-column-name" className="w-48" placeholder="New column" value={column} onChange={(e) => setColumn(e.target.value)} />
            <Button type="submit" variant="outline" data-testid="add-column">
              Add column
            </Button>
          </form>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-semibold">Activity</h3>
        <ActivityList entries={list.activity} />
      </div>
    </section>
  );
}

function ActivityList({ entries }: { entries: Activity[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-1.5 text-sm">
      {entries.map((a) => (
        <li key={a.id} data-testid="activity" className="flex flex-wrap gap-x-2">
          <span className="font-medium">{a.actor}</span>
          <span>{describe(a)}</span>
          <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}
