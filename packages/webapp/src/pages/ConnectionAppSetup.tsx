import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { useLocation } from 'react-router-dom';
import queryString from 'query-string';

import { LeftNavBarItems } from '../components/LeftNavBar';
import { baseUrl } from '../utils/utils';
import { useGetProjectInfoAPI } from '../utils/api';
import Spinner from '../components/ui/Spinner';
import DashboardLayout from '../layout/DashboardLayout';

export default function ConnectionAppSetup() {
    const getProjectInfoAPI = useGetProjectInfoAPI()

    const location = useLocation();
    const queryParams = queryString.parse(location.search);
    const installationId: string | (string | null)[] | null = queryParams.installation_id;

    const [loaded, setLoaded] = useState(false);
    const [publicKey, setPublicKey] = useState('');
    const [hostUrl, setHostUrl] = useState('');
    const [websocketsPath, setWebsocketsPath] = useState('');

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setPublicKey(account.public_key);
                setHostUrl(account.host || baseUrl());
                setWebsocketsPath(account.websockets_path); 
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
    }, [loaded, setLoaded, getProjectInfoAPI, setPublicKey]);

    if (publicKey) {
        const nango = new Nango({ host: hostUrl, websocketsPath, publicKey });
        nango.appGithubReconcile(installationId as string);
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <div className="flex h-full px-16 w-fit mx-auto items-center justify-center">
                <div>
                    <Spinner size={16} />
                </div>
            </div>
        </DashboardLayout>
    );
}
