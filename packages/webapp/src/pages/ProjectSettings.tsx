import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useState, useEffect } from 'react';
import { HelpCircle } from '@geist-ui/icons';
import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import API from '../utils/api';
import { isCloud } from '../utils/utils';

export default function ProjectSettings() {
    const [secretKey, setSecretKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [callbackEditMode, setCallbackEditMode] = useState(false);
    const navigate = useNavigate();
    const defaultCloudCallback = isCloud() ? 'https://api.nango.dev/oauth/callback' : 'http://localhost:3003/oauth/callback';

    useEffect(() => {
        const getAccount = async () => {
            let res = await API.getProjectInfo(navigate);

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.secret_key);
                setPublicKey(account.public_key);
                setCallbackUrl(account.callback_url || defaultCloudCallback);
            }
        };
        getAccount();
    }, [navigate, defaultCloudCallback]);

    const handleCallbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            callback_url: { value: string };
        };

        const res = await API.editCallbackUrl(target.callback_url.value, navigate);

        if (res?.status === 200) {
            toast.success('Callback URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setCallbackEditMode(false);
            setCallbackUrl(target.callback_url.value || defaultCloudCallback);
        }
    };

    const handleCallbackEdit = (e: React.SyntheticEvent) => {
        setCallbackEditMode(true);
    };

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.ProjectSettings} />
                <div className="ml-60 w-full mt-14">
                    {secretKey && (
                        <div className="mx-auto w-largebox">
                            <div className="mx-20 h-full mb-20">
                                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Project Details</h2>
                                <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                                    {isCloud() && (
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
                                    )}
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <div className="flex mb-2">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Secret Key
                                                </label>
                                                <p className="ml-2 text-text-dark-gray text-sm">(do not share!)</p>
                                            </div>
                                            <Prism language="bash" colorScheme="dark">
                                                {secretKey}
                                            </Prism>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mx-8 mt-8">
                                            <div className="flex text-white  mb-2">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Callback URL
                                                </label>
                                                <a href="https://docs.nango.dev/reference/configuration#custom-callback-url" target="_blank" rel="noreferrer">
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
                                                        Customizing the callback URL requires that you set up a 308 redirect from the custom callback URL to
                                                        https://api.nango.dev/oauth/callback.
                                                    </p>
                                                </form>
                                            )}
                                            {!callbackEditMode && (
                                                <div className="flex">
                                                    <Prism language="bash" colorScheme="dark" className="w-full">
                                                        {callbackUrl}
                                                    </Prism>
                                                    {isCloud() && (
                                                        <button
                                                            onClick={handleCallbackEdit}
                                                            className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
