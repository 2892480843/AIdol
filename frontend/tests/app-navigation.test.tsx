import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavigation, currentNavigation } from '@/components/app-navigation';
import { MobileSidebar } from '@/components/mobile-sidebar';

const route = vi.hoisted(() => ({ pathname: '/dashboard/family/feed' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

describe('application navigation', () => {
  it('selects the most specific section without marking its parent active', () => {
    render(<AppNavigation />);
    expect(screen.getByRole('link', { name: 'familyFeed' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'family' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(currentNavigation('/dashboard/outfits/new')?.href).toBe(
      '/dashboard/outfits',
    );
    expect(currentNavigation('/dashboard/unknown')).toBeUndefined();
  });

  it('closes the mobile drawer when navigating and exposes its accessible close control', async () => {
    const onClose = vi.fn();
    render(<MobileSidebar open onClose={onClose} />);
    const link = await screen.findByRole('link', { name: 'wardrobe' });
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'closeSidebar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes the mobile drawer with Escape', async () => {
    const onClose = vi.fn();
    render(<MobileSidebar open onClose={onClose} />);
    await screen.findByRole('button', { name: 'closeSidebar' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'closeSidebar' }), {
      key: 'Escape',
      code: 'Escape',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
