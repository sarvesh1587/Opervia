import { ButtonLink, Logo } from '../../components/ui/primitives'
import { Link } from 'react-router-dom'

export default function NotFound({ inApp = false }: { inApp?: boolean }) {
  return (
    <div className={`${inApp ? 'min-h-[70vh]' : 'min-h-screen'} flex flex-col bg-paper-50 px-4 py-6 md:px-7`}>
      {!inApp && <Link to="/" aria-label="Opervia home"><Logo /></Link>}
      <div className="m-auto max-w-xl text-center">
        <div className="font-serif text-[clamp(96px,18vw,220px)] leading-none tracking-[-0.03em]">404</div>
        <p className="mt-2 text-[17px] text-stone-600">There is no page at this address. The ledger balances; the link doesn’t.</p>
        <ButtonLink to={inApp ? '/app/dashboard' : '/'} className="mt-8">{inApp ? 'Back to overview' : 'Back to home'}</ButtonLink>
      </div>
    </div>
  )
}
