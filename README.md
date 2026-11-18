# Matter Workspace

A workspace for legal teams: keep each matter's documents in one place, ask questions about them, review them side by side in a grid, run reusable workflows and track checklists.

Inspired by https://legora.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create matters, upload PDF, DOCX and TXT documents, and share each matter with members as editor or viewer.
- Ask questions in saved chat threads and get answers that cite and quote the matter's documents.
- Build review grids of documents by questions, run them with AI, then sort, filter, edit, mark reviewed and lock cells, and save column templates.
- Write workflows with steps, document slots and a report or table output, publish them, and run them on a matter.
- Keep checklists by hand or drafted from documents, with status, owner, due date, source, custom columns and an activity log.

Left out: accounts and sign-in, which your Gateway handles; legal research databases; regulatory monitoring; drafting and redlining; client portals and intake; integrations; mobile and Office add-ins.

## Setup

- Install: `pnpm install`, then `pnpm everyapp install <repository url>` or `pnpm run deploy` from a clone.
- Run locally: `pnpm dev`. Test: `pnpm test`; the release checks in `checks/` run against a built release.
- No secrets or settings. The app uses a D1 database and an R2 bucket for documents, created on deploy. R2 must be enabled on the Cloudflare account once.
- AI: the app needs the workspace's default chat model (`everyapp ai default`, or a provider key such as OpenRouter's). If the model is removed later, the AI actions say so and everything else keeps working.

## Limitations

- Only people who have opened the app once can be picked when sharing a matter.
- Scanned PDFs without a text layer give the AI nothing to read.
- Long documents are trimmed to about 60,000 characters per request.
- Review columns and workflow runs wait for the model in the request, so very large grids take a while.
- AI answers were checked locally against a stand-in model only; real models and deployment are not covered by the checks.
