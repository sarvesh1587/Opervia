import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog } from '../../components/ui/dialog'
import { DataTable, Field, FormError, Input, PageHeader, Pagination, SearchInput, Select, Tabs, toolbar, useListParams, type Column } from '../../components/ui/kit'
import { Button, EASE } from '../../components/ui/primitives'
import { toast } from '../../components/ui/toast'
import { useAction, useDetail, useList } from '../../hooks/data'
import { ApiError, http, qs } from '../../lib/api'
import { shortDate, time } from '../../lib/format'
import type { AuditRow, Page, Role, Session, UserRow } from '../../lib/types'
import { useAuth } from '../auth'

function BusinessTab() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const s = useDetail<Session['business']>(['settings'], '/settings')
  const [v, setV] = useState({ name: '', city: '', taxRate: 18, taxLabel: 'GST', paymentTermsDays: 15 })
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (s.data) setV({ name: s.data.name, city: s.data.city ?? '', taxRate: s.data.taxRate, taxLabel: s.data.taxLabel, paymentTermsDays: s.data.paymentTermsDays }) }, [s.data])
  const { business } = useAuth()
  const ro = !can('settings:write') || business.isDemo
  const save = async () => {
    setSaving(true); setError(null)
    try { await http.patch('/settings', v); await qc.invalidateQueries({ queryKey: ['settings'] }); await qc.invalidateQueries({ queryKey: ['session'] }); toast.success('Settings saved', 'New orders and invoices use these values.') }
    catch (e) { setError(e) } finally { setSaving(false) }
  }
  const fe = error instanceof ApiError ? error.fieldErrors : {}
  return (
    <div className="grid gap-10 px-4 py-8 md:px-7 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="space-y-5">
        <Field id="b-name" label="Business name" error={fe.name}><Input id="b-name" value={v.name} disabled={ro} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field id="b-city" label="City"><Input id="b-city" value={v.city} disabled={ro} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="b-taxlabel" label="Tax label" error={fe.taxLabel}><Input id="b-taxlabel" value={v.taxLabel} disabled={ro} onChange={(e) => setV({ ...v, taxLabel: e.target.value })} /></Field>
          <Field id="b-tax" label="Tax rate %" error={fe.taxRate}><Input id="b-tax" type="number" step="0.01" value={v.taxRate} disabled={ro} onChange={(e) => setV({ ...v, taxRate: Number(e.target.value) })} className="tnum" /></Field>
          <Field id="b-terms" label="Payment terms" error={fe.paymentTermsDays} hint="Days until due"><Input id="b-terms" type="number" value={v.paymentTermsDays} disabled={ro} onChange={(e) => setV({ ...v, paymentTermsDays: Number(e.target.value) })} className="tnum" /></Field>
        </div>
        <FormError error={error && !Object.keys(fe).length ? error : null} />
        {!ro && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>}
        {ro && <p className="text-[13px] text-stone-600">{business.isDemo ? 'Business settings are locked in the shared demo workspace.' : 'Only admins can change business settings.'}</p>}
      </div>
      <aside className="border-l-2 border-ink-950 pl-5 text-[13.5px] leading-relaxed text-stone-600">
        <div className="label mb-2 text-ink-950">How tax is applied</div>
        Tax is charged on the subtotal after discount, using the rate in force when the order is drafted. Issued invoices keep their own copy of the rate, so changing it here never rewrites history. Opervia applies a single configurable rate; it does not determine which GST rules apply to your goods.
      </aside>
    </div>
  )
}

function AddUser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, setV] = useState({ name: '', email: '', role: 'STAFF' as Role, password: '' })
  useEffect(() => { if (open) setV({ name: '', email: '', role: 'STAFF', password: '' }) }, [open])
  const act = useAction(() => http.post('/users', v), { invalidate: [['users']], success: `${v.name} added`, onSuccess: onClose, silentFieldErrors: true })
  const fe = act.error instanceof ApiError ? act.error.fieldErrors : {}
  return (
    <Dialog open={open} onClose={onClose} title="Add a teammate" description="Share the temporary password with them directly; they can change it after signing in." width={480}>
      <div className="space-y-5">
        <Field id="u-name" label="Name" error={fe.name}><Input id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field id="u-email" label="Email" error={fe.email}><Input id="u-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field id="u-role" label="Role"><Select id="u-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}><option value="STAFF">Staff — orders, customers, receiving</option><option value="MANAGER">Manager — plus purchasing, invoices, analytics</option><option value="ADMIN">Admin — everything</option></Select></Field>
        <Field id="u-pass" label="Temporary password" error={fe.password} hint="8+ characters with an uppercase letter and a number"><Input id="u-pass" type="text" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="font-mono" /></Field>
        <FormError error={act.error && !Object.keys(fe).length ? act.error : null} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => act.mutate(undefined)} disabled={act.isPending}>{act.isPending ? 'Adding…' : 'Add teammate'}</Button></div>
      </div>
    </Dialog>
  )
}

