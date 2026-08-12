'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SubmitRequestPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    procedure: 'Biometric Passport Renewal',
    givenName: 'Youssef',
    familyName: 'Ben Ammar',
    cinNumber: '08123456',
    address: 'Avenue Habib Bourguiba, Tunis',
    phone: '+216 98 123 456',
    deliveryMode: 'Home Express Courier',
    filesUploaded: 2,
  });
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push('/payments/confirmation');
    }, 800);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Page Title & Wizard Progress Bar */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-extrabold text-institutional-navy dark:text-white">
          Initiate Official Procedure Request
        </h1>
        <p className="text-xs text-on-surface-variant max-w-xl mx-auto">
          Complete the three required steps below. All submitted documents are protected under TLS encryption and verified server-side.
        </p>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${step === 1 ? 'bg-midnight-navy text-white shadow-md' : 'bg-surface-container text-slate-500'}`}>
            <span className="w-5 h-5 rounded-full bg-accent-gold text-midnight-navy flex items-center justify-center text-[10px]">1</span>
            Procedure & Personal Info
          </div>
          <span className="text-slate-300">→</span>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${step === 2 ? 'bg-midnight-navy text-white shadow-md' : 'bg-surface-container text-slate-500'}`}>
            <span className="w-5 h-5 rounded-full bg-accent-gold text-midnight-navy flex items-center justify-center text-[10px]">2</span>
            Document Uploads
          </div>
          <span className="text-slate-300">→</span>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${step === 3 ? 'bg-midnight-navy text-white shadow-md' : 'bg-surface-container text-slate-500'}`}>
            <span className="w-5 h-5 rounded-full bg-accent-gold text-midnight-navy flex items-center justify-center text-[10px]">3</span>
            Review & Fee Payment
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl space-y-6">
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-3">
              Step 1: Select Procedure & Enter Applicant Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Target Procedure</label>
                <select
                  value={formData.procedure}
                  onChange={(e) => setFormData({ ...formData, procedure: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background focus:ring-2 focus:ring-midnight-navy outline-none"
                >
                  <option>Biometric Passport Renewal</option>
                  <option>National Identity Card (CIN)</option>
                  <option>Civil Status Birth Extract</option>
                  <option>Property Tax Certificate</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Given Name</label>
                  <input
                    type="text"
                    value={formData.givenName}
                    onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Family Surname</label>
                  <input
                    type="text"
                    value={formData.familyName}
                    onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">National CIN Number</label>
                  <input
                    type="text"
                    value={formData.cinNumber}
                    onChange={(e) => setFormData({ ...formData, cinNumber: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Official Postal Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-3">
              Step 2: Upload Supporting Documents
            </h2>

            <div className="border-2 border-dashed border-outline-variant rounded-2xl p-8 text-center space-y-3 bg-surface-container-lowest dark:bg-slate-800/50 hover:border-accent-gold transition-colors">
              <span className="material-symbols-outlined text-4xl text-accent-gold">cloud_upload</span>
              <div className="space-y-1">
                <p className="text-sm font-bold text-institutional-navy dark:text-white">
                  Drag and drop your supporting files here
                </p>
                <p className="text-xs text-slate-400">PDF, JPG, PNG up to 10MB each (National ID Scan, Birth Extract, Residence Proof)</p>
              </div>
              <button type="button" className="px-4 py-2 text-xs font-bold bg-midnight-navy text-white rounded-lg hover:bg-slate-800">
                Browse Files
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-slate-400">Uploaded Attachments ({formData.filesUploaded})</h3>
              <div className="p-3 bg-surface-container rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500">task</span>
                  <span className="font-medium text-on-surface">CIN_Identity_Scan_FrontBack.pdf</span>
                </div>
                <span className="text-slate-400">1.8 MB (Verified)</span>
              </div>
              <div className="p-3 bg-surface-container rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500">task</span>
                  <span className="font-medium text-on-surface">Residence_Certificate_2026.pdf</span>
                </div>
                <span className="text-slate-400">950 KB (Verified)</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-3">
              Step 3: Review Summary & Fiscal Stamp Payment
            </h2>

            <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-xl border border-outline-variant/30 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Procedure:</span>
                <strong className="font-bold text-on-surface">{formData.procedure}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Applicant:</span>
                <strong className="font-bold text-on-surface">{formData.givenName} {formData.familyName} (CIN: {formData.cinNumber})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Method:</span>
                <strong className="font-bold text-on-surface">{formData.deliveryMode}</strong>
              </div>
              <div className="flex justify-between border-t border-outline-variant/30 pt-3 text-sm">
                <span className="font-bold text-institutional-navy dark:text-white">Fiscal Stamp Fee:</span>
                <strong className="font-extrabold text-emerald-600">60.000 TND</strong>
              </div>
            </div>

            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl">shield</span>
              <span>Payment is processed through the Official e-Dinar Secure Gateway. Instant transaction receipt provided upon confirmation.</span>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex justify-between items-center pt-4 border-t border-outline-variant/30">
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="px-5 py-2.5 text-xs font-bold text-midnight-navy dark:text-white border border-outline-variant rounded-lg hover:bg-surface-container"
            >
              ← Back
            </button>
          ) : <div></div>}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 bg-midnight-navy text-white text-xs font-bold rounded-lg hover:bg-slate-800 shadow-md"
            >
              Continue to Step {step + 1} →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-3 bg-accent-gold text-midnight-navy font-extrabold text-xs rounded-xl shadow-lg hover:bg-amber-300 transition-all"
            >
              {loading ? 'Processing Transaction...' : 'Pay 60.000 TND & Submit Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
