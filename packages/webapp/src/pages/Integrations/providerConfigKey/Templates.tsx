import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Search, Upload } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { JsonSchemaTopLevelObject } from '../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../components/jsonSchema/utils';
import { CodeBlock } from '@/components-v2/CodeBlock';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { EmptyCard } from '@/components-v2/EmptyCard';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { KeyValueBadge } from '@/components-v2/KeyValueBadge';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { ComboboxSelect } from '@/components-v2/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { INTEGRATION_TEMPLATES_GITHUB_URL, INTEGRATION_TEMPLATES_RAW_URL } from '@/constants';
import { usePreBuiltDeployFlow } from '@/hooks/useFlow';
import { useGetIntegration } from '@/hooks/useIntegration';
import { useGetProviderTemplates } from '@/hooks/useIntegrationFunctions';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { cn } from '@/utils/utils';

import type { ComboboxOption } from '@/components-v2/ui/combobox';
import type { ApiError, NangoActionFunction, NangoSyncFunction } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

type Template = NangoSyncFunction | NangoActionFunction;

const TYPE_FILTER_VALUES = ['sync', 'action'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_OPTIONS: ComboboxOption<TypeFilterValue>[] = [
    { value: 'sync', label: 'Sync' },
    { value: 'action', label: 'Action' }
];

function isTypeFilterValue(value: string): value is TypeFilterValue {
    return (TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

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
    } = useGetProviderTemplates({ env, providerConfigKey: providerConfigKey! });
    const templates = templatesResponse?.data;

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    useDebounce(() => setDebouncedSearch(search || ''), 300, [search]);

    const [rawTypeFilter, setTypeFilter] = useQueryState('typeFilter', parseAsString.withDefault(''));
    const typeFilter: TypeFilterValue | undefined = rawTypeFilter && isTypeFilterValue(rawTypeFilter) ? rawTypeFilter : undefined;

    const [selectedName, setSelectedName] = useQueryState('template', parseAsString);
    const [selectedType, setSelectedType] = useQueryState('type', parseAsString);

    const filteredTemplates = useMemo<Template[]>(() => {
        if (!templates) return [];
        const needle = debouncedSearch.trim().toLowerCase();
        return templates.filter((t) => {
            if (typeFilter && t.type !== typeFilter) return false;
            if (needle) {
                const haystack = `${t.name} ${t.description ?? ''}`.toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            return true;
        });
    }, [templates, debouncedSearch, typeFilter]);

    const selected = useMemo<Template | null>(() => {
        if (!selectedName || !selectedType) return null;
        return filteredTemplates.find((t) => t.name === selectedName && t.type === selectedType) ?? null;
    }, [filteredTemplates, selectedName, selectedType]);

    useEffect(() => {
        if (templatesLoading) return;
        if (filteredTemplates.length === 0) {
            if (selectedName !== null) void setSelectedName(null);
            if (selectedType !== null) void setSelectedType(null);
            return;
        }
        if (!selected) {
            const fallback = filteredTemplates[0];
            void setSelectedName(fallback.name);
            void setSelectedType(fallback.type);
        }
    }, [templatesLoading, filteredTemplates, selected, selectedName, selectedType, setSelectedName, setSelectedType]);

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
            toast({ title: `${selected.name} deployed successfully`, variant: 'success' });
            navigate(`/${env}/integrations/${integrationData.integration.unique_key}/functions/${encodeURIComponent(selected.name)}?type=${selected.type}`);
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
                <title>Browse templates - Nango</title>
            </Helmet>

            <div className="flex gap-6 w-full flex-1 min-h-0 pl-11">
                <div className="flex flex-col gap-6 w-[420px] shrink-0 min-h-0">
                    {/** Header */}
                    {integrationData ? (
                        <div className="inline-flex items-center gap-2.5 shrink-0 pt-6">
                            <IntegrationLogo provider={integrationData.integration.provider} className="size-10.5" />
                            <span className="text-text-primary text-body-large-semi">
                                {integrationData.integration.display_name ?? integrationData.template.display_name}
                            </span>
                            <span className="text-text-tertiary text-body-medium-regular">/ Browse templates</span>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-2.5 shrink-0 pl-11 pt-11">
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
                                                    isSelected && 'bg-bg-subtle border-l-2 border-l-border-brand'
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-text-primary text-body-medium-medium truncate">{t.name}</span>
                                                    <Badge variant="gray" className="uppercase">
                                                        {t.type}
                                                    </Badge>
                                                </div>
                                                {t.description && (
                                                    <span className="text-text-secondary text-body-small-regular line-clamp-1">{t.description}</span>
                                                )}
                                                {t.scopes && t.scopes.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        {t.scopes.slice(0, 3).map((scope) => (
                                                            <Badge key={scope} variant="gray">
                                                                {scope.length > 15 ? `…${scope.slice(-15)}` : scope}
                                                            </Badge>
                                                        ))}
                                                        {t.scopes.length > 3 && <Badge variant="gray">+{t.scopes.length - 3}</Badge>}
                                                    </div>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pr-11 py-3">
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

interface TemplateDetailProps {
    template: Template;
    provider: string;
    onDeploy: () => void;
    isDeploying: boolean;
}

const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, provider, onDeploy, isDeploying }) => {
    const githubUrl = `${INTEGRATION_TEMPLATES_GITHUB_URL}/tree/main/integrations/${provider}/${template.type === 'action' ? 'actions' : 'syncs'}/${template.name}.ts`;
    const rawCodeUrl = `${INTEGRATION_TEMPLATES_RAW_URL}/main/integrations/${provider}/${template.type === 'action' ? 'actions' : 'syncs'}/${template.name}.ts`;
    const {
        data: code,
        isLoading: isCodeLoading,
        error: codeError
    } = useQuery<string>({
        queryKey: ['template-code', provider, template.type, template.name],
        queryFn: async () => {
            const res = await fetch(rawCodeUrl);
            if (!res.ok) throw new Error(`Failed to load template source (${res.status})`);
            return await res.text();
        },
        retry: false,
        staleTime: 5 * 60 * 1000
    });

    const inputSchema = useMemo<JSONSchema7 | null>(() => {
        if (!template.input || !template.json_schema) return null;
        const schema = template.json_schema.definitions?.[template.input] ?? null;
        if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) return null;
        return schema as JSONSchema7;
    }, [template]);

    const outputSchemas = useMemo<{ name: string; schema: JSONSchema7 }[]>(() => {
        if (!template.returns || !template.json_schema) return [];
        return template.returns
            .map((name) => {
                const schema = template.json_schema?.definitions?.[name] ?? null;
                if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) return null;
                return { name, schema: schema as JSONSchema7 };
            })
            .filter((item): item is { name: string; schema: JSONSchema7 } => item !== null);
    }, [template]);

    return (
        <div className="flex flex-col gap-6 p-6 rounded-md border border-border-muted bg-bg-elevated">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <div className="inline-flex items-center gap-2">
                        <span className="text-text-primary text-body-large-semi">{template.name}</span>
                        <Badge variant="gray" className="uppercase">
                            {template.type}
                        </Badge>
                    </div>
                    {template.description && <span className="text-text-secondary text-body-medium-regular">{template.description}</span>}
                </div>
                <Button type="button" onClick={onDeploy} disabled={isDeploying}>
                    <Upload />
                    {isDeploying ? 'Deploying…' : 'Deploy template'}
                </Button>
            </div>

            {template.type === 'sync' && (
                <div className="flex flex-wrap gap-4 gap-y-2">
                    {template.runs && (
                        <KeyValueBadge label="Frequency">
                            <span>{template.runs}</span>
                        </KeyValueBadge>
                    )}
                    <KeyValueBadge label="Auto start">{template.auto_start ? 'yes' : 'no'}</KeyValueBadge>
                </div>
            )}

            <section className="flex flex-col gap-2">
                <span className="text-text-primary text-body-medium-semi">Required scopes</span>
                {template.scopes && template.scopes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {template.scopes.map((scope) => (
                            <Badge key={scope} variant="gray">
                                {scope}
                            </Badge>
                        ))}
                    </div>
                ) : (
                    <span className="text-text-secondary text-body-medium-regular">No scopes required.</span>
                )}
            </section>

            <Tabs defaultValue={!inputSchema && outputSchemas.length > 0 ? 'output' : 'input'} className="gap-4">
                <TabsList className="w-fit gap-0">
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="output">Output</TabsTrigger>
                    <TabsTrigger value="code">Code</TabsTrigger>
                </TabsList>
                <TabsContent value="input" className="flex flex-col gap-4">
                    {inputSchema ? (
                        <JsonSchemaTopLevelObject schema={inputSchema} />
                    ) : (
                        <EmptyCard>
                            <span className="text-text-secondary text-body-medium-regular">No inputs.</span>
                        </EmptyCard>
                    )}
                </TabsContent>
                <TabsContent value="output" className="flex flex-col gap-4">
                    {outputSchemas.length > 0 ? (
                        <Navigation defaultValue={outputSchemas[0].name} orientation="horizontal">
                            {outputSchemas.length > 1 && (
                                <NavigationList>
                                    {outputSchemas.map((o) => (
                                        <NavigationTrigger key={o.name} value={o.name}>
                                            {o.name}
                                        </NavigationTrigger>
                                    ))}
                                </NavigationList>
                            )}
                            {outputSchemas.map((o) => (
                                <NavigationContent key={o.name} value={o.name}>
                                    <JsonSchemaTopLevelObject schema={o.schema} />
                                </NavigationContent>
                            ))}
                        </Navigation>
                    ) : (
                        <EmptyCard>
                            <span className="text-text-secondary text-body-medium-regular">No outputs.</span>
                        </EmptyCard>
                    )}
                </TabsContent>
                <TabsContent value="code" className="flex flex-col gap-4">
                    {isCodeLoading ? (
                        <Skeleton className="w-full h-96" />
                    ) : codeError || !code ? (
                        <EmptyCard>
                            <span className="text-text-secondary text-body-medium-regular">Failed to load source code.</span>
                        </EmptyCard>
                    ) : (
                        <CodeBlock
                            title={`${template.name}.ts`}
                            language="typescript"
                            code={code}
                            copyable={false}
                            headerElement={
                                <ButtonLink to={githubUrl} variant="secondary" target="_blank">
                                    View on GitHub
                                    <ExternalLink />
                                </ButtonLink>
                            }
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};
