import db from '@nangohq/database';
import * as endUserService from '@nangohq/shared';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetConnectSession } from '@nangohq/types';
import { connectUISettingsService } from '@nangohq/shared';

export const getConnectSession = asyncWrapper<GetConnectSession>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { connectSession, account, environment } = res.locals;

    const getEndUser = await endUserService.getEndUser(db.knex, {
        id: connectSession.endUserId,
        accountId: account.id,
        environmentId: environment.id
    });

    if (getEndUser.isErr()) {
        res.status(404).send({
            error: {
                code: 'not_found',
                message: 'End user not found'
            }
        });
        return;
    }
    const endUser = getEndUser.value;
    const response: GetConnectSession['Success'] = {
        data: {
            end_user: {
                id: endUser.endUserId
            }
        }
    };
    if (endUser.displayName) {
        response.data.end_user.display_name = endUser.displayName;
    }
    if (endUser.email) {
        response.data.end_user.email = endUser.email;
    }
    if (endUser.organization) {
        response.data.organization = {
            id: endUser.organization.organizationId
        };
        if (endUser.organization.displayName) {
            response.data.organization.display_name = endUser.organization.displayName;
        }
    }
    if (connectSession.allowedIntegrations) {
        response.data.allowed_integrations = connectSession.allowedIntegrations;
    }
    if (connectSession.integrationsConfigDefaults) {
        response.data.integrations_config_defaults = Object.fromEntries(
            Object.entries(connectSession.integrationsConfigDefaults).map(([key, value]) => [
                key,
                {
                    connection_config: value.connectionConfig,
                    // For debugging reason, it's enforced in the backend
                    authorization_params: value.authorization_params
                }
            ])
        );
    }

    if (connectSession.connectionId) {
        response.data.isReconnecting = true;
    }

    const connectUISettings = await connectUISettingsService.getConnectUISettings(environment.id);
    if (connectUISettings) {
        response.data.connectui_settings = {
            nangoWatermark: connectUISettings.nango_watermark,
            colors: {
                primary: connectUISettings.color_primary,
                onPrimary: connectUISettings.color_on_primary,
                background: connectUISettings.color_background,
                surface: connectUISettings.color_surface,
                text: connectUISettings.color_text,
                textMuted: connectUISettings.color_text_muted
            }
        };
    }

    res.status(200).send(response);
});
