import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { NotFoundError } from "@/server/core";
import { documentFile } from "@/server/documents";

// Opens (or with ?download=1 downloads) a document the member can see.
export const Route = createFileRoute("/api/documents/$documentId/file")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Sign in", { status: 401 });
        const download = new URL(request.url).searchParams.get("download") === "1";
        try {
          return await documentFile(user, params.documentId, download);
        } catch (error) {
          if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
          throw error;
        }
      },
    },
  },
});
