import { useState, type SubmitEvent } from "react";
import { CalendarIcon, Check, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrioritySelect } from "@/components/priority-select";
import { formatDue, today, type Priority, type Todo, type TodoChanges } from "@/lib/api";
import { cn } from "@/lib/utils";

const priorityStyle: Record<Priority, string> = {
  high: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

type Props = {
  todo: Todo;
  onChange: (changes: TodoChanges) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function TodoItem({ todo, onChange, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState<Priority>(todo.severity);
  const [due, setDue] = useState(todo.due_date ?? "");

  const done = todo.status === "closed";
  const overdue = !done && todo.due_date !== null && todo.due_date < today();
  const dueToday = !done && todo.due_date === today();

  function startEdit() {
    setTitle(todo.title);
    setPriority(todo.severity);
    setDue(todo.due_date ?? "");
    setEditing(true);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onChange({ title: title.trim(), severity: priority, due_date: due || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="py-3">
        <form
          onSubmit={save}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
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
            <Button type="submit" size="icon" aria-label="Save">
              <Check />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
              <X />
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 py-3">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => onChange({ status: checked ? "closed" : "open" })}
        aria-label={done ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
      />
      <div className="min-w-0 flex-1" onDoubleClick={startEdit}>
        <p className={cn("truncate", done && "text-muted-foreground line-through")}>{todo.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("capitalize", !done && priorityStyle[todo.severity])}>
            {todo.severity}
          </Badge>
          {todo.due_date && (
            <Badge
              variant={overdue ? "destructive" : "outline"}
              className={cn(dueToday && "border-primary/40 text-foreground")}
            >
              <CalendarIcon />
              {overdue ? `Overdue · ${formatDue(todo.due_date)}` : dueToday ? "Today" : formatDue(todo.due_date)}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button size="icon-sm" variant="ghost" aria-label={`Edit "${todo.title}"`} onClick={startEdit}>
          <Pencil />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="hover:text-destructive"
          aria-label={`Delete "${todo.title}"`}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
