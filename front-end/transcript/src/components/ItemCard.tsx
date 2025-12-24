import Badge from "./ui/Badge";
import Button from "./ui/Button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import type { ExtractedItem, ExtractedItemKind } from "../lib/types";

function kindLabel(k: ExtractedItemKind) {
  switch (k) {
    case "summary":
      return "Summary";
    case "decision":
      return "Decision";
    case "action_item":
      return "Action Item";
    case "open_question":
      return "Open Question";
    case "estimate":
      return "Estimate";
    case "risk":
      return "Risk";
    case "note":
      return "Note";
    default:
      return k;
  }
}

function confidenceTone(conf: number | null | undefined) {
  if (conf === null || conf === undefined || Number.isNaN(conf))
    return "unknown";
  if (conf >= 0.85) return "high";
  if (conf >= 0.65) return "medium";
  return "low";
}

function confidenceLabel(conf: number | null | undefined) {
  if (conf === null || conf === undefined || Number.isNaN(conf))
    return "conf ?";
  const pct = Math.round(conf * 100);
  return `conf ${pct}%`;
}

function confidenceClasses(tone: ReturnType<typeof confidenceTone>) {
  switch (tone) {
    case "high":
      return "bg-emerald-600 hover:bg-emerald-700 text-white";
    case "medium":
      return "bg-amber-500 hover:bg-amber-600 text-white";
    case "low":
      return "bg-rose-600 hover:bg-rose-700 text-white";
    default:
      return "bg-zinc-900 hover:bg-zinc-800 text-white";
  }
}

export default function ItemCard({
  item,
  onApprove,
  onReject,
  onEdit,
  busy = false,
  requireHumanApproval = true,
}: {
  item: ExtractedItem;
  onApprove?: (item: ExtractedItem) => void;
  onReject?: (item: ExtractedItem) => void;
  onEdit?: (item: ExtractedItem) => void;
  busy?: boolean;
  requireHumanApproval?: boolean;
}) {
  const tone = confidenceTone(item.confidence);
  const approveBtnClasses = confidenceClasses(tone);

  const showDecisionButtons = requireHumanApproval;

  const approveLabel = item.kind === "action_item" ? "Confirm task" : "Approve";

  return (
    <Card className="rounded-2xl border border-zinc-200 bg-white">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{item.title}</CardTitle>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge>{kindLabel(item.kind)}</Badge>

              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                {confidenceLabel(item.confidence)}
              </span>

              {item.needs_review ? (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  NEEDS REVIEW
                </span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
            {item.status ?? "pending"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {item.details ? (
          <div className="text-sm text-zinc-700">{item.details}</div>
        ) : null}

        {item.speaker || item.timestamp_start || item.timestamp_end ? (
          <div className="text-xs text-zinc-500">
            {item.speaker ? <span>Speaker: {item.speaker}</span> : null}
            {item.speaker && (item.timestamp_start || item.timestamp_end)
              ? " • "
              : null}
            {item.timestamp_start || item.timestamp_end ? (
              <span>
                {item.timestamp_start ?? "?"}–{item.timestamp_end ?? "?"}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.review_reasons?.length ? (
          <div className="text-xs text-amber-700">
            Reasons: {item.review_reasons.join(", ")}
          </div>
        ) : null}

        {item.contexts?.length ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-zinc-600">
              Evidence ({item.contexts.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {item.contexts.map((c, idx) => (
                <li
                  key={idx}
                  className="rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700"
                >
                  {c}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="ghost" onClick={() => onEdit?.(item)} disabled={busy}>
          Edit
        </Button>

        <Button
          variant="secondary"
          onClick={() => onReject?.(item)}
          disabled={busy || !showDecisionButtons}
        >
          No
        </Button>

        <Button
          onClick={() => onApprove?.(item)}
          disabled={busy || !showDecisionButtons}
          className={approveBtnClasses}
        >
          {approveLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
