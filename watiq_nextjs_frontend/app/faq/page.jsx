'use client';

export default function FaqPage() {
  const faqs = [
    { q: 'How do I renew my Biometric Passport online?', a: 'Log in using your CIN, navigate to "Submit Request", select "Biometric Passport Renewal", upload your residence proof and CIN scan, pay the 60.000 TND fiscal stamp, and book your appointment for fingerprint capture.' },
    { q: 'Is the digital document from the vault legally recognized?', a: 'Yes, all PDFs issued through Watiq contain a digital SHA256 cryptographic signature issued by the Republic Certification Authority.' },
    { q: 'What should I bring to my in-person appointment?', a: 'Bring your printed appointment entry pass PDF, your original National ID (CIN), and your current passport if renewing.' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <h1 className="text-3xl font-extrabold text-institutional-navy dark:text-white border-b border-outline-variant/30 pb-4">
        Frequently Asked Questions (FAQ)
      </h1>
      <div className="space-y-4">
        {faqs.map((f, i) => (
          <div key={i} className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs space-y-2">
            <h2 className="font-bold text-base text-institutional-navy dark:text-white">{f.q}</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
