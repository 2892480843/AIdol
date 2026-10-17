'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Plus, Shirt, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ItemPicker } from '@/components/shared/item-picker';
import { useTypeLabel } from '@/lib/hooks/use-translated-constants';
import type { ClothingTypeValue, Item } from '@/lib/types';

const BASE_ITEM_FILTER_TYPES = [
  'shirt', 't-shirt', 'pants', 'jeans', 'shoes', 'sneakers', 'jacket', 'dress',
] as const satisfies readonly ClothingTypeValue[];

export function BaseItemPicker({ selectedItem, onChange }: { selectedItem: Item | null; onChange: (item: Item | null) => void }) {
  const t = useTranslations('suggest');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('constants.types');
  const typeLabel = useTypeLabel();
  const [isItemPickerOpen, setIsItemPickerOpen] = useState(false);
  const [filterType, setFilterType] = useState<string | undefined>();
  return (
    <>
      {/* Base item selection */}
      <div className="space-y-3 pt-1 border-t">
        <div className="space-y-0.5">
          <h2 className="font-semibold text-sm sm:text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('baseItem.title')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('baseItem.subtitle')}
          </p>
        </div>

        {!selectedItem ? (
          <Button
            type="button"
            variant="outline"
            className="w-full h-16 border-dashed border-2 flex items-center justify-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
            onClick={() => setIsItemPickerOpen(true)}
          >
            <div className="p-2 rounded-full bg-muted">
              <Plus className="h-4 w-4" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium block text-foreground">
                {t('baseItem.chooseItem')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('baseItem.chooseItemHint')}
              </span>
            </div>
          </Button>
        ) : (
          <div className="flex items-center justify-between p-3 rounded-xl border bg-card/80 shadow-sm gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-14 h-14 rounded-lg overflow-hidden border bg-muted flex-shrink-0">
                {selectedItem.thumbnail_url || selectedItem.image_url ? (
                  <Image
                    src={(selectedItem.thumbnail_url || selectedItem.image_url)!}
                    alt={selectedItem.name || typeLabel(selectedItem.type)}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <Shirt className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    {t('baseItem.mustInclude')}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] capitalize px-1.5 py-0">
                    {typeLabel(selectedItem.type)}
                  </Badge>
                </div>
                <p className="text-sm font-medium truncate">
                  {selectedItem.name || typeLabel(selectedItem.type)}
                </p>
                {selectedItem.primary_color && (
                  <p className="text-xs text-muted-foreground capitalize truncate">
                    {selectedItem.primary_color}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsItemPickerOpen(true)}
                className="text-xs"
              >
                {t('baseItem.change')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(null)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={t('baseItem.remove')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Item Picker Dialog */}
      <Dialog open={isItemPickerOpen} onOpenChange={setIsItemPickerOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('baseItem.dialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('baseItem.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {/* Quick Category Filter Chips */}
          <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {[
              { label: t('baseItem.all'), value: undefined },
              ...BASE_ITEM_FILTER_TYPES.map((value) => ({ label: tTypes(value), value })),
            ].map((cat) => (
              <Button
                key={cat.value ?? 'all'}
                type="button"
                variant={filterType === cat.value ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7 px-2.5 rounded-full flex-shrink-0"
                onClick={() => setFilterType(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden min-h-0 pt-1">
            <ItemPicker
              key={filterType ?? 'all'}
              selectedIds={selectedItem ? new Set([selectedItem.id]) : new Set()}
              onToggle={(item) => {
                if (selectedItem?.id === item.id) {
                  onChange(null);
                } else {
                  onChange(item);
                  setIsItemPickerOpen(false);
                }
              }}
              filterType={filterType}
              hideNeedsWash={true}
              heightClass="h-[340px]"
            />
          </div>

          <div className="flex justify-between items-center pt-3 border-t mt-2">
            {selectedItem ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {t('baseItem.clear')}
              </Button>
            ) : <div />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsItemPickerOpen(false)}
            >
              {tCommon('done')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
