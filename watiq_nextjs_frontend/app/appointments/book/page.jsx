import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { one, many, intOr, formatDate, formatMoney, query as qs } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import { bookAppointmentAction } from '@/lib/actions.js';
import '@/styles/pages/book_appointment.css';

/**
 * The three-step booking wizard, driven by the query string.
 * Port of frontend_flask/templates/book_appointment.html and
 * views/citizen.py:book_appointment.
 *
 * The mockup ran the steps in JavaScript over hardcoded offices and slots. They
 * are decided on the server instead — no office_id means step 1, an office but
 * no slot means step 2, a slot means step 3 — so the flow is bookmarkable, the
 * back button works, and it does not depend on scripting.
 *
 * GET /api/v1/appointments/slots requires BOTH office_id and slot_date. Sending
 * neither returned 422 on every load, which is why no slot ever appeared.
 */

export const metadata = { title: 'Book an Appointment | Watiq National Portal' };

/**
 * Group slots into the Morning/Afternoon blocks the design draws.
 *
 * time_slot is a label, not a time — the API has shipped both "09:00–09:30" and
 * "09:00 AM" — so the hour is parsed out and an unparseable label falls into
 * the afternoon rather than disappearing from the page. Done here rather than
 * in the markup because a lexicographic compare gets "9:00" wrong the moment
 * the API stops zero-padding.
 */
