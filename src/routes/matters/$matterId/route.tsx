import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { errorMessage } from "@/client/lib/format";
import { getMatter } from "@/serverFunctions/app";

export const Route = createFileRoute("/matters/$matterId")({
  loader: ({ params }) => getMatter({ data: { id: params.matterId } }),
  component: MatterLayout,
  errorComponent: MatterError,
});

const TABS = [
  { id: "documents", label: "Documents", to: "/matters/$matterId" },
  { id: "assistant", label: "Assistant", to: "/matters/$matterId/assistant" },
  { id: "reviews", label: "Reviews", to: "/matters/$matterId/reviews" },
  { id: "workflows", label: "Workflows", to: "/matters/$matterId/workflows" },
  { id: "checklists", label: "Checklists", to: "/matters/$matterId/checklists" },
  { id: "sharing", label: "Sharing", to: "/matters/$matterId/sharing" },
] as const;

const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

function MatterLayout() {
  const matter = Route.useLoaderData();
  return (
    <AppShell wide>
      <PageHeader
        title={matter.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {matter.client ? <span>{matter.client}</span> : null}
            <Badge variant="secondary">{ROLE_LABEL[matter.role]}</Badge>
          </span>
        }
      />
      {matter.description ? (
        <p className="-mt-4 max-w-prose text-sm text-muted-foreground">{matter.description}</p>
      ) : null}
      <nav className="-mt-2 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            to={tab.to}
            params={{ matterId: matter.id }}
            data-testid={`tab-${tab.id}`}
            activeOptions={{ exact: tab.id === "documents" }}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </AppShell>
  );
}

function MatterError({ error }: { error: unknown }) {
  const message = errorMessage(error);
  return (
    <AppShell>
      <PageHeader title={message === "Matter not found" ? "Matter not found" : "Couldn't open this matter"} />
      <EmptyState
        kind="error"
        title={message === "Matter not found" ? "It doesn't exist or isn't shared with you." : message}
        action={
          <Button render={<Link to="/" />} variant="outline">
            Back to matters
          </Button>
        }
      />
    </AppShell>
  );
}

/** The matter loaded by the layout, for its tabs. */
export function useMatter() {
  return Route.useLoaderData();
}
