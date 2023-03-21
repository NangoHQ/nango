import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';
import API from '../utils/api';
import Nango from '@nangohq/frontend';
import { isHosted, isStaging, baseUrl, isCloud } from '../utils/utils';
import { Prism } from '@mantine/prism';
import { HelpCircle } from '@geist-ui/icons';
import { Tooltip } from '@geist-ui/core';

interface Integration {
    uniqueKey: string;
    provider: string;
    connectionCount: number;
    creationDate: string;
}

export default function IntegrationCreate() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [integrations, setIntegrations] = useState<Integration[] | null>(null);
    const navigate = useNavigate();
    const [integrationUniqueKey, setIntegrationUniqueKey] = useState<string>('');
    const [connectionId, setConnectionId] = useState<string>('test-connection-id');
    const [connectionConfigParams, setConnectionConfigParams] = useState<string>('{ }');
    const [publicKey, setPublicKey] = useState('');

    useEffect(() => {
        const getIntegrations = async () => {
            const getIntegrations = async () => {
                let res = await API.getIntegrationList(navigate);

                if (res?.status === 200) {
                    let data = await res.json();
                    setIntegrations(data['integrations']);

                    if (data['integrations'] && data['integrations'].length > 0) {
                        setIntegrationUniqueKey(data['integrations'][0].uniqueKey);
                    }
                }
            };
            getIntegrations();

            const getAccount = async () => {
                let res = await API.getProjectInfo(navigate);

                if (res?.status === 200) {
                    const account = (await res.json())['account'];
                    setPublicKey(account.public_key);
                }
            };
            getAccount();
        };
        getIntegrations();
    }, [navigate]);

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            integration_unique_key: { value: string };
            connection_id: { value: string };
            connection_config_params: { value: string };
        };

        let nango = new Nango({ host: baseUrl(), publicKey: isCloud() ? publicKey : undefined });

        nango
            .auth(target.integration_unique_key.value, target.connection_id.value, { params: JSON.parse(target.connection_config_params.value) })
            .catch((err: { message: string; type: string }) => {
                setServerErrorMessage(`${err.type} error: ${err.message}`);
            })
            .then(() => {
                toast.success('Connection created!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate('/connections', { replace: true });
            });
    };

    const handleIntegrationUniqueKeyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setIntegrationUniqueKey(e.target.value);
    };

    const handleConnectionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setConnectionId(e.target.value);
    };

    const handleConnectionConfigParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setConnectionConfigParams(e.target.value);
    };

    const snippet = () => {
        let args = [];

        if (isStaging() || isHosted()) {
            args.push(`host: '${baseUrl()}'`);
        }

        if (isCloud() && publicKey) {
            args.push(`publicKey: '${publicKey}'`);
        }

        if (!['{', '{}', ''].includes(connectionConfigParams.replace(/ /g, ''))) {
            args.push(`config: { params: ${connectionConfigParams}}`);
        }

        let argsStr = args.length > 0 ? `{ ${args.join(', ')}}` : '';

        return `import Nango from '@nangohq/frontend';
        
let nango = new Nango(${argsStr});

nango.auth('${integrationUniqueKey}', '${connectionId}').then((result: { integrationUniqueKey: string; connectionId: string}) => {
    // do something
}).catch((err: { message: string; type: string }) => {
    // handle error
});`;
    };

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Integrations} />
                <div className="ml-60 w-full mt-14">
                    {integrations && integrations.length > 0 && (!isCloud() || publicKey) && (
                        <div className="mx-auto w-largebox pb-40">
                            <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Connection</h2>
                            <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                                <form className="space-y-6" onSubmit={handleCreate}>
                                    <div>
                                        <div>
                                            <div className="flex">
                                                <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                    Integration Unique Key
                                                </label>
                                            </div>
                                            <div className="mt-1">
                                                <select
                                                    id="integration_unique_key"
                                                    name="integration_unique_key"
                                                    className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    onChange={handleIntegrationUniqueKeyChange}
                                                >
                                                    {integrations.map((integration) => (
                                                        <option>{integration.uniqueKey}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex mt-6">
                                                <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                    Connection ID
                                                </label>
                                                <Tooltip
                                                    text={
                                                        <>
                                                            <div className="flex text-black text-sm">
                                                                <p>{`The ID you will use to retrieve the connection (most often the user ID).`}</p>
                                                            </div>
                                                        </>
                                                    }
                                                >
                                                    <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                                </Tooltip>
                                            </div>
                                            <div className="mt-1">
                                                <input
                                                    id="connection_id"
                                                    name="connection_id"
                                                    type="text"
                                                    defaultValue={connectionId}
                                                    required
                                                    className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                                    onChange={handleConnectionIdChange}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex mt-6">
                                            <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                Extra Configuration
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p className="ml-1">{`Some integrations require extra configuration (cf.`}</p>
                                                            <a
                                                                href="https://docs.nango.dev/reference/frontend-sdk#connection-config"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-text-blue hover:text-text-light-blue ml-1"
                                                            >
                                                                docs
                                                            </a>
                                                            <p>{`).`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="connection_config_params"
                                                name="connection_config_params"
                                                type="text"
                                                defaultValue={connectionConfigParams}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                                onChange={handleConnectionConfigParamsChange}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        {serverErrorMessage && <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>}
                                        <div className="flex">
                                            <button
                                                type="submit"
                                                className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black"
                                            >
                                                Start OAuth Flow
                                            </button>
                                            <label htmlFor="email" className="text-text-light-gray block text-sm pt-5 ml-4">
                                                or from your frontend:
                                            </label>
                                        </div>
                                        <div>
                                            <div className="mt-6">
                                                <Prism language="typescript" colorScheme="dark">
                                                    {snippet()}
                                                </Prism>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                    {integrations && integrations.length === 0 && (
                        <div className="mx-auto">
                            <div className="mx-16">
                                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Connection</h2>
                                <div className="text-sm w-largebox h-40">
                                    <p className="text-white text-sm">
                                        You have not created any Integrations yet. Please create an{' '}
                                        <Link to="/integrations" className="text-text-blue">
                                            Integration
                                        </Link>{' '}
                                        first to create a Connection. Follow the{' '}
                                        <a href="https://docs.nango.dev/quickstart" className="text-text-blue" target="_blank" rel="noreferrer">
                                            Quickstart
                                        </a>{' '}
                                        for more instructions.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
