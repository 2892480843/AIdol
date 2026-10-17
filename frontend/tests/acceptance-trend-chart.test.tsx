import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AcceptanceTrendChart } from '@/components/acceptance-trend-chart'

vi.mock('next-intl', () => ({
  useLocale: () => 'de',
  useTranslations: () => (key: string) => key,
}))

describe('AcceptanceTrendChart', () => {
  it('labels each week from its ISO start date on the app locale', () => {
    render(
      <AcceptanceTrendChart
        data={[
          { period: 'Oct 06', period_start: '2026-10-06', total: 2, accepted: 1, rejected: 1, rate: 50 },
        ]}
      />,
    )

    const expected = new Date(2026, 9, 6).toLocaleDateString('de', { month: 'short', day: 'numeric' })
    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('Oct 06')).not.toBeInTheDocument()
  })
})

  it('renders a real trend graphic without inventing empty-week observations', () => {
    const { container } = render(
      <AcceptanceTrendChart data={[
        { period: 'a', period_start: '2026-10-06', total: 2, accepted: 1, rejected: 1, rate: 50 },
        { period: 'b', period_start: '2026-10-13', total: 0, accepted: 0, rejected: 0, rate: 0 },
        { period: 'c', period_start: '2026-10-20', total: 4, accepted: 4, rejected: 0, rate: 100 },
      ]} />
    )
    expect(screen.getByRole('img', { name: 'insights.acceptanceTrend.title' })).toBeInTheDocument()
    expect(container.querySelectorAll('circle[data-rate]')).toHaveLength(2)
    expect(container.querySelector('circle[data-rate="50"]')).toBeInTheDocument()
    expect(container.querySelector('circle[data-rate="100"]')).toBeInTheDocument()
  })
