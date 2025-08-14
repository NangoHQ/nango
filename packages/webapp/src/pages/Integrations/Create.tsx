import { BookOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Dialog';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { Button } from '../../components/ui/button/Button';
import { apiPostIntegration, clearIntegrationsCache } from '../../hooks/useIntegration';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useGetProvidersAPI } from '../../utils/api';

import type { AuthModeType } from '@nangohq/types';

interface Provider {
    name: string;
    displayName: string;
    defaultScopes: string[];
    authMode: AuthModeType;
    categories?: string[];
    docs?: string;
    preConfigured: boolean;
    preConfiguredScopes: string[];
}

export default function Create() {
    const { mutate, cache } = useSWRConfig();
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loaded, setLoaded] = useState(false);
    const [initialProviders, setInitialProviders] = useState<Provider[] | null>(null);
    const [providers, setProviders] = useState<Provider[] | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
    const [isCreatingShared, setIsCreatingShared] = useState(false);

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

    const onSelectProvider = (provider: Provider) => {
        if (provider.preConfigured) {
            // show modal for preconfigured providers
            setSelectedProvider(provider);
            setShowConfigModal(true);
        } else {
            // go directly to create integration for non-preconfigured providers
            onCreateIntegrationDirect(provider.name);
        }
    };

    const onCreateIntegrationDirect = async (providerName: string) => {
        const created = await apiPostIntegration(env, {
            provider: providerName,
            useSharedCredentials: false
        });

        if ('error' in created.json) {
            toast({ title: created.json.error.message || 'Failed to create, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Integration created', variant: 'success' });
            clearIntegrationsCache(cache, mutate);
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

    const handleIntegrationCreation = async (useSharedCredentials: boolean) => {
        if (!selectedProvider) return;

        if (useSharedCredentials) {
            setIsCreatingShared(true);

            try {
                const created = await apiPostIntegration(env, { provider: selectedProvider.name, useSharedCredentials: true });

                if ('error' in created.json) {
                    toast({ title: created.json.error.message || 'Failed to create, an error occurred', variant: 'error' });
                    return;
                }

                toast({ title: 'Integration created with Nango credentials', variant: 'success' });
                clearIntegrationsCache(cache, mutate);
                navigate(`/${env}/integrations/${created.json.data.unique_key}/settings`);
                setShowConfigModal(false);
            } finally {
                setIsCreatingShared(false);
            }
        } else {
            await onCreateIntegrationDirect(selectedProvider.name);
            setShowConfigModal(false);
        }
    };

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
                                onClick={() => onSelectProvider(provider)}
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
            <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
                <DialogContent className="w-[570px] max-w-[570px]">
                    <DialogHeader>
                        <DialogTitle>Configure new integration:</DialogTitle>
                    </DialogHeader>

                    {selectedProvider && (
                        <div className="space-y-8">
                            <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                                <div className="flex items-center">
                                    <IntegrationLogo provider={selectedProvider.name} height={10} width={10} classNames="mr-2" />
                                    <span className="text-white font-medium">{selectedProvider.displayName}</span>
                                </div>
                                <div className="bg-gray-700 px-2 py-1 rounded text-sm">
                                    <span className="text-gray-500">Type: </span>
                                    <span className="text-gray-300">{selectedProvider.authMode}</span>
                                </div>
                            </div>
                            <div className="relative w-full rounded-lg border px-2 py-2 text-sm flex gap-2.5 items-center min-h-10 bg-blue-base-35 border-blue-base text-blue-base">
                                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <div className="flex flex-col gap-2">
                                    <div className="text-sm">
                                        Nango provides a developer app for testing. They may get reset occasionally. Always use your own developer app for
                                        production.
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <Button type="button" onClick={() => handleIntegrationCreation(env !== 'prod')} disabled={isCreatingShared} variant="primary">
                                    {isCreatingShared ? 'Creating...' : env === 'prod' ? 'Use your own developer app' : "Use Nango's developer app"}
                                </Button>
                                <Button type="button" onClick={() => handleIntegrationCreation(env === 'prod')} variant="secondary">
                                    {env === 'prod' ? "Use Nango's developer app" : 'Use your own developer app'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
