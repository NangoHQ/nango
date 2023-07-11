import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useState, useEffect } from 'react';
import { HelpCircle } from '@geist-ui/icons';

import { useGetProjectInfoAPI, useEditCallbackUrlAPI, useEditWebhookUrlAPI, useEditHmacEnabledAPI, useEditHmacKeyAPI } from '../utils/api';
import { isCloud, defaultCallback } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import SecretInput from '../components/ui/input/SecretInput';
import { useStore } from '../store';

export default function ProjectSettings() {
    const [loaded, setLoaded] = useState(false);
    const [secretKey, setSecretKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [webhookUrl, setWebhookUrl] = useState('');
    const [callbackEditMode, setCallbackEditMode] = useState(false);
    const [webhookEditMode, setWebhookEditMode] = useState(false);
    const [hmacKey, setHmacKey] = useState('');
    const [hmacEnabled, setHmacEnabled] = useState(false);
    const [hmacEditMode, setHmacEditMode] = useState(false);
    const getProjectInfoAPI = useGetProjectInfoAPI();
    const editCallbackUrlAPI = useEditCallbackUrlAPI();
    const editWebhookUrlAPI = useEditWebhookUrlAPI();
    const editHmacEnabled = useEditHmacEnabledAPI();
    const editHmacKey = useEditHmacKeyAPI();

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.secret_key);
                setPublicKey(account.public_key);
                setCallbackUrl(account.callback_url || defaultCallback());
                setWebhookUrl(account.webhook_url || '');
                setHmacEnabled(account.hmac_enabled);
                setHmacKey(account.hmac_key);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
    }, [getProjectInfoAPI, loaded, setLoaded, env]);

    const handleCallbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            callback_url: { value: string };
        };

        const res = await editCallbackUrlAPI(target.callback_url.value);

        if (res?.status === 200) {
            toast.success('Callback URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setCallbackEditMode(false);
            setCallbackUrl(target.callback_url.value || defaultCallback());
        }
    };

    const handleWebhookbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            webhook_url: { value: string };
        };

        const res = await editWebhookUrlAPI(target.webhook_url.value);

        if (res?.status === 200) {
            toast.success('Wehook URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setWebhookEditMode(false);
            setWebhookUrl(target.webhook_url.value);
        }
    };

    const handleCallbackEdit = (_: React.SyntheticEvent) => {
        setCallbackEditMode(true);
    };

    const handleHmacEnabled = async (checked: boolean) => {
        setHmacEnabled(checked);
        await editHmacEnabled(checked);
    };

    const handleHmacSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            hmac_key: { value: string };
        };

        const res = await editHmacKey(target.hmac_key.value);

        if (res?.status === 200) {
            toast.success('HMAC key updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setHmacEditMode(false);
            setHmacKey(target.hmac_key.value);
        }

        setHmacEditMode(false);
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ProjectSettings}>
            {secretKey && (
                <div className="mx-auto w-largebox">
                    <div className="mx-20 h-full mb-20">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Project Details</h2>
                        <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                            <div>
                                <div className="mx-8 mt-8">
                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold  mb-2">
                                        Public Key
                                    </label>
                                    <Prism language="bash" colorScheme="dark">
                                        {publicKey}
                                    </Prism>
                                </div>
                            </div>
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex mb-2">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Secret Key
                                        </label>
                                        <p className="ml-2 text-text-dark-gray text-sm">(do not share!)</p>
                                    </div>
                                    <SecretInput disabled copy={true} optionalValue={secretKey} setOptionalValue={setSecretKey} />
                                </div>
                            </div>
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex text-white  mb-2">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Callback URL
                                        </label>
                                        <a href="https://docs.nango.dev/guides/oauth#custom-callback-url" target="_blank" rel="noreferrer">
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </a>
                                    </div>
                                    {callbackEditMode && (
                                        <form className="mt-2" onSubmit={handleCallbackSave}>
                                            <div className="flex">
                                                <input
                                                    id="callback_url"
                                                    name="callback_url"
                                                    type="url"
                                                    defaultValue={callbackUrl}
                                                    className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                />

                                                <button
                                                    type="submit"
                                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                            <p className="mt-2 text-sm text-red-700">
                                                {isCloud() ? (
                                                    <>
                                                        Customizing the callback URL requires that you set up a 308 redirect from the custom callback URL to
                                                        https://api.nango.dev/oauth/callback.
                                                    </>
                                                ) : (
                                                    <>
                                                        Customizing the callback URL requires that you set up a redirect from the custom callback URL to
                                                        {' '}{defaultCallback()}.
                                                    </>
                                                )}
                                            </p>
                                        </form>
                                    )}
                                    {!callbackEditMode && (
                                        <div className="flex">
                                            <Prism language="bash" colorScheme="dark" className="w-full">
                                                {callbackUrl}
                                            </Prism>
                                            <button
                                                onClick={handleCallbackEdit}
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex text-white mb-2">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Webhook URL
                                        </label>
                                    </div>
                                    {webhookEditMode && (
                                        <form className="mt-2" onSubmit={handleWebhookbackSave}>
                                            <div className="flex">
                                                <input
                                                    id="webhook_url"
                                                    name="webhook_url"
                                                    type="url"
                                                    defaultValue={webhookUrl}
                                                    className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                />

                                                <button
                                                    type="submit"
                                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                    {!webhookEditMode && (
                                        <div className="flex">
                                            <Prism language="bash" colorScheme="dark" className="w-full">
                                                {webhookUrl || '\u0000'}
                                            </Prism>
                                            <button
                                                onClick={() => setWebhookEditMode(!webhookEditMode)}
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex items-center mb-2">
                                        <label htmlFor="email" className="text-text-light-gray text-sm font-semibold">
                                            HMAC Enabled
                                        </label>
                                        <input
                                          type="checkbox"
                                          className="flex ml-3 bg-black"
                                          checked={hmacEnabled}
                                          onChange={(event) => handleHmacEnabled(event.target.checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                            {hmacEnabled && (
                                <div>
                                    <div className="mx-8 mt-8 relative">
                                        <div className="flex mb-2">
                                            <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                HMAC Key
                                            </label>
                                        </div>
                                        {!hmacEditMode && (
                                            <div className="flex">
                                                <SecretInput disabled copy={true} defaultValue={hmacKey} additionalClass="w-full" />
                                                    <button
                                                        onClick={() => setHmacEditMode(!hmacEditMode)}
                                                        className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                    >
                                                        Edit
                                                    </button>
                                            </div>
                                        )}
                                        {hmacEditMode && (
                                            <form className="mt-2" onSubmit={handleHmacSave}>
                                                <div className="flex">
                                                    <input
                                                        id="hmac_key"
                                                        name="hmac_key"
                                                        type="text"
                                                        defaultValue={hmacKey}
                                                        className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
