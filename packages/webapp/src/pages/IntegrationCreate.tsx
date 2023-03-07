import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';

export default function IntegrationCreate() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [providers, setProviders] = useState<string[] | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const getProviders = async () => {
            let res = await fetch('/api/v1/provider');

            if (res.status === 200) {
                let data = await res.json();
                setProviders(data['providers']);
            } else if (res.status === 401) {
                navigate('/signin', { replace: true });
            } else {
                toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
            }
        };
        getProviders();
    }, [navigate]);

    const handleSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            provider: { value: string };
            unique_key: { value: string };
            client_id: { value: string };
            client_secret: { value: string };
            scopes: { value: string };
        };

        const data = {
            provider: target.provider.value,
            provider_config_key: target.unique_key.value,
            client_id: target.client_id.value,
            client_secret: target.client_secret.value,
            scopes: target.scopes.value
        };

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };

        let res = await fetch('/api/v1/integration', options);

        if (res.status === 200) {
            toast.success('Integration created!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/integration', { replace: true });
        } else if (res.status === 401) {
            navigate('/signin', { replace: true });
        } else {
            toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Integrations} />
                {providers && (
                    <div className="mx-auto mt-16 w-largebox">
                        <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Integration</h2>
                        <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                            <form className="space-y-6" onSubmit={handleSave}>
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
                                    <label htmlFor="unique_key" className="text-text-light-gray block text-sm font-semibold">
                                        Unique Key
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="unique_key"
                                            name="unique_key"
                                            type="text"
                                            required
                                            minLength={1}
                                            maxLength={100}
                                            className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="client_id" className="text-text-light-gray block text-sm font-semibold">
                                        Client ID
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="client_id"
                                            name="client_id"
                                            type="text"
                                            required
                                            minLength={1}
                                            maxLength={100}
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
                                            required
                                            minLength={8}
                                            maxLength={50}
                                            className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-white focus:outline-none focus:ring-white"
                                        />
                                    </div>
                                </div>

                                <div className="">
                                    <button type="submit" className="bg-white mt-4 h-9 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                                        Save
                                    </button>
                                    {serverErrorMessage && <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>}
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