function splitByHalfDay(slots) {
  const morning = [];
  const afternoon = [];
  for (const item of slots) {
    const label = String(item.time_slot ?? '');
    const head = label.match(/\s*(\d{1,2})/);
    let hour = head ? Number.parseInt(head[1], 10) : 12;
    if (/pm/i.test(label) && hour < 12) hour += 12;
    else if (/am/i.test(label) && hour === 12) hour = 0;
    (hour < 12 ? morning : afternoon).push(item);
  }
  return [
    ['Morning', 'light_mode', morning],
    ['Afternoon', 'partly_cloudy_day', afternoon],
  ];
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export default async function BookAppointmentPage({ searchParams }) {
  await requireLogin('/appointments/book');
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const officeId = intOr(params?.office_id, null);
  const slotId = intOr(params?.slot_id, null);
  const queryText = one(params?.q).trim();

  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const requested = new Date(`${one(params?.slot_date) || isoDay(today)}T00:00:00Z`);
  // Never earlier than today: the API has no slots in the past, and offering
  // the week strip a way to walk backwards into an empty page is a dead end.
  const slotDate = Number.isNaN(requested.getTime()) || requested < today ? today : requested;

  const [officesRaw, slotsRaw, officeServicesRaw] = await Promise.all([
    tryGet('/api/v1/catalog/offices', []),
    officeId
      ? tryGet('/api/v1/appointments/slots', [], {
          params: { office_id: officeId, slot_date: isoDay(slotDate) },
        })
      : Promise.resolve([]),
    officeId ? tryGet(`/api/v1/catalog/offices/${officeId}/services`, []) : Promise.resolve([]),
  ]);

  let offices = itemsOf(officesRaw);
  // The chosen office is resolved BEFORE the search filter is applied, so a
  // leftover ?q= cannot make the office of an in-progress booking vanish.
  const office = offices.find((o) => o.id === officeId) ?? null;

  // The office directory has no search endpoint, and it is a short list, so the
  // search box in the design filters the fetched rows here.
  if (queryText) {
    const needle = queryText.toLowerCase();
    offices = offices.filter((o) =>
      ['name', 'name_fr', 'city', 'governorate', 'address']
        .map((field) => String(o[field] ?? ''))
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  // The design's checkbox group, offered over the `type` column the directory
  // actually publishes ('municipality', 'court', …) rather than the mockup's
  // hardcoded service names, which nothing in the API can match an office
  // against — a filter that can only ever return nothing is a dead control with
  // extra steps. The options come from the rows themselves, so the list is
  // never a box the citizen can tick to empty the results.
  const officeTypes = [...new Set(offices.map((o) => o.type).filter(Boolean))].sort();
  const selectedTypes = many(params?.type).filter((type) => officeTypes.includes(type));
  if (selectedTypes.length) offices = offices.filter((o) => selectedTypes.includes(o.type));

  const slots = itemsOf(slotsRaw);
  const slot = slots.find((s) => s.id === slotId) ?? null;
  const officeServices = itemsOf(officeServicesRaw).filter((s) => s.is_available !== false);

  // Monday..Sunday around the chosen day, matching the seven-column calendar.
  const weekStart = new Date(slotDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + offset);
    return day;
  });
  const shiftWeek = (days) => {
    const shifted = new Date(weekStart);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return isoDay(shifted);
  };

  const CARD = 'bg-surface border border-outline-variant rounded-xl p-6 shadow-sm';
  const STEP = (n, done) =>
    `inline-flex items-center justify-center w-7 h-7 rounded-full font-label-sm text-label-sm ${
      done ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
    }`;

  return (
    <PageShell active="appointments" {...ctx}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {t('Book an Appointment')}
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Choose an office, pick a day and a free slot, then say which service the appointment is for.')}
        </p>
      </header>

      {/* Step 1 — office */}
      <section className={CARD} aria-labelledby="step-office">
        <h2 className="flex items-center gap-3 font-headline-md text-headline-md text-on-surface mb-4" id="step-office">
          <span className={STEP(1, Boolean(office))}>1</span>
          {t('Choose an office')}
        </h2>

        <form action="/appointments/book" className="flex flex-wrap items-end gap-3 mb-6" method="get" role="search">
          <input name="slot_date" type="hidden" value={isoDay(slotDate)} />
          <div className="flex-1 min-w-[16rem]">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="q">
              {t('Search offices')}
            </label>
            <input
              className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
              defaultValue={queryText}
              id="q"
              name="q"
              placeholder={t('Name, city or governorate')}
              type="search"
            />
          </div>

          {officeTypes.length > 0 && (
            <fieldset className="flex flex-wrap items-center gap-3">
              <legend className="sr-only">{t('Office type')}</legend>
              {officeTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
                  <input
                    className="w-4 h-4 rounded border-outline-variant"
                    defaultChecked={selectedTypes.includes(type)}
                    name="type"
                    type="checkbox"
                    value={type}
                  />
                  {t(type)}
                </label>
              ))}
            </fieldset>
          )}

          <button
            className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            type="submit"
          >
            {t('Search')}
          </button>
        </form>

        {offices.length === 0 ? (
          <EmptyState
            icon="location_off"
            message={t('No office matches that search.')}
            action={{ href: '/appointments/book', label: t('Show every office') }}
          />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {offices.map((o) => (
              <li key={o.id}>
                <a
                  aria-current={o.id === officeId ? 'true' : undefined}
                  className={`block h-full rounded-xl border p-4 transition-colors focus-ring ${
                    o.id === officeId
                      ? 'border-primary bg-primary-container text-on-primary'
                      : 'border-outline-variant hover:bg-surface-container-low'
                  }`}
                  href={`/appointments/book${qs({ office_id: o.id, slot_date: isoDay(slotDate), q: queryText, type: selectedTypes })}`}
                >
                  <p className="font-body-md text-body-md font-bold">{o.name}</p>
                  <p className="font-support-sm text-support-sm opacity-80">
                    {[o.city, o.governorate].filter(Boolean).join(', ')}
                  </p>
                  {o.type && (
                    <p className="mt-1 font-label-sm text-label-sm uppercase tracking-wide opacity-70">
                      {t(o.type)}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Step 2 — day and slot */}
      <section className={CARD} aria-labelledby="step-slot">
        <h2 className="flex items-center gap-3 font-headline-md text-headline-md text-on-surface mb-4" id="step-slot">
          <span className={STEP(2, Boolean(slot))}>2</span>
          {t('Pick a day and a time')}
        </h2>

        {!officeId ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Choose an office above to see its free slots.')}
          </p>
        ) : (
          <>
            <nav aria-label={t('Week')} className="flex items-center justify-between gap-3 mb-4">
              <a
                className="inline-flex items-center gap-2 border border-outline-variant px-4 py-2 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
                href={`/appointments/book${qs({ office_id: officeId, slot_date: shiftWeek(-7), q: queryText, type: selectedTypes })}`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_left</span>
                {t('Previous week')}
              </a>
              <a
                className="inline-flex items-center gap-2 border border-outline-variant px-4 py-2 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
                href={`/appointments/book${qs({ office_id: officeId, slot_date: shiftWeek(7), q: queryText, type: selectedTypes })}`}
              >
                {t('Next week')}
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_right</span>
              </a>
            </nav>

            <ul className="grid grid-cols-7 gap-2 mb-6">
              {week.map((day) => {
                const iso = isoDay(day);
                const past = day < today;
                const active = iso === isoDay(slotDate);
                return (
                  <li key={iso}>
                    {past ? (
                      <span className="block text-center rounded-lg border border-outline-variant p-3 opacity-40 cursor-not-allowed">
                        <span className="block font-label-sm text-label-sm uppercase">
                          {new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(day)}
                        </span>
                        <span className="block font-headline-md text-headline-md">{day.getUTCDate()}</span>
                      </span>
                    ) : (
                      <a
                        aria-current={active ? 'date' : undefined}
                        className={`block text-center rounded-lg border p-3 transition-colors focus-ring ${
                          active
                            ? 'border-primary bg-primary-container text-on-primary'
                            : 'border-outline-variant hover:bg-surface-container-low'
                        }`}
                        href={`/appointments/book${qs({ office_id: officeId, slot_date: iso, q: queryText, type: selectedTypes })}`}
                      >
                        <span className="block font-label-sm text-label-sm uppercase">
                          {new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(day)}
                        </span>
                        <span className="block font-headline-md text-headline-md">{day.getUTCDate()}</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            {slots.length === 0 ? (
              <EmptyState
                icon="event_busy"
                message={t('No free slot at that office on that day. Try another day.')}
              />
            ) : (
              splitByHalfDay(slots).map(([label, icon, group]) =>
                group.length === 0 ? null : (
                  <div key={label} className="mb-6">
                    <h3 className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
                      {t(label)}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {group.map((s) => {
                        const full = Number(s.seats_left) <= 0;
                        return (
                          <li key={s.id}>
                            {full ? (
                              <span className="inline-block rounded-lg border border-outline-variant px-4 py-3 opacity-40 cursor-not-allowed font-body-md text-body-md">
                                {s.time_slot} · {t('full')}
                              </span>
                            ) : (
                              <a
                                aria-current={s.id === slotId ? 'true' : undefined}
                                className={`inline-block rounded-lg border px-4 py-3 transition-colors focus-ring font-body-md text-body-md ${
                                  s.id === slotId
                                    ? 'border-primary bg-primary-container text-on-primary'
                                    : 'border-outline-variant hover:bg-surface-container-low'
                                }`}
                                href={`/appointments/book${qs({ office_id: officeId, slot_date: isoDay(slotDate), slot_id: s.id, q: queryText, type: selectedTypes })}`}
                              >
                                {s.time_slot}
                                <span className="block font-support-sm text-support-sm opacity-70">
                                  {s.seats_left} {t('left')}
                                </span>
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ),
              )
            )}
          </>
        )}
      </section>

      {/* Step 3 — service, then confirm */}
      <section className={CARD} aria-labelledby="step-confirm">
        <h2 className="flex items-center gap-3 font-headline-md text-headline-md text-on-surface mb-4" id="step-confirm">
          <span className={STEP(3, false)}>3</span>
          {t('Confirm')}
        </h2>

        {!slot ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Pick a time slot above to confirm your booking.')}
          </p>
        ) : (
          <form action={bookAppointmentAction} className="space-y-6 max-w-xl">
            <input name="slot_id" type="hidden" value={slot.id} />
            <input name="office_id" type="hidden" value={officeId} />
            <input name="slot_date" type="hidden" value={isoDay(slotDate)} />

            <dl className="grid grid-cols-2 gap-4 bg-surface-container-low rounded-xl p-4">
              {[
                [t('Office'), office?.name ?? slot.office_name],
                [t('Date'), formatDate(slot.slot_date)],
                [t('Time'), slot.time_slot],
                [t('Seats left'), String(slot.seats_left ?? '—')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                    {label}
                  </dt>
                  <dd className="font-body-md text-body-md text-on-surface">{value || '—'}</dd>
                </div>
              ))}
            </dl>

            <div>
              <label
                className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2"
                htmlFor="office_service_id"
              >
                {t('Which service is this for?')}
              </label>
              {/* office_service_id points at the office_services row, not at the
                  catalogue service — the same key the slot itself carries. */}
              <select
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
                defaultValue={slot.office_service_id ?? ''}
                id="office_service_id"
                name="office_service_id"
                required
              >
                <option value="">{t('Select a service…')}</option>
                {officeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {formatMoney(s.fee_override ?? s.base_fee, s.currency ?? 'TND')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="reason">
                {t('Anything the office should know in advance')}{' '}
                <span className="normal-case">({t('optional')})</span>
              </label>
              <textarea
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
                id="reason"
                maxLength={2000}
                name="reason"
                rows={4}
              />
            </div>

            <button
              className="w-full md:w-auto bg-primary-container text-on-primary px-8 py-4 rounded font-headline-md hover:shadow-lg active:scale-[0.98] transition-all focus-ring"
              type="submit"
            >
              {t('Confirm booking')}
            </button>
          </form>
        )}
      </section>
    </PageShell>
  );
}
