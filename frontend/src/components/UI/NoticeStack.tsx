import { AlertTriangle, X } from "lucide-react";
import type { AppNotice } from "../../state/canvasStore";
import "./NoticeStack.css";

interface NoticeStackProps {
  notices: AppNotice[];
  onDismiss: (id: string) => void;
}

/**
 * Visible-but-unobtrusive error surface. Every failure mode in the app
 * (bad file, unsupported version, export failure, storage failure) routes
 * here instead of failing silently or throwing to the console only.
 */
export function NoticeStack({ notices, onDismiss }: NoticeStackProps) {
  if (notices.length === 0) return null;
  return (
    <div className="notice-stack" role="alert" aria-live="assertive">
      {notices.map((n) => (
        <div className="notice" key={n.id}>
          <AlertTriangle size={16} className="notice__icon" />
          <span className="notice__message">{n.message}</span>
          <button
            type="button"
            className="notice__dismiss"
            onClick={() => onDismiss(n.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
