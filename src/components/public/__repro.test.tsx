import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildSampleSnapshot } from '@/components/tv/sample-model';
import type { EventSnapshot } from '@/lib/data/snapshot';

let current: EventSnapshot | null = null;

vi.mock('@/components/public/snapshot-context', () => ({
  useSnapshot: () => current,
  useLiveEvent: () => ({ snapshot: current }),
}));

describe('repro', () => {
  it('renders /live when everything is completed', async () => {
    current = buildSampleSnapshot('ceremony');
    expect(current.challenges.every((c) => c.status === 'completed')).toBe(true);
    expect(current.currentRound).toBeNull();
    const { default: LivePage } = await import('@/app/(public)/live/page');
    const html = renderToStaticMarkup(<LivePage />);
    expect(html).toContain('COMPETITION COMPLETE');
  });
});
