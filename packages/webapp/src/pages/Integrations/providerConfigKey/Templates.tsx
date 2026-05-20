import { Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { TemplateDetail } from './TemplateDetail';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { EmptyCard } from '@/components-v2/EmptyCard';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { AlertButton } from '@/components-v2/ui/alert';
import { Badge } from '@/components-v2/ui/badge';
import { ComboboxSelect } from '@/components-v2/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { usePreBuiltDeployFlow } from '@/hooks/useFlow';
import { useGetIntegration } from '@/hooks/useIntegration';
import { useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { cn } from '@/utils/utils';

import type { ComboboxOption } from '@/components-v2/ui/combobox';
import type { ApiError, NangoFunctionTemplate } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['sync', 'action'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_OPTIONS: ComboboxOption<TypeFilterValue>[] = [
    { value: 'sync', label: 'Sync' },
    { value: 'action', label: 'Action' }
];

const isOneOf = <T extends string>(values: readonly T[], v: string): v is T => (values as readonly string[]).includes(v);

export const Templates: React.FC = () => {
    const { providerConfigKey } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const { data: integrationResponse, isLoading: integrationLoading, error: integrationError } = useGetIntegration(env, providerConfigKey!);
    const integrationData = integrationResponse?.data;

    const {
        data: templatesResponse,
        isLoading: templatesLoading,
        error: templatesError
    } = useGetIntegrationTemplates({ env, providerConfigKey: providerConfigKey! });
    const templates = templatesResponse?.data;

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    useDebounce(() => setDebouncedSearch(search || ''), 300, [search]);

    const [rawTypeFilter, setTypeFilter] = useQueryState('typeFilter', parseAsString.withDefault(''));
    const typeFilter: TypeFilterValue | undefined = rawTypeFilter && isOneOf(TYPE_FILTER_VALUES, rawTypeFilter) ? rawTypeFilter : undefined;

    const [selectedName, setSelectedName] = useQueryState('template', parseAsString);
    const [selectedType, setSelectedType] = useQueryState('type', parseAsString);

    const filteredTemplates = useMemo<NangoFunctionTemplate[]>(() => {
        if (!templates) return [];
        const needle = debouncedSearch.trim().toLowerCase();
        return templates
            .filter((t) => {
                if (typeFilter && t.type !== typeFilter) return false;
                if (needle) {
                    const haystack = `${t.name} ${t.description ?? ''}`.toLowerCase();
                    if (!haystack.includes(needle)) return false;
                }
                return true;
            })
            .sort((a, b) => {
                const deployedDiff = Number(!!a.deployed) - Number(!!b.deployed);
                if (deployedDiff !== 0) return deployedDiff;
                return a.name.localeCompare(b.name);
            });
    }, [templates, debouncedSearch, typeFilter]);

    // Render-time fallback: prefer the URL-selected template if it's visible, otherwise the first match.
    // No effect / URL writes here — the URL only changes when the user explicitly clicks an item.
    const selected = useMemo<NangoFunctionTemplate | null>(() => {
        if (filteredTemplates.length === 0) return null;
        if (selectedName && selectedType) {
            const match = filteredTemplates.find((t) => t.name === selectedName && t.type === selectedType);
            if (match) return match;
        }
        const firstAvailable = filteredTemplates.find((t) => !t.deployed);
        return firstAvailable ?? filteredTemplates[0];
    }, [filteredTemplates, selectedName, selectedType]);

    const { mutateAsync: deployFlow, isPending: isDeploying } = usePreBuiltDeployFlow(env, integrationData?.integration.unique_key ?? '');

    const onDeploy = async () => {
        if (!selected || !integrationData) return;
        try {
            await deployFlow({
                provider: integrationData.integration.provider,
                providerConfigKey: integrationData.integration.unique_key,
                scriptName: selected.name,
                type: selected.type
            });
            const functionPath = `/${env}/integrations/${integrationData.integration.unique_key}/functions/${encodeURIComponent(selected.name)}?type=${selected.type}`;
            toast({
                title: `${selected.name} deployed successfully`,
                variant: 'success',
                action: (
                    <AlertButton variant="success-secondary" onClick={() => navigate(functionPath)}>
                        View
                    </AlertButton>
                )
            });
        } catch (err) {
            const message = err instanceof APIError ? (err.json as ApiError<string>).error.message : undefined;
            toast({ title: 'Failed to deploy template', description: message, variant: 'error' });
        }
    };

    if (integrationError || templatesError) {
        return <CriticalErrorAlert message="Something went wrong while loading templates" />;
    }

    if (!integrationLoading && !integrationData) {
        return <PageNotFound />;
    }

    const isLoading = integrationLoading || templatesLoading;

    return (
        <DashboardLayout fullWidth className="h-full flex flex-col gap-6 p-0">
            <Helmet>
                <title>Templates - Nango</title>
            </Helmet>

            <div className="flex gap-6 w-full flex-1 min-h-0 pl-11">
                <div className="flex flex-col gap-6 w-[420px] shrink-0 min-h-0">
                    {integrationData ? (
                        <div className="inline-flex items-center gap-2.5 shrink-0 pt-6">
                            <IntegrationLogo provider={integrationData.integration.provider} className="size-10.5" />
                            <span className="text-text-primary text-body-large-semi">
                                {integrationData.integration.display_name ?? integrationData.template.display_name}
                            </span>
                            <span className="text-text-tertiary text-body-medium-regular">Templates</span>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-2.5 shrink-0 pt-6">
                            <Skeleton className="size-10.5" />
                            <Skeleton className="w-36 h-6" />
                        </div>
                    )}
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                            <InputGroup className="h-10">
                                <InputGroupInput
                                    type="text"
                                    placeholder="Search templates"
                                    value={search || ''}
                                    onChange={(e) => setSearch(e.target.value || null)}
                                />
                                <InputGroupAddon>
                                    <Search />
                                </InputGroupAddon>
                            </InputGroup>
                            <ComboboxSelect<TypeFilterValue>
                                allowMultiple
                                label={typeFilter ? 'Type' : 'All types'}
                                dropdownTitle="Filter by type"
                                options={TYPE_OPTIONS}
                                selected={typeFilter ? [typeFilter] : []}
                                onSelectedChange={(next) => {
                                    const newlyAdded = next.find((value) => value !== typeFilter);
                                    void setTypeFilter(newlyAdded ?? null);
                                }}
                                onClearAll={() => void setTypeFilter(null)}
                                reorderOnSelect={false}
                                showSearch={false}
                            />
                        </div>

                        {isLoading ? (
                            <Skeleton className="w-full h-50" />
                        ) : filteredTemplates.length === 0 ? (
                            <EmptyCard>
                                <p className="text-text-secondary text-body-medium-regular text-center">
                                    {templates && templates.length === 0 ? 'No templates available for this provider.' : 'No templates match your filters.'}
                                </p>
                            </EmptyCard>
                        ) : (
                            <ul className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pb-3">
                                {filteredTemplates.map((t) => {
                                    const isSelected = selected?.name === t.name && selected.type === t.type;
                                    const isDeployed = !!t.deployed;
                                    return (
                                        <li key={`${t.type}:${t.name}`}>
                                            <button
                                                type="button"
                                                aria-current={isSelected ? 'true' : undefined}
                                                onClick={() => {
                                                    void setSelectedName(t.name);
                                                    void setSelectedType(t.type);
                                                }}
                                                className={cn(
                                                    'w-full flex flex-col gap-1 p-3 rounded-md border border-border-muted bg-bg-elevated text-left cursor-pointer hover:bg-bg-subtle transition-colors',
                                                    isDeployed && 'opacity-50',
                                                    isSelected && 'bg-bg-subtle border-l-2 border-l-border-brand'
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-text-primary text-body-medium-medium truncate">{t.name}</span>
                                                    <Badge variant="gray" className="uppercase shrink-0">
                                                        {t.type}
                                                    </Badge>
                                                </div>
                                                {t.description && (
                                                    <span className="text-text-secondary text-body-small-regular line-clamp-1">{t.description}</span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-120 min-h-0 overflow-y-auto pr-11 py-3">
                    {isLoading ? (
                        <Skeleton className="w-full h-96" />
                    ) : selected && integrationData ? (
                        <TemplateDetail
                            key={`${selected.type}:${selected.name}`}
                            template={selected}
                            provider={integrationData.integration.provider}
                            onDeploy={onDeploy}
                            isDeploying={isDeploying}
                        />
                    ) : null}
                </div>
            </div>
        </DashboardLayout>
    );
};
