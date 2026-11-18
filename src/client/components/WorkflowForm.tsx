import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";
import { saveWorkflow } from "@/serverFunctions/app";

export interface WorkflowValues {
  name: string;
  description: string;
  instructions: string;
  slots: string[];
  outputFormat: "report" | "table";
  fields: string[];
  published: boolean;
}

export const EMPTY_WORKFLOW: WorkflowValues = {
  name: "",
  description: "",
  instructions: "",
  slots: [""],
  outputFormat: "report",
  fields: [],
  published: false,
};

export function WorkflowForm({ id, initial }: { id?: string; initial: WorkflowValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [fields, setFields] = useState(initial.fields.join(", "));
  const [pending, setPending] = useState(false);
  const set = <K extends keyof WorkflowValues>(key: K, value: WorkflowValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await saveWorkflow({
        data: {
          id,
          workflow: {
            ...values,
            slots: values.slots.map((s) => s.trim()).filter(Boolean),
            fields: fields.split(",").map((f) => f.trim()).filter(Boolean),
          },
        },
      });
      await router.navigate({ to: "/workflows" });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field id="wf-name" label="Name">
        <Input id="wf-name" value={values.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>
      <Field id="wf-description" label="Description">
        <Input id="wf-description" value={values.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field id="wf-instructions" label="Instructions">
        <Textarea
          id="wf-instructions"
          rows={6}
          placeholder={"1. …\n2. …"}
          value={values.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          required
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Documents it needs</legend>
        {values.slots.map((slot, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Document slot ${i + 1}`}
              data-testid="slot-name"
              placeholder="e.g. Share purchase agreement"
              value={slot}
              onChange={(e) => set("slots", values.slots.map((s, j) => (j === i ? e.target.value : s)))}
            />
            {values.slots.length > 1 ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Remove slot" onClick={() => set("slots", values.slots.filter((_, j) => j !== i))}>
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {values.slots.length < 10 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => set("slots", [...values.slots, ""])}>
            <Plus aria-hidden />
            Add slot
          </Button>
        ) : null}
      </fieldset>
      <Field id="wf-format" label="Output">
        <NativeSelect
          id="wf-format"
          data-testid="output-format"
          value={values.outputFormat}
          onChange={(e) => set("outputFormat", e.target.value as "report" | "table")}
        >
          <NativeSelectOption value="report">Written report</NativeSelectOption>
          <NativeSelectOption value="table">Table of fields</NativeSelectOption>
        </NativeSelect>
      </Field>
      {values.outputFormat === "table" ? (
        <Field id="wf-fields" label="Fields">
          <Input id="wf-fields" placeholder="Separate with commas" value={fields} onChange={(e) => setFields(e.target.value)} required />
        </Field>
      ) : null}
      <div className="flex items-center gap-2 text-sm font-medium">
        <Checkbox aria-label="Publish to the organization" checked={values.published} onCheckedChange={(on) => set("published", on)} />
        <span aria-hidden onClick={() => set("published", !values.published)}>
          Publish to the organization
        </span>
      </div>
      <Button type="submit" pending={pending} data-testid="save-workflow">
        Save workflow
      </Button>
    </form>
  );
}
