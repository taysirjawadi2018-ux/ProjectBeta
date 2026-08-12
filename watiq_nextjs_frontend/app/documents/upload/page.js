'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DocumentUploadPage() {
  const router = useRouter();
  const [docType, setDocType] = useState('Proof of Residence');
  const [fileName, setFileName] = useState('');

  const handleUpload = (e) => {
    e.preventDefault();
    alert('Document uploaded and scheduled for automated verification!');
    router.push('/documents');
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-midnight-navy/10 text-midnight-navy dark:text-accent-gold flex items-center justify-center mx-auto mb-2">
            <span className="material-symbols-outlined text-3xl">upload_file</span>
          </div>
          <h1 className="text-2xl font-bold text-institutional-navy dark:text-white">
            Upload Document to Vault
          </h1>
          <p className="text-xs text-on-surface-variant">
            Upload official PDF or scanned images to your encrypted citizen repository.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background outline-none"
            >
              <option>Proof of Residence</option>
              <option>National CIN Scan</option>
              <option>Birth Certificate Extract</option>
              <option>Employment Contract</option>
              <option>Property Deed</option>
            </select>
          </div>

          <div className="border-2 border-dashed border-outline-variant rounded-xl p-6 text-center space-y-2">
            <input
              type="file"
              required
              onChange={(e) => setFileName(e.target.files[0]?.name || '')}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer space-y-1 block">
              <span className="material-symbols-outlined text-3xl text-accent-gold">cloud_upload</span>
              <p className="text-xs font-bold text-midnight-navy dark:text-white">
                {fileName ? fileName : 'Click to select file (PDF, JPG, PNG)'}
              </p>
              <p className="text-[11px] text-slate-400">Maximum file size: 10 MB</p>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-midnight-navy text-white font-bold text-xs rounded-xl shadow-md hover:bg-slate-800 transition-all"
          >
            Upload File to Vault
          </button>
        </form>
      </div>
    </div>
  );
}
