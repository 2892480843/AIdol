'use client';

import { PageHeader } from '@/components/page-header';
import styles from '@/components/secondary-ui.module.css';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  Plus,
  Trash2,
  Clock,
  Loader2,
  Settings2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotificationSettings,
  useCreateNotificationSetting,
  useUpdateNotificationSetting,
  useDeleteNotificationSetting,
  useTestNotificationSetting,
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  Schedule,
} from '@/lib/hooks/use-notifications';
import { ChannelCard } from '@/components/notifications/channel-card';
import { useUserProfile } from '@/lib/hooks/use-user';
import { useOccasionLabel, useOccasions } from '@/lib/hooks/use-translated-constants';
import { useTranslations } from 'next-intl';
import { AddChannelDialog, ChannelFormData } from '@/components/notifications/add-channel-dialog';

const DAY_KEYS = [
  { value: 0, key: 'monday' as const },
  { value: 1, key: 'tuesday' as const },
  { value: 2, key: 'wednesday' as const },
  { value: 3, key: 'thursday' as const },
  { value: 4, key: 'friday' as const },
  { value: 5, key: 'saturday' as const },
  { value: 6, key: 'sunday' as const },
];

function ScheduleCard({
  schedule,
  onToggle,
  onToggleDayBefore,
  onDelete,
}: {
  schedule: Schedule;
  onToggle: (enabled: boolean) => void;
  onToggleDayBefore: (notify_day_before: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('notifications');
  const occasionLabel = useOccasionLabel();
  const day = DAY_KEYS.find((d) => d.value === schedule.day_of_week);

  // Calculate which day the notification actually comes
  const notifyDay = schedule.notify_day_before
    ? DAY_KEYS[(schedule.day_of_week + 6) % 7] // Previous day
    : day;

  return (
    <div className="space-y-4 rounded-none border border-border bg-primary/[.025] p-4 sm:p-5">
      {/* Top row: Day info and main toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={styles.statIcon}>
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{day ? t(`days.${day.key}`) : ''}</p>
            <p className="text-sm text-muted-foreground">
              {t('schedule.summary', {
                time: schedule.notification_time,
                occasion: occasionLabel(schedule.occasion),
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={schedule.enabled} aria-label={t('schedule.title')} onCheckedChange={onToggle} />
          <Button variant="ghost" size="icon" aria-label={t('schedule.deleteConfirm.title')} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {/* Bottom row: Day before toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Switch
            id={`daybefore-${schedule.id}`}
            checked={schedule.notify_day_before}
            onCheckedChange={onToggleDayBefore}
          />
          <Label htmlFor={`daybefore-${schedule.id}`} className="text-sm cursor-pointer">
            {t('schedule.notifyDayBefore')}
          </Label>
        </div>
        {schedule.notify_day_before && (
          <span className="text-xs text-muted-foreground">
            {t('schedule.notifyDayEvening', { day: notifyDay ? t(`days.${notifyDay.key}`) : '' })}
          </span>
        )}
      </div>
    </div>
  );
}

interface ScheduleFormData {
  day_of_week: number;
  notification_time: string;
  occasion: string;
  enabled: boolean;
  notify_day_before: boolean;
}

function AddScheduleDialog({
  onAdd,
  isLoading,
}: {
  onAdd: (data: ScheduleFormData) => Promise<void>;
  isLoading: boolean;
}) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const occasions = useOccasions();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('07:00');
  const [occasion, setOccasion] = useState('casual');
  const [notifyDayBefore, setNotifyDayBefore] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);

  // Calculate which day notification comes on
  const notifyDay = notifyDayBefore
    ? DAY_KEYS[(dayOfWeek + 6) % 7] // Previous day
    : DAY_KEYS.find((d) => d.value === dayOfWeek);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onAdd({
        day_of_week: dayOfWeek,
        notification_time: time,
        occasion,
        enabled: true,
        notify_day_before: notifyDayBefore,
      });
      // Close and reset on success
      setOpen(false);
      setTime('07:00');
      setOccasion('casual');
      setNotifyDayBefore(false);
    } catch {
      // Error handled by parent via toast
    }
  };

  const closeAndReset = () => {
    setOpen(false);
    setTime('07:00');
    setOccasion('casual');
    setNotifyDayBefore(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          {t('schedule.addSchedule')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('schedule.addSchedule')}</DialogTitle>
            <DialogDescription>
              {t('schedule.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="schedule-day">{t('schedule.dayLabel')}</Label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={(v) => setDayOfWeek(parseInt(v))}
              >
                <SelectTrigger id="schedule-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_KEYS.map((day) => (
                    <SelectItem key={day.value} value={String(day.value)}>
                      {t(`days.${day.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">{t('schedule.timeLabel')}</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-occasion">{t('schedule.occasionLabel')}</Label>
              <Select value={occasion} onValueChange={setOccasion}>
                <SelectTrigger id="schedule-occasion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {occasions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-none border bg-muted/30 p-4">
              <div className="space-y-0.5">
                <Label htmlFor="notify-day-before">{t('schedule.notifyDayBefore')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('schedule.notifyDayBeforeDesc')}
                </p>
              </div>
              <Switch
                id="notify-day-before"
                checked={notifyDayBefore}
                onCheckedChange={setNotifyDayBefore}
              />
            </div>
            {notifyDayBefore && (
              <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                {t('schedule.notifyDayBeforeInfo', { notifyDay: notifyDay ? t(`days.${notifyDay.key}`) : '', time, outfitDay: (() => { const d = DAY_KEYS.find(d => d.value === dayOfWeek); return d ? t(`days.${d.key}`) : ''; })() })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAndReset} disabled={isLoading}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {tc('adding')}
                </>
              ) : (
                t('schedule.addSchedule')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const { data: settings, isLoading: loadingSettings } = useNotificationSettings();
  const { data: schedules, isLoading: loadingSchedules } = useSchedules();
  const { data: userProfile } = useUserProfile();

  const createSetting = useCreateNotificationSetting();
  const updateSetting = useUpdateNotificationSetting();
  const deleteSetting = useDeleteNotificationSetting();
  const testSetting = useTestNotificationSetting();

  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'channel' | 'schedule'; id: string } | null>(null);

  const handleCreateChannel = async (data: ChannelFormData): Promise<void> => {
    try {
      await createSetting.mutateAsync(data);
      toast.success(t('channels.channelAdded'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('channels.addFailed');
      toast.error(message);
      throw error; // Re-throw so dialog knows it failed
    }
  };

  const handleCreateSchedule = async (data: ScheduleFormData): Promise<void> => {
    try {
      await createSchedule.mutateAsync(data);
      toast.success(t('schedule.scheduleAdded'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('schedule.addFailed');
      toast.error(message);
      throw error; // Re-throw so dialog knows it failed
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testSetting.mutateAsync(id);
      toast.success(result.message || t('channels.testSent'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('channels.testFailed');
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleChannel = async (id: string, enabled: boolean) => {
    try {
      await updateSetting.mutateAsync({ id, data: { enabled } });
      toast.success(enabled ? t('channels.channelEnabled') : t('channels.channelDisabled'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('updateFailed');
      toast.error(message);
    }
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    try {
      await updateSchedule.mutateAsync({ id, data: { enabled } });
      toast.success(enabled ? t('schedule.scheduleEnabled') : t('schedule.scheduleDisabled'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('updateFailed');
      toast.error(message);
    }
  };

  const handleToggleDayBefore = async (id: string, notify_day_before: boolean) => {
    try {
      await updateSchedule.mutateAsync({ id, data: { notify_day_before } });
      toast.success(notify_day_before ? t('schedule.willNotifyDayBefore') : t('schedule.willNotifySameDay'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('updateFailed');
      toast.error(message);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.type === 'channel') {
        await deleteSetting.mutateAsync(deleteConfirm.id);
        toast.success(t('channels.channelDeleted'));
      } else {
        await deleteSchedule.mutateAsync(deleteConfirm.id);
        toast.success(t('schedule.scheduleDeleted'));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('deleteFailed');
      toast.error(message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader title={t('title')} description={t('subtitle')} icon={<Bell className="h-5 w-5" />} />

      {/* Notification Channels */}
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {t('channels.title')}
                {!loadingSettings && <span className="rounded-none bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{settings?.length ?? 0}</span>}
              </CardTitle>
              <CardDescription>
                {t('channels.description')}
              </CardDescription>
            </div>
            <AddChannelDialog onAdd={handleCreateChannel} isLoading={createSetting.isPending} userEmail={userProfile?.email} />
          </div>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : settings?.length === 0 ? (
            <div className={styles.emptyState}>
              <Bell className="mx-auto mb-5 h-10 w-10 text-primary/60" />
              <p>{t('channels.noChannels')}</p>
              <p className="text-sm">{t('channels.noChannelsDesc')}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {settings?.map((setting) => (
                <ChannelCard
                  key={setting.id}
                  setting={setting}
                  testing={testingId === setting.id}
                  onTest={() => handleTest(setting.id)}
                  onToggle={(enabled) => handleToggleChannel(setting.id, enabled)}
                  onDelete={() => setDeleteConfirm({ type: 'channel', id: setting.id })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedules */}
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('schedule.title')}
                {!loadingSchedules && <span className="rounded-none bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{schedules?.length ?? 0}</span>}
              </CardTitle>
              <CardDescription>
                {t('schedule.description')}
              </CardDescription>
            </div>
            <AddScheduleDialog
              onAdd={handleCreateSchedule}
              isLoading={createSchedule.isPending}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingSchedules ? (
            <div className="space-y-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : schedules?.length === 0 ? (
            <div className={styles.emptyState}>
              <Calendar className="mx-auto mb-5 h-10 w-10 text-primary/60" />
              <p>{t('schedule.noSchedules')}</p>
              <p className="text-sm">{t('schedule.noSchedulesDesc')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {DAY_KEYS.map((day) => {
                const daySchedules = schedules?.filter((s) => s.day_of_week === day.value) || [];
                if (daySchedules.length === 0) return null;
                return daySchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onToggle={(enabled) => handleToggleSchedule(schedule.id, enabled)}
                    onToggleDayBefore={(notify_day_before) => handleToggleDayBefore(schedule.id, notify_day_before)}
                    onDelete={() => setDeleteConfirm({ type: 'schedule', id: schedule.id })}
                  />
                ));
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === 'channel' ? t('channels.deleteConfirm.title') : t('schedule.deleteConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'channel'
                ? t('channels.deleteConfirm.description')
                : t('schedule.deleteConfirm.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSetting.isPending || deleteSchedule.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {tc('deleting')}
                </>
              ) : (
                tc('delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
