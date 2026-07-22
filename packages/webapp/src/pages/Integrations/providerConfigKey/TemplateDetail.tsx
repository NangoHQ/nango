import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Upload } from 'lucide-react';
import { useMemo } from 'react';

import { Badge, Button, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { KeyValueBadge } from '@/components/ui/KeyValueBadge';
import { LineSnippet } from '@/components/ui/LineSnippet';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { Spinner } from '@/components/ui/Spinner';
import { StyledLink } from '@/components/ui/StyledLink';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { INTEGRATION_TEMPLATES_GITHUB_URL, INTEGRATION_TEMPLATES_RAW_URL } from '@/constants';
import { buildPullCommand, functionRepoPath } from '@/utils/scripts';
import { JsonSchemaTopLevelObject } from '../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../components/jsonSchema/utils';

import type { NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

interface TemplateDetailProps {
    template: NangoFunctionTemplate;
    provider: string;
    // Canonical templates-repo folder when `provider` symlinks to another; used for repo URLs only.
    symLinkTargetName?: string | null;
    onDeploy: () => void;
    isDeploying: boolean;
}

export const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, provider, symLinkTargetName, onDeploy, isDeploying }) => {
    const repoProvider = symLinkTargetName ?? provider;
    const githubUrl = `${INTEGRATION_TEMPLATES_GITHUB_URL}/tree/main/${functionRepoPath({ provider: repoProvider, name: template.name, type: template.type })}`;

    const inputSchema = useMemo<JSONSchema7 | null>(() => {
        if (!template.input || !template.json_schema) {
            return null;
        }
        const schema = template.json_schema.definitions?.[template.input] ?? null;
        if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) {
            return null;
        }
        return schema as JSONSchema7;
    }, [template]);

    const outputSchemas = useMemo<{ name: string; schema: JSONSchema7 }[]>(() => {
        if (!template.returns || !template.json_schema) {
            return [];
        }
        return template.returns
            .map((name) => {
                const schema = template.json_schema?.definitions?.[name] ?? null;
                if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) {
                    return null;
                }
                return { name, schema: schema as JSONSchema7 };
            })
            .filter((item): item is { name: string; schema: JSONSchema7 } => item !== null);
    }, [template]);

    return (
        <div className="flex flex-col gap-6 p-6 rounded-md border border-border-muted bg-surface-page">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <div className="inline-flex items-center gap-2">
                        <span className="text-text-strong text-body-large-semi">{template.name}</span>
                        <Badge case="capitalize">{template.type}</Badge>
                    </div>
                    {template.description && <span className="text-text-secondary text-body-medium-regular">{template.description}</span>}
                </div>
                <div className="inline-flex items-center gap-2 shrink-0">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button type="button" variant="secondary" size="sm">
                                Customize
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Pull template to customize</DialogTitle>
                            </DialogHeader>
                            <DialogBody>
                                <div className="flex flex-col gap-1.5">
                                    <LineSnippet
                                        className="bg-surface-canvas border border-border-muted min-w-0"
                                        snippet={buildPullCommand({
                                            integration: provider,
                                            name: template.name,
                                            type: template.type,
                                            source: { catalog: true }
                                        })}
                                    />
                                    <StyledLink
                                        to="https://nango.dev/docs/reference/functions/functions-cli"
                                        type="external"
                                        icon
                                        className="text-body-small-medium"
                                    >
                                        Get started with the Nango CLI
                                    </StyledLink>
                                </div>
                            </DialogBody>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="secondary">
                                        Close
                                    </Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <ConditionalTooltip condition={!!template.deployed} content="You already have a function deployed with this name">
                        <Button type="button" size="sm" onClick={onDeploy} loading={isDeploying} disabled={!!template.deployed}>
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
                <span className="text-text-strong text-body-medium-semi">Required scopes</span>
                {template.scopes && template.scopes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {template.scopes.map((scope) => (
                            <Badge key={scope}>{scope}</Badge>
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
                    <CodeTab provider={repoProvider} templateType={template.type} templateName={template.name} githubUrl={githubUrl} />
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
    const rawCodeUrl = `${INTEGRATION_TEMPLATES_RAW_URL}/main/${functionRepoPath({ provider, name: templateName, type: templateType })}`;
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
                <Spinner className="size-5 text-text-muted" />
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
