import { useMemo, useState } from "react";
import type { Invite } from "../lib/types";

function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n, ]+/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.toLowerCase())
    )
  );
}

export default function InvitesModal({
  open,
  invites,
  onClose,
  onAccept,
  onDecline,
  onCreateGroup,
}: {
  open: boolean;
  invites: Invite[];
  onClose: () => void;
  onAccept: (inviteId: number) => Promise<void>;
  onDecline: (inviteId: number) => Promise<void>;
  onCreateGroup: (name: string, emails: string[]) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [emailsRaw, setEmailsRaw] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo(() => parseEmails(emailsRaw), [emailsRaw]);

  if (!open) return null;

  const handleCreate = async () => {
    setErr(null);

    const groupName = name.trim();
    if (!groupName) {
      setErr("Group name is required.");
      return;
    }

    setCreating(true);
    try {
      await onCreateGroup(groupName, parsed);
      setName("");
      setEmailsRaw("");
      setShowCreate(false);
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-900">Invites</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
            >
              {showCreate ? "Hide create" : "Create new group"}
            </button>
            <button
              onClick={onClose}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {showCreate ? (
            <div className="rounded-2xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Create a new group
              </div>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Group name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                placeholder="e.g. Product Team"
              />

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Invite emails (optional)
              </label>
              <textarea
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                className="mt-2 h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="a@example.com, b@example.com"
              />

              <div className="mt-2 text-xs text-zinc-600">
                Will invite: {parsed.length}
                {parsed.length === 0 ? " (empty group is OK)" : ""}
              </div>

              {err ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setErr(null);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {invites.length === 0 ? (
              <div className="text-sm text-zinc-600">No pending invites.</div>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {inv.workspace_name}
                    </div>
                    <div className="truncate text-xs text-zinc-600">
                      From: {inv.invited_by_email ?? "Unknown"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDecline(inv.id)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      No
                    </button>
                    <button
                      onClick={() => onAccept(inv.id)}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-2 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Yes
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
