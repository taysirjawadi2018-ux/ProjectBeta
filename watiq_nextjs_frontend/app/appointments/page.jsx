'use client';

import { useState } from 'react';

export default function BookAppointmentPage() {
  const [selectedDate, setSelectedDate] = useState('2026-08-14');
  const [selectedSlot, setSelectedSlot] = useState('10:30 AM');
  const [office, setOffice] = useState('Tunis Central Municipality Office');
  const [confirmed, setConfirmed] = useState(false);

  const dates = [
    { day: 'Thu', date: '13', full: '2026-08-13' },
    { day: 'Fri', date: '14', full: '2026-08-14' },
    { day: 'Mon', date: '17', full: '2026-08-17' },
    { day: 'Tue', date: '18', full: '2026-08-18' },
    { day: 'Wed', date: '19', full: '2026-08-19' },
  ];

  const slots = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:15 AM', '02:00 PM', '02:45 PM', '03:30 PM'];

  const handleBook = () => {
    setConfirmed(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-institutional-navy dark:text-white">
          Book In-Person Government Appointment
        </h1>
        <p className="text-xs text-on-surface-variant max-w-lg mx-auto">
          Schedule your visit for biometric photo capture, fingerprint registration, or document verification.
        </p>
      </div>

      {!confirmed ? (
        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl space-y-8">
          {/* Step 1: Select Regional Office */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
              1. Select Regional Office Location
            </label>
            <select
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background focus:ring-2 focus:ring-midnight-navy outline-none"
            >
              <option>Tunis Central Municipality Office (Avenue Habib Bourguiba)</option>
              <option>Ariana Regional Delegations Office</option>
              <option>Sousse Public Service Center</option>
              <option>Sfax North Delegations Office</option>
            </select>
          </div>

          {/* Step 2: Select Date Grid */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
              2. Choose Available Date (August 2026)
            </label>
            <div className="grid grid-cols-5 gap-3">
              {dates.map((d) => (
                <button
                  key={d.full}
                  onClick={() => setSelectedDate(d.full)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedDate === d.full
                      ? 'bg-midnight-navy text-white border-midnight-navy shadow-md font-bold'
                      : 'bg-surface-container/50 border-outline-variant/30 hover:border-accent-gold text-on-surface'
                  }`}
                >
                  <div className="text-[10px] uppercase font-semibold text-slate-400">{d.day}</div>
                  <div className="text-xl font-extrabold">{d.date}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Select Time Slot */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
              3. Choose Time Slot
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSlot(s)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    selectedSlot === s
                      ? 'bg-accent-gold text-midnight-navy border-accent-gold shadow-md'
                      : 'bg-surface-container/50 border-outline-variant/30 hover:border-accent-gold text-on-surface'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Confirmation Box */}
          <div className="pt-6 border-t border-outline-variant/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs space-y-1">
              <span className="text-slate-400">Selected Appointment:</span>
              <p className="font-bold text-sm text-institutional-navy dark:text-white">
                {selectedDate} at {selectedSlot} ({office})
              </p>
            </div>
            <button
              onClick={handleBook}
              className="px-8 py-3 bg-midnight-navy text-white font-extrabold text-xs rounded-xl shadow-lg hover:bg-slate-800 transition-all"
            >
              Confirm Appointment Slot
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-4xl">event_available</span>
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
              PASS CONFIRMED #APP-2026-9012
            </span>
            <h2 className="text-2xl font-extrabold text-institutional-navy dark:text-white">
              Appointment Successfully Reserved!
            </h2>
            <p className="text-xs text-on-surface-variant">
              Please present your QR code pass or National CIN upon arrival at the office reception counter.
            </p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-outline-variant/30 max-w-md mx-auto text-left text-xs space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Location:</span>
              <strong className="font-bold text-on-surface">{office}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Date & Time:</span>
              <strong className="font-bold text-emerald-600">{selectedDate} @ {selectedSlot}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Counter Number:</span>
              <strong className="font-mono text-on-surface">Desk #04 (Biometric Capture)</strong>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => window.print()}
              className="px-5 py-2.5 text-xs font-bold border border-outline-variant rounded-xl hover:bg-surface-container"
            >
              Print Entry Pass PDF
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="px-5 py-2.5 text-xs font-bold bg-midnight-navy text-white rounded-xl"
            >
              Book Another Visit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
