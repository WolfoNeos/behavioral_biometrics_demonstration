import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

import { configure } from '@testing-library/react';

// machine chargée (suite complète en parallèle) : les attentes asynchrones ne doivent pas expirer à 1 s
configure({ asyncUtilTimeout: 4000 });
