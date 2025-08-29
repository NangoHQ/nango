import db from '@nangohq/database';
import * as endUserService from '@nangohq/shared';
import { connectUISettingsService } from '@nangohq/shared';
import { report, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetConnectSession } from '@nangohq/types';

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

    const connectUISettingsResult = await connectUISettingsService.getConnectUISettings(db.knex, environment.id);
    if (connectUISettingsResult.isErr()) {
        // Not critical - report, but don't fail
        report(connectUISettingsResult.error);
    }

    let connectUISettings = connectUISettingsService.defaultConnectUISettings;
    if (connectUISettingsResult.isOk() && connectUISettingsResult.value) {
        connectUISettings = connectUISettingsResult.value;
    }

    const response: GetConnectSession['Success'] = {
        data: {
            end_user: {
                id: endUser.endUserId
            },
            connectUISettings
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
    if (connectSession.overrides) {
        response.data.overrides = connectSession.overrides;
    }

    res.status(200).send(response);
});
