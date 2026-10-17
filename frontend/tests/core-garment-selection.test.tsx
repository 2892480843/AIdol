import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasPanel } from '@/components/studio/canvas-panel';
import { ItemPicker } from '@/components/shared/item-picker';

const garments = vi.hoisted(() => [
  { id: 'linen-shirt', name: 'Linen shirt', type: 'shirt', thumbnail_url: null, image_url: null, primary_color: 'white' },
  { id: 'olive-trousers', name: 'Olive trousers', type: 'pants', thumbnail_url: null, image_url: null, primary_color: 'green' },
]);

vi.mock('@/lib/hooks/use-items', () => ({
  useItems: () => ({ data: { items: garments, total: 2, has_more: false }, isLoading: false, isFetching: false }),
}));

describe('core garment selection surfaces', () => {
  it('removes the chosen canvas garment without affecting the other piece', () => {
    const remove = vi.fn();
    render(<CanvasPanel items={garments} onRemove={remove} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'removeItem' })[1]);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('olive-trousers');
  });

  it('announces selected pieces and keeps each picker action bound to its own garment', () => {
    const toggle = vi.fn();
    render(<ItemPicker selectedIds={new Set(['linen-shirt'])} onToggle={toggle} />);
    expect(screen.getByRole('button', { name: 'Linen shirt' })).toHaveAttribute('aria-pressed', 'true');
    const trousers = screen.getByRole('button', { name: 'Olive trousers' });
    expect(trousers).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(trousers);
    expect(toggle).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'olive-trousers' }));
  });
});
