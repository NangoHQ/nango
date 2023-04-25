import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Prism } from '@mantine/prism';
import { toast } from 'react-toastify';
import { RefreshCw } from '@geist-ui/icons';

import { useGetConnectionDetailsAPI, useDeleteConnectionAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import SecretInput from '../components/ui/SecretInput';
import PrismPlus from '../components/ui/prism/PrismPlus';
import Button from '../components/ui/button/Button';
import Typography from '../components/ui/typography/Typography';

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
    const [loaded, setLoaded] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [connection, setConnection] = useState<Connection | null>(null);
    const navigate = useNavigate();
    const getConnectionDetailsAPI = useGetConnectionDetailsAPI();
    const deleteConnectionAPI = useDeleteConnectionAPI();
    const { connectionId, providerConfigKey } = useParams();

    useEffect(() => {
        if (!connectionId || !providerConfigKey) return;

        const getConnections = async () => {
            let res = await getConnectionDetailsAPI(connectionId, providerConfigKey);

            if (res?.status === 200) {
                let data = await res.json();
                setConnection(data['connection']);
            } else if (res != null) {
                setServerErrorMessage(`
We could not retrieve and/or refresh your access token due to the following error: 
\n\n${(await res.json()).error}
`);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [connectionId, providerConfigKey, getConnectionDetailsAPI, loaded, setLoaded]);

    const deleteButtonClicked = async () => {
        if (!connectionId || !providerConfigKey) return;

        let res = await deleteConnectionAPI(connectionId, providerConfigKey);

        if (res?.status === 200) {
            toast.success('Connection deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/connections', { replace: true });
        }
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="mx-auto w-largebox">
                <div className="mx-16 pb-40">
                    <div className="flex mt-16 mb-12 justify-between">
                        <Typography
                            tooltipProps={{
                                text: (
                                    <>
                                        <div className="flex text-black text-sm">
                                            <p>{`Stores the OAuth credentials & details. You can fetch it with the `}</p>
                                            <a
                                                href="https://docs.nango.dev/reference/connections-api"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-text-blue hover:text-text-light-blue ml-1"
                                            >
                                                API
                                            </a>
                                            <p className="ml-1">{` and `}</p>
                                            <a
                                                href="https://docs.nango.dev/reference/node-sdk"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-text-blue hover:text-text-light-blue ml-1"
                                            >
                                                Node SDK
                                            </a>
                                            <p>{`.`}</p>
                                        </div>
                                    </>
                                )
                            }}
                        >
                            Connection
                        </Typography>
                        <Button iconProps={{ Icon: <RefreshCw className="h-5 w-5" />, position: 'start' }}>Manually Refresh Token</Button>
                    </div>
                    <div className="border border-border-gray rounded-md h-fit py-14 text-white text-sm">
                        <div>
                            <div className="mx-8">
                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                    Connection ID
                                </label>
                                <Prism language="bash" colorScheme="dark">
                                    {connectionId || ''}
                                </Prism>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                    Integration Unique Key
                                </label>
                                <Prism language="bash" colorScheme="dark">
                                    {providerConfigKey || ''}
                                </Prism>
                            </div>
                        </div>
                        {connection && (
                            <div>
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
                                            Integration Template
                                        </label>
                                        <div className="mt-3 mb-5 flex">
                                            <img src={`images/template-logos/${connection.provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                            <p className="">{`${connection.provider}`}</p>
                                        </div>
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

                                            <SecretInput disabled defaultValue={connection.accessToken} copy={true} />
                                        </div>
                                    </div>
                                )}
                                {connection.expiresAt && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                Access Token Expiration
                                            </label>
                                            <p className="mt-3 mb-5">{new Date(connection.expiresAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}
                                {connection.refreshToken && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                Refresh Token
                                            </label>
                                            <SecretInput disabled defaultValue={connection.refreshToken} copy={true} />
                                        </div>
                                    </div>
                                )}
                                {connection.oauthToken && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                OAuth Token
                                            </label>
                                            <SecretInput disabled defaultValue={connection.oauthToken} copy={true} />
                                        </div>
                                    </div>
                                )}
                                {connection.oauthTokenSecret && (
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                OAuth Token Secret
                                            </label>
                                            <SecretInput disabled defaultValue={connection.oauthTokenSecret} copy={true} />
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection Configuration
                                        </label>
                                        <Prism language="json" colorScheme="dark">
                                            {JSON.stringify(connection.connectionConfig, null, 4) || '{}'}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection Metadata
                                        </label>
                                        <Prism language="json" colorScheme="dark">
                                            {JSON.stringify(connection.connectionMetadata, null, 4) || '{}'}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Raw Token Response
                                        </label>
                                        <PrismPlus language="json" colorScheme="dark">
                                            {JSON.stringify(connection.rawCredentials, null, 4) || '{}'}
                                        </PrismPlus>
                                    </div>
                                </div>
                            </div>
                        )}
                        {serverErrorMessage && (
                            <div className="mx-8 mt-8">
                                <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>
                            </div>
                        )}

                        <button
                            className="mx-8 mt-8 flex h-8 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white hover:bg-red-400 bg-red-600"
                            onClick={deleteButtonClicked}
                        >
                            <p>Delete</p>
                        </button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
