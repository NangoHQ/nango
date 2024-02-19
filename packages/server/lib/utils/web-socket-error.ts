export interface WSErr {
    type: string;
    message: string;
}

export class WSErrBuilder {
    public static UnknownAuthMode(authMode: string): WSErr {
        return {
            type: 'auth_mode_err',
            message: `Auth mode ${authMode} not supported.`
        };
    }

    public static ConnectionNotFound(connectionId: string): WSErr {
        return {
            type: 'connection_not_found',
            message: `Connection ${connectionId} not found.`
        };
    }

    public static InvalidCallbackOAuth1(): WSErr {
        return {
            type: 'callback_err',
            message: `Did not get oauth_token and/or oauth_verifier in the callback.`
        };
    }

    public static InvalidCallbackOAuth2(): WSErr {
        return {
            type: 'callback_err',
            message: `Did not get authorization code in the callback.`
        };
    }

    public static UnknownGrantType(grantType: string): WSErr {
        return {
            type: 'grant_type_err',
            message: `The grant type "${grantType}" is not supported by this OAuth flow.`
        };
    }

    public static MissingConnectionId(): WSErr {
        return {
            type: 'missing_connection_id',
            message: `Missing Connection ID.`
        };
    }

    public static MissingProviderConfigKey(): WSErr {
        return {
            type: 'no_provider_config_key',
            message: `Missing Provider Config unique key.`
        };
    }

    public static UnknownProviderConfigKey(providerConfigKey: string): WSErr {
        return {
            type: 'provider_config_err',
            message: `Could not find a Provider Config matching the "${providerConfigKey}" key.`
        };
    }

    public static InvalidProviderConfig(providerConfigKey: string): WSErr {
        return {
            type: 'provider_config_err',
            message: `Provider Config "${providerConfigKey}" is missing cliend ID, secret and/or scopes.`
        };
    }

    public static InvalidState(state: string): WSErr {
        return {
            type: 'state_err',
            message: `Invalid state parameter passed in the callback: ${state}`
        };
    }

    public static TokenError(): WSErr {
        return {
            type: 'token_err',
            message: `Error storing/retrieving the token.`
        };
    }

    public static UnknownProviderTemplate(providerTemplate: string): WSErr {
        return {
            type: 'unknown_config_key',
            message: `No Provider Configuration with key "${providerTemplate}".`
        };
    }

    public static InvalidConnectionConfig(url: string, params: string): WSErr {
        return {
            type: 'url_param_err',
            message: `Missing Connection Config param(s) in Auth request to interpolate url ${url}. Provided Connection Config: ${params}`
        };
    }

    public static UnknownError(errorMessage?: string): WSErr {
        return {
            type: 'unknown_err',
            message: `Unknown error during the Oauth flow.${errorMessage ? ' ' + errorMessage : ''}`
        };
    }

    public static MissingHmac(): WSErr {
        return {
            type: 'missing_hmac',
            message: `Missing HMAC digest.`
        };
    }

    public static InvalidHmac(): WSErr {
        return {
            type: 'invalid_hmac',
            message: `Invalid HMAC digest.`
        };
    }
}
