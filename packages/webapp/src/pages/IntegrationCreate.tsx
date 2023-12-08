import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';

import {
    useGetIntegrationDetailsAPI,
    useGetProvidersAPI,
    useGetProjectInfoAPI,
    useEditIntegrationAPI,
    useCreateIntegrationAPI,
    useDeleteIntegrationAPI
} from '../utils/api';
import AlertOverLay from '../components/AlertOverLay';
import { HelpCircle } from '@geist-ui/icons';
import { Tooltip } from '@geist-ui/core';
import { defaultCallback } from '../utils/utils';
import { Prism } from '@mantine/prism';
import { LeftNavBarItems } from '../components/LeftNavBar';
import DashboardLayout from '../layout/DashboardLayout';
import SecretInput from '../components/ui/input/SecretInput';
import SecretTextArea from '../components/ui/input/SecretTextArea';
import TagsInput from '../components/ui/input/TagsInput';
import Info from '../components/ui/Info'
import { AuthModes } from '../types';

interface Integration {
    unique_key: string;
    provider: string;
    client_id: string;
    client_secret: string;
    app_link?: string;
    scopes: string;
}

interface Providers {
    name: string;
    defaultScopes: string[];
    authMode: AuthModes;
}

export default function IntegrationCreate() {
    const [loaded, setLoaded] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [providers, setProviders] = useState<Providers[] | null>(null);
    const [integration, setIntegration] = useState<Integration | null>(null);
    const [deleteAlertState, setDeleteAlertState] = useState<boolean>(false);
    const navigate = useNavigate();
    const { providerConfigKey } = useParams();
    const [templateLogo, setTemplateLogo] = useState<string>('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [webhookReceiveUrl, setWebhookReceiveUrl] = useState('');
    const [hasWebhook, setHasWebhook] = useState(false);
    const getIntegrationDetailsAPI = useGetIntegrationDetailsAPI();
    const getProvidersAPI = useGetProvidersAPI();
    const getProjectInfoAPI = useGetProjectInfoAPI();
    const editIntegrationAPI = useEditIntegrationAPI();
    const createIntegrationAPI = useCreateIntegrationAPI();
    const deleteIntegrationAPI = useDeleteIntegrationAPI();
    const [selectedProvider, setSelectedProvider] = useState<string>('my-integration');
    const [providerDefaultScope, setProviderDefaultScope] = useState<string>('');
    const [authMode, setAuthMode] = useState<AuthModes>(AuthModes.OAuth2);

    useEffect(() => {
        const getProviders = async () => {
            if (providerConfigKey) {
                let res = await getIntegrationDetailsAPI(providerConfigKey);
                if (res?.status === 200) {
                    const data = await res.json();
                    setIntegration(data['config']);
                    const currentIntegration = data['config'];
                    if (currentIntegration['auth_mode']) {
                        setAuthMode(currentIntegration['auth_mode']);
                    }
                    setHasWebhook(currentIntegration['has_webhook']);
                }
            } else {
                let res = await getProvidersAPI();

                if (res?.status === 200) {
                    let data = await res.json();
                    setProviders(data);
                    setSelectedProvider(data[0].name);
                    setProviderDefaultScope(data[0].defaultScopes?.join(',') ?? '');
                    setAuthMode(data[0].authMode);
                }
            }
        };

        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setCallbackUrl(account.callback_url || defaultCallback());
                setWebhookReceiveUrl(account.webhook_receive_url);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getProviders();
            getAccount();
        }
    }, [providerConfigKey, getIntegrationDetailsAPI, getProvidersAPI, getProjectInfoAPI, loaded, setLoaded]);

    const handleIntegrationProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        let [provider, defaultScope, authMode] = e.target.value.split('|');
        setSelectedProvider(provider);
        setProviderDefaultScope(defaultScope ?? '');
        setAuthMode(authMode as AuthModes);
    };

    const handleSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        if (providerConfigKey) {
            if (!integration) {
                return;
            }

            const target = e.target as typeof e.target & {
                client_id: { value: string };
                client_secret: { value: string };
                scopes: { value: string };
                app_link: { value: string };
            };

            let res = await editIntegrationAPI(
                integration.provider,
                authMode,
                providerConfigKey,
                target.client_id?.value,
                target.client_secret?.value,
                target.scopes?.value,
                target.app_link?.value
            );

            if (res?.status === 200) {
                toast.success('Integration updated!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate('/integrations', { replace: true });
            }
        } else {
            const target = e.target as typeof e.target & {
                provider: { value: string };
                unique_key: { value: string };
                client_id: { value: string };
                client_secret: { value: string };
                scopes: { value: string };
                app_link: { value: string };
            };
            const [provider] = target.provider.value.split('|');
            const res = await createIntegrationAPI(provider, authMode, target.unique_key?.value, target.client_id?.value, target.client_secret?.value, target.scopes?.value, target.app_link?.value);

            if (res?.status === 200) {
                toast.success('Integration created!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate('/integrations', { replace: true });
            } else if (res != null) {
                let payload = await res.json();
                toast.error(payload.type === 'duplicate_provider_config' ? 'Unique Key already exists.' : payload.error, {
                    position: toast.POSITION.BOTTOM_CENTER
                });
            }
        }
    };

    const deleteButtonClicked = async () => {
        setDeleteAlertState(true);
    };

    const acceptDeleteButtonClicked = async () => {
        if (!providerConfigKey) return;

        let res = await deleteIntegrationAPI(providerConfigKey);

        if (res?.status === 204) {
            toast.success('Integration deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/integrations', { replace: true });
        }
    };

    const rejectDeleteButtonClicked = () => {
        setDeleteAlertState(false);
    };

    if (integration != null && templateLogo === '') {
        setTemplateLogo(`images/template-logos/${integration.provider}.svg`);
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            {deleteAlertState && (
                <AlertOverLay
                    message={'Deleting an integration will also permanently delete all associated connections. Are you sure you want to delete it?'}
                    title={`Delete ${providerConfigKey}!`}
                    onAccept={acceptDeleteButtonClicked}
                    onCancel={rejectDeleteButtonClicked}
                />
            )}
            {(providers || integration) && (
                <div className="mx-auto w-largebox pb-40">
                    <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">
                      {providerConfigKey && integration
                        ? 'Update Integration'
                        : 'Add New Integration'}
                    </h2>
                    <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                        <form className="space-y-6" onSubmit={handleSave} autoComplete="one-time-code">
                            <input type="text" className="hidden" name="username" autoComplete="username" />
                            <input type="password" className="hidden" name="password" autoComplete="password"/>
                            {!providerConfigKey && providers && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="provider" className="text-text-light-gray block text-sm font-semibold">
                                                Integration Provider
                                            </label>
                                        </div>
                                        <div className="mt-1">
                                            <select
                                                id="provider"
                                                name="provider"
                                                className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                onChange={handleIntegrationProviderChange}
                                            >
                                                {providers.map((provider, key) => (
                                                    <option key={key} value={`${provider.name}|${provider.defaultScopes?.join(',') ?? ''}|${provider.authMode}`}>
                                                        {provider.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex mt-6">
                                            <label htmlFor="unique_key" className="text-text-light-gray block text-sm font-semibold">
                                                Integration Unique Key
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Choose a unique key for your integration. It can be the same as the Integration Provider (e.g. 'github').`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>

                                        <div className="mt-1" key={selectedProvider}>
                                            <input
                                                id="unique_key"
                                                name="unique_key"
                                                type="text"
                                                autoComplete="new-password"
                                                required
                                                defaultValue={selectedProvider}
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {providerConfigKey && integration && (
                                <div>
                                    <div className="">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            API Configuration
                                        </label>
                                        <div className="mt-3 mb-5 flex">
                                            {/* <img src={templateLogo} /> */}
                                            <p className="">{`${integration.provider}`}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Integration Unique Key
                                        </label>
                                        <p className="mt-3 mb-5">{`${providerConfigKey}`}</p>
                                    </div>
                                </div>
                            )}

                            {(authMode === AuthModes.Basic || authMode === AuthModes.ApiKey) && !providerConfigKey && (
                                <Info size={20}>
                                    The "{selectedProvider}" integration provider uses {authMode === AuthModes.Basic ? 'basic auth' : 'API Keys'} for authentication (<a href="https://docs.nango.dev/guides/oauth#connection-configuration" className="text-white underline hover:text-text-light-blue" rel="noreferrer" target="_blank">docs</a>).
                                </Info>
                            )}

                            {authMode === AuthModes.App && (
                                <>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                App ID
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Obtain the app id from the from the app page.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="app_id"
                                                name="client_id"
                                                type="text"
                                                defaultValue={integration ? integration.client_id : ''}
                                                autoComplete="new-password"
                                                required
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex">
                                            <label htmlFor="app_public_link" className="text-text-light-gray block text-sm font-semibold">
                                                App Public Link
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Obtain the app public link from the app page.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="app_link"
                                                name="app_link"
                                                type="text"
                                                defaultValue={integration ? integration.app_link : ''}
                                                autoComplete="new-password"
                                                required
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex">
                                            <label htmlFor="client_secret" className="text-text-light-gray block text-sm font-semibold">
                                                App Private Key
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Obtain the app private key from the from the app page by downloading the private key and pasting the entirety of its contents here.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <SecretTextArea
                                                copy={true}
                                                id="client_secret"
                                                name="client_secret"
                                                defaultValue={integration ? integration.client_secret : ''}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div>
                                            <div className="flex">
                                                <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                    Setup URL
                                                </label>
                                                <Tooltip
                                                    text={
                                                        <>
                                                            <div className="flex text-black text-sm">
                                                                <p>{`Register this setup URL on the app settings page in the "Post Installation section". Check "Redirect on update" as well.`}</p>
                                                            </div>
                                                        </>
                                                    }
                                                >
                                                    <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                                </Tooltip>
                                            </div>
                                            <Prism language="bash" colorScheme="dark">
                                                {callbackUrl.replace('oauth/callback', 'app-auth/connect')}
                                            </Prism>
                                        </div>
                                    </div>
                                </>
                            )}
                            {(authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2) && (
                                <>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                Client ID
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Obtain the Client ID on the developer portal of the Integration Provider.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="client_id"
                                                name="client_id"
                                                type="text"
                                                defaultValue={integration ? integration.client_id : ''}
                                                autoComplete="one-time-code"
                                                required
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex">
                                            <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                Client Secret
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`Obtain the Client Secret on the developer portal of the Integration Provider.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <SecretInput
                                                copy={true}
                                                id="client_secret"
                                                name="client_secret"
                                                autoComplete="one-time-code"
                                                defaultValue={integration ? integration.client_secret : ''}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex">
                                            <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                Scopes
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            <p>{`The list of scope should be found in the documentation of the external provider.`}</p>
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        <div className="mt-1">
                                            <TagsInput
                                                id="scopes"
                                                name="scopes"
                                                type="text"
                                                defaultValue={integration ? integration.scopes : providerDefaultScope}
                                                minLength={1}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div>
                                            <div className="flex">
                                                <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                    Callback URL
                                                </label>
                                                <Tooltip
                                                    text={
                                                        <>
                                                            <div className="flex text-black text-sm">
                                                                <p>{`Register this callback URL on the developer portal of the Integration Provider.`}</p>
                                                            </div>
                                                        </>
                                                    }
                                                >
                                                    <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                                </Tooltip>
                                            </div>
                                            <Prism language="bash" colorScheme="dark">
                                                {callbackUrl}
                                            </Prism>
                                        </div>
                                    </div>
                                    {providerConfigKey && hasWebhook && (
                                        <div>
                                            <div>
                                                <div className="flex">
                                                    <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                                        Webhook Receive URL
                                                    </label>
                                                    <Tooltip
                                                        text={
                                                            <>
                                                                <div className="flex text-black text-sm">
                                                                    <p>{`Register this webhook URL on the developer portal of the Integration Provider to receive incoming webhooks.`}</p>
                                                                </div>
                                                            </>
                                                        }
                                                    >
                                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                                    </Tooltip>
                                                </div>
                                                <Prism language="bash" colorScheme="dark">
                                                    {`${webhookReceiveUrl}/${providerConfigKey}`}
                                                </Prism>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <div>
                                <div className="flex justify-between">
                                    {((!providerConfigKey && !integration) || (authMode !== AuthModes.Basic && authMode !== AuthModes.ApiKey)) && (
                                        <button type="submit" className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                                            Save
                                        </button>
                                    )}
                                    {providerConfigKey && integration && (
                                        <button
                                            type="button"
                                            className="mt-4 flex h-8 rounded-md pl-3 pr-3 pt-1.5 text-sm text-white hover:bg-red-400 bg-red-600"
                                            onClick={deleteButtonClicked}
                                        >
                                            <p>Delete</p>
                                        </button>
                                    )}
                                </div>
                                {serverErrorMessage && <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
