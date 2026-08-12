import Link from 'next/link';
import Image from 'next/image';

const SECTIONS = [
  {
    heading: 'Citizen Experience',
    icon: 'group',
    cards: [
      {
        href: '/dashboard',
        title: 'Landing Page & Services',
        blurb: 'Primary entry point for all citizens to access services and search procedures.',
        img: '/img/img-9179d34af7be.jpg',
      },
      {
        href: '/login',
        title: 'Login & Authentication',
        blurb: 'Secure authentication gateway for citizen profiles.',
        img: '/img/img-bd78e8b3a7f3.jpg',
      },
      {
        href: '/dashboard',
        title: 'Citizen Dashboard',
        blurb: 'Personalized overview of citizen records, active requests, and appointments.',
        img: '/img/img-57e6aa78a6ec.jpg',
      },
      {
        href: '/requests/submit',
        title: 'Submit Request (Multi-Step)',
        blurb: 'Structured multi-step form for initiating official procedures with file uploads.',
        img: '/img/img-c7da550f73d8.jpg',
      },
      {
        href: '/requests',
        title: 'My Requests',
        blurb: 'Data table tracking live status, reference numbers, and updates.',
        img: '/img/img-0c5aeee57f6e.jpg',
      },
      {
        href: '/appointments',
        title: 'Book Appointment',
        blurb: 'Interactive scheduling tool with calendar grid and slot selector.',
        img: '/img/img-cdd9f0549147.jpg',
      },
      {
        href: '/notifications',
        title: 'Notification Center',
        blurb: 'Centralized hub for important system alerts and message status.',
        img: '/img/img-f0573fb85c4a.jpg',
      },
      {
        href: '/payments/confirmation',
        title: 'Payment Confirmation',
        blurb: 'Receipt confirmation screen with download and print receipt options.',
        img: '/img/img-5d9aa780b56c.jpg',
      },
    ],
  },
  {
    heading: 'Government Operations (Staff)',
    icon: 'corporate_fare',
    cards: [
      {
        href: '/staff/workbench',
        title: 'Staff Workbench',
        blurb: 'Primary operational dashboard for government employees and processing queues.',
        img: '/img/img-c337bf0561a7.jpg',
      },
      {
        href: '/staff/verify/REQ-2026-8819',
        title: 'Verify Request',
        blurb: 'Side-by-side inspection view for staff to review ID scans and grant approvals.',
        img: '/img/img-e804cbbd1940.jpg',
      },
    ],
  },
  {
    heading: 'System Administration',
    icon: 'admin_panel_settings',
    cards: [
      {
        href: '/admin',
        title: 'Admin Management',
        blurb: 'Global system health, user role configuration, and audit metrics.',
        img: '/img/img-a99969afbedc.jpg',
      },
    ],
  },
];

export default function ScreenCatalog() {
  return (
    <div className="space-y-12 my-8">
      {SECTIONS.map((sec, idx) => (
        <section key={idx} className="space-y-6">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-3">
            <span className="material-symbols-outlined text-2xl text-accent-gold dark:text-amber-400">
              {sec.icon}
            </span>
            <h2 className="text-xl font-bold text-institutional-navy dark:text-white">
              {sec.heading}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sec.cards.map((card, cIdx) => (
              <Link
                key={cIdx}
                href={card.href}
                className="group bg-surface dark:bg-slate-800 rounded-xl border border-outline-variant/30 overflow-hidden shadow-xs hover:shadow-md hover:border-accent-gold transition-all flex flex-col"
              >
                <div className="relative h-44 w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                  <img
                    src={card.img}
                    alt={card.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                  <span className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] font-semibold bg-midnight-navy/90 text-white rounded-md backdrop-blur">
                    View Screen →
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-institutional-navy dark:text-white group-hover:text-mediterranean-cerulean transition-colors mb-1">
                      {card.title}
                    </h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {card.blurb}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
