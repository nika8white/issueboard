import { useEffect, useState, type FormEvent } from "react";

type Issue = { id: number; title: string; severity: string; status: string };

export default function App() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");

  const load = () => fetch("/api/issues").then((r) => r.json()).then(setIssues);
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    await fetch("/api/issues", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, severity }),
    });
    setTitle(""); load();
  }

  async function close(id: number) {
    await fetch(`/api/issues/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    load();
  }

  return (
    <main>
      <h1>To-Do List</h1>
      <form onSubmit={add}>
        <label htmlFor="title">Issue</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label htmlFor="severity">Severity</label>
        <select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option>low</option><option>medium</option><option>high</option>
        </select>
        <button type="submit">Add issue</button>
      </form>
      <ul>
        {issues.map((i) => (
          <li key={i.id}>
            [{i.severity}] {i.title} — {i.status}
            {i.status === "open" && <button onClick={() => close(i.id)}>Close “{i.title}”</button>}
          </li>
        ))}
      </ul>
    </main>
  );
}