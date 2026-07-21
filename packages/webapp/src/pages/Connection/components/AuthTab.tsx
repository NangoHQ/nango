import { ArrowUpRight, Info } from 'lucide-react';

import { Alert, AlertActions, AlertButtonLink, AlertDescription } from '@/components/ui/Alert';
import { useConnectionContext } from '@/pages/Connection/Show';
import { useStore } from '@/store';
import { getLogsUrl } from '@/utils/logs';
import { AuthCredentials } from './AuthCredentials/AuthCredentials';
import { ConnectionExtras } from './ConnectionExtras';
import { ConnectionTabLayout } from './ConnectionTabLayout';
import { EditableConnectionTags } from './EditableConnectionTags';
import { ReconnectPanel } from './ReconnectPanel';

export const AuthTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, providerConfigKey } = useConnectionContext();

    const { connection, errorLog } = connectionData;
    const { credentials } = connection;

    return (
        <ConnectionTabLayout connectionData={connectionData}>
            <div className="flex flex-col gap-8 w-full max-w-2xl">
                <ReconnectPanel />

                {errorLog && (
                    <Alert variant="error">
                        <Info />
                        <AlertDescription>
                            {credentials.type === 'BASIC' || credentials.type === 'API_KEY'
                                ? "Nango couldn't automatically verify these credentials. Reconnect above to restore this connection."
                                : "Nango couldn't automatically refresh these credentials. Reconnect above to restore this connection."}
                        </AlertDescription>
                        <AlertActions>
                            <AlertButtonLink
                                to={getLogsUrl({ env, operationId: errorLog.log_id, connections: connection.connection_id, day: errorLog.created_at })}
                                variant="error"
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
