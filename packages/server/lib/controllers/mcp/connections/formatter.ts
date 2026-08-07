import cloneDeepWith from 'lodash-es/cloneDeepWith.js';
import isDate from 'lodash-es/isDate.js';

import type { McpConnection } from './schema.js';
import type { ListedConnection } from '@nangohq/shared';

export function connectionToMcp({ connection, provider, active_logs, end_user }: ListedConnection): McpConnection {
    return {
        id: connection.id,
        connection_id: connection.connection_id,
        provider_config_key: connection.provider_config_key,
        provider,
        created: new Date(connection.created_at).toISOString(),
        metadata: connection.metadata,
        tags: connection.tags,
        errors: active_logs,
        end_user: end_user
            ? {
                  id: end_user.end_user_id,
                  display_name: end_user.display_name,
                  email: end_user.email,
                  tags: end_user.tags,
                  organization: end_user.organization_id
                      ? {
                            id: end_user.organization_id,
                            display_name: end_user.organization_display_name
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
