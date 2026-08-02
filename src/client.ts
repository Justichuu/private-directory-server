type ViewStatus = "booting" | "locked" | "loading" | "ready" | "empty" | "uploading" | "error";
interface ApiItem { readonly name: string; readonly path: string; readonly type: "directory" | "file"; readonly size: number; }
interface ApiListing { readonly path: string; readonly items: readonly ApiItem[]; }
interface SessionInfo { readonly authenticated: boolean; readonly authenticationRequired: boolean; readonly accessMode: "read-only" | "upload"; readonly maxUploadBytes: number; }
interface ViewState { status: ViewStatus; path: string; items: readonly ApiItem[]; error: string; session: SessionInfo | null; searchQuery: string; }

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Required UI element is missing: ${selector}`);
  return element;
}

const state: ViewState = { status: "booting", path: "", items: [], error: "", session: null, searchQuery: "" };
const browser = requireElement<HTMLElement>("#browser");
const loginPanel = requireElement<HTMLElement>("#loginPanel");
const loginForm = requireElement<HTMLFormElement>("#loginForm");
const loginError = requireElement<HTMLElement>("#loginError");
const tokenInput = requireElement<HTMLInputElement>("#token");
const logoutButton = requireElement<HTMLButtonElement>("#logout");
const statusElement = requireElement<HTMLElement>("#status");
const itemsElement = requireElement<HTMLElement>("#items");
const breadcrumbsElement = requireElement<HTMLElement>("#breadcrumbs");
const searchForm = requireElement<HTMLFormElement>("#searchForm");
const searchInput = requireElement<HTMLInputElement>("#search");
const uploadButton = requireElement<HTMLElement>("#uploadButton");
const uploadInput = requireElement<HTMLInputElement>("#upload");
const previewDialog = requireElement<HTMLDialogElement>("#previewDialog");
const previewTitle = requireElement<HTMLElement>("#previewTitle");
const previewContent = requireElement<HTMLElement>("#previewContent");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = -1;
  do { value /= 1024; unitIndex += 1; } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex] ?? "B"}`;
}

function encodePath(filePath: string): string { return filePath.split("/").map(encodeURIComponent).join("/"); }
function navigateTo(targetPath: string): void {
  history.pushState({ path: targetPath }, "", targetPath ? `/?path=${encodeURIComponent(targetPath)}` : "/");
  state.searchQuery = "";
  searchInput.value = "";
  void loadDirectory(targetPath);
}

function createCrumb(label: string, targetPath: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "crumb";
  button.textContent = label;
  button.addEventListener("click", () => navigateTo(targetPath));
  return button;
}

function renderBreadcrumbs(currentPath: string): void {
  breadcrumbsElement.replaceChildren(createCrumb("Shared directory", ""));
  const segments = currentPath.split("/").filter(Boolean);
  segments.forEach((segment, index) => {
    const separator = document.createElement("span");
    separator.className = "separator";
    separator.textContent = "/";
    breadcrumbsElement.append(separator, createCrumb(segment, segments.slice(0, index + 1).join("/")));
  });
}

function previewKind(name: string): "image" | "audio" | "video" | "document" | "text" | "none" {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension)) return "image";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";
  if (["mp4", "webm", "mov"].includes(extension)) return "video";
  if (["pdf"].includes(extension)) return "document";
  if (["txt", "md", "json", "js", "ts", "css", "html", "xml", "yaml", "yml", "log"].includes(extension)) return "text";
  return "none";
}

async function showPreview(item: ApiItem): Promise<void> {
  previewTitle.textContent = item.name;
  previewContent.textContent = "Loading preview…";
  previewDialog.showModal();
  const source = `/view/${encodePath(item.path)}`;
  const kind = previewKind(item.name);
  if (kind === "text") {
    try {
      const response = await fetch(source, { headers: { Range: "bytes=0-524287" } });
      if (!response.ok) throw new Error("Preview could not be loaded.");
      const pre = document.createElement("pre");
      pre.textContent = await response.text();
      previewContent.replaceChildren(pre);
    } catch (error: unknown) { previewContent.textContent = error instanceof Error ? error.message : "Preview could not be loaded."; }
    return;
  }
  const element = kind === "image" ? document.createElement("img") : kind === "audio" ? document.createElement("audio") : kind === "video" ? document.createElement("video") : document.createElement("iframe");
  if (element instanceof HTMLMediaElement) element.controls = true;
  if (element instanceof HTMLImageElement) element.alt = item.name;
  element.setAttribute("src", source);
  previewContent.replaceChildren(element);
}

