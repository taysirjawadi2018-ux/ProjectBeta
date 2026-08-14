'use client';

import { useState } from 'react';
import Link from 'next/link';
import ScreenCatalog from '@/components/ScreenCatalog';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('landing');
  const [searchQuery, setSearchQuery] = useState('');

  const services = [
    { title: 'National Identity Card (CIN)', category: 'Civil Status', time: '5 Business Days', icon: 'badge', href: '/requests/submit' },
    { title: 'Biometric Passport Renewal', category: 'Travel & Mobility', time: '3 Business Days', icon: 'flight_takeoff', href: '/requests/submit' },
    { title: 'Birth Certificate (Extract)', category: 'Civil Status', time: 'Instant Digital', icon: 'description', href: '/requests/submit' },
    { title: 'Property Tax Payment & Certificate', category: 'Finance & Tax', time: 'Instant Receipt', icon: 'payments', href: '/requests/submit' },
    { title: 'Business License Registration', category: 'Enterprise', time: '7 Business Days', icon: 'domain', href: '/requests/submit' },
    { title: 'Driver License Verification', category: 'Transport', time: 'Instant Verification', icon: 'directions_car', href: '/requests/submit' },
  ];

  const filteredServices = services.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-10 pb-16">
      {/* Hero Banner Section */}
      <section className="relative bg-gradient-to-b from-midnight-navy via-slate-900 to-institutional-navy text-white pt-16 pb-20 px-4 sm:px-6 overflow-hidden">
        {/* Subtle Decorative Pattern Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#C5A059_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-gold/20 text-accent-gold border border-accent-gold/40">
            <span className="w-2 h-2 rounded-full bg-accent-gold"></span>
            Unified Citizen Portal 2.0
          </span>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-white">
            Access All National Government Services & Procedures
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Submit applications, track document verification status, schedule in-person appointments, and manage official civil records securely online.
          </p>

          {/* Hero Search Box */}
          <div className="max-w-2xl mx-auto relative pt-4">
            <div className="relative flex items-center bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gold-muted/40 p-2">
              <span className="material-symbols-outlined text-slate-400 ml-3 mr-2 text-2xl">search</span>
              <input
                type="text"
                placeholder="Search for a service, procedure, or document (e.g., Passport, CIN, Birth Certificate)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none py-2"
              />
              <button 
                onClick={() => setSearchQuery('')}
                className="px-5 py-2.5 bg-midnight-navy text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
              >
                Search
              </button>
            </div>
          </div>

          {/* Tab Switcher: Landing vs Complete Screen Catalog */}
          <div className="inline-flex p-1 bg-white/10 backdrop-blur rounded-xl border border-white/20 text-xs font-semibold mt-4">
            <button
              onClick={() => setActiveTab('landing')}
              className={`px-5 py-2 rounded-lg transition-all ${
                activeTab === 'landing'
                  ? 'bg-accent-gold text-midnight-navy font-bold shadow-md'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Public Services View
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-5 py-2 rounded-lg transition-all ${
                activeTab === 'catalog'
                  ? 'bg-accent-gold text-midnight-navy font-bold shadow-md'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              All 12 Screen Mockups Catalog
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {activeTab === 'catalog' ? (
          <ScreenCatalog />
        ) : (
          <div className="space-y-12">
            {/* Quick Action Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 -mt-16 relative z-20">
              <Link
                href="/requests/submit"
                className="bg-surface dark:bg-slate-800 p-5 rounded-xl border border-outline-variant/40 shadow-md hover:border-accent-gold hover:-translate-y-1 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-midnight-navy/10 dark:bg-accent-gold/20 text-midnight-navy dark:text-accent-gold flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">post_add</span>
                </div>
                <h3 className="font-bold text-sm text-institutional-navy dark:text-white">Submit Request</h3>
                <p className="text-xs text-on-surface-variant mt-1">Start a new procedure</p>
              </Link>

              <Link
                href="/requests"
                className="bg-surface dark:bg-slate-800 p-5 rounded-xl border border-outline-variant/40 shadow-md hover:border-accent-gold hover:-translate-y-1 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-mediterranean-cerulean/10 text-mediterranean-cerulean flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">timeline</span>
                </div>
                <h3 className="font-bold text-sm text-institutional-navy dark:text-white">Track Application</h3>
                <p className="text-xs text-on-surface-variant mt-1">Check status by Ref ID</p>
              </Link>

              <Link
                href="/appointments"
                className="bg-surface dark:bg-slate-800 p-5 rounded-xl border border-outline-variant/40 shadow-md hover:border-accent-gold hover:-translate-y-1 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">calendar_month</span>
                </div>
                <h3 className="font-bold text-sm text-institutional-navy dark:text-white">Book Appointment</h3>
                <p className="text-xs text-on-surface-variant mt-1">In-person office visits</p>
              </Link>

              <Link
                href="/documents"
                className="bg-surface dark:bg-slate-800 p-5 rounded-xl border border-outline-variant/40 shadow-md hover:border-accent-gold hover:-translate-y-1 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">folder_shared</span>
                </div>
                <h3 className="font-bold text-sm text-institutional-navy dark:text-white">Document Vault</h3>
                <p className="text-xs text-on-surface-variant mt-1">Access verified PDFs</p>
              </Link>
            </div>

            {/* Popular Services Grid */}
            <section className="space-y-6">
              <div className="flex justify-between items-end border-b border-outline-variant/30 pb-3">
                <div>
                  <h2 className="text-2xl font-bold text-institutional-navy dark:text-white">Popular Government Services</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Select a procedure below to initiate request processing.</p>
                </div>
                <Link href="/requests/submit" className="text-xs font-bold text-mediterranean-cerulean hover:underline">
                  View All Services →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredServices.map((service, i) => (
                  <div
                    key={i}
                    className="bg-surface dark:bg-slate-800 rounded-xl p-6 border border-outline-variant/30 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="p-2.5 rounded-lg bg-surface-container text-midnight-navy dark:text-accent-gold">
                          <span className="material-symbols-outlined text-2xl">{service.icon}</span>
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {service.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-institutional-navy dark:text-white">{service.title}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        Est. Processing Time: <strong className="text-slate-800 dark:text-slate-200">{service.time}</strong>
                      </div>
                    </div>

                    <div className="pt-5 mt-4 border-t border-outline-variant/20 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-mono">CODE: SERV-0{i + 1}</span>
                      <Link
                        href={service.href}
                        className="px-3.5 py-1.5 text-xs font-bold text-white bg-midnight-navy hover:bg-slate-800 dark:bg-accent-gold dark:text-midnight-navy rounded-lg transition-colors"
                      >
                        Apply Now
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
