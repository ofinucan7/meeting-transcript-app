import { useEffect, useMemo, useRef, useState } from "react";
import ItemCard from "./ItemCard";
import { api } from "../lib/api";
import type { Extraction, ExtractedItem } from "../lib/types";

type ReviewFilter = "pending" | "approved" | "rejected" | "all";

function normalizeItem(raw: any): ExtractedItem {
  return {
    ...raw,
    kind: (raw.kind ?? raw.item_type ?? "note") as ExtractedItem["kind"],
    status: (raw.status ?? "pending") as ExtractedItem["status"],
    contexts: raw.contexts ?? [],
    details: raw.details ?? null,
    speaker: raw.speaker ?? null,
    timestamp_start: raw.timestamp_start ?? null,
    timestamp_end: raw.timestamp_end ?? null,
    confidence: raw.confidence ?? null,
    needs_review: !!raw.needs_review,
    review_reasons: raw.review_reasons ?? null,
  };
}

export default function ExtractedItemsPanel({
  meetingId,
  workspaceId,
  onTasksChanged,
}: {
  meetingId: number | null;
  workspaceId: number | null;
  onTasksChanged?: () => void | Promise<void>;
}) {
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [selectedExtractionId, setSelectedExtractionId] = useState<
    number | null
  >(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [loadingExtractions, setLoadingExtractions] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [busyIds, setBusyIds] = useState<Record<number, boolean>>({});

  const pollRef = useRef<number | null>(null);

  const activeExtraction = useMemo(() => {
    if (!selectedExtractionId) return null;
    return extractions.find((e) => e.id === selectedExtractionId) ?? null;
  }, [extractions, selectedExtractionId]);

  const refreshItems = async (extractionId: number | null) => {
    if (!extractionId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const its = await api.listExtractionItems(extractionId);
      setItems(its.map((it: any) => normalizeItem(it)));
    } finally {
      setLoadingItems(false);
    }
  };

  const refreshExtractions = async () => {
    if (!meetingId) {
      setExtractions([]);
      setSelectedExtractionId(null);
      return;
    }
    setLoadingExtractions(true);
    try {
      const exts = await api.listExtractions(meetingId);
      setExtractions(exts);

      if (!selectedExtractionId && exts.length > 0) {
        const id = exts[0].id;
        setSelectedExtractionId(id);
        await refreshItems(id);
        return;
      }

      if (
        selectedExtractionId &&
        !exts.some((e) => e.id === selectedExtractionId)
      ) {
        const id = exts.length ? exts[0].id : null;
        setSelectedExtractionId(id);
        if (id) await refreshItems(id);
      }
    } finally {
      setLoadingExtractions(false);
    }
  };

  const startExtraction = async () => {
    if (!meetingId) return;
    setStarting(true);
    try {
      const ext = await api.startExtraction(meetingId, "hf_structured");
      setSelectedExtractionId(ext.id);
      await refreshExtractions();
      await refreshItems(ext.id);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    refreshExtractions();
  }, [meetingId]);

  useEffect(() => {
    refreshItems(selectedExtractionId);
  }, [selectedExtractionId]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!activeExtraction || activeExtraction.status !== "processing") return;

    pollRef.current = window.setInterval(async () => {
      await refreshExtractions();
      await refreshItems(selectedExtractionId);
    }, 1500);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeExtraction?.status, selectedExtractionId]);

  const filteredItems = useMemo(() => {
    if (reviewFilter === "all") return items;
    return items.filter((it) => (it.status ?? "pending") === reviewFilter);
  }, [items, reviewFilter]);

  const setBusy = (id: number, v: boolean) =>
    setBusyIds((prev) => ({ ...prev, [id]: v }));

  const approveItem = async (item: ExtractedItem) => {
    setBusy(item.id, true);
    try {
      const kind = (item as any).kind ?? (item as any).item_type;

      if (kind === "action_item" && workspaceId) {
        try {
          await api.createTask({
            workspace_id: workspaceId,
            title: item.title,
            details: item.details ?? null,
            due_at: null,
          });

          await onTasksChanged?.();
        } catch (err) {
          console.warn("createTask failed", err);
        }
      }

      const patchedRaw = await api.patchExtractedItem(item.id, {
        status: "approved",
        needs_review: false,
        review_reasons: null,
        edit_reason: "human_approved",
      });

      const patched = normalizeItem(patchedRaw);
      setItems((prev) => prev.map((p) => (p.id === item.id ? patched : p)));
    } finally {
      setBusy(item.id, false);
    }
  };

  const rejectItem = async (item: ExtractedItem) => {
    setBusy(item.id, true);
    try {
      const reason =
        window.prompt("Optional: why are you rejecting this item?") ?? null;

      const patchedRaw = await api.patchExtractedItem(item.id, {
        status: "rejected",
        needs_review: true,
        review_reasons: reason ? [reason] : ["human_rejected"],
        edit_reason: reason ?? "human_rejected",
      });

      const patched = normalizeItem(patchedRaw);
      setItems((prev) => prev.map((p) => (p.id === item.id ? patched : p)));
    } finally {
      setBusy(item.id, false);
    }
  };

  const editItem = async (
    itemId: number,
    payload: Partial<ExtractedItem> & { edit_reason?: string | null }
  ) => {
    setBusy(itemId, true);
    try {
      const patchedRaw = await api.patchExtractedItem(itemId, {
        ...payload,
        edit_reason: payload.edit_reason ?? "human_edit",
      });

      const patched = normalizeItem(patchedRaw);
      setItems((prev) => prev.map((p) => (p.id === itemId ? patched : p)));
    } finally {
      setBusy(itemId, false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Extracted Items
          </h2>
          <div className="text-xs text-zinc-600">
            {activeExtraction ? (
              <>
                Run {activeExtraction.id} • {activeExtraction.model} •{" "}
                {activeExtraction.status}
              </>
            ) : (
              "No extraction run selected."
            )}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            MVP mode: all items require human approval. Approve/No buttons are
            always the source of truth (confidence only changes color).
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs"
            value={selectedExtractionId ?? ""}
            onChange={(e) =>
              setSelectedExtractionId(
                e.target.value ? Number(e.target.value) : null
              )
            }
            disabled={loadingExtractions || starting}
          >
            {extractions.map((e) => (
              <option key={e.id} value={e.id}>
                Run {e.id} • {e.status}
              </option>
            ))}
          </select>

          <button
            onClick={startExtraction}
            disabled={!meetingId || starting}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {starting ? "Starting..." : "Run extraction"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`h-8 rounded-lg border px-3 text-xs ${
            reviewFilter === "pending"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
          }`}
          onClick={() => setReviewFilter("pending")}
        >
          Pending (
          {items.filter((i) => (i.status ?? "pending") === "pending").length})
        </button>

        <button
          className={`h-8 rounded-lg border px-3 text-xs ${
            reviewFilter === "approved"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
          }`}
          onClick={() => setReviewFilter("approved")}
        >
          Approved ({items.filter((i) => i.status === "approved").length})
        </button>

        <button
          className={`h-8 rounded-lg border px-3 text-xs ${
            reviewFilter === "rejected"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
          }`}
          onClick={() => setReviewFilter("rejected")}
        >
          Rejected ({items.filter((i) => i.status === "rejected").length})
        </button>

        <button
          className={`h-8 rounded-lg border px-3 text-xs ${
            reviewFilter === "all"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
          }`}
          onClick={() => setReviewFilter("all")}
        >
          All ({items.length})
        </button>

        {(loadingExtractions || loadingItems) && (
          <span className="ml-2 text-xs text-zinc-500">Loading…</span>
        )}
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
            No items for this filter.
          </div>
        ) : (
          filteredItems.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              busy={!!busyIds[it.id]}
              onApprove={() => approveItem(it)}
              onReject={() => rejectItem(it)}
              onEdit={(payload) => editItem(it.id, payload)}
            />
          ))
        )}
      </div>
    </section>
  );
}
