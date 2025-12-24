import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Mode = "login" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "login" ? "Log in" : "Create your account"),
    [mode]
  );

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirm("");
    setError(null);
    setLoading(false);
  };

  const close = () => {
    setOpen(false);
    resetForm();
  };

  const openLogin = () => {
    setMode("login");
    setOpen(true);
    setError(null);
  };

  const openSignup = () => {
    setMode("signup");
    setOpen(true);
    setError(null);
  };

  const submit = async () => {
    setError(null);

    const e = email.trim().toLowerCase();
    if (!e) return setError("Email is required.");
    if (!password) return setError("Password is required.");

    if (mode === "signup") {
      if (password !== confirm) return setError("Passwords do not match.");
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await api.login(e, password);
      } else {
        await api.signup(e, password);
      }

      navigate("/app");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-900">
          Transcript Summary
        </h1>

        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
          Upload meeting transcripts and get structured summaries, decisions,
          action items, and a personalized review workflow for your team.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={openLogin}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.98]"
          >
            Log in
          </button>

          <button
            onClick={openSignup}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 active:scale-[0.98]"
          >
            Sign up
          </button>
        </div>
      </div>

      {/* Modal */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div className="text-sm font-semibold text-zinc-900">{title}</div>

              <button
                onClick={close}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4 text-left">
              <label className="block text-xs font-medium text-zinc-700">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a@example.com"
                autoComplete="email"
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              />

              <label className="mt-4 block text-xs font-medium text-zinc-700">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              />

              {mode === "signup" ? (
                <>
                  <label className="mt-4 block text-xs font-medium text-zinc-700">
                    Confirm password
                  </label>
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                  />
                </>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                onClick={submit}
                disabled={loading}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-60"
              >
                {loading
                  ? mode === "login"
                    ? "Logging in…"
                    : "Creating account…"
                  : mode === "login"
                  ? "Log in"
                  : "Create account"}
              </button>

              <div className="mt-4 text-center text-xs text-zinc-500">
                {mode === "login" ? (
                  <>
                    Don’t have an account?{" "}
                    <button
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                      }}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => {
                        setMode("login");
                        setError(null);
                      }}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      Log in
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
