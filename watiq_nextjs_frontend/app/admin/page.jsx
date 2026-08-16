import { tryGet } from '@/lib/api.js';
import { itemsOf, totalOf } from '@/lib/format.js';
import { requireAdmin } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { one, intOr, query as qs } from '@/lib/view.js';
import StaffShell from '@/components/StaffShell.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import Pagination from '@/components/Pagination.jsx';
import AnonymizeForm from './AnonymizeForm.jsx';
import {
  setUserActiveAction,
  createStaffAction,
  setStaffActiveAction,
  updateRolePermissionsAction,
} from '@/lib/actions.js';
import '@/styles/pages/staff_workbench.css';

/**
 * System administration.
 * Port of frontend_flask/templates/admin_management.html and views/admin.py.
 *
 * Covers every endpoint in backend/app/modules/admin/router.py. No screen was
 * ever designed for this, so the layout is assembled from components that
 * already exist in the design system rather than invented wholesale.
 *
 * Guarded by requireAdmin, which 404s a clerk rather than 403ing them — a
 * non-admin has no business learning this route exists.
 */

export const metadata = { title: 'Administration | Watiq Back Office' };

const TABS = [
  ['users', 'Citizens'],
  ['staff', 'Staff'],
  ['roles', 'Roles'],
];

const PAGE_SIZE = 25;
const FIELD =
  'w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md';
const LABEL = 'block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2';

