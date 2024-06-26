import axios from 'axios';
import querystring from 'querystring';
import * as uuid from 'uuid';
import { z } from 'zod';
import * as crypto from 'node:crypto';
import type { OAuthSession } from '@nangohq/shared';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP, generateBaseString, generateSignature, getTbaMetaParams, SIGNATURE_METHOD, percentEncode } from '@nangohq/utils';
import { analytics, configService, AnalyticsTypes, getConnectionConfig, getOauthCallbackUrl, interpolateStringFromObject } from '@nangohq/shared';
import oAuthSessionService from '../../services/oauth-session.service.js';
import { missesInterpolationParam } from '../../utils/utils.js';
import * as WSErrBuilder from '../../utils/web-socket-error.js';
import type { TbaAuthorization } from '@nangohq/types';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';

const queryStringValidation = z
    .object({
        connection_id: z.string().nonempty(),
        params: z.record(z.any()).optional(),
        authorization_params: z.record(z.any()).optional(),
        user_scope: z.string().optional(),
        ws_client_id: z.string().optional(),
        public_key: z.string().uuid(),
        hmac: z.string().optional(),
        token_id: z.string().nonempty(),
        token_secret: z.string().nonempty(),
        credentials: z
            .object({
                oauth_client_id_override: z.string().optional(),
                oauth_client_secret_override: z.string().optional()
            })
            .optional()
    })
    .strict();

const paramValidation = z
    .object({
        providerConfigKey: z.string().nonempty()
    })
    .strict();

export const tbaAuthorization = asyncWrapper<TbaAuthorization>(async (req, res) => {
    const queryStringVal = queryStringValidation.safeParse(req.query);

    if (!queryStringVal.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) }
        });
        return;
    }
    const paramVal = paramValidation.safeParse(req.params);

    if (!paramVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) }
        });
        return;
    }

    const { account, environment } = res.locals;

    const { token_id: tokenId, token_secret: tokenSecret, connection_id: connectionId, params, ws_client_id: wsClientId, credentials } = queryStringVal.data;
    const { providerConfigKey } = paramVal.data;

    const logCtx = await logContextGetter.create(
        {
            operation: { type: 'auth', action: 'create_connection' },
            message: 'Create connection via TBA',
            expiresAt: defaultOperationExpiration.auth()
        },
        { account, environment }
    );
    void analytics.track(AnalyticsTypes.PRE_TBA_AUTH, account.id);

    await hmacCheck({
        environment,
        logCtx,
        providerConfigKey,
        connectionId,
        hmac: queryStringVal.data.hmac,
        res
    });

    const config = await configService.getProviderConfig(providerConfigKey, environment.id);

    if (config == null) {
        await logCtx.error('Unknown provider config');
        await logCtx.failed();

        res.status(404).send({
            error: { code: 'unknown_provider_config' }
        });

        return;
    }

    const template = configService.getTemplate(config.provider);

    if (template.auth_mode !== 'TBA') {
        await logCtx.error('Provider does not support TBA auth', { provider: config.provider });
        await logCtx.failed();

        res.status(400).send({
            error: { code: 'invalid_auth_mode' }
        });

        return;
    }

    await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

    const connectionConfig = params ? getConnectionConfig(params) : {};
    const tokenUrl: string = template.token_url as string;

    if (!tokenUrl) {
        await logCtx.error('Missing token URL in provider config', { provider: config.provider });
        await logCtx.failed();

        res.status(400).send({
            error: { code: 'missing_token_url' }
        });
    }

    if (missesInterpolationParam(tokenUrl, connectionConfig)) {
        const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
        await logCtx.error(error.message, { connectionConfig });
        await logCtx.failed();

        res.status(400).send({
            error: { code: 'missing_connection_config_param', message: error.message }
        });
        return;
    }

    const tokenRequestUrl = interpolateStringFromObject(tokenUrl, {
        connectionConfig
    });

    const callbackUrl = await getOauthCallbackUrl(environment.id);

    const { nonce, timestamp } = getTbaMetaParams();

    const oauth_consumer_key = credentials?.oauth_client_id_override || config.oauth_client_id;
    const oauth_client_secret = credentials?.oauth_client_secret_override || config.oauth_client_secret;

    const oauthParams = {
        oauth_consumer_key,
        oauth_nonce: nonce,
        oauth_signature_method: SIGNATURE_METHOD,
        oauth_timestamp: timestamp,
        oauth_callback: callbackUrl
    };

    const baseString = generateBaseString({
        method: 'POST',
        url: tokenRequestUrl,
        params: oauthParams
    });

    const emptyTokenSecret = '';

    const hash = generateSignature({
        baseString,
        clientSecret: oauth_client_secret,
        tokenSecret: emptyTokenSecret
    });

    const authHeader =
        `OAuth oauth_consumer_key="${percentEncode(oauth_consumer_key)}",` +
        `oauth_nonce="${nonce}",` +
        `oauth_timestamp="${timestamp}",` +
        `oauth_signature_method="${SIGNATURE_METHOD}",` +
        `oauth_callback="${percentEncode(callbackUrl)}",` +
        `oauth_signature="${percentEncode(hash)}"`;

    const headers = {
        Authorization: authHeader
    };

    const response = await axios.post(tokenRequestUrl, null, { headers });

    const { data } = response;

    if (!data) {
        await logCtx.error('No data returned from token request');
        await logCtx.failed();

        res.status(400).send({
            error: { code: 'no_data_returned_from_token_request' }
        });

        return;
    }

    const parsedData = querystring.parse(data);
    const { oauth_token, oauth_token_secret } = parsedData;

    const authorizeTokenUrl = template.authorization_url as string;

    const fullAuthorizeTokenUrl = interpolateStringFromObject(authorizeTokenUrl, {
        connectionConfig
    });

    const session: OAuthSession = {
        providerConfigKey: providerConfigKey,
        provider: config.provider,
        connectionId: connectionId,
        callbackUrl: callbackUrl,
        authMode: template.auth_mode,
        codeVerifier: crypto.randomBytes(24).toString('hex'),
        id: uuid.v1(),
        connectionConfig: {
            ...connectionConfig,
            oauth_token: oauth_token as string,
            oauth_token_secret: oauth_token_secret as string,
            consumer_key: oauth_consumer_key,
            oauth_client_id: oauth_consumer_key,
            oauth_client_secret: oauth_client_secret,
            token_id: tokenId,
            token_secret: tokenSecret
        },
        environmentId: environment.id,
        webSocketClientId: wsClientId,
        activityLogId: logCtx.id
    };

    await oAuthSessionService.create(session);

    const redirectUrl = new URL(fullAuthorizeTokenUrl);
    redirectUrl.searchParams.append('oauth_token', oauth_token as string);
    redirectUrl.searchParams.append('state', session.id.replace(/-/g, ''));

    await logCtx.info('Redirecting', {
        authorizationUri: redirectUrl.toString(),
        providerConfigKey,
        connectionId,
        params: {
            oauth_token: oauth_token as string,
            state: session.id.replace(/-/g, '')
        },
        connectionConfig
    });

    res.redirect(redirectUrl.toString());
});
