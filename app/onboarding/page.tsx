import { Wizard } from '@/ui/onboarding/Wizard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Get started — Personal finance',
};

export default function OnboardingPage() {
  return <Wizard />;
}
