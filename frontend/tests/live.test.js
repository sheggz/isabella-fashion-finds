// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { keepFresh } from '../src/live.js';
import { loading, WAKING_AFTER_MS } from '../src/components/states.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('keepFresh', () => {
  it('re-runs the refresh every interval', async () => {
    const refresh = vi.fn().mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(3100);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it('stops for good when the returned cleanup runs', async () => {
    const refresh = vi.fn().mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 1000 });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('skips ticks while the tab is hidden and refreshes at once when it returns', async () => {
    setVisibility('hidden');
    const refresh = vi.fn().mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(3100);
    expect(refresh).not.toHaveBeenCalled();
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refreshes when the browser comes back online', async () => {
    setVisibility('visible');
    const refresh = vi.fn().mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 60000 });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps polling after a failed refresh (silent: the screen keeps what it has)', async () => {
    setVisibility('visible');
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh.mock.calls.length).toBeGreaterThan(1);
    stop();
  });

  it('removes its event listeners on stop', async () => {
    setVisibility('visible');
    const refresh = vi.fn().mockResolvedValue();
    const stop = keepFresh(refresh, { intervalMs: 60000 });
    stop();
    window.dispatchEvent(new Event('online'));
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('loading() wake-up notice', () => {
  it('tells the shopper the server is waking up if loading drags on', () => {
    const node = loading();
    document.body.append(node);
    expect(node.textContent).toBe('Loading…');
    vi.advanceTimersByTime(WAKING_AFTER_MS + 10);
    expect(node.textContent).toMatch(/waking the server/i);
  });

  it('does nothing if the placeholder was already replaced', () => {
    const node = loading(); // never attached: stands for a node the page has replaced
    vi.advanceTimersByTime(WAKING_AFTER_MS + 10);
    expect(node.textContent).toBe('Loading…');
  });
});
