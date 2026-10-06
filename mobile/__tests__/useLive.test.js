import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useLive } from '../src/useLive';

let listener;
beforeEach(() => {
  jest.useFakeTimers();
  listener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listener = fn;
    return { remove: jest.fn() };
  });
  AppState.currentState = 'active';
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useLive', () => {
  it('refreshes every interval while the app is in the foreground', async () => {
    const refresh = jest.fn().mockResolvedValue();
    await renderHook(() => useLive(refresh, { intervalMs: 1000 }));
    await jest.advanceTimersByTimeAsync(3100);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('pauses in the background and refreshes at once on return', async () => {
    const refresh = jest.fn().mockResolvedValue();
    await renderHook(() => useLive(refresh, { intervalMs: 1000 }));
    AppState.currentState = 'background';
    await jest.advanceTimersByTimeAsync(3100);
    expect(refresh).not.toHaveBeenCalled();
    AppState.currentState = 'active';
    listener('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const refresh = jest.fn().mockResolvedValue();
    await renderHook(() => useLive(refresh, { intervalMs: 1000, enabled: false }));
    await jest.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('stops when the screen goes away', async () => {
    const refresh = jest.fn().mockResolvedValue();
    const { unmount } = await renderHook(() => useLive(refresh, { intervalMs: 1000 }));
    unmount();
    await jest.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps going after a failed refresh', async () => {
    const refresh = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
    await renderHook(() => useLive(refresh, { intervalMs: 1000 }));
    await jest.advanceTimersByTimeAsync(10000);
    expect(refresh.mock.calls.length).toBeGreaterThan(1);
  });
});
