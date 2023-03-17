import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';
import API from '../utils/api';

interface Integration {
    uniqueKey: string;
    provider: string;
    clientId: string;
    clientSecret: string;
    scopes: string;
}

export default function IntegrationCreate() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [providers, setProviders] = useState<string[] | null>(null);
    const [integration, setIntegration] = useState<Integration | null>(null);
    const navigate = useNavigate();
    const { providerConfigKey } = useParams();

    useEffect(() => {
        const getProviders = async () => {
            if (providerConfigKey) {
                // Edit integration.

                let res = await API.getIntegrationDetails(providerConfigKey, navigate);

                if (res?.status === 200) {
                    let data = await res.json();
                    setIntegration(data['integration']);
                }
            } else {
                // Create integration
                let res = await API.getProviders(navigate);

                if (res?.status === 200) {
                    let data = await res.json();
                    setProviders(data['providers']);
                }
            }
        };
        getProviders();
    }, [navigate, providerConfigKey]);

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
            };

            let res = await API.editIntegration(
                integration.provider,
                providerConfigKey,
                target.client_id.value,
                target.client_secret.value,
                target.scopes.value,
                navigate
            );

            if (res?.status === 200) {
                toast.success('Integration updated!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate('/integration', { replace: true });
            }
        } else {
            const target = e.target as typeof e.target & {
                provider: { value: string };
                unique_key: { value: string };
                client_id: { value: string };
                client_secret: { value: string };
                scopes: { value: string };
            };

            let res = await API.createIntegration(
                target.provider.value,
                target.unique_key.value,
                target.client_id.value,
                target.client_secret.value,
                target.scopes.value,
                navigate
            );

            if (res?.status === 200) {
                toast.success('Integration created!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate('/integration', { replace: true });
            } else if (res != null) {
                let payload = await res.json();
                toast.error(payload.type == 'duplicate_provider_config' ? 'Unique Key already exists.' : payload.error, {
                    position: toast.POSITION.BOTTOM_CENTER
                });
            }
        }
    };

    const deleteButtonClicked = async () => {
        if (!providerConfigKey) return;

        let res = await API.deleteIntegration(providerConfigKey, navigate);

        if (res?.status === 200) {
            toast.success('Integration deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/integrations', { replace: true });
        }
    };

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Integrations} />
                <div className="ml-60 w-full mt-14">
                    {(providers || integration) && (
                        <div className="mx-auto w-largebox">
                            <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Integration</h2>
                            <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                                <form className="space-y-6" onSubmit={handleSave}>
                                    {!providerConfigKey && providers && (
                                        <div>
                                            <div>
                                                <label htmlFor="provider" className="text-text-light-gray block text-sm font-semibold">
                                                    Provider
                                                </label>
                                                <div className="mt-1">
                                                    <select
                                                        id="provider"
                                                        name="provider"
                                                        className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                        defaultValue="Canada"
                                                    >
                                                        {providers.map((provider) => (
                                                            <option>{provider}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label htmlFor="unique_key" className="text-text-light-gray block text-sm font-semibold mt-6">
                                                    Unique Key
                                                </label>
                                                <div className="mt-1">
                                                    <input
                                                        id="unique_key"
                                                        name="unique_key"
                                                        type="text"
                                                        required
                                                        minLength={1}
                                                        className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {providerConfigKey && integration && (
                                        <div>
                                            <div>
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Provider Configuration Unique Key
                                                </label>
                                                <p className="mt-3 mb-5">{`${providerConfigKey}`}</p>
                                            </div>
                                            <div className="mt-8">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Provider Template
                                                </label>
                                                <div className="mt-3 mb-5 flex">
                                                    <img src={`images/template-logos/${integration.provider}.svg`} alt="" className="h-7 mr-0.5" />
                                                    <p className="">{`${integration.provider}`}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                            Client ID
                                        </label>
                                        <div className="mt-1">
                                            <input
                                                id="client_id"
                                                name="client_id"
                                                type="text"
                                                defaultValue={integration ? integration.clientId : ''}
                                                required
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="client_secret" className="text-text-light-gray block text-sm font-semibold">
                                            Client Secret
                                        </label>
                                        <div className="mt-1">
                                            <input
                                                id="client_secret"
                                                name="client_secret"
                                                type="text"
                                                defaultValue={integration ? integration.clientSecret : ''}
                                                required
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-white focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="scopes" className="text-text-light-gray block text-sm font-semibold">
                                            Scopes
                                        </label>
                                        <div className="mt-1">
                                            <input
                                                id="scopes"
                                                name="scopes"
                                                type="text"
                                                defaultValue={integration ? integration.scopes : ''}
                                                required
                                                minLength={1}
                                                className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-white focus:outline-none focus:ring-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between">
                                            <button
                                                type="submit"
                                                className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black"
                                            >
                                                Save
                                            </button>
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
                </div>
            </div>
        </div>
    );
}
