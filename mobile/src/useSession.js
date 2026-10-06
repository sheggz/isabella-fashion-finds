import { useSyncExternalStore } from 'react';
import { session } from './auth';

/** The current session state; the component re-renders whenever it changes. */
export const useSession = () => useSyncExternalStore(session.store.subscribe, session.store.get);
