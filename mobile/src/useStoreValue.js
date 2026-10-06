import { useSyncExternalStore } from 'react';

/** Read a store from @isabella/core and re-render the component whenever it changes. */
export const useStoreValue = (store) => useSyncExternalStore(store.subscribe, store.get);
