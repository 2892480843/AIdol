'use client';

import styles from '@/components/secondary-ui.module.css';

import type { ReactNode } from 'react';
import { Bell, Loader2, Mail, MessageSquare, Send, Smartphone, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { NotificationChannel, NotificationSettings } from '@/lib/hooks/use-notifications';

const CHANNEL_ICONS: Record<NotificationChannel, ReactNode> = {
  ntfy: <Bell className="h-5 w-5" />,
  mattermost: <MessageSquare className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  expo_push: <Smartphone className="h-5 w-5" />,
};

export function ChannelCard({
  setting,
  onTest,
  onToggle,
  onDelete,
  testing,
}: {
  setting: NotificationSettings;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const t = useTranslations('notifications');
  const details: Record<NotificationChannel, ReactNode> = {
    ntfy: setting.config.topic,
    mattermost: t('channels.webhookConfigured'),
    email: setting.config.address,
    expo_push: t('channels.mobileAppRegistered'),
  };
  return (
    <Card className={styles.channel}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`${styles.statIcon} shrink-0`}>
              {CHANNEL_ICONS[setting.channel]}
            </div>
            <div className="min-w-0">
              <p className="font-medium">{t(`channels.types.${setting.channel}`)}</p>
              <p className="break-words text-sm text-muted-foreground">{details[setting.channel]}</p>
              {setting.config_error && (
                <p className="text-sm text-destructive">{t('channels.invalidConfigHint')}</p>
              )}
            </div>
          </div>
          <Switch checked={setting.enabled} aria-label={t(`channels.types.${setting.channel}`)} onCheckedChange={onToggle} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={testing || !setting.enabled}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {t('channels.test')}
          </Button>
          <Badge variant="secondary">{t('channels.priority', { level: setting.priority })}</Badge>
          {setting.config_error && (
            <Badge variant="destructive">{t('channels.invalidConfig')}</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('channels.deleteConfirm.title')} className="ml-auto text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
