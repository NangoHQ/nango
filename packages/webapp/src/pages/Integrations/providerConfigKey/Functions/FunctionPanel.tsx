import { CopyButton } from '@/components/ui/CopyButton';
import { CountBadge } from '@/components/ui/CountBadge';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';

import type { FunctionSchemas } from './functionDetails.utils';
import type { JSONSchema7 } from 'json-schema';

export const FunctionPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <aside className="sticky top-0 flex max-h-[calc(100dvh-7rem)] min-h-[min(606px,calc(100dvh-7rem))] w-full flex-col overflow-y-auto overscroll-y-contain bg-surface-panel">
        {children}
    </aside>
);

interface FunctionPanelHeaderProps {
    name: string;
    description?: string | undefined;
    actions?: React.ReactNode;
    children?: React.ReactNode;
}

export const FunctionPanelHeader: React.FC<FunctionPanelHeaderProps> = ({ name, description, actions, children }) => (
    <div className="flex items-start justify-between gap-2 border-b border-border-default p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1">
                <h2 data-panel-title tabIndex={-1} className="truncate type-code-medium-sm text-text-default outline-none">
                    {name}
                </h2>
                <CopyButton text={name} className="size-4 p-0" />
            </div>
            {description && <p className="type-text-regular-xs text-text-secondary">{description}</p>}
            {children}
        </div>
        {actions && <div className="flex h-5 shrink-0 items-center gap-2">{actions}</div>}
    </div>
);

interface ExtraTab {
    value: string;
    label: string;
    content: React.ReactNode;
}

interface FunctionSchemaTabsProps extends FunctionSchemas {
    extraTabs?: ExtraTab[];
    showFieldCounts?: boolean;
}

export const FunctionSchemaTabs: React.FC<FunctionSchemaTabsProps> = ({ inputSchema, outputSchemas, extraTabs = [], showFieldCounts = false }) => {
    const inputCount = showFieldCounts ? countFields(inputSchema ? [inputSchema] : []) : null;
    const outputCount = showFieldCounts ? countFields(outputSchemas.map((output) => output.schema)) : null;
    return (
        <Tabs defaultValue="input" className="gap-3 px-3 pt-3">
            <TabsList className="w-fit gap-3">
                <TabsTrigger value="input" className="px-2 py-1.5">
                    Input
                    {inputCount != null && <CountBadge count={inputCount} />}
                </TabsTrigger>
                <TabsTrigger value="output" className="px-2 py-1.5">
                    Output
                    {outputCount != null && <CountBadge count={outputCount} />}
                </TabsTrigger>
                {extraTabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} className="px-2 py-1.5">
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value="input">
                {inputSchema ? <JsonSchemaTopLevelObject schema={inputSchema} /> : <CompactEmptyState>No inputs.</CompactEmptyState>}
            </TabsContent>
            <TabsContent value="output">
                {outputSchemas.length > 0 ? (
                    <Navigation defaultValue={outputSchemas[0]?.name ?? ''} orientation="horizontal">
                        {outputSchemas.length > 1 && (
                            <NavigationList>
                                {outputSchemas.map((outputSchema) => (
                                    <NavigationTrigger key={outputSchema.name} value={outputSchema.name}>
                                        {outputSchema.name}
                                    </NavigationTrigger>
                                ))}
                            </NavigationList>
                        )}
                        {outputSchemas.map((outputSchema) => (
                            <NavigationContent key={outputSchema.name} value={outputSchema.name}>
                                <JsonSchemaTopLevelObject schema={outputSchema.schema} />
                            </NavigationContent>
                        ))}
                    </Navigation>
                ) : (
                    <CompactEmptyState>No outputs.</CompactEmptyState>
                )}
            </TabsContent>
            {extraTabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                    {tab.content}
                </TabsContent>
            ))}
        </Tabs>
    );
};

function countFields(schemas: JSONSchema7[]): number | null {
    let total = 0;
    for (const schema of schemas) {
        if (!schema.properties) {
            return null;
        }
        total += Object.keys(schema.properties).length;
    }
    return total;
}

export const CompactEmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <EmptyCard className="h-24 min-h-0 p-3">
        <span className="type-label-sm text-text-secondary">{children}</span>
    </EmptyCard>
);