function PeopleTab() {
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const users = useList<UserRow[]>(['users'], '/users')
  const update = useAction(({ id, ...body }: { id: string; role?: Role; active?: boolean }) => http.patch(`/users/${id}`, body), { invalidate: [['users']], success: 'Access updated · they’ll need to sign in again' })
  const cols: Column<UserRow>[] = [
    { key: 'n', header: 'Person', cell: (u) => <span><span className="font-medium">{u.name}</span>{u.id === user.id && <span className="ml-2 font-mono text-[11px] text-stone-500">you</span>}<span className="block text-[12px] text-stone-500">{u.email}</span></span> },
    { key: 'r', header: 'Role', cell: (u) => u.id === user.id ? <span>{u.role.toLowerCase()}</span> : (
      <><label htmlFor={`role-${u.id}`} className="sr-only">Role for {u.name}</label>
      <Select id={`role-${u.id}`} value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })} className="h-9 w-[140px] text-[13px]"><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="STAFF">Staff</option></Select></>
    ) },
    { key: 'l', header: 'Last sign-in', hide: 'md', cell: (u) => <span className="tnum text-stone-600">{u.lastLoginAt ? `${shortDate(u.lastLoginAt)} ${time(u.lastLoginAt)}` : 'Never'}</span> },
    { key: 'a', header: 'Access', align: 'right', cell: (u) => u.id === user.id ? <span className="text-stone-500">—</span> : (
      <Button size="sm" variant={u.active ? 'ghost' : 'secondary'} onClick={() => update.mutate({ id: u.id, active: !u.active })}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>
    ) },
  ]
  return (
    <div>
      <div className={toolbar}><p className="text-[14px] text-stone-600">Role changes sign the person out everywhere so the new permissions apply at once.</p><Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add teammate</Button></div>
      <div className="mt-3"><DataTable caption="Team" rows={users.data} columns={cols} loading={users.isLoading} rowClass={(u) => (u.active ? '' : 'opacity-50')} /></div>
      <AddUser open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function AuditTab() {
  const { values: f, page, set } = useListParams({ q: '', entity: '' })
  const list = useList<Page<AuditRow>>(['audit', f, page], `/audit${qs({ q: f.q, entity: f.entity, page, pageSize: 30 })}`)
  const cols: Column<AuditRow>[] = [
    { key: 't', header: 'When', width: '170px', cell: (a) => <span className="tnum font-mono text-[12px] text-stone-600">{shortDate(a.createdAt)} {time(a.createdAt)}</span> },
    { key: 'u', header: 'Who', width: '150px', cell: (a) => a.user?.name ?? <span className="text-stone-500">System</span> },
    { key: 's', header: 'What happened', cell: (a) => <span>{a.summary}<span className="ml-2 font-mono text-[11px] text-stone-500">{a.action}</span></span> },
  ]
  return (
    <div>
      <div className={toolbar}>
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Search the log" />
        <Select value={f.entity} onChange={(e) => set({ entity: e.target.value, page: 1 })} aria-label="Filter by record type" className="h-9 w-auto text-[13px]">
          <option value="">All records</option>{['SalesOrder', 'PurchaseOrder', 'Invoice', 'Product', 'Customer', 'Supplier', 'User', 'Business'].map((e) => <option key={e} value={e}>{e.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>)}
        </Select>
      </div>
      <div className="mt-3"><DataTable caption="Audit log" rows={list.data?.items} columns={cols} loading={list.isLoading} /></div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
    </div>
  )
}

function SecurityTab() {
  const { business } = useAuth()
  const [v, setV] = useState({ currentPassword: '', newPassword: '' })
  const act = useAction(() => http.post('/auth/password', v), { success: 'Password changed', onSuccess: () => setV({ currentPassword: '', newPassword: '' }), silentFieldErrors: true })
  const fe = act.error instanceof ApiError ? act.error.fieldErrors : {}
  if (business.isDemo) return <p className="px-4 py-8 text-[14px] text-stone-600 md:px-7">Passwords can’t be changed in the shared demo workspace, so it keeps working for everyone.</p>
  return (
    <div className="max-w-[460px] space-y-5 px-4 py-8 md:px-7">
      <Field id="pw-cur" label="Current password" error={fe.currentPassword}><Input id="pw-cur" type="password" autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} /></Field>
      <Field id="pw-new" label="New password" error={fe.newPassword} hint="8+ characters with an uppercase letter and a number"><Input id="pw-new" type="password" autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /></Field>
      <FormError error={act.error && !Object.keys(fe).length ? act.error : null} />
      <Button onClick={() => act.mutate(undefined)} disabled={act.isPending || !v.currentPassword || !v.newPassword}>{act.isPending ? 'Saving…' : 'Change password'}</Button>
      <p className="text-[12.5px] text-stone-500">Changing your password signs out your other sessions.</p>
    </div>
  )
}

export default function SettingsPage() {
  const { can, user } = useAuth()
  const tabs = [{ value: 'business', label: 'Business' }, ...(can('users:manage') ? [{ value: 'people', label: 'People' }] : []), ...(can('audit:read') ? [{ value: 'audit', label: 'Audit log' }] : []), { value: 'security', label: 'Security' }]
  const { values: f, set } = useListParams({ tab: 'business' })
  const tab = tabs.some((t) => t.value === f.tab) ? f.tab : 'business'
  return (
    <div>
      <PageHeader eyebrow={`Settings · signed in as ${user.role.toLowerCase()}`} title={<>Workspace <span className="font-serif font-normal italic">settings.</span></>} />
      <div className="px-4 pt-4 md:px-7"><Tabs id="settings" value={tab} onChange={(v) => set({ tab: v })} options={tabs} /></div>
      <div className="border-t border-paper-300">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
            {tab === 'business' ? <BusinessTab /> : tab === 'people' ? <PeopleTab /> : tab === 'audit' ? <AuditTab /> : <SecurityTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
