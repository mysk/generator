import { InvocationForm } from "../types";

export function getFormAttribute(form: InvocationForm, name: string, fallback: string): string {
  const attribute = (form.attributes ?? []).find((entry) => entry.name === name);
  return attribute?.value ?? fallback;
}
