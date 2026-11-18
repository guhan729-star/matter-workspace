import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { AiOffError, aiStatus } from "@/server/ai";
import { rememberUser } from "@/server/core";
import * as matters from "@/server/matters";
import * as documents from "@/server/documents";
import * as chat from "@/server/chat";
import * as reviews from "@/server/reviews";
import * as workflows from "@/server/workflows";
import * as checklists from "@/server/checklists";

// Every function runs behind ensureUserMiddleware; the domain code in
// src/server checks the person's access to each matter, thread, review,
// workflow and list.
const id = z.object({ id: z.string().min(1) });
const none = z.object({}).optional();

/** An AI action: a missing model comes back as `aiOff`, not an error. */
async function orAiOff<R>(run: () => Promise<R>): Promise<{ result: R; aiOff: null } | { result: null; aiOff: string }> {
  try {
    return { result: await run(), aiOff: null };
  } catch (error) {
    if (error instanceof AiOffError) return { result: null, aiOff: error.message };
    throw error;
  }
}

export const getMatters = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => none.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.listMatters(context.user);
  });

export const createMatter = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => matters.createMatterInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.createMatter(context.user, data);
  });

export const getMatter = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.getMatter(context.user, data.id);
  });

export const deleteMatter = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.deleteMatter(context.user, data.id);
  });

export const getSharing = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.getSharing(context.user, data.id);
  });

export const shareMatter = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => matters.shareInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.share(context.user, data);
  });

export const unshareMatter = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => matters.unshareInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return matters.unshare(context.user, data);
  });

export const getDocuments = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return documents.listDocuments(context.user, data.id);
  });

export const renameDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => documents.renameDocumentInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return documents.renameDocument(context.user, data);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return documents.deleteDocument(context.user, data.id);
  });

export const getAiStatus = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => none.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return aiStatus();
  });

export const getThreads = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return chat.listThreads(context.user, data.id);
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => chat.createThreadInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return chat.createThread(context.user, data.matterId);
  });

export const getThread = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return chat.getThread(context.user, data.id);
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => chat.renameThreadInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return chat.renameThread(context.user, data);
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return chat.deleteThread(context.user, data.id);
  });

export const askQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => chat.askInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return orAiOff(() => chat.ask(context.user, data));
  });

export const getReviews = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.listReviews(context.user, data.id);
  });

export const createReview = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.createReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.createReview(context.user, data);
  });

export const getReview = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.getReview(context.user, data.id);
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.deleteReview(context.user, data.id);
  });

export const addReviewColumn = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.addColumnInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.addColumn(context.user, data);
  });

export const deleteReviewColumn = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.deleteColumn(context.user, data.id);
  });

export const runReviewCells = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.runInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return orAiOff(() => reviews.runCells(context.user, data));
  });

export const editReviewCell = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.editCellInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.editCell(context.user, data);
  });

export const markCellReviewed = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.flagCellInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.markReviewed(context.user, data);
  });

export const lockReviewCell = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.flagCellInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.lockCell(context.user, data);
  });

export const saveReviewTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => reviews.saveTemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return reviews.saveTemplate(context.user, data);
  });

export const getWorkflows = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => none.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.listWorkflows(context.user);
  });

export const getWorkflow = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.getWorkflow(context.user, data.id);
  });

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => workflows.saveWorkflowInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.saveWorkflow(context.user, data);
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.deleteWorkflow(context.user, data.id);
  });

export const runWorkflow = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => workflows.runWorkflowInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return orAiOff(() => workflows.runWorkflow(context.user, data));
  });

export const getRuns = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.listRuns(context.user, data.id);
  });

export const getRun = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return workflows.getRun(context.user, data.id);
  });

export const getChecklists = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.listChecklists(context.user, data.id);
  });

export const createChecklist = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => checklists.createChecklistInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return orAiOff(() => checklists.createChecklist(context.user, data));
  });

export const getChecklist = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.getChecklist(context.user, data.id);
  });

export const addChecklistItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => checklists.addItemInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.addItem(context.user, data);
  });

export const updateChecklistItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => checklists.updateItemInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.updateItem(context.user, data);
  });

export const moveChecklistItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => checklists.moveItemInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.moveItem(context.user, data);
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.deleteItem(context.user, data.id);
  });

export const addChecklistColumn = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => checklists.addColumnInput.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.addColumn(context.user, data);
  });

export const deleteChecklist = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((input: unknown) => id.parse(input))
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return checklists.deleteChecklist(context.user, data.id);
  });
