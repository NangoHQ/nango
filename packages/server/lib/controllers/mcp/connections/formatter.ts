import cloneDeepWith from 'lodash-es/cloneDeepWith.js';
import isDate from 'lodash-es/isDate.js';

import type { ListedConnection } from '../../../services/connection.service.js';
import type { McpConnection } from './schema.js';

export function connectionToMcp({
    id,
    connectionId,
    integrationId,
    provider,
    createdAt,
    metadata,
    tags,
    errors,
    endUser,
    ...connection
}: ListedConnection): McpConnection {
    return {
        id,
        connection_id: connectionId,
        provider_config_key: integrationId,
        provider,
        created: createdAt.toISOString(),
        metadata,
        tags,
        errors: errors.map((error) => ({ type: error.type, log_id: error.logId })),
        end_user: endUser
            ? {
                  id: endUser.id,
                  display_name: endUser.displayName,
                  email: endUser.email,
                  tags: endUser.tags,
                  organization: endUser.organization
                      ? {
                            id: endUser.organization.id,
                            display_name: endUser.organization.displayName
                        }
                      : null
              }
            : null,
        ...('credentials' in connection
            ? {
                  credentials: cloneDeepWith(connection.credentials, (value) => {
                      if (isDate(value)) {
                          return value.toISOString();
                      }
                      return undefined;
                  }) as McpConnection['credentials']
              }
            : {})
    };
}
