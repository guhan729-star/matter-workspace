import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** People who have opened the app, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const matters = sqliteTable(
  "matters",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    client: text("client").notNull().default(""),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("matters_org").on(t.orgId)],
);

/** Members a matter is shared with, besides its owner. */
export const matterMembers = sqliteTable(
  "matter_members",
  {
    matterId: text("matter_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["editor", "viewer"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.matterId, t.userId] }),
    index("matter_members_user").on(t.userId),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["pdf", "docx", "txt"] }).notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    text: text("text").notNull().default(""),
    uploaderId: text("uploader_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("documents_matter").on(t.matterId)],
);

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    authorId: text("author_id").notNull(),
    title: text("title").notNull(),
    /** JSON array of document ids; empty means every document. */
    documentIds: text("document_ids").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [index("threads_matter").on(t.matterId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    /** JSON array of { documentId, documentName, quote }. */
    citations: text("citations").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_thread").on(t.threadId)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    name: text("name").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_matter").on(t.matterId)],
);

export const reviewDocuments = sqliteTable(
  "review_documents",
  {
    reviewId: text("review_id").notNull(),
    documentId: text("document_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.documentId] })],
);

export const reviewColumns = sqliteTable(
  "review_columns",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull(),
    label: text("label").notNull(),
    prompt: text("prompt").notNull(),
    format: text("format", {
      enum: ["text", "yes_no", "date", "number", "choice"],
    }).notNull(),
    /** JSON array of strings, for the choice format. */
    choices: text("choices").notNull().default("[]"),
    position: integer("position").notNull(),
  },
  (t) => [index("review_columns_review").on(t.reviewId)],
);

export const reviewCells = sqliteTable(
  "review_cells",
  {
    reviewId: text("review_id").notNull(),
    columnId: text("column_id").notNull(),
    documentId: text("document_id").notNull(),
    answer: text("answer").notNull().default(""),
    reasoning: text("reasoning").notNull().default(""),
    quote: text("quote").notNull().default(""),
    status: text("status", { enum: ["done", "error"] }).notNull(),
    editedBy: text("edited_by"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    updatedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.columnId, t.documentId] }),
    index("review_cells_review").on(t.reviewId),
  ],
);

/** Column sets shared with the whole organization. */
export const reviewTemplates = sqliteTable("review_templates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  /** JSON array of { label, prompt, format, choices }. */
  columns: text("columns").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    authorId: text("author_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull(),
    /** JSON array of input slot names. */
    slots: text("slots").notNull(),
    outputFormat: text("output_format", { enum: ["report", "table"] }).notNull(),
    /** JSON array of field names, for the table format. */
    fields: text("fields").notNull().default("[]"),
    published: integer("published", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [index("workflows_org").on(t.orgId)],
);

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    workflowId: text("workflow_id").notNull(),
    workflowName: text("workflow_name").notNull(),
    authorId: text("author_id").notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
    /** JSON array of { slot, documentId, documentName }. */
    inputs: text("inputs").notNull(),
    context: text("context").notNull().default(""),
    outputFormat: text("output_format", { enum: ["report", "table"] }).notNull(),
    /** Prose, or JSON { fields, rows } for a table. */
    output: text("output").notNull().default(""),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("workflow_runs_matter").on(t.matterId)],
);

export const checklists = sqliteTable(
  "checklists",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    name: text("name").notNull(),
    createdBy: text("created_by").notNull(),
    /** JSON array of { id, name }. */
    columns: text("columns").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [index("checklists_matter").on(t.matterId)],
);

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    checklistId: text("checklist_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["open", "in_progress", "blocked", "done"],
    })
      .notNull()
      .default("open"),
    ownerId: text("owner_id"),
    dueDate: text("due_date"),
    sourceDocumentId: text("source_document_id"),
    sourceRef: text("source_ref").notNull().default(""),
    /** JSON object of custom column id → text. */
    custom: text("custom").notNull().default("{}"),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("checklist_items_list").on(t.checklistId)],
);

/** Append-only: rows are inserted, never updated. */
export const checklistActivity = sqliteTable(
  "checklist_activity",
  {
    id: text("id").primaryKey(),
    checklistId: text("checklist_id").notNull(),
    itemId: text("item_id"),
    itemTitle: text("item_title").notNull().default(""),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: createdAt(),
  },
  (t) => [index("checklist_activity_list").on(t.checklistId)],
);

/** Small facts the app remembers, such as whether the AI model answered. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
