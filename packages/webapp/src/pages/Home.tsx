import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useState, useEffect } from 'react';
import { Book, Slack, Github, HelpCircle } from '@geist-ui/icons';

export default function Home() {
    const [secretKey, setSecretKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [callbackEditMode, setCallbackEditMode] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const getAccount = async () => {
            let res = await fetch('/api/v1/account');

            if (res.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.secret_key);
                setPublicKey(account.public_key);
                setCallbackUrl(account.callback_url || 'https://api.nango.dev/oauth/callback');
            } else if (res.status === 401) {
                navigate('/signin', { replace: true });
            } else {
                toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
            }
        };
        getAccount();
    }, [navigate]);

    const logoutButtonClicked = async () => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const res = await fetch('/api/v1/logout', options);

        if (res.status === 200) {
            localStorage.clear();
            navigate('/signin', { replace: true });
        }
    };

    const handleCallbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            callback_url: { value: string };
        };

        const data = {
            callback_url: target.callback_url.value
        };

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };

        try {
            const res = await fetch('/api/v1/account/callback', options);

            if (res.status === 200) {
                toast.success('Callback URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
                setCallbackEditMode(false);
                setCallbackUrl(target.callback_url.value || 'https://api.nango.dev/oauth/callback');
            } else if (res.status === 401) {
                navigate('/signin', { replace: true });
            } else {
                toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
            }
        } catch (e) {
            toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const handleCallbackEdit = (e: React.SyntheticEvent) => {
        setCallbackEditMode(true);
    };

    return (
        <div>
            <div className="border border-border-gray flex justify-between">
                <div className="">
                    <img className="h-8 my-3 ml-6" src="/logo-circled.svg" alt="Your Company" />
                </div>
                <div className="flex">
                    <a
                        href="https://nango.dev/slack"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 bg-gray-800 text-white mt-3"
                    >
                        <Slack className="h-4 mr-1 mt-0.5"></Slack>
                        <p>Community</p>
                    </a>
                    <a
                        href="https://docs.nango.dev/quickstart"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 bg-gray-800 text-white  mt-3"
                    >
                        <Book className="h-4 mr-1 mt-0.5"></Book>
                        <p>Documentation</p>
                    </a>
                    <a
                        href="https://github.com/NangoHQ/nango"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 bg-gray-800 text-white  mt-3"
                    >
                        <Github className="h-4 mr-1 mt-0.5"></Github>
                        <p>Github</p>
                    </a>
                    <button
                        onClick={logoutButtonClicked}
                        className="flex h-8 rounded-md ml-4 px-3 pt-1.5 text-sm hover:bg-gray-700 bg-gray-800 text-red-600 font-semibold mt-3 mr-6"
                    >
                        <p>Log Out</p>
                    </button>
                </div>
            </div>
            <div className="flex justify-center">
                <div className="w-full mx-20 max-w-7xl h-full">
                    <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-6">Add an OAuth integration to your app</h2>
                    <div>
                        <div className="mr-8 mt-8">
                            <p className="text-white text-sm">
                                You will soon be able to manage Nango with this dashboard. For now, please use the CLI as explained in the{' '}
                                <a href="https://docs.nango.dev/quickstart" className="text-text-blue" target="_blank" rel="noreferrer">
                                    Quickstart
                                </a>
                                .
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex justify-center">
                <div className="w-full mx-20 max-w-7xl h-full mb-20">
                    <h2 className="mt-24 text-left text-3xl font-semibold tracking-tight text-white mb-6">Project Details</h2>
                    <div className="border border-border-gray rounded-md h-fit w-full py-14">
                        <div>
                            <div className="mx-8">
                                <p className="text-white mb-2 text-sm">Public Key</p>
                                <Prism language="bash" colorScheme="dark">
                                    {publicKey}
                                </Prism>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex">
                                    <p className="text-white text-sm mb-2">Secret Key</p>
                                    <p className="ml-2 text-text-dark-gray text-sm">(do not share!)</p>
                                </div>
                                <Prism language="bash" colorScheme="dark">
                                    {secretKey}
                                </Prism>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex text-white">
                                    <p className="text-white text-sm mb-2">Callback URL</p>
                                    <a href="https://docs.nango.dev/reference/configuration#custom-callback-url" target="_blank" rel="noreferrer">
                                        <HelpCircle className="text-white h-5 ml-1"></HelpCircle>
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
                    </div>
                </div>
            </div>
        </div>
    );
}
