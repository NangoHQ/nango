import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthCredentials } from './AuthCredentials';
import { ConnectionConfiguration } from './ConnectionConfiguration';
import { KeyValueBadge } from '@/components-v2/KeyValueBadge';

import type { GetConnection } from '@nangohq/types';

export const AuthTab = ({ connectionData }: { connectionData: GetConnection['Success']['data'] }) => {
    const credentials = connectionData.connection.credentials;
    const connection = connectionData.connection;

    return (
        <div className="flex flex-col gap-8">
            {/* Tags */}
            {connection.tags && (
                <div className="flex flex-col gap-2">
                    <div className="inline-flex gap-1 items-center">
                        <span className="text-body-medium-medium text-text-primary">Tags</span>
                        <Link to="https://nango.dev/docs" target="_blank">
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

            <AuthCredentials credentials={credentials} />
            <ConnectionConfiguration
                config={connection.connection_config}
                metadata={connection.metadata}
                rawTokenResponse={'raw' in credentials ? credentials.raw : null}
            />
        </div>
    );
};
