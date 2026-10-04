import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPoller } from '../src/poller.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

describe('createPoller', () => {
  it('does nothing until it is started, and does not run immediately when started', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    await tick(5000);
    expect(task).not.toHaveBeenCalled();
    poller.start();
    expect(task).not.toHaveBeenCalled();
    poller.stop();
  });

  it('runs the task once per interval', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    poller.start();
    await tick(1000);
    expect(task).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(task).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('stop() ends it for good', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    poller.start();
    await tick(1000);
    poller.stop();
    await tick(10000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('starting twice does not double the polling', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    poller.start();
    poller.start();
    await tick(1000);
    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('never overlaps: the next wait only starts once a slow task has finished', async () => {
    let finish;
    const task = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const poller = createPoller({ task, intervalMs: 1000 });
    poller.start();
    await tick(1000);                 // first run begins and is still going
    await tick(5000);                 // lots of time passes, but no second run starts
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await tick(1000);                 // finished; one interval later the next run starts
    expect(task).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('skips a run while paused (screen hidden, app in the background) and resumes afterwards', async () => {
    let active = false;
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000, isActive: () => active });
    poller.start();
    await tick(3000);
    expect(task).not.toHaveBeenCalled();
    active = true;
    await tick(1000);
    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('a failing task is reported, does not stop the polling, and backs off up to a limit', async () => {
    const onError = vi.fn();
    const task = vi.fn().mockRejectedValue(new Error('offline'));
    const poller = createPoller({ task, intervalMs: 1000, onError, maxBackoffFactor: 4 });
    poller.start();
    await tick(1000);                 // run 1 fails -> next wait 2s
    expect(onError).toHaveBeenCalledTimes(1);
    await tick(1999);
    expect(task).toHaveBeenCalledTimes(1);
    await tick(1);                    // run 2 at t=3s fails -> next wait 4s
    expect(task).toHaveBeenCalledTimes(2);
    await tick(4000);                 // run 3 at t=7s fails -> wait stays capped at 4s
    expect(task).toHaveBeenCalledTimes(3);
    await tick(4000);
    expect(task).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it('a success after failures returns to the normal rhythm', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000, onError: () => {} });
    poller.start();
    await tick(1000);                 // fails
    await tick(2000);                 // succeeds (after the doubled wait)
    expect(task).toHaveBeenCalledTimes(2);
    await tick(1000);                 // back to 1s
    expect(task).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('triggerNow() runs the task straight away (e.g. when the app returns to the foreground) and restarts the wait', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    poller.start();
    await tick(600);
    await poller.triggerNow();
    expect(task).toHaveBeenCalledTimes(1);
    await tick(900);                  // 900ms after the manual run: not yet
    expect(task).toHaveBeenCalledTimes(1);
    await tick(100);
    expect(task).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('triggerNow() while a run is in progress joins it instead of starting a second one', async () => {
    let finish;
    const task = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const poller = createPoller({ task, intervalMs: 1000 });
    const first = poller.triggerNow();
    const second = poller.triggerNow();
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
  });

  it('triggerNow() works even if start() was never called, and does not begin background polling', async () => {
    const task = vi.fn().mockResolvedValue();
    const poller = createPoller({ task, intervalMs: 1000 });
    await poller.triggerNow();
    await tick(5000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
