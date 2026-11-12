type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

// One JSON object per line. Cloud Logging reads "severity" and "message" automatically
// and turns every other field into something you can filter on.
export function log(severity: Severity, message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ severity, message, ...fields }));
}