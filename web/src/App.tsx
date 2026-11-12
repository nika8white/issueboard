import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrioritySelect } from "@/components/priority-select";
import { TodoItem } from "@/components/todo-item";
import { api, type Priority, type Todo, type TodoChanges } from "@/lib/api";

type Filter = "all" | "active" | "done";

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// Open first; then earliest due date (no date last); then highest priority; then newest.
function byUrgency(a: Todo, b: Todo) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.severity !== b.severity) return priorityRank[a.severity] - priorityRank[b.severity];
  return b.id - a.id;
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");

  useEffect(() => {
    api.list().then(setTodos).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  // Runs an API call and shows its error instead of failing silently.
  async function attempt(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    return attempt(async () => {
      const created = await api.create({ title: title.trim(), severity: priority, due_date: due || null });
      setTodos((list) => [created, ...list]);
      setTitle("");
      setDue("");
    });
  };

  const update = (id: number, changes: TodoChanges) =>
    attempt(async () => {
      const updated = await api.update(id, changes);
      setTodos((list) => list.map((t) => (t.id === id ? updated : t)));
    });

  const remove = (id: number) =>
    attempt(async () => {
      await api.remove(id);
      setTodos((list) => list.filter((t) => t.id !== id));
    });

  const clearCompleted = () =>
    attempt(async () => {
      await api.clearCompleted();
      setTodos((list) => list.filter((t) => t.status === "open"));
    });

  const activeCount = todos.filter((t) => t.status === "open").length;
  const doneCount = todos.length - activeCount;

  const visible = useMemo(
    () =>
      todos
        .filter((t) => (filter === "all" ? true : filter === "active" ? t.status === "open" : t.status === "closed"))
        .sort(byUrgency),
    [todos, filter],
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ListTodo className="size-6" />
            <h1>To-Do List</h1>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="New to-do"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="flex-1"
            />
            <div className="flex gap-2">
              <PrioritySelect value={priority} onChange={setPriority} />
              <Input
                aria-label="Due date"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-36"
              />
              <Button type="submit" disabled={!title.trim()}>
                <Plus />
                Add
              </Button>
            </div>
          </form>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All ({todos.length})</TabsTrigger>
              <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="done">Done ({doneCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === "done" ? "Nothing finished yet." : filter === "active" ? "All done. Nice!" : "No to-dos yet. Add one above."}
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onChange={(changes) => update(todo.id, changes)}
                  onDelete={() => remove(todo.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>

        {todos.length > 0 && (
          <CardFooter className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {activeCount} {activeCount === 1 ? "item" : "items"} left
            </span>
            <Button variant="ghost" size="sm" onClick={clearCompleted} disabled={doneCount === 0}>
              Clear completed
            </Button>
          </CardFooter>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">Double-click a to-do to edit it.</p>
    </main>
  );
}
