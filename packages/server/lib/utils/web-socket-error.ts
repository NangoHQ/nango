export interface WSErr {
    type: string;
    message: string;
}

export function UnknownAuthMode(authMode: string): WSErr {
    return {
        type: 'auth_mode_err',
        message: `Auth mode ${authMode} not supported.`
    };
}

export function ConnectionNotFound(connectionId: string): WSErr {
    return {
        type: 'connection_not_found',
        message: `Connection ${connectionId} not found.`
    };
}

export function InvalidCallbackOAuth1(): WSErr {
    return {
        type: 'callback_err',
        message: `Did not get oauth_token and/or oauth_verifier in the callback.`
    };
}

export function InvalidCallbackOAuth2(): WSErr {
    return {
        type: 'callback_err',
        message: `Did not get authorization code in the callback.`
    };
}

export function EnvironmentOrAccountNotFound(): WSErr {
    return {
        type: 'account_or_environment_retrieval_err',
        message: `The account or environment could not be retrieved.`
    };
}

export function UnknownGrantType(grantType: string): WSErr {
    return {
        type: 'grant_type_err',
        message: `The grant type "${grantType}" is not supported by this OAuth flow.`
    };
}

export function MissingConnectionId(): WSErr {
    return {
        type: 'missing_connection_id',
        message: `Missing Connection ID.`
    };
}

export function MissingProviderConfigKey(): WSErr {
    return {
        type: 'no_provider_config_key',
        message: `Missing Provider Config unique key.`
    };
}

export function UnknownProviderConfigKey(providerConfigKey: string): WSErr {
    return {
        type: 'provider_config_err',
        message: `Could not find a Provider Config matching the "${providerConfigKey}" key.`
    };
}

export function InvalidProviderConfig(providerConfigKey: string): WSErr {
    return {
        type: 'provider_config_err',
        message: `Provider Config "${providerConfigKey}" is missing client ID, secret and/or scopes.`
    };
}

export function InvalidState(state: string): WSErr {
    return {
        type: 'state_err',
        message: `Invalid state parameter passed in the callback: ${state}`
    };
}

export function TokenError(): WSErr {
    return {
        type: 'token_err',
        message: `Error storing/retrieving the token.`
    };
}

export function UnknownProviderTemplate(providerTemplate: string): WSErr {
    return {
        type: 'unknown_config_key',
        message: `No Provider Configuration with key "${providerTemplate}".`
    };
}

export function InvalidConnectionConfig(url: string, params: string): WSErr {
    return {
        type: 'url_param_err',
        message: `Missing Connection Config param(s) in Auth request to interpolate url ${url}. Provided Connection Config: ${params}`
    };
}

export function UnknownError(errorMessage?: string): WSErr {
    return {
        type: 'unknown_err',
        message: `Unknown error during the Oauth flow.${errorMessage ? ' ' + errorMessage : ''}`
    };
}

export function MissingHmac(): WSErr {
    return {
        type: 'missing_hmac',
        message: `Missing HMAC digest.`
    };
}

export function InvalidHmac(): WSErr {
    return {
        type: 'invalid_hmac',
        message: `Invalid HMAC digest.`
    };
}
