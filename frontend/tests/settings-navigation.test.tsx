import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from '@/app/dashboard/settings/page'

const reset = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/lib/hooks/use-preferences', () => ({
  usePreferences: () => ({ data: undefined, isLoading: false }),
  useUpdatePreferences: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetPreferences: () => ({ mutateAsync: reset, isPending: false }),
  useTestAIEndpoint: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/hooks/use-user', () => ({
  useUserProfile: () => ({ data: { display_name: 'Owner', email: 'owner@example.com' }, isLoading: false }),
  useUpdateUserProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

beforeEach(() => reset.mockClear())

describe('settings sections', () => {
  it('links every navigation section to its actual form without unmounting unsaved fields', () => {
    const { container } = render(<SettingsPage />)
    const navigation = screen.getByRole('navigation', { name: 'title' })
    const links = within(navigation).getAllByRole('link')
    expect(links).toHaveLength(8)
    for (const link of links) {
      const target = container.querySelector(link.getAttribute('href')!)
      expect(target).toBeInTheDocument()
    }
    expect(screen.getByDisplayValue('owner@example.com')).toBeInTheDocument()
  })

  it('requires explicit confirmation before resetting preferences and allows cancellation', async () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('confirmReset')).toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(reset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'reset' }))
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1))
  })
})
