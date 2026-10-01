import { data, startHourlyReset } from './storage';
import { installBrowserMocks } from './browser';
import { installGuide } from './guide';

data();
startHourlyReset();
installBrowserMocks(installGuide());
await import('../src/main');
