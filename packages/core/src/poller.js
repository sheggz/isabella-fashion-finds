/**
 * Re-run a task on a schedule, politely. This is what keeps screens fresh ("a change on the
 * website appears on the phone within seconds") without any special server technology.
 *
 * Behaviour worth knowing:
 * - A chain of `setTimeout`s, not `setInterval`: the next wait only starts AFTER the task has
 *   finished, so a slow server can never pile up overlapping requests.
 * - `isActive()` lets the caller pause it (screen hidden, app in the background): a paused tick
 *   skips the task but keeps checking, so it resumes by itself.
 * - A failing task is reported through `onError` and does not stop polling; the wait doubles
 *   after each consecutive failure (up to `maxBackoffFactor` times the interval) and returns to
 *   normal after a success, so an offline phone does not hammer the server.
 * - `triggerNow()` is for "the app just came back to the foreground": it runs the task now (or
 *   joins the run already in progress) and restarts the wait.
 *
 * @param {object} config
 * @param {() => Promise<unknown> | unknown} config.task
 * @param {number} config.intervalMs
 * @param {() => boolean} [config.isActive]
 * @param {(error: unknown) => void} [config.onError]
 * @param {number} [config.maxBackoffFactor]
 */
export const createPoller = ({ task, intervalMs, isActive = () => true, onError, maxBackoffFactor = 4 }) => {
  let timer = null;
  let stopped = true;
  let failures = 0;
  let inFlight = null;

  const delay = () => intervalMs * Math.min(2 ** failures, maxBackoffFactor);

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(tick, delay());
  };

  const run = () => {
    if (inFlight) return inFlight; // never two runs at once
    inFlight = (async () => {
      try {
        await task();
        failures = 0;
      } catch (error) {
        failures += 1;
        onError?.(error);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  async function tick() {
    timer = null;
    if (!stopped && isActive()) await run();
    schedule();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
    async triggerNow() {
      await run();
      schedule(); // restarts the wait; does nothing if the poller is stopped
    },
  };
};
