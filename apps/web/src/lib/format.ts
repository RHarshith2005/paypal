const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return dateFormatter.format(parsed);
}

export function formatExpiry(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function shortId(id: string, visible = 10): string {
  if (id.length <= visible + 2) return id;
  return `${id.slice(0, visible)}…`;
}

export function shortHash(hash: string, visible = 12): string {
  if (hash.length <= visible) return hash;
  return `${hash.slice(0, visible)}…`;
}
