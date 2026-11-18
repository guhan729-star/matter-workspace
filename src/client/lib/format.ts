export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Validation errors arrive as a JSON list of issues.
    try {
      const issues = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // A plain message.
    }
    return error.message;
  }
  return "Something went wrong";
}
