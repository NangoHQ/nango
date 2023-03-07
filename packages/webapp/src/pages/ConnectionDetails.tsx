import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Prism } from '@mantine/prism';
import API from '../utils/api';

interface Connection {
    id: number;
    connectionId: string;
    provider: string;
    providerConfigKey: number;
    creationDate: string;
    oauthType: string;
    connectionConfig: Record<string, string>;
    connectionMetadata: Record<string, string>;
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
    oauthToken: string | null;
    oauthTokenSecret: string | null;
    rawCredentials: object;
}

export default function ConnectionDetails() {
    const [connection, setConnection] = useState<Connection | null>(null);
    const navigate = useNavigate();

    const { connectionId, providerConfigKey } = useParams();

    useEffect(() => {
        if (!connectionId || !providerConfigKey) return;

        const getConnections = async () => {
            let res = await API.getConnectionDetails(connectionId, providerConfigKey, navigate);

            if (res?.status === 200) {
                let data = await res.json();
                setConnection(data['connection']);
            }
        };
        getConnections();
    }, [navigate, connectionId, providerConfigKey]);

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Connections} />
                {connection && (
                    <div className="mx-auto mt-14 w-largebox">
                        <div className="mx-16 pb-40">
                            <div className="flex justify-between">
                                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Connection</h2>
                            </div>
                            <div className="border border-border-gray rounded-md h-fit py-14 text-white text-sm">
                                <div>
                                    <div className="mx-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection ID
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {connection.connectionId}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Creation Date
                                        </label>
                                        <p className="mt-3 mb-5">{new Date(connection.creationDate).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Provider Configuration Unique Key
                                        </label>
                                        <p className="mt-3 mb-5">{`${connection.providerConfigKey}`}</p>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Provider Template
                                        </label>
                                        <p className="mt-3 mb-5">{`${connection.provider}`}</p>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            OAuth Type
                                        </label>
                                        <p className="mt-3 mb-5">{connection.oauthType}</p>
                                    </div>
                                </div>
                                {connection.accessToken && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                Access Token
                                            </label>
                                            <Prism language="bash" colorScheme="dark">
                                                {connection.accessToken}
                                            </Prism>
                                        </div>
                                    </div>
                                )}
                                {connection.expiresAt && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                Access Token
                                            </label>
                                            <p className="mt-3 mb-5">{connection.expiresAt}</p>
                                        </div>
                                    </div>
                                )}
                                {connection.refreshToken && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                Access Token
                                            </label>
                                            <Prism language="bash" colorScheme="dark">
                                                {connection.refreshToken}
                                            </Prism>
                                        </div>
                                    </div>
                                )}
                                {connection.oauthToken && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                OAuth Token
                                            </label>
                                            <Prism language="bash" colorScheme="dark">
                                                {connection.oauthToken}
                                            </Prism>
                                        </div>
                                    </div>
                                )}
                                {connection.oauthTokenSecret && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                OAuth Token Secret
                                            </label>
                                            <Prism language="bash" colorScheme="dark">
                                                {connection.oauthTokenSecret}
                                            </Prism>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection Configuration
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {JSON.stringify(connection.connectionConfig, null, 4) || '{}'}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection Metadata
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {JSON.stringify(connection.connectionMetadata, null, 4) || '{}'}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Raw Token Response
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {JSON.stringify(connection.rawCredentials, null, 4) || '{}'}
                                        </Prism>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
