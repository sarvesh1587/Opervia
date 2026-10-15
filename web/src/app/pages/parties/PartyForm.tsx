import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '../../../components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { toast } from '../../../components/ui/toast'
import { ApiError, http } from '../../../lib/api'
import type { Party } from '../../../lib/types'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  contactName: z.string().trim().max(80).optional(),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]).optional(),
  phone: z.union([z.literal(''), z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')]).optional(),
  gstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN has 15 characters, starting with the state code')]).optional(),
  address: z.string().trim().max(300).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})
type V = z.infer<typeof schema>

export default function PartyForm({ kind, open, onClose, party, onSaved }: { kind: 'customer' | 'supplier'; open: boolean; onClose: () => void; party?: Party; onSaved?: (p: Party) => void }) {
  const qc = useQueryClient()
  const base = kind === 'customer' ? '/customers' : '/suppliers'
  const [error, setError] = useState<unknown>(null)
  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<V>({ resolver: zodResolver(schema) })
  useEffect(() => {
    if (!open) return
    setError(null)
    reset({ name: party?.name ?? '', contactName: party?.contactName ?? '', email: party?.email ?? '', phone: party?.phone ?? '', gstin: party?.gstin ?? '', address: party?.address ?? '', status: party?.status ?? 'ACTIVE' })
  }, [open, party, reset])

  const submit = async (v: V) => {
    setError(null)
    const body = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === '' ? undefined : val]))
    try {
      const saved = party ? await http.patch<Party>(`${base}/${party.id}`, body) : await http.post<Party>(base, body)
      await qc.invalidateQueries({ queryKey: [kind === 'customer' ? 'customers' : 'suppliers'] })
      await qc.invalidateQueries({ queryKey: [kind, saved.id] })
      toast.success(party ? `${saved.name} updated` : `${saved.name} added`)
      onSaved?.(saved); onClose()
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as keyof V, { message: m })
      setError(e)
    }
  }
  const noun = kind === 'customer' ? 'customer' : 'supplier'
  return (
    <Dialog open={open} onClose={onClose} variant="sheet" width={520} title={party ? `Edit ${party.name}` : `Add a ${noun}`}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <Field id="p-name" label={kind === 'customer' ? 'Business or person' : 'Supplier name'} error={errors.name?.message}><Input id="p-name" {...register('name')} invalid={!!errors.name} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="p-contact" label="Contact person"><Input id="p-contact" {...register('contactName')} /></Field>
          <Field id="p-phone" label="Phone" error={errors.phone?.message}><Input id="p-phone" type="tel" {...register('phone')} invalid={!!errors.phone} placeholder="+91 98220 00000" /></Field>
        </div>
        <Field id="p-email" label="Email" error={errors.email?.message}><Input id="p-email" type="email" {...register('email')} invalid={!!errors.email} /></Field>
        <Field id="p-gstin" label="GSTIN" error={errors.gstin?.message} hint="Optional"><Input id="p-gstin" {...register('gstin')} invalid={!!errors.gstin} className="font-mono uppercase" placeholder="27AABCU9603R1ZM" /></Field>
        <Field id="p-addr" label="Address"><Textarea id="p-addr" {...register('address')} /></Field>
        <Field id="p-status" label="Status" hint={`Inactive ${noun}s stay on record but can’t be used for new orders.`}>
          <Select id="p-status" {...register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
        </Field>
        <FormError error={error && !(error instanceof ApiError && Object.keys(error.fieldErrors).length) ? error : null} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : party ? 'Save changes' : `Add ${noun}`}</Button></div>
      </form>
    </Dialog>
  )
}
