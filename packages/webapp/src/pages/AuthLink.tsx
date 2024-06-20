import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState } from 'react';
import { baseUrl } from '../utils/utils';
import Nango, { AuthError } from '@nangohq/frontend';

export default function AuthLink() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const searchParams = useSearchParams()[0];

    const handleCreate = (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        // Required params.
        const integrationUniqueKey = searchParams.get('integration_unique_key');
        const connectionId = searchParams.get('connection_id');
        const publicKey = searchParams.get('public_key') || undefined;

        if (!integrationUniqueKey || !connectionId) {
            setServerErrorMessage('Missing Integration ID and/or User ID.');
            return;
        }

        if (!publicKey) {
            setServerErrorMessage('Missing public key.');
            return;
        }

        // Optional params.
        const host = searchParams.get('host') || baseUrl();
        const websocketsPath = searchParams.get('websockets_path') || '/';
        const userScopes = searchParams.get('selected_scopes')?.split(',') || []; // Slack only.
        const params = searchParams.get('params');
        const authorizationParams = searchParams.get('authorization_params');
        const username = searchParams.get('username');
        const password = searchParams.get('password');
        const apiKey = searchParams.get('api_key');

        const nango = new Nango({ host: host, websocketsPath: websocketsPath, publicKey: publicKey });

        let credentials = {};

        if (username && password) {
            credentials = {
                username,
                password
            };
        }

        if (apiKey) {
            credentials = {
                apiKey: apiKey
            };
        }

        nango
            .auth(integrationUniqueKey, connectionId, {
                user_scope: userScopes,
                params: params ? JSON.parse(params) : {},
                authorization_params: authorizationParams ? JSON.parse(authorizationParams) : {},
                credentials
            })
            .then(() => {
                toast.success('Connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            })
            .catch((err: unknown) => {
                setServerErrorMessage(err instanceof AuthError ? `${err.type} error: ${err.message}` : 'unknown error');
            });
    };

    return (
        <div className="ml-4 mt-4">
            <button onClick={handleCreate} className="bg-white h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                Authenticate
            </button>
            {serverErrorMessage && <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>}
        </div>
    );
}
