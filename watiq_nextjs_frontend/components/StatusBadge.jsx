import { statusTone, statusLabel } from '@/lib/view.js';

/** The status pill, so every screen spells one the same way. */
export default function StatusBadge({ status, className = '' }) {
  return (
    <span
      className={`inline-flex items-center font-label-sm text-label-sm px-2.5 py-1 rounded border ${statusTone(status)} ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}
