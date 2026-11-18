import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "matter-workspace",
  name: "Matter Workspace",
  description:
    "Keep legal matters with their documents, ask questions about them, review them in grids, run reusable workflows and track checklists.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Uploaded matter documents.
    r2: ["files"],
  },
  ai: {
    chat: {
      why: "Answers questions about matter documents, fills review grids, runs workflows and drafts checklists.",
    },
  },
});
