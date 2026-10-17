'use client';

import styles from '@/components/secondary-ui.module.css';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useSubmitFamilyRating, useDeleteFamilyRating } from '@/lib/hooks/use-outfits';
import { FamilyRating } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { StarRatingDisplay, StarRatingInput } from '@/components/shared/star-rating';

interface FamilyRatingFormProps {
  outfitId: string;
  existingRating?: FamilyRating;
  onSuccess?: () => void;
}

export function FamilyRatingForm({ outfitId, existingRating, onSuccess }: FamilyRatingFormProps) {
  const t = useTranslations('family.ratings');
  const [rating, setRating] = useState(existingRating?.rating ?? 0);
  const [comment, setComment] = useState(existingRating?.comment ?? '');
  const submitRating = useSubmitFamilyRating();

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error(t('selectRating'));
      return;
    }
    try {
      await submitRating.mutateAsync({
        outfitId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success(existingRating ? t('ratingUpdated') : t('ratingSubmitted'));
      onSuccess?.();
    } catch {
      toast.error(t('submitError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{t('yourRating')}</span>
        <StarRatingInput value={rating} onChange={setRating} />
      </div>
      <Textarea
        placeholder={t('addComment')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
        aria-label={t('addComment')} className="min-h-24 resize-y text-sm"
      />
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={rating === 0 || submitRating.isPending}
      >
        {submitRating.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {existingRating ? t('updateRating') : t('submitRating')}
      </Button>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface FamilyRatingsDisplayProps {
  ratings: FamilyRating[];
  outfitId: string;
  currentUserId?: string;
}

export function FamilyRatingsDisplay({ ratings, outfitId, currentUserId }: FamilyRatingsDisplayProps) {
  const t = useTranslations('family.ratings');
  const deleteRating = useDeleteFamilyRating();

  if (ratings.length === 0) return null;

  const handleDelete = async () => {
    try {
      await deleteRating.mutateAsync(outfitId);
      toast.success(t('ratingRemoved'));
    } catch {
      toast.error(t('removeError'));
    }
  };

  return (
    <div className="space-y-4">
      {ratings.map((r) => (
        <div key={r.id} className={styles.memberRow}>
          <Avatar className="h-8 w-8">
            <AvatarImage src={r.user_avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(r.user_display_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium truncate">{r.user_display_name}</span>
              <StarRatingDisplay value={r.rating} />
            </div>
            {r.comment && (
              <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">&ldquo;{r.comment}&rdquo;</p>
            )}
          </div>
          {currentUserId && r.user_id === currentUserId && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('ratingRemoved')} className="h-10 w-10 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteRating.isPending}
            >
              {deleteRating.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
