'use client';

import { useState } from 'react';

export default function A11yControls() {
  const [fontSize, setFontSize] = useState(100);
  const [highContrast, setHighContrast] = useState(false);

  const toggleContrast = () => {
    const nextState = !highContrast;
    setHighContrast(nextState);
    if (nextState) {
      document.documentElement.classList.add('dark', 'high-contrast');
    } else {
      document.documentElement.classList.remove('dark', 'high-contrast');
    }
  };

  const adjustFont = (delta) => {
    const newSize = Math.min(130, Math.max(90, fontSize + delta));
    setFontSize(newSize);
    document.documentElement.style.fontSize = `${newSize}%`;
  };

  return (
    <div className="flex items-center gap-1 bg-surface-container-low dark:bg-slate-800 p-1 rounded-lg border border-outline-variant/30 text-xs">
      <button 
        onClick={() => adjustFont(-5)} 
        title="Decrease Text Size" 
        className="px-2 py-1 hover:bg-surface-container rounded font-bold text-on-surface hover:text-primary transition-colors"
      >
        A-
      </button>
      <button 
        onClick={() => adjustFont(5)} 
        title="Increase Text Size" 
        className="px-2 py-1 hover:bg-surface-container rounded font-bold text-on-surface hover:text-primary transition-colors"
      >
        A+
      </button>
      <div className="w-px h-4 bg-outline-variant/40 mx-1"></div>
      <button 
        onClick={toggleContrast} 
        title="Toggle High Contrast / Dark Mode" 
        className={`px-2 py-1 rounded font-medium transition-colors ${highContrast ? 'bg-accent-gold text-midnight-navy font-bold' : 'hover:bg-surface-container text-on-surface'}`}
      >
        <span className="material-symbols-outlined text-sm align-middle">contrast</span>
      </button>
    </div>
  );
}
