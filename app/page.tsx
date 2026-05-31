import { redirect } from 'next/navigation';
import { Workbench } from '@/ui/shell/Workbench';
import { getSetupStatus } from '@/server/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home() {
  // A fresh clone has no profile/Gmail yet — send it to guided onboarding.
  const status = await getSetupStatus();
  if (!status.ready) redirect('/onboarding');
  return <Workbench />;
}
