import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Header({
  appName,
  user,
  inviteCount,
  onOpenInvites,
  onLogout,
}: {
  appName: string;
  user: User | null;
  inviteCount: number;
  onOpenInvites: () => void;
  onLogout: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const last = lastYRef.current;
      const goingDown = y > last;

      if (goingDown && y > 96) setHidden(true);
      else if (!goingDown) setHidden(false);

      lastYRef.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await api.logout();
    onLogout();
  };

  return (
    <header
      className={`sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur transition-transform duration-200 ${
        hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
      } ${hidden ? "pointer-events-none" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/app" className="text-sm font-semibold text-zinc-900">
          {appName}
        </a>

        <div className="flex items-center gap-3">
          {user ? (
            <span className="hidden text-xs text-zinc-600 sm:inline">
              {user.email}
            </span>
          ) : null}

          <button
            onClick={onOpenInvites}
            className="relative inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
            aria-label="Invites"
            title="Invites"
          >
            Invites
            {inviteCount > 0 ? (
              <span className="ml-2 inline-flex min-w-4.5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-semibold text-white">
                {inviteCount}
              </span>
            ) : null}
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
