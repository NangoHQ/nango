import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, ExternalLink, Upload } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { JsonSchemaTopLevelObject } from '../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../components/jsonSchema/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { CodeBlock } from '@/components-v2/CodeBlock';
import { EmptyCard } from '@/components-v2/EmptyCard';
import { KeyValueBadge } from '@/components-v2/KeyValueBadge';
import { LineSnippet } from '@/components-v2/LineSnippet';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Spinner } from '@/components-v2/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { INTEGRATION_TEMPLATES_GITHUB_URL, INTEGRATION_TEMPLATES_RAW_URL } from '@/constants';

import type { NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

interface TemplateDetailProps {
    template: NangoFunctionTemplate;
    provider: string;
    onDeploy: () => void;
    isDeploying: boolean;
}

export const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, provider, onDeploy, isDeploying }) => {
    const githubUrl = `${INTEGRATION_TEMPLATES_GITHUB_URL}/tree/main/integrations/${provider}/${template.type === 'action' ? 'actions' : 'syncs'}/${template.name}.ts`;

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
                <div className="inline-flex items-center gap-2 shrink-0">
                    {template.deployed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex text-feedback-warning-fg" tabIndex={0}>
                                    <AlertTriangle className="size-4" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">You already have a function deployed with this name</TooltipContent>
                        </Tooltip>
                    )}
                    <Button type="button" onClick={onDeploy} disabled={isDeploying || !!template.deployed}>
                        <Upload />
                        {isDeploying ? 'Deploying…' : 'Deploy template'}
                    </Button>
                </div>
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

            <Collapsible asChild>
                <section className="flex flex-col gap-2">
                    <CollapsibleTrigger className="flex items-center justify-between gap-2 cursor-pointer group">
                        <span className="text-text-primary text-body-medium-semi">Customize this template</span>
                        <ChevronRight className="size-4.5 text-text-tertiary transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-2">
                        <LineSnippet
                            className="bg-bg-surface border border-border-muted"
                            snippet={`nango pull --catalog ${provider} ${template.name} ${template.type === 'action' ? '--action' : '--sync'}`}
                        />
                        <Link
                            to="https://nango.dev/docs/guides/functions/functions-guide#step-by-step-guide"
                            target="_blank"
                            className="text-text-tertiary text-body-small-medium inline-flex items-center gap-1.5 w-fit"
                        >
                            Get started with the Nango CLI <ExternalLink className="size-3.5" />
                        </Link>
                    </CollapsibleContent>
                </section>
            </Collapsible>

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
                    <CodeTab provider={provider} templateType={template.type} templateName={template.name} githubUrl={githubUrl} />
                </TabsContent>
            </Tabs>
        </div>
    );
};

interface CodeTabProps {
    provider: string;
    templateType: NangoFunctionTemplate['type'];
    templateName: string;
    githubUrl: string;
}

// Rendered inside <TabsContent value="code">, which Radix unmounts when the tab is inactive.
// Mounting here means the GitHub fetch only fires when the user opens the Code tab.
const CodeTab: React.FC<CodeTabProps> = ({ provider, templateType, templateName, githubUrl }) => {
    const rawCodeUrl = `${INTEGRATION_TEMPLATES_RAW_URL}/main/integrations/${provider}/${templateType === 'action' ? 'actions' : 'syncs'}/${templateName}.ts`;
    const {
        data: code,
        isLoading,
        error
    } = useQuery<string>({
        queryKey: ['template-code', provider, templateType, templateName],
        queryFn: async () => {
            const res = await fetch(rawCodeUrl);
            if (!res.ok) throw new Error(`Failed to load template source (${res.status})`);
            return await res.text();
        },
        retry: false,
        staleTime: 5 * 60 * 1000
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Spinner className="size-5 text-text-tertiary" />
            </div>
        );
    }
    if (error || !code) {
        return (
            <EmptyCard>
                <span className="text-text-secondary text-body-medium-regular">Failed to load source code.</span>
            </EmptyCard>
        );
    }
    return (
        <CodeBlock
            title={`${templateName}.ts`}
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
    );
};
