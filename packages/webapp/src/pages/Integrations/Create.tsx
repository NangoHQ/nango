import { useVirtualizer } from '@tanstack/react-virtual';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Info, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';

import { AuthBadge } from './components/AuthBadge';
import { apiPostIntegration, clearIntegrationsCache } from '../../hooks/useIntegration';
import { useProviders } from '../../hooks/useProviders';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Badge } from '@/components-v2/ui/badge';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components-v2/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';

import type { ApiProviderListItem } from '@nangohq/types';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

type Provider = ApiProviderListItem;

export const CreateIntegration = () => {
    const { mutate, cache } = useSWRConfig();
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [providers, setProviders] = useState<Provider[] | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
    const [isCreatingShared, setIsCreatingShared] = useState(false);

    const { data: providersData } = useProviders(env);
    const navigate = useNavigate();

    const initialProviders = useMemo(() => {
        return providersData?.data ?? null;
    }, [providersData]);

    useEffect(() => {
        if (initialProviders) {
            setProviders(initialProviders);
        }
    }, [initialProviders]);

    const onSelectProvider = (provider: Provider) => {
        if (provider.preConfigured) {
            // show modal for preconfigured providers
            setSelectedProvider(provider);
            setShowConfigModal(true);
        } else {
            // go directly to create integration for non-preconfigured providers
            void onCreateIntegrationDirect(provider.name);
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

    const fuse = useMemo(() => {
        if (!initialProviders || initialProviders.length === 0) {
            return null;
        }

        return new Fuse(initialProviders, {
            keys: [
                { name: 'displayName', weight: 0.3 },
                { name: 'name', weight: 0.3 },
                { name: 'authMode', weight: 0.2 },
                { name: 'categories', weight: 0.2 }
            ],
            threshold: 0.4, // 0.0 = exact match, 1.0 = match anything. 0.4 is a good balance
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true, // Search anywhere in the string
            findAllMatches: true // Find all matches, not just the first
        });
    }, [initialProviders]);

    const filterProviders = useCallback(
        (value: string) => {
            if (!value.trim() || !fuse) {
                setProviders(initialProviders);
                return;
            }

            const results = fuse.search(value);
            const filtered = results.map((result) => result.item);
            setProviders(filtered);
        },
        [initialProviders, fuse]
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
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Create integration - Nango</title>
            </Helmet>

            <header>
                <h2 className="text-text-primary text-title-subsection">Set up new integration</h2>
            </header>

            <InputGroup className="bg-bg-subtle">
                <InputGroupInput type="text" placeholder="Github, accounting, oauth..." onChange={handleInputChange} onKeyUp={handleInputChange} autoFocus />
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
            </InputGroup>

            <ProviderList providers={providers} onSelectProvider={onSelectProvider} />

            <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
                <DialogContent className="w-[570px] max-w-[570px]">
                    <DialogHeader>
                        <DialogTitle>Configure new integration:</DialogTitle>
                    </DialogHeader>

                    {selectedProvider && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between p-3 bg-bg-subtle rounded">
                                <div className="flex items-center gap-2">
                                    <IntegrationLogo provider={selectedProvider.name} />
                                    <span className="text-white font-medium">{selectedProvider.displayName}</span>
                                </div>
                                <AuthBadge authMode={selectedProvider.authMode} className="py-2 px-4 !text-body-small-semi gap-2" />
                            </div>
                            <Alert variant="info">
                                <Info />
                                <AlertDescription>
                                    Nango provides a developer app for testing. They may get reset occasionally. Always use your own developer app for
                                    production.
                                </AlertDescription>
                            </Alert>
                            <div className="flex justify-between gap-2">
                                <Button
                                    type="button"
                                    size="lg"
                                    onClick={() => handleIntegrationCreation(env !== 'prod')}
                                    disabled={isCreatingShared}
                                    variant="primary"
                                >
                                    {isCreatingShared && <Loader2 />}
                                    {isCreatingShared && env !== 'prod'
                                        ? 'Creating...'
                                        : env !== 'prod'
                                          ? "Use Nango's developer app"
                                          : 'Use your own developer app'}
                                </Button>
                                <Button
                                    type="button"
                                    size="lg"
                                    onClick={() => handleIntegrationCreation(env === 'prod')}
                                    disabled={isCreatingShared}
                                    variant="secondary"
                                >
                                    {isCreatingShared && <Loader2 />}
                                    {isCreatingShared && env === 'prod'
                                        ? 'Creating...'
                                        : env === 'prod'
                                          ? "Use Nango's developer app"
                                          : 'Use your own developer app'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
};

const ProviderList = ({ providers, onSelectProvider }: { providers: Provider[] | null; onSelectProvider: (provider: Provider) => void }) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: providers?.length ?? 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 74,
        overscan: 5,
        gap: 8
    });

    if (!providers || providers.length === 0) {
        return null;
    }

    return (
        <div ref={parentRef} className="h-full overflow-auto">
            <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const provider = providers[virtualRow.index];
                    return (
                        <Provider
                            key={virtualRow.key}
                            provider={provider}
                            onClick={() => onSelectProvider(provider)}
                            virtualRow={virtualRow}
                            rowVirtualizer={rowVirtualizer}
                        />
                    );
                })}
            </div>
        </div>
    );
};

const Provider = ({
    provider,
    onClick,
    virtualRow,
    rowVirtualizer
}: {
    provider: Provider;
    onClick: () => void;
    virtualRow?: VirtualItem;
    rowVirtualizer?: Virtualizer<HTMLDivElement, HTMLDivElement>;
}) => {
    return (
        <div
            onClick={onClick}
            className="p-4 w-full inline-flex items-center justify-between bg-bg-elevated rounded border border-transparent cursor-pointer transition-colors hover:bg-bg-surface hover:border-border-disabled"
            data-index={virtualRow?.index}
            ref={rowVirtualizer ? (node) => rowVirtualizer.measureElement(node) : undefined}
            style={
                virtualRow
                    ? {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`
                      }
                    : undefined
            }
        >
            <div className="inline-flex gap-1.5 items-center">
                <IntegrationLogo provider={provider.name} />
                <span className="text-text-primary text-body-medium-semi">{provider.displayName}</span>
            </div>
            <div className="inline-flex gap-1.5 items-center justify-end">
                <AuthBadge authMode={provider.authMode} />
                {provider.categories?.map((category) => (
                    <Badge key={category} variant="ghost">
                        {category}
                    </Badge>
                ))}
            </div>
        </div>
    );
};
