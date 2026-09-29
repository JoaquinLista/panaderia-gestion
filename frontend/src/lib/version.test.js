import { describe, it, expect } from 'vitest';

import { versionCorta } from './version.js';

describe('versionCorta', () => {
  it('muestra los primeros 7 caracteres del SHA, como GitHub', () => {
    expect(versionCorta('894590e1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7')).toBe('894590e');
  });

  it('sin SHA dice "local"', () => {
    expect(versionCorta(undefined)).toBe('local');
    expect(versionCorta('  ')).toBe('local');
  });
});
