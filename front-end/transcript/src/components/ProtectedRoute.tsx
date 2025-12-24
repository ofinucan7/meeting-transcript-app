import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then(() => setOk(true))
      .catch(() => setOk(false));
  }, []);

  if (ok === null) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 text-zinc-700">Loading…</div>
    );
  }

  if (!ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
