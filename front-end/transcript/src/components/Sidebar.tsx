import { useMemo, useRef, useState } from "react";
import type { Meeting, Task, Workspace, WorkspaceMember } from "../lib/types";

function formatDateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Sidebar({
  open,
  onToggle,
  workspaces,
  activeWorkspaceId,
  onChangeWorkspace,
  members,
  onRenameMember,
  meetings,
  selectedMeetingId,
  onSelectMeeting,
  onNewMeetingUpload,
  tasks,
  onMarkDone,
  onUndo,
  canUndo,
}: {
  open: boolean;
  onToggle: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  onChangeWorkspace: (id: number) => void;

  members: WorkspaceMember[];
  onRenameMember: (
    memberId: number,
    displayName: string | null
  ) => Promise<void>;

  meetings: Meeting[];
  selectedMeetingId: number | null;
  onSelectMeeting: (id: number) => void;

  onNewMeetingUpload: (file: File) => Promise<void>;

  tasks: Task[];
  onMarkDone: (taskId: number) => Promise<void>;
  onUndo: () => Promise<void>;
  canUndo: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const todoTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done"),
    [tasks]
  );

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = ""; // reset so selecting same file works again

    setUploading(true);
    try {
      await onNewMeetingUpload(f);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onToggle}
      />

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-80 border-r border-zinc-200 bg-white transition-transform md:static md:h-auto md:rounded-2xl md:border md:shadow-sm ${
          open ? "translate-x-0 md:block" : "-translate-x-full md:hidden"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900">Workspace</div>

            <button
              onClick={onToggle}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 md:hidden"
            >
              Close
            </button>
          </div>

          {/* Workspace picker */}
          <div className="border-b border-zinc-200 px-4 py-3">
            <select
              value={activeWorkspaceId ?? ""}
              onChange={(e) => onChangeWorkspace(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="" disabled>
                Select a workspace…
              </option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current obligations */}
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-700">
                Current obligations
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Undo
                </button>

                <button
                  onClick={() => setTaskModalOpen(true)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  View all
                </button>
              </div>
            </div>

            <div className="mt-2 space-y-2">
              {todoTasks.length === 0 ? (
                <div className="text-xs text-zinc-500">All caught up 🎉</div>
              ) : (
                todoTasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-zinc-900">
                        {t.title}
                      </div>
                      {t.due_at ? (
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          Due {formatDateLabel(t.due_at)}
                        </div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => onMarkDone(t.id)}
                      className="shrink-0 rounded-lg bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800"
                    >
                      Done
                    </button>
                  </div>
                ))
              )}
            </div>

            {canUndo ? (
              <button
                onClick={onUndo}
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Undo last done
              </button>
            ) : null}
          </div>

          {/* Members */}
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Members
            </div>

            {!activeWorkspaceId ? (
              <div className="text-sm text-zinc-600">
                Select a workspace to view members.
              </div>
            ) : members.length === 0 ? (
              <div className="text-sm text-zinc-600">No members found.</div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const hasDisplay = !!m.display_name?.trim();
                  const primary = hasDisplay ? m.display_name! : m.email;
                  const secondary = hasDisplay ? m.email : null;

                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-zinc-900">
                            {primary}
                          </div>
                          {m.role === "owner" ? (
                            <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                              OWNER
                            </span>
                          ) : null}
                        </div>
                        {secondary ? (
                          <div className="truncate text-xs text-zinc-600">
                            {secondary}
                          </div>
                        ) : null}
                      </div>

                      <button
                        onClick={async () => {
                          const next = window.prompt(
                            `Set a display name for ${m.email} (leave blank to clear):`,
                            m.display_name ?? ""
                          );
                          if (next === null) return;
                          const cleaned = next.trim();
                          await onRenameMember(
                            m.id,
                            cleaned.length ? cleaned : null
                          );
                        }}
                        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                      >
                        Rename
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Meetings header */}
          <div className="flex items-center justify-between px-4 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Meetings
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={handlePickFile}
                disabled={!activeWorkspaceId || uploading}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "New meeting"}
              </button>
            </div>
          </div>

          {/* Meetings list */}
          <div className="mt-3 flex-1 overflow-auto px-2 pb-3">
            {!activeWorkspaceId ? (
              <div className="px-3 py-2 text-sm text-zinc-600">
                Create or pick a workspace to load meetings.
              </div>
            ) : meetings.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600">
                No meetings yet. Upload a transcript to create one.
              </div>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelectMeeting(m.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedMeetingId === m.id
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div className="text-sm font-medium text-zinc-900">
                      {m.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {formatDateLabel(m.created_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Tasks modal */}
      {taskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div className="text-sm font-semibold text-zinc-900">
                Current obligations
              </div>
              <button
                onClick={() => setTaskModalOpen(false)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-5 py-4">
              <div className="space-y-3">
                {todoTasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4"
                  >
                    <div className="text-sm font-semibold text-zinc-900">
                      {t.title}
                    </div>
                    {t.details ? (
                      <div className="mt-2 text-sm text-zinc-700">
                        {t.details}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-zinc-500">
                        No details provided.
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => onMarkDone(t.id)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Mark complete
                      </button>
                    </div>
                  </div>
                ))}

                {todoTasks.length === 0 ? (
                  <div className="text-sm text-zinc-600">All caught up 🎉</div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-5 py-3">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              >
                Undo last action
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
