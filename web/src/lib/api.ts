// Thin client for the Express API. The table is still called "issues";
// in the UI an issue is a to-do: severity = priority, status "closed" = done.

export type Priority = "low" | "medium" | "high";
export type Status = "open" | "closed";

export type Todo = {
  id: number;
  title: string;
  severity: Priority;
  status: Status;
  due_date: string | null; // "YYYY-MM-DD"
  created_at: string;
};

export type TodoChanges = Partial<Pick<Todo, "title" | "severity" | "status" | "due_date">>;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  list: () => call<Todo[]>("/api/issues"),
  create: (todo: { title: string; severity: Priority; due_date: string | null }) =>
    call<Todo>("/api/issues", { method: "POST", body: JSON.stringify(todo) }),
  update: (id: number, changes: TodoChanges) =>
    call<Todo>(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  remove: (id: number) => call<void>(`/api/issues/${id}`, { method: "DELETE" }),
  clearCompleted: () => call<{ deleted: number }>("/api/issues?status=closed", { method: "DELETE" }),
};

// Today's date in the user's time zone, as "YYYY-MM-DD", to compare with due dates.
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
