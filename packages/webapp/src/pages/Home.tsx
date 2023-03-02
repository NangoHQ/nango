import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { Tabs } from '@mantine/core';
import { useState, useEffect } from 'react';

export default function Home() {
    const [secretKey, setSecretKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        getAccount();
    }, []);

    const getAccount = async () => {
        const options: RequestInit = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' as RequestCredentials,
            cache: 'no-store' as RequestCache
        };

        let res = await fetch('/api/v1/account', options);

        if (res.status === 200) {
            const account = (await res.json())['account'];
            setSecretKey(account.secret_key);
            setPublicKey(account.public_key);
        } else if (res.status === 401) {
            navigate('/signin', { replace: true });
        } else {
            toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

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

    const frontendCode = `
    import Nango from '@nangohq/frontend'; // After installing the npm package

var nango = new Nango({ publicKey: '${publicKey}' });

nango.auth('<CONFIG-KEY>', '<CONNECTION-ID>').then((result) => {
    alert(\`Success!\`);
}).catch((e) => {
    alert(e.message);
});
    `;

    const backendCode = `
import { Nango } from '@nangohq/node';

let nango = new Nango({ secretKey: '${secretKey}' });

let accessToken = await nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>');
`;

    const envVariables = `
export NANGO_HOSTPORT=https://api.nango.dev
export NANGO_SECRET_KEY=${secretKey}
`;

    const bashTokenCommand = `
curl 'https://api.nango.dev/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>' \\
    -H 'Authorization: Bearer ${secretKey}'    
`;

    return (
        <div>
            <button
                className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                onClick={logoutButtonClicked}
            >
                Logout
            </button>
            <h2 className="mt-24 text-left text-3xl font-semibold tracking-tight text-white ml-40 mb-10">Get Started</h2>
            <div className="border-2 border-border-gray rounded-md h-fit w-fit mx-40">
                <div>
                    <div className="mx-8 my-8">
                        <p className="text-white mb-6">To use Nango's CLI, add the following environment variables to your .bashrc (or equivalent):</p>
                        <Prism language="bash" colorScheme="dark">
                            {envVariables}
                        </Prism>
                    </div>
                </div>
                <div>
                    <div className="mx-8 my-8">
                        <ul>
                            <li>
                                <p className="text-white mb-6">Give a name to your OAuth app configuration (e.g. 'hubspot-prod')</p>
                            </li>
                            <li>
                                <p className="text-white mb-6">Select a template key in our provider list (e.g. 'github')</p>
                            </li>
                            <li>
                                <p className="text-white mb-6">Register with the OAuth provider to obtain the app ID, secret and scopes.</p>
                            </li>
                        </ul>

                        <p className="text-white mb-6">In your console, register your OAuth app with Nango:</p>
                        <Prism language="bash" colorScheme="dark">
                            {"npx nango config:create '<APP-CONFIG-NAME>' '<TEMPLATE>' '<APP_ID>' '<APP_SECRET>' '<SCOPES>'"}
                        </Prism>
                    </div>
                </div>
                <div>
                    <div className="mx-8 my-8">
                        <p className="text-white mb-6">In your frontend code, trigger the OAuth flow:</p>
                        <Prism language="typescript" colorScheme="dark">
                            {frontendCode}
                        </Prism>
                    </div>
                </div>
                <div>
                    <div className="mx-8 my-8">
                        <p className="text-white mb-6">In your backend code, retrieve the OAuth token:</p>

                        <Tabs defaultValue="Typescript" variant="outline">
                            <Tabs.List>
                                <Tabs.Tab value="Typescript">
                                    <p className="text-white">Typescript</p>
                                </Tabs.Tab>
                                <Tabs.Tab value="REST">
                                    {' '}
                                    <p className="text-white">REST</p>
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="Typescript" pt="xs">
                                <Prism language="typescript" colorScheme="dark">
                                    {backendCode}
                                </Prism>
                            </Tabs.Panel>

                            <Tabs.Panel value="REST" pt="xs">
                                <Prism language="bash" colorScheme="dark">
                                    {bashTokenCommand}
                                </Prism>
                            </Tabs.Panel>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}
