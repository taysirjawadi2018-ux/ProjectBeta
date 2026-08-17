/**
 * One-shot messages. Port of frontend_flask/templates/partials/_flash.html.
 *
 * Colours come from the design tokens, so this matches the notice panel the
 * mockups already used.
 *
 * An error is role="alert" (interrupts a screen reader) while everything else
 * is role="status" (announced at the next pause). Making them all alerts would
 * make "Saved." interrupt whatever the reader was in the middle of.
 */

const STYLES = {
  error: {
    box: 'bg-error-container border-error text-on-error-container',
    icon: 'warning',
    role: 'alert',
  },
  success: {
    box: 'bg-secondary-container border-secondary text-on-secondary-container',
    icon: 'check_circle',
    role: 'status',
  },
  default: {
    box: 'bg-surface-container-low border-surface-variant text-on-surface',
    icon: 'info',
    role: 'status',
  },
};

export default function Flash({ messages = [] }) {
  if (!messages.length) return null;

  return (
    <div
      aria-live="polite"
      className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop pt-4 space-y-3"
    >
      {messages.map(({ message, category }, index) => {
        const style = STYLES[category] ?? STYLES.default;
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key -- the queue is
            // drained on read, so there is no identity to key on and no reorder.
            key={index}
            className={`flex items-start gap-3 p-4 rounded-xl border ${style.box}`}
            role={style.role}
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              {style.icon}
            </span>
            <p className="font-body-md text-body-md">{message}</p>
          </div>
        );
      })}
    </div>
  );
}
