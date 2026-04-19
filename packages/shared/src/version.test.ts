import { describe, it, expect } from 'vitest';
import { PACKAGE_VERSION } from './index';

describe('PACKAGE_VERSION', () => {
  it('is a non-empty semver string', () => {
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
