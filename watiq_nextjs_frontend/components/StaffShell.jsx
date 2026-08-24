/**
 * Back-office content shell.
 *
 * Once carried the navy sidebar and the mobile link strip; both are gone now
 * that the root layout renders the one universal navigation bar, which is
 * role-aware and shows an officer their workbench sections in exactly the same
 * bar a citizen sees the citizen sections in. This shell only owns the
 * content column.
 *
 * `active`, `staff` and `role` are accepted and ignored — call sites still
 * pass them, and the API enforces permissions regardless of what any chrome
 * shows. Hiding a control the caller cannot use is a courtesy, not a control.
 */
export default function StaffShell({ children }) {
  return (
    <div className="min-h-screen bg-surface-container-low">
      <main
        id="main"
        className="max-w-container-max mx-auto p-margin-mobile md:p-margin-desktop space-y-8"
      >
        {children}
      </main>
    </div>
  );
}