export default async function AdminPage({ searchParams }) {
  await requireAdmin('/admin');
  const params = await searchParams;
  const t = await getTranslator();
  const role = await sessionRole();

  const requested = one(params?.tab);
  const tab = TABS.some(([key]) => key === requested) ? requested : 'users';
  const queryText = one(params?.q).trim();
  const page = Math.max(1, intOr(params?.page, 1));

  const staff = await tryGet('/api/v1/staff/me', null);

  // Only what the visible tab needs. Fetching all three would triple the load
  // on a page where two thirds of it is never looked at.
  let users = [];
  let usersTotal = 0;
  let staffMembers = [];
  let roles = [];
  let permissions = [];

  if (tab === 'users') {
    const data =
      (await tryGet('/api/v1/admin/users', {}, {
        params: { page, size: PAGE_SIZE, ...(queryText ? { q: queryText } : {}) },
      })) ?? {};
    users = itemsOf(data);
    usersTotal = totalOf(data);
  } else if (tab === 'staff') {
    [staffMembers, roles] = await Promise.all([
      tryGet('/api/v1/admin/staff', []).then(itemsOf),
      tryGet('/api/v1/admin/roles', []).then(itemsOf),
    ]);
  } else {
    [roles, permissions] = await Promise.all([
      tryGet('/api/v1/admin/roles', []).then(itemsOf),
      tryGet('/api/v1/admin/permissions', []).then(itemsOf),
    ]);
  }

  return (
    <StaffShell active="admin" role={role} staff={staff} t={t}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Administration')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('Accounts, staff and role permissions.')}
        </p>
      </header>

      <nav aria-label={t('Sections')} className="flex flex-wrap gap-2 border-b border-outline-variant pb-4">
        {TABS.map(([key, label]) => (
          <a
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            className={`font-label-md text-label-md px-5 py-2.5 rounded-full border transition-colors focus-ring ${
              tab === key
                ? 'bg-primary-container text-on-primary border-primary-container'
                : 'border-outline-variant text-on-surface hover:bg-surface-container-low'
            }`}
            href={`/admin${qs({ tab: key })}`}
          >
            {t(label)}
          </a>
        ))}
      </nav>

      {tab === 'users' && (
        <section aria-labelledby="users-heading" className="space-y-4">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="users-heading">
            {t('Citizen accounts')}
          </h2>

          <form action="/admin" className="flex flex-wrap items-end gap-3" method="get" role="search">
            <input name="tab" type="hidden" value="users" />
            <div className="flex-1 min-w-[16rem]">
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="q">
                {t('Search')}
              </label>
              <input
                className={FIELD}
                defaultValue={queryText}
                id="q"
                name="q"
                placeholder={t('Name or national ID')}
                type="search"
              />
            </div>
            <button
              className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
              type="submit"
            >
              {t('Search')}
            </button>
          </form>

          {users.length === 0 ? (
            <EmptyState icon="person_off" message={t('No account matches that search.')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
                <caption className="sr-only">{t('Citizen accounts')}</caption>
                <thead className="bg-surface-container-high">
                  <tr>
                    {['Name', 'National ID', 'Status', 'Actions'].map((heading) => (
                      <th
                        key={heading}
                        className="text-start font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide px-4 py-3"
                        scope="col"
                      >
                        {t(heading)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-container-low transition-colors align-top">
                      <td className="px-4 py-4 font-body-md text-body-md text-on-surface">
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-4 font-mono text-support-sm text-on-surface-variant">
                        {user.national_id}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex font-label-sm text-label-sm px-2.5 py-1 rounded border ${
                            user.is_active
                              ? 'bg-secondary-container text-on-secondary-container border-secondary'
                              : 'bg-error-container text-on-error-container border-error'
                          }`}
                        >
                          {user.is_active ? t('Active') : t('Deactivated')}
                        </span>
                      </td>
                      <td className="px-4 py-4 space-y-3">
                        <form action={setUserActiveAction}>
                          <input name="user_id" type="hidden" value={user.id} />
                          <input name="activate" type="hidden" value={user.is_active ? 'no' : 'yes'} />
                          <button
                            className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring whitespace-nowrap"
                            type="submit"
                          >
                            {user.is_active ? t('Deactivate') : t('Reactivate')}
                          </button>
                        </form>

                        <AnonymizeForm nationalId={user.national_id} userId={user.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            base="/admin"
            page={page}
            params={{ tab: 'users', q: queryText }}
            size={PAGE_SIZE}
            t={t}
            total={usersTotal}
          />
        </section>
      )}

      {tab === 'staff' && (
        <section aria-labelledby="staff-heading" className="space-y-6">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="staff-heading">
            {t('Staff accounts')}
          </h2>

          <form
            action={createStaffAction}
            className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-4"
          >
            <h3 className="font-label-md text-label-md text-on-surface">{t('Add a staff member')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={LABEL} htmlFor="email">{t('Email')}</label>
                <input className={FIELD} id="email" name="email" required type="email" />
              </div>
              <div>
                <label className={LABEL} htmlFor="first_name">{t('First name')}</label>
                <input className={FIELD} id="first_name" name="first_name" required type="text" />
              </div>
              <div>
                <label className={LABEL} htmlFor="last_name">{t('Last name')}</label>
                <input className={FIELD} id="last_name" name="last_name" required type="text" />
              </div>
              <div>
                <label className={LABEL} htmlFor="office_id">{t('Office ID')}</label>
                <input className={FIELD} id="office_id" inputMode="numeric" name="office_id" type="text" />
              </div>
              <div>
                <label className={LABEL} htmlFor="role_id">{t('Role')}</label>
                <select className={FIELD} defaultValue="" id="role_id" name="role_id">
                  <option value="">{t('Select a role…')}</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
              type="submit"
            >
              {t('Create staff member')}
            </button>
          </form>

          {staffMembers.length === 0 ? (
            <EmptyState icon="badge" message={t('No staff accounts.')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
                <caption className="sr-only">{t('Staff accounts')}</caption>
                <thead className="bg-surface-container-high">
                  <tr>
                    {['Name', 'Role', 'Office', 'Status', 'Actions'].map((heading) => (
                      <th
                        key={heading}
                        className="text-start font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide px-4 py-3"
                        scope="col"
                      >
                        {t(heading)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {staffMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-4 font-body-md text-body-md text-on-surface">
                        {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.name || '—'}
                      </td>
                      <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                        {member.role_name ?? member.role_code ?? '—'}
                      </td>
                      <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                        {member.office_name ?? '—'}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex font-label-sm text-label-sm px-2.5 py-1 rounded border ${
                            member.is_active
                              ? 'bg-secondary-container text-on-secondary-container border-secondary'
                              : 'bg-error-container text-on-error-container border-error'
                          }`}
                        >
                          {member.is_active ? t('Active') : t('Deactivated')}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <form action={setStaffActiveAction}>
                          <input name="staff_id" type="hidden" value={member.id} />
                          <input name="activate" type="hidden" value={member.is_active ? 'no' : 'yes'} />
                          <button
                            className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring whitespace-nowrap"
                            type="submit"
                          >
                            {member.is_active ? t('Deactivate') : t('Reactivate')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'roles' && (
        <section aria-labelledby="roles-heading" className="space-y-6">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="roles-heading">
            {t('Roles and permissions')}
          </h2>

          {roles.length === 0 ? (
            <EmptyState icon="key_off" message={t('No roles defined.')} />
          ) : (
            roles.map((r) => (
              <form
                action={updateRolePermissionsAction}
                className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-4"
                key={r.id}
              >
                <input name="role_id" type="hidden" value={r.id} />

                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface">{r.name}</h3>
                  {r.description && (
                    <p className="font-body-md text-body-md text-on-surface-variant">{r.description}</p>
                  )}
                </div>

                <fieldset>
                  <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                    {t('Permissions')}
                  </legend>
                  {/* Every permission is rendered, checked or not: the PATCH
                      replaces the whole set, so an unrendered one would be
                      silently revoked by any save. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {permissions.map((permission) => (
                      <label
                        key={permission.code}
                        className="flex items-start gap-2 font-body-md text-body-md text-on-surface"
                      >
                        <input
                          className="mt-1 w-4 h-4 rounded border-outline-variant"
                          defaultChecked={(r.permissions ?? []).includes(permission.code)}
                          name="permission"
                          type="checkbox"
                          value={permission.code}
                        />
                        <span>
                          <span className="font-mono text-support-sm">{permission.code}</span>
                          {permission.description && (
                            <span className="block font-support-sm text-support-sm text-on-surface-variant">
                              {permission.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button
                  className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
                  type="submit"
                >
                  {t('Save permissions')}
                </button>
              </form>
            ))
          )}
        </section>
      )}
    </StaffShell>
  );
}
