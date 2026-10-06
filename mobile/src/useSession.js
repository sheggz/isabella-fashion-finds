import { session } from './auth';
import { useStoreValue } from './useStoreValue';

/** The current session state; the component re-renders whenever it changes. */
export const useSession = () => useStoreValue(session.store);
