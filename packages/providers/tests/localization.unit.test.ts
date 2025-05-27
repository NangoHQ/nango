import { assert, describe, it } from 'vitest';

import { loadProvidersYaml } from '../lib/index.js';
import { loadLanguageOverrides } from '../lib/localization.js';

export function assertOverridePathsExist(providers: Record<string, any>, overrides: Record<string, any>, currentPath: string = ''): void {
    for (const key in overrides) {
        assert(key in providers, `Override path '${currentPath}.${key}' does not exist in providers object`);

        const overrideValue = overrides[key];
        const providerValue = providers[key];
        if (typeof overrideValue === 'object' && overrideValue !== null) {
            assert(
                typeof providerValue === 'object' && providerValue !== null,
                `Override path '${currentPath}.${key}' expects an object in providers, but found ${typeof providerValue}`
            );
            assertOverridePathsExist(providerValue, overrideValue, `${currentPath}.${key}`);
        }
    }
}

describe('Localization', () => {
    describe('Overrides match providers.yaml keys', () => {
        const providers = loadProvidersYaml();

        it('en', () => {
            const overrides = loadLanguageOverrides('en');
            if (providers && Object.keys(overrides).length > 0) {
                assertOverridePathsExist(providers, overrides);
            }
        });

        it('fr', () => {
            const overrides = loadLanguageOverrides('fr');
            if (providers && Object.keys(overrides).length > 0) {
                assertOverridePathsExist(providers, overrides);
            }
        });

        it('es', () => {
            const overrides = loadLanguageOverrides('es');
            if (providers && Object.keys(overrides).length > 0) {
                assertOverridePathsExist(providers, overrides);
            }
        });

        it('de', () => {
            const overrides = loadLanguageOverrides('de');
            if (providers && Object.keys(overrides).length > 0) {
                assertOverridePathsExist(providers, overrides);
            }
        });
    });
});
