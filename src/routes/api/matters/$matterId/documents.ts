import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ForbiddenError, NotFoundError, rememberUser } from "@/server/core";
import { uploadDocument, UploadError } from "@/server/documents";

// Upload one document to a matter (multipart, field "file"). Private: the
// Gateway admits members only, and uploadDocument checks edit access.
export const Route = createFileRoute("/api/matters/$matterId/documents")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
        await rememberUser(user);
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        try {
          if (!(file instanceof File)) throw new UploadError("Choose a file to upload.");
          return Response.json(await uploadDocument(user, params.matterId, file), { status: 201 });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});

function errorResponse(error: unknown) {
  if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof UploadError) return Response.json({ error: error.message }, { status: 400 });
  throw error;
}
