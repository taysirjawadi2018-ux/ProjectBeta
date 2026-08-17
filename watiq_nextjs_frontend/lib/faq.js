/**
 * The knowledge base behind /help.
 *
 * Port of the FAQ list in frontend_flask/views/public.py:255-298. The mockup
 * shipped three category chips but questions for only one of them, so the two
 * Digital ID entries below are its copy verbatim and the rest describe what
 * this portal actually does — a category that opens onto nothing is worse than
 * no category.
 *
 * Move this to a CMS or an API the moment there is one; it lives here because
 * there is not.
 */
export const FAQ = [
  {
    topic: 'Digital ID',
    icon: 'fingerprint',
    question: 'How do I renew my digital identity?',
    answer:
      "To renew your digital identity, log in to your Citizen Space using your current credentials. Navigate to the 'Identity' section and select 'Renew Certificate'. You will need to complete a biometric verification step using your smartphone camera.",
  },
  {
    topic: 'Digital ID',
    icon: 'fingerprint',
    question: 'What documents are required for initial setup?',
    answer:
      'You will need your National Identity Card (CIN) and a secondary proof of address (utility bill or bank statement) issued within the last three months. Both documents must be scanned clearly.',
  },
  {
    topic: 'Digital ID',
    icon: 'fingerprint',
    question: 'I have lost access to my account. What now?',
    answer:
      'Use the account recovery page. Recovery is verified against the phone number registered to your CIN; if that number has changed, recovery has to be done in person at any municipal office.',
  },
  {
    topic: 'Appointments',
    icon: 'event_available',
    question: 'How do I book an appointment?',
    answer:
      'Choose an office on the appointment map, pick a day from the week strip and then a free slot. You will need to say which service the appointment is for before it can be confirmed.',
  },
  {
    topic: 'Appointments',
    icon: 'event_available',
    question: 'Can I cancel or change a booking?',
    answer:
      'Yes. Open the appointment from your appointment list and cancel it there; the slot is released immediately and can be rebooked by anyone, including you.',
  },
  {
    topic: 'Payments',
    icon: 'payments',
    question: 'Which fees are payable online?',
    answer:
      'Any request whose status reaches Payment required can be paid from the payments page. Requests that carry no fee never enter that status.',
  },
  {
    topic: 'Payments',
    icon: 'payments',
    question: 'Where do I find my receipt?',
    answer:
      'Every completed payment has a receipt on the payments page. It carries the transaction reference you will be asked for at the counter.',
  },
];

export const FAQ_TOPICS = [...new Set(FAQ.map((entry) => entry.topic))].sort();
