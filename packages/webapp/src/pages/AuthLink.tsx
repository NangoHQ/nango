import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState } from 'react';
import { baseUrl } from '../utils/utils';
import Nango from '@nangohq/frontend';

import { isCloud } from '../utils/utils';

export default function AuthLink() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const searchParams = useSearchParams()[0];

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        // Required params.
        let integrationUniqueKey = searchParams.get('integration_unique_key');
        let connectionId = searchParams.get('connection_id');
        let publicKey = searchParams.get('public_key') || undefined;

        if (!integrationUniqueKey || !connectionId) {
            setServerErrorMessage('Missing Integration ID and/or User ID.');
            return;
        }

        if (isCloud() && !publicKey) {
            setServerErrorMessage('Missing public key.');
            return;
        }

        // Optional params.
        let host = searchParams.get('host') || baseUrl();
        let websocketsPath = searchParams.get('websockets_path') || '/';
        let userScopes = searchParams.get('selected_scopes')?.split(',') || []; // Slack only.
        let connectionConfig = searchParams.get('config');

        console.log('host', host);

        const nango = new Nango({ host: host, websocketsPath: websocketsPath, publicKey: publicKey });

        nango
            .auth(integrationUniqueKey, connectionId, {
                user_scope: userScopes,
                params: connectionConfig ? JSON.parse(connectionConfig) : {}
            })
            .then(() => {
                toast.success('Connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            })
            .catch((err: { message: string; type: string }) => {
                setServerErrorMessage(`${err.type} error: ${err.message}`);
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
