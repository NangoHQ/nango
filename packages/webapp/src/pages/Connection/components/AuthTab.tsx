import { ArrowUpRight, Info } from 'lucide-react';

import { Alert, AlertActions, AlertDescription } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { useConnectionContext } from '@/pages/Connection/Show';
import { useStore } from '@/store';
import { getLogsUrl } from '@/utils/logs';
import { AuthCredentials } from './AuthCredentials/AuthCredentials';
import { ConnectionExtras } from './ConnectionExtras';
import { ConnectionTabLayout } from './ConnectionTabLayout';
import { EditableConnectionTags } from './EditableConnectionTags';

export const AuthTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, providerConfigKey } = useConnectionContext();

    const { connection, errorLog } = connectionData;
    const { credentials } = connection;

    return (
        <ConnectionTabLayout connectionData={connectionData}>
            <div className="flex flex-col gap-8 w-full max-w-2xl">
                {errorLog && (
                    <Alert variant="danger">
                        <Info />
                        <AlertDescription>
                            {credentials.type === 'BASIC' || credentials.type === 'API_KEY'
                                ? 'There was an error while testing credentials validity.'
                                : 'There was an error refreshing the credentials.'}
                        </AlertDescription>
                        <AlertActions>
                            <AlertButtonLink
                                to={getLogsUrl({ env, operationId: errorLog.log_id, connections: connection.connection_id, day: errorLog.created_at })}
                            >
                                View log <ArrowUpRight />
                            </AlertButtonLink>
                        </AlertActions>
                    </Alert>
                )}

                <EditableConnectionTags connectionId={connection.connection_id} providerConfigKey={providerConfigKey} tags={connection.tags} />

                <AuthCredentials connection={connection} providerConfigKey={providerConfigKey} />
                <ConnectionExtras
                    connectionId={connection.connection_id}
                    providerConfigKey={providerConfigKey}
                    config={connection.connection_config}
                    metadata={connection.metadata}
                    rawTokenResponse={'raw' in credentials ? credentials.raw : null}
                />
            </div>
        </ConnectionTabLayout>
    );
};
