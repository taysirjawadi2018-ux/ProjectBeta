export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6 text-xs text-on-surface leading-relaxed">
      <h1 className="text-3xl font-extrabold text-institutional-navy dark:text-white border-b border-outline-variant/30 pb-4">
        Terms of Service & Privacy Policy
      </h1>

      <div className="bg-surface dark:bg-slate-900 p-8 rounded-2xl border border-outline-variant/30 space-y-4">
        <h2 className="text-base font-bold text-institutional-navy dark:text-white">1. Data Protection & BFF Token Security (ADR-005)</h2>
        <p>
          Watiq National Portal operates under strict government data privacy regulations. API authentication tokens are never stored directly in browser local storage; all session tokens are handled server-side.
        </p>

        <h2 className="text-base font-bold text-institutional-navy dark:text-white">2. Electronic Signature Authenticity</h2>
        <p>
          Documents downloaded from the Digital Vault carry legal weight equivalent to paper certificates under Decree-Law No. 2026-14 on digital administration.
        </p>
      </div>
    </div>
  );
}
