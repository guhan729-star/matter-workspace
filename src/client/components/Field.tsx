import type { ReactNode } from "react";
import { Label } from "@/client/components/ui/label";

/** A label above its control. */
export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
