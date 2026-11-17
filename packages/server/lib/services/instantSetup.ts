import type { AuthModeType, Provider, ProviderInstantSetup, ProviderMcpOAUTH2 } from '@nangohq/types';

const AUTH_MODES_NEEDING_DEV_APP: AuthModeType[] = ['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM'];
const AUTH_MODES_WITH_REQUIRED_SETUP_FIELDS: AuthModeType[] = ['TBA', 'INSTALL_PLUGIN'];

export function needsSetupFields(provider: Provider): boolean {
    return AUTH_MODES_WITH_REQUIRED_SETUP_FIELDS.includes(provider.auth_mode) || provider.integration_config !== undefined;
}

export function getInstantSetup(provider: Provider, preConfigured: boolean): ProviderInstantSetup {
    if (needsSetupFields(provider)) {
        return null;
    }
    if (preConfigured) {
        return 'managed';
    }
    if (AUTH_MODES_NEEDING_DEV_APP.includes(provider.auth_mode)) {
        return null;
    }
    if (provider.auth_mode === 'MCP_OAUTH2' && (provider as ProviderMcpOAUTH2).client_registration === 'static') {
        return null;
    }
    return 'no-dev-app';
}
