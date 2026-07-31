import type { IntegrationConfig, Provider } from '@nangohq/types';

export function getPreconfiguredCredentials(custom: IntegrationConfig['custom'], provider: Provider): string[] {
    if (!custom || provider.auth_mode !== 'TWO_STEP' || !provider.integration_config) {
        return [];
    }

    return Object.keys(provider.integration_config).filter((field) => Boolean(custom[field]));
}
