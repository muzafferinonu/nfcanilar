export function extFromFile(file: File) {
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? parts.pop() : "";
  return (ext || "bin").toLowerCase();
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
