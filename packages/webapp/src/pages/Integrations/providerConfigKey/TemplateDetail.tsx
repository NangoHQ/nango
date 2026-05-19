import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Upload } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { JsonSchemaTopLevelObject } from '../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../components/jsonSchema/utils';
import { CodeBlock } from '@/components-v2/CodeBlock';
import { ConditionalTooltip } from '@/components-v2/ConditionalTooltip';
import { EmptyCard } from '@/components-v2/EmptyCard';
import { KeyValueBadge } from '@/components-v2/KeyValueBadge';
import { LineSnippet } from '@/components-v2/LineSnippet';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components-v2/ui/popover';
import { Spinner } from '@/components-v2/ui/spinner';
import { INTEGRATION_TEMPLATES_GITHUB_URL, INTEGRATION_TEMPLATES_RAW_URL } from '@/constants';

import type { NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

function buildPullCommand(provider: string, templateName: string, templateType: NangoFunctionTemplate['type']): string {
    return `nango pull --catalog ${provider} ${templateName} ${templateType === 'action' ? '-a' : '-s'}`;
}

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
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="secondary" size="sm">
                                Customize
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-fit p-4 flex flex-col gap-2 bg-bg-elevated border border-border-muted">
                            <span className="text-text-primary text-body-medium-semi">Pull template to customize</span>
                            <LineSnippet
                                className="bg-bg-surface border border-border-muted w-96 min-w-0"
                                snippet={buildPullCommand(provider, template.name, template.type)}
                            />
                            <Link
                                to="https://nango.dev/docs/reference/functions/functions-cli"
                                target="_blank"
                                className="text-text-tertiary self-end text-body-small-medium inline-flex items-center gap-1.5 w-fit"
                            >
                                Get started with the Nango CLI <ExternalLink className="size-3.5" />
                            </Link>
                        </PopoverContent>
                    </Popover>

                    <ConditionalTooltip condition={!!template.deployed} content="You already have a function deployed with this name">
                        <Button type="button" size="sm" onClick={onDeploy} disabled={isDeploying || !!template.deployed}>
                            <Upload />
                            {isDeploying ? 'Deploying…' : 'Deploy template'}
                        </Button>
                    </ConditionalTooltip>
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
