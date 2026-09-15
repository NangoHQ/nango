import { getGlobalClientMetadataDocumentUrl, mcpClient } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { DBEnvironment, DBTeam, Provider, ProviderMcpOAUTH2 } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface McpClientRegistration {
    oauth_client_id: string;
    oauth_client_secret: string;
    registrationClientUri?: string;
    registrationAccessToken?: string;
}

export type McpClientRegistrationErrorCode = 'missing_environment_and_team' | 'missing_environment' | 'cimd_url_unavailable';

export class McpClientRegistrationError extends Error {
    public code: McpClientRegistrationErrorCode;

    constructor(code: McpClientRegistrationErrorCode, message: string) {
        super(message);
        this.name = 'McpClientRegistrationError';
        this.code = code;
    }
}

export async function registerMcpOAuth2Client({
    provider,
    uniqueKey,
    environment,
    team
}: {
    provider: Provider;
    uniqueKey: string;
    environment: DBEnvironment | undefined;
    team: DBTeam | undefined;
}): Promise<Result<McpClientRegistration | null, McpClientRegistrationError>> {
    const clientRegistration = (provider as ProviderMcpOAUTH2).client_registration;

    if (clientRegistration === 'dynamic') {
        if (!environment || !team) {
            return Err(
                new McpClientRegistrationError('missing_environment_and_team', 'environment and team are required to dynamically register an MCP_OAUTH2 client')
            );
        }
        const registered = await mcpClient.registerClientId({ provider, environment, team });
        return Ok({
            oauth_client_id: registered.client_id,
            oauth_client_secret: registered.client_secret || '',
            ...(registered.registration_client_uri && { registrationClientUri: registered.registration_client_uri }),
            ...(registered.registration_access_token && { registrationAccessToken: registered.registration_access_token })
        });
    }

    if (clientRegistration === 'cimd') {
        if (!environment) {
            return Err(new McpClientRegistrationError('missing_environment', 'environment is required to build an MCP_OAUTH2 client ID metadata document URL'));
        }
        const cimdResult = resolveCimdUrl(environment.uuid, uniqueKey);
        if (cimdResult.isErr()) {
            return Err(cimdResult.error);
        }
        return Ok({ oauth_client_id: cimdResult.value, oauth_client_secret: '' });
    }

    return Ok(null);
}

export function resolveCimdUrl(environmentUuid: string, uniqueKey: string): Result<string, McpClientRegistrationError> {
    const cimdUrl = getGlobalClientMetadataDocumentUrl(environmentUuid, uniqueKey);
    if (!cimdUrl) {
        return Err(
            new McpClientRegistrationError(
                'cimd_url_unavailable',
                'Client ID metadata documents require your Nango instance to be reachable at a public HTTPS URL'
            )
        );
    }
    return Ok(cimdUrl);
}

export async function cleanupMcpClientRegistration(registration: McpClientRegistration | null | undefined): Promise<void> {
    if (!registration?.registrationClientUri) {
        return;
    }
    await mcpClient.deregisterClientId({
        registrationClientUri: registration.registrationClientUri,
        registrationAccessToken: registration.registrationAccessToken
    });
}

const REGISTRATION_CLIENT_URI_KEY = 'mcpRegistrationClientUri';
const REGISTRATION_ACCESS_TOKEN_KEY = 'mcpRegistrationAccessToken';

export function mcpRegistrationCustomFields(registration: McpClientRegistration | null | undefined): Record<string, string> | undefined {
    if (!registration?.registrationClientUri) {
        return undefined;
    }
    return {
        [REGISTRATION_CLIENT_URI_KEY]: registration.registrationClientUri,
        ...(registration.registrationAccessToken && { [REGISTRATION_ACCESS_TOKEN_KEY]: registration.registrationAccessToken })
    };
}

export function mcpRegistrationFromCustom(custom: Record<string, string> | null | undefined): McpClientRegistration | null {
    const registrationClientUri = custom?.[REGISTRATION_CLIENT_URI_KEY];
    if (!registrationClientUri) {
        return null;
    }
    const registrationAccessToken = custom?.[REGISTRATION_ACCESS_TOKEN_KEY];
    return {
        oauth_client_id: '',
        oauth_client_secret: '',
        registrationClientUri,
        ...(registrationAccessToken && { registrationAccessToken })
    };
}
