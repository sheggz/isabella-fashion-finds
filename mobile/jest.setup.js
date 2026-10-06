// Slow machines (CI, first run with a cold transform cache) can need more than the default 1 s
// before a screen finishes its first load. A generous wait costs nothing when things are fast.
import { configure } from '@testing-library/react-native';

configure({ asyncUtilTimeout: 5000 });