function createItem(item: ApiItem): HTMLElement {
  const row = document.createElement("div");
  row.className = "item";
  const icon = document.createElement("span"); icon.className = "icon"; icon.textContent = item.type === "directory" ? "DIR" : "FILE";
  const name = document.createElement("button"); name.className = "name"; name.textContent = item.name;
  name.addEventListener("click", () => {
    if (item.type === "directory") navigateTo(item.path);
    else if (previewKind(item.name) !== "none") void showPreview(item);
    else window.location.assign(`/files/${encodePath(item.path)}`);
  });
  const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = item.type === "directory" ? "Folder" : formatBytes(item.size);
  row.append(icon, name, meta);
  if (item.type === "file") {
    if (previewKind(item.name) !== "none") {
      const preview = document.createElement("button"); preview.className = "item-action quiet preview"; preview.textContent = "Preview"; preview.addEventListener("click", () => void showPreview(item)); row.append(preview);
    }
    const download = document.createElement("a"); download.className = "item-action quiet"; download.textContent = "Download"; download.href = `/files/${encodePath(item.path)}`; download.download = item.name; row.append(download);
  }
  return row;
}

function render(): void {
  const locked = state.status === "locked";
  loginPanel.hidden = !locked;
  browser.hidden = locked || state.status === "booting";
  logoutButton.hidden = state.session?.authenticationRequired !== true || locked;
  uploadButton.hidden = state.session?.accessMode !== "upload";
  if (locked || state.status === "booting") return;
  renderBreadcrumbs(state.path);
  itemsElement.replaceChildren();
  itemsElement.hidden = state.status !== "ready";
  statusElement.hidden = state.status === "ready";
  statusElement.classList.toggle("error", state.status === "error");
  const messages: Partial<Record<ViewStatus, string>> = { loading: "Loading directory…", uploading: "Uploading file…", empty: state.searchQuery ? "No matching files found." : "This directory is empty.", error: state.error };
  statusElement.textContent = messages[state.status] ?? "";
  if (state.status === "ready") state.items.forEach((item) => itemsElement.append(createItem(item)));
}

function isListing(value: unknown): value is ApiListing {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { path?: unknown; items?: unknown };
  return typeof candidate.path === "string" && Array.isArray(candidate.items);
}

async function loadItems(endpoint: string): Promise<void> {
  state.status = "loading"; state.error = ""; render();
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (response.status === 401) { state.status = "locked"; render(); return; }
    const payload: unknown = await response.json();
    if (!response.ok || !isListing(payload)) throw new Error(typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "The directory could not be loaded.");
    state.path = payload.path; state.items = payload.items; state.status = payload.items.length === 0 ? "empty" : "ready";
  } catch (error: unknown) { state.status = "error"; state.error = error instanceof Error ? error.message : "The directory could not be loaded."; }
  render();
}

async function loadDirectory(targetPath: string): Promise<void> { await loadItems(`/api/files?path=${encodeURIComponent(targetPath)}`); }

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async (): Promise<void> => {
    loginError.textContent = "";
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tokenInput.value }) }).catch(() => null);
    if (response === null || !response.ok) { loginError.textContent = response === null ? "The server could not be reached." : "The token was not accepted."; return; }
    tokenInput.value = ""; await boot();
  })();
});
logoutButton.addEventListener("click", () => void fetch("/api/session", { method: "DELETE" }).then(() => { state.status = "locked"; render(); }));
searchForm.addEventListener("submit", (event) => { event.preventDefault(); const query = searchInput.value.trim(); if (query.length >= 2) { state.searchQuery = query; void loadItems(`/api/search?path=${encodeURIComponent(state.path)}&q=${encodeURIComponent(query)}`); } });
uploadInput.addEventListener("change", () => {
  const file = uploadInput.files?.[0];
  if (file === undefined || state.session === null) return;
  if (file.size > state.session.maxUploadBytes) { state.status = "error"; state.error = `File exceeds the ${formatBytes(state.session.maxUploadBytes)} upload limit.`; render(); return; }
  const targetPath = [state.path, file.name].filter(Boolean).join("/");
  state.status = "uploading"; render();
  void fetch(`/api/files?path=${encodeURIComponent(targetPath)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }).then(async (response) => { if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? "Upload failed."); } uploadInput.value = ""; await loadDirectory(state.path); }).catch((error: unknown) => { state.status = "error"; state.error = error instanceof Error ? error.message : "Upload failed."; render(); });
});
requireElement<HTMLButtonElement>("#closePreview").addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("close", () => previewContent.replaceChildren());
window.addEventListener("popstate", () => void loadDirectory(new URLSearchParams(location.search).get("path") ?? ""));

async function boot(): Promise<void> {
  state.status = "booting"; render();
  try {
    const response = await fetch("/api/session", { headers: { Accept: "application/json" } });
    const session = await response.json() as SessionInfo;
    state.session = session;
    if (!session.authenticated) { state.status = "locked"; render(); return; }
    await loadDirectory(new URLSearchParams(location.search).get("path") ?? "");
  } catch { state.status = "error"; state.error = "The server could not be reached."; render(); }
}
void boot();
