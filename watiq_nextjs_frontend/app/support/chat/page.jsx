'use client';

import { useState } from 'react';

export default function SupportChatPage() {
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hello! I am your Watiq AI Assistant. How can I assist you with your government procedure today?' },
  ]);
  const [input, setInput] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input;
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `Thank you for your question regarding "${userMsg}". You can track your active procedure at /requests or schedule an appointment at /appointments.`,
        },
      ]);
    }, 600);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="bg-surface dark:bg-slate-900 rounded-2xl border border-outline-variant/30 shadow-xl overflow-hidden flex flex-col h-[70vh]">
        {/* Chat Header */}
        <div className="bg-midnight-navy text-white p-4 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
          <div>
            <h1 className="font-bold text-sm">Watiq Virtual Support Agent</h1>
            <p className="text-[11px] text-slate-300">24/7 Automated Government Procedure Assistant</p>
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-md p-3.5 rounded-2xl leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-midnight-navy text-white rounded-br-none'
                    : 'bg-surface-container text-on-surface rounded-bl-none'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-outline-variant/30 bg-background dark:bg-slate-800 flex gap-2">
          <input
            type="text"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-outline-variant text-xs bg-surface dark:bg-slate-900 text-on-background outline-none"
          />
          <button type="submit" className="px-5 py-2.5 bg-midnight-navy text-white text-xs font-bold rounded-xl hover:bg-slate-800">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
