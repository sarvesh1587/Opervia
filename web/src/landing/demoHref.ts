import { DEMO_MODE } from '../lib/api'

/** With a backend, visitors pick a demo role on the sign-in page; the static preview opens the dashboard directly. */
export const DEMO_HREF = DEMO_MODE ? '/app/dashboard' : '/login'
