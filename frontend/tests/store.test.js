import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/lib/store.js';

describe('createStore', () => {
  it('holds a value and lets you replace it', () => {
    const store = createStore({ n: 1 });
    expect(store.get()).toEqual({ n: 1 });
    store.set({ n: 2 });
    expect(store.get()).toEqual({ n: 2 });
  });

  it('accepts an updater function that receives the current value', () => {
    const store = createStore({ n: 1 });
    store.set((s) => ({ ...s, n: s.n + 1 }));
    expect(store.get().n).toBe(2);
  });

  it('notifies subscribers on change, with the new value', () => {
    const store = createStore(0);
    const seen = vi.fn();
    store.subscribe(seen);
    store.set(5);
    expect(seen).toHaveBeenCalledWith(5);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore(0);
    const seen = vi.fn();
    const off = store.subscribe(seen);
    off();
    store.set(1);
    expect(seen).not.toHaveBeenCalled();
  });

  it('does not notify when the value is unchanged', () => {
    const store = createStore(1);
    const seen = vi.fn();
    store.subscribe(seen);
    store.set(1);
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps notifying the others if one subscriber throws', () => {
    const store = createStore(0);
    const good = vi.fn();
    store.subscribe(() => { throw new Error('bad subscriber'); });
    store.subscribe(good);
    expect(() => store.set(1)).not.toThrow();
    expect(good).toHaveBeenCalledWith(1);
  });
});
