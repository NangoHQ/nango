import { useState, useEffect, useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, BookOpenIcon } from '@heroicons/react/24/outline';

import { useGetProvidersAPI } from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { useStore } from '../../store';
import { useSWRConfig } from 'swr';
import type { AuthModeType } from '@nangohq/types';
import { apiPostIntegration } from '../../hooks/useIntegration';
import { useToast } from '../../hooks/useToast';
import { Helmet } from 'react-helmet';

interface Provider {
    name: string;
    displayName: string;
    defaultScopes: string[];
    authMode: AuthModeType;
    categories?: string[];
    docs?: string;
}

export default function Create() {
    const { mutate } = useSWRConfig();
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loaded, setLoaded] = useState(false);
    const [initialProviders, setInitialProviders] = useState<Provider[] | null>(null);
    const [providers, setProviders] = useState<Provider[] | null>(null);
    const getProvidersAPI = useGetProvidersAPI(env);
    const navigate = useNavigate();

    useEffect(() => {
        const getProviders = async () => {
            const res = await getProvidersAPI();

            if (res?.status === 200) {
                const data = await res.json();
                setProviders(data);
                setInitialProviders(data);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getProviders();
        }
    }, [getProvidersAPI, loaded, setLoaded]);

    const onCreateIntegration = async (provider: string) => {
        const created = await apiPostIntegration(env, { provider });

        if ('error' in created.json) {
            toast({ title: created.json.error.message || 'Failed to create, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Integration created', variant: 'success' });
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`), undefined);
            navigate(`/${env}/integrations/${created.json.data.unique_key}/settings`);
        }
    };

    const showDocs = (e: React.MouseEvent<SVGSVGElement>, provider: Provider) => {
        e.stopPropagation();
        const documentationUrl = provider.docs ?? `https://docs.nango.dev/integrations/all/${provider.name}`;
        window.open(documentationUrl, '_blank');
    };

    const filterProviders = useCallback(
        (value: string) => {
            if (!value.trim()) {
                setProviders(initialProviders);
                return;
            }
            const lowercaseValue = value.toLowerCase();
            const filtered = initialProviders?.filter(
                (provider) =>
                    provider.displayName.toLowerCase().includes(lowercaseValue) ||
                    provider.categories?.some((category) => category.toLowerCase().includes(lowercaseValue))
            );
            setProviders(filtered as Provider[]);
        },
        [initialProviders]
    );

    const debouncedFilterProviders = useMemo(() => debounce(filterProviders, 300), [filterProviders]);

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
            debouncedFilterProviders(event.currentTarget.value);
        },
        [debouncedFilterProviders]
    );

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Helmet>
                <title>Integrations Create - Nango</title>
            </Helmet>
            {providers && (
                <div className="w-full">
                    <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-8">Create Integration</h2>
                    <div className="relative">
                        <div className="h-fit rounded-md text-white text-sm">
                            <MagnifyingGlassIcon className="absolute top-2 left-4 h-5 w-5 text-gray-400" />
                            <input
                                id="search"
                                name="search"
                                type="text"
                                placeholder="Search APIs or category"
                                className="border-border-gray bg-active-gray indent-8 text-white block w-full appearance-none rounded-md border px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                                onChange={handleInputChange}
                                onKeyUp={handleInputChange}
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap text-white w-full">
                        {providers.map((provider) => (
                            <div
                                key={provider.name}
                                className="flex justify-between px-2 p-2 mr-2 mt-4 mb-5 w-[14.7rem] border border-transparent rounded cursor-pointer items-center text-sm hover:bg-hover-gray"
                                onClick={() => onCreateIntegration(provider.name)}
                            >
                                <div className="flex items-center">
                                    <IntegrationLogo provider={provider.name} height={12} width={12} classNames="mr-2" />
                                    <div className="flex flex-col flex-start">
                                        <span className="flex">{provider.displayName}</span>
                                        {provider.categories && <span className="flex text-xs text-gray-400">{provider.categories.join(', ')}</span>}
                                    </div>
                                </div>
                                <BookOpenIcon onClick={(e) => showDocs(e, provider)} className="h-5 w-5 text-gray-400 hover:text-white hover:bg-hover-gray" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
