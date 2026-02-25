import { ArrowUpRight, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthCredentials } from './AuthCredentials/AuthCredentials';
import { ConnectionExtras } from './ConnectionExtras';
import { ConnectionSideInfo } from './ConnectionSideInfo';
import { KeyValueBadge } from '@/components-v2/KeyValueBadge';
import { Alert, AlertActions, AlertButtonLink, AlertDescription } from '@/components-v2/ui/alert';
import { useStore } from '@/store';
import { getLogsUrl } from '@/utils/logs';

import type { GetConnection } from '@nangohq/types';

export const AuthTab = ({ connectionData, providerConfigKey }: { connectionData: GetConnection['Success']['data']; providerConfigKey: string }) => {
    const env = useStore((state) => state.env);
    const { connection, errorLog } = connectionData;
    const { credentials } = connection;

    return (
        <div className="flex w-full gap-11 justify-between">
            <div className="flex flex-col gap-8 max-w-2xl">
                {errorLog && (
                    <Alert variant="destructive">
                        <Info />
                        <AlertDescription>
                            {credentials.type === 'BASIC' || credentials.type === 'API_KEY'
                                ? 'There was an error while testing credentials validity.'
                                : 'There was an error refreshing the credentials.'}
                        </AlertDescription>
                        <AlertActions>
                            <AlertButtonLink
                                to={getLogsUrl({ env, operationId: errorLog.log_id, connections: connection.connection_id, day: errorLog.created_at })}
                                variant="destructive"
                            >
                                View log <ArrowUpRight />
                            </AlertButtonLink>
                        </AlertActions>
                    </Alert>
                )}

                {/* Tags */}
                {Object.keys(connection.tags).length > 0 && (
                    <div className="flex flex-col gap-2">
                        <div className="inline-flex gap-1 items-center">
                            <span className="text-body-medium-medium text-text-primary">Tags</span>
                            <Link to="https://nango.dev/docs/implementation-guides/platform/auth/connection-tags#connection-tags" target="_blank">
                                <ExternalLink className="size-3 text-icon-tertiary" />
                            </Link>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {Object.entries(connection.tags).map(([key, value]) => (
                                <KeyValueBadge label={key} key={key} variant="lighter">
                                    {value}
                                </KeyValueBadge>
                            ))}
                        </div>
                    </div>
                )}

                <AuthCredentials connection={connection} providerConfigKey={providerConfigKey} />
                <ConnectionExtras
                    config={connection.connection_config}
                    metadata={connection.metadata}
                    rawTokenResponse={'raw' in credentials ? credentials.raw : null}
                />
            </div>

            <ConnectionSideInfo connectionData={connectionData} />
        </div>
    );
};
