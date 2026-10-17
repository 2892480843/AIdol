import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { AuthFrame } from '@/components/auth-frame';

export default async function Home() {
  const t = await getTranslations('auth');
  return (
    <AuthFrame title={t('brandName')} subtitle={t('tagline')} caption={t('tagline')}>
      <Button asChild size="lg" className="w-full">
        <Link href="/dashboard">{t('getStarted')}<ArrowRight className="ml-3 h-4 w-4" /></Link>
      </Button>
    </AuthFrame>
  );
}
