import { redirect } from 'next/navigation';
import { getSetupStatus } from '@/server/setup';
import { WorkbenchShell } from '@/ui/shell/Workbench';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Setup gate + persistent shell for every workbench route. A fresh clone has
 * no profile/Gmail yet — deep links (e.g. /tax) server-render through this
 * layout and get sent to guided onboarding.
 *
 * Known caveat: layouts don't re-run on client-side navigation between
 * sibling routes, so the gate only fires on server-rendered entries. That's
 * fine here — setup status only ever transitions not-ready → ready (there is
 * no in-app wipe flow), so a session can't regress mid-flight.
 */
export default async function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const status = await getSetupStatus();
  if (!status.ready) redirect('/onboarding');
  return <WorkbenchShell>{children}</WorkbenchShell>;
}
