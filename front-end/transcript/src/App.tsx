import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import InvitesModal from "./components/InvitesModal";
import ExtractedItemsPanel from "./components/ExtractedItemsPanel";
import { api } from "./lib/api";
import type {
  Meeting,
  Task,
  User,
  Workspace,
  Invite,
  WorkspaceMember,
} from "./lib/types";

const LS_WORKSPACE = "ts_active_workspace_id";

export default function App() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(
    null
  );

  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(
    null
  );

  const [tasks, setTasks] = useState<Task[]>([]);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesOpen, setInvitesOpen] = useState(false);

  const [lastDone, setLastDone] = useState<{
    taskId: number;
    prevStatus: Task["status"];
  } | null>(null);

  const canUndo = !!lastDone;

  const refreshInvites = async () => {
    try {
      const pending = await api.listPendingInvites();
      setInvites(pending);
    } catch {
      setInvites([]);
    }
  };

  const refreshWorkspaceMembers = async (workspaceId: number) => {
    try {
      const ms = await api.listWorkspaceMembers(workspaceId);
      setMembers(ms);
    } catch {
      setMembers([]);
    }
  };

  const handleAcceptInvite = async (id: number) => {
    await api.acceptInvite(id);
    await refreshInvites();

    const ws = await api.listWorkspaces();
    setWorkspaces(ws);

    if (!activeWorkspaceId && ws.length > 0) setActiveWorkspaceId(ws[0].id);
  };

  const handleDeclineInvite = async (id: number) => {
    await api.declineInvite(id);
    await refreshInvites();
  };

  const handleCreateGroup = async (groupName: string, emails: string[]) => {
    const ws = await api.createWorkspace(groupName);

    for (const email of emails) {
      try {
        await api.createInvite(ws.id, email);
      } catch (e) {
        console.warn("Invite failed for", email, e);
      }
    }

    const all = await api.listWorkspaces();
    setWorkspaces(all);
    setActiveWorkspaceId(ws.id);

    await refreshInvites();
  };

  const handleRenameMember = async (
    memberId: number,
    displayName: string | null
  ) => {
    if (!activeWorkspaceId) return;
    await api.updateWorkspaceMember(activeWorkspaceId!, memberId, displayName);
    await refreshWorkspaceMembers(activeWorkspaceId);
  };

  useEffect(() => {
    (async () => {
      const me = await api.me();
      setUser(me);

      await refreshInvites();

      const ws = await api.listWorkspaces();
      setWorkspaces(ws);

      const saved = localStorage.getItem(LS_WORKSPACE);
      const savedId = saved ? Number(saved) : null;

      const initial =
        (savedId && ws.some((w) => w.id === savedId) && savedId) ||
        (ws.length > 0 ? ws[0].id : null);

      setActiveWorkspaceId(initial);
    })();
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setMeetings([]);
      setTasks([]);
      setMembers([]);
      setSelectedMeetingId(null);
      return;
    }

    localStorage.setItem(LS_WORKSPACE, String(activeWorkspaceId));

    (async () => {
      const [ms, ts] = await Promise.all([
        api.listMeetings(activeWorkspaceId),
        api.listTasks(activeWorkspaceId),
      ]);

      setMeetings(ms);
      setTasks(ts);

      await refreshWorkspaceMembers(activeWorkspaceId);

      if (ms.length > 0) setSelectedMeetingId(ms[0].id);
      else setSelectedMeetingId(null);
    })();
  }, [activeWorkspaceId]);

  const handleChangeWorkspace = async (id: number) => {
    setActiveWorkspaceId(id);
    setLastDone(null);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
    navigate("/login");
  };

  const refreshTasks = async (workspaceId: number) => {
    const ts = await api.listTasks(workspaceId);
    setTasks(ts);
  };

  const handleMarkDone = async (taskId: number) => {
    const current = tasks.find((t) => t.id === taskId);
    if (!current) return;

    setLastDone({ taskId, prevStatus: current.status });

    const updated = await api.patchTask(taskId, { status: "done" });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
  };

  const handleUndo = async () => {
    if (!lastDone) return;

    const { taskId, prevStatus } = lastDone;
    const updated = await api.patchTask(taskId, { status: prevStatus });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    setLastDone(null);
  };

  const handleNewMeetingUpload = async (file: File) => {
    if (!activeWorkspaceId) return;

    const base = file.name.replace(/\.txt$/i, "");
    const title = base.length > 0 ? base : "New Meeting";

    const m = await api.createMeeting({
      workspace_id: activeWorkspaceId,
      title,
      meeting_date: null,
    });

    await api.uploadTranscript(m.id, file);

    const ms = await api.listMeetings(activeWorkspaceId);
    setMeetings(ms);
    setSelectedMeetingId(m.id);
  };

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  );

  const todoCount = useMemo(
    () => tasks.filter((t) => t.status !== "done").length,
    [tasks]
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        appName="Transcript Summary"
        user={user}
        inviteCount={invites.length}
        onOpenInvites={() => setInvitesOpen(true)}
        onLogout={handleLogout}
      />

      <div className="mx-auto flex max-w-6xl gap-4 px-4 py-4">
        {/* Sidebar toggle button for desktop */}
        <div className="hidden md:block">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
          >
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </button>
        </div>

        <Sidebar
          open={sidebarOpen}
          currentUserEmail={user?.email ?? null}
          onToggle={() => setSidebarOpen((v) => !v)}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onChangeWorkspace={handleChangeWorkspace}
          members={members}
          onRenameMember={handleRenameMember}
          meetings={meetings}
          selectedMeetingId={selectedMeetingId}
          onSelectMeeting={(id) => setSelectedMeetingId(id)}
          onNewMeetingUpload={handleNewMeetingUpload}
          tasks={tasks}
          onMarkDone={handleMarkDone}
          onUndo={handleUndo}
          canUndo={canUndo}
        />

        <InvitesModal
          open={invitesOpen}
          invites={invites}
          onClose={() => setInvitesOpen(false)}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
          onCreateGroup={handleCreateGroup}
        />

        {/* Main content */}
        <main className="flex-1 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">
                {activeMeeting ? activeMeeting.title : "No meeting selected"}
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                {activeWorkspaceId
                  ? `Workspace: ${
                      workspaces.find((w) => w.id === activeWorkspaceId)
                        ?.name ?? ""
                    }`
                  : "Create or join a workspace to upload meetings."}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-right">
              <div className="text-xs font-semibold text-zinc-700">
                Your tasks
              </div>
              <div className="text-lg font-semibold text-zinc-900">
                {todoCount}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 p-4">
            <ExtractedItemsPanel
              meetingId={selectedMeetingId}
              workspaceId={activeWorkspaceId}
              onTasksChanged={
                activeWorkspaceId
                  ? () => refreshTasks(activeWorkspaceId)
                  : undefined
              }
            />
          </div>
        </main>
      </div>
    </div>
  );
}
