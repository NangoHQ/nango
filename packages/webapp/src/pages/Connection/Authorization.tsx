import { useState } from 'react';
import { Prism } from '@mantine/prism';
import { Loading } from '@geist-ui/core';

import PrismPlus from '../../components/ui/prism/PrismPlus';
import { Connection, AuthModes } from '../../types';
import { formatDateToShortUSFormat } from '../../utils/utils';
import SecretInput from '../../components/ui/input/SecretInput';
import CopyButton from '../../components/ui/button/CopyButton';

interface AuthorizationProps {
    connection: Connection | null;
    forceRefresh: () => void;
    loaded: boolean;
    syncLoaded: boolean;
}

export default function Authorization(props: AuthorizationProps) {
    const { connection, forceRefresh, loaded } = props;
    const [refreshing, setRefreshing] = useState(false);

    const handleForceRefresh = async () => {
        setRefreshing(true);
        await forceRefresh();
        setRefreshing(false);
    };

    if (!loaded) return <Loading spaceRatio={2.5} className="top-24" />;

    return (
        <div className="mx-auto space-y-12 text-sm w-[976px]">
            <div className="flex">
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-1">Connection ID</span>
                    <div className="flex items-center gap-2">
                        <span className="text-white">{connection?.connectionId}</span>
                        <CopyButton text={connection?.connectionId as string} dark />
                    </div>
                </div>
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-1">Creation Date</span>
                    <span className="text-white">{formatDateToShortUSFormat(connection?.creationDate as string)}</span>
                </div>
            </div>
            <div className="flex">
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-2">Auth Type</span>
                    <span className="text-white">{connection?.oauthType}</span>
                </div>
                {connection?.oauthType === AuthModes.ApiKey && (
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">{connection?.oauthType}</span>
                        <SecretInput disabled defaultValue={connection?.credentials?.apiKey} copy={true} />
                    </div>
                )}
                {connection?.expiresAt && (
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Access Token Expiration</span>
                        <span className="text-white">{new Date(connection.expiresAt).toLocaleString()}</span>
                    </div>
                )}
            </div>
            {connection?.credentials && connection?.oauthType === AuthModes.Basic && (
                <div className="flex">
                    {connection?.credentials.username && (
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-2">Username</span>
                            <span className="text-white">{connection?.credentials.username}</span>
                        </div>
                    )}
                    {connection?.credentials.password && (
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Password</span>
                            <SecretInput disabled defaultValue={connection?.credentials?.password} copy={true} />
                        </div>
                    )}
                </div>
            )}
            {connection?.accessToken && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Access Token</span>
                    <SecretInput disabled value={refreshing ? 'Refreshing...' : connection.accessToken} copy={true} refresh={handleForceRefresh} />
                </div>
            )}
            {connection?.oauthToken && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">OAuth Token</span>
                    <SecretInput disabled defaultValue={connection?.oauthToken} copy={true} />
                </div>
            )}
            {connection?.oauthTokenSecret && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">OAuth Token Secret</span>
                    <SecretInput disabled defaultValue={connection?.oauthTokenSecret} copy={true} />
                </div>
            )}
            {connection?.refreshToken && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Refresh Token</span>
                    <SecretInput disabled value={refreshing ? 'Refreshing...' : connection.refreshToken} copy={true} refresh={handleForceRefresh} />
                </div>
            )}
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Configuration</span>
                <Prism language="json" colorScheme="dark">
                    {JSON.stringify(connection?.connectionConfig, null, 4) || '{}'}
                </Prism>
            </div>
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Metadata</span>
                <Prism language="json" colorScheme="dark">
                    {JSON.stringify(connection?.connectionMetadata, null, 4) || '{}'}
                </Prism>
            </div>
            {(connection?.oauthType === AuthModes.OAuth1 ||
                connection?.oauthType === AuthModes.OAuth2 ||
                connection?.oauthType === AuthModes.App ||
                connection?.oauthType === AuthModes.Custom) && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-2">Raw Token Response</span>
                    <PrismPlus language="json" colorScheme="dark">
                        {JSON.stringify(connection?.rawCredentials, null, 4) || '{}'}
                    </PrismPlus>
                </div>
            )}
        </div>
    );
}
