import { useMemo } from 'react';

import { Badge, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@nangohq/design-system';

import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { JsonSchemaTopLevelObject } from '../../Integrations/components/jsonSchema/JsonSchema';
import { getInputSchema, getOutputSchemas } from '../../Integrations/providerConfigKey/Functions/FunctionDetailsPanel';
import { useFunctionDisplayName } from '../functions';
import { FunctionTypeBadge } from './FunctionTypeBadge';

import type { NangoActionFunction, NangoSyncFunction } from '@nangohq/types';

export const FunctionDialog = ({
    fn,
    setUpButton,
    onClose
}: {
    fn: NangoSyncFunction | NangoActionFunction | null;
    setUpButton: React.ReactNode;
    onClose: () => void;
}) => {
    return (
        <Dialog open={fn !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[85dvh]">{fn && <FunctionDialogContent fn={fn} setUpButton={setUpButton} />}</DialogContent>
        </Dialog>
    );
};

const FunctionDialogContent = ({ fn, setUpButton }: { fn: NangoSyncFunction | NangoActionFunction; setUpButton: React.ReactNode }) => {
    const displayName = useFunctionDisplayName(fn.name);
    const inputSchema = useMemo(() => getInputSchema(fn), [fn]);
    const outputSchemas = useMemo(() => getOutputSchemas(fn), [fn]);

    return (
        <>
            <DialogHeader>
                <div className="flex items-center gap-2">
                    <DialogTitle>{displayName}</DialogTitle>
                    <FunctionTypeBadge type={fn.type} />
                </div>
                {displayName !== fn.name && (
                    <div className="flex items-center gap-1">
                        <span className="type-code-regular-xs text-text-secondary">{fn.name}</span>
                        <CopyButton text={fn.name} className="size-4 p-0" />
                    </div>
                )}
                {fn.description && <DialogDescription>{fn.description}</DialogDescription>}
            </DialogHeader>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
                {(fn.type === 'sync' && fn.runs) || (fn.scopes && fn.scopes.length > 0) ? (
                    <div className="flex flex-col gap-2">
                        {fn.type === 'sync' && fn.runs && <Detail label="Runs">{fn.runs}</Detail>}
                        {fn.scopes && fn.scopes.length > 0 && (
                            <Detail label="Required scopes">
                                <div className="flex flex-wrap gap-1">
                                    {fn.scopes.map((scope) => (
                                        <Badge key={scope} variant="secondary">
                                            {scope}
                                        </Badge>
                                    ))}
                                </div>
                            </Detail>
                        )}
                    </div>
                ) : null}

                <Tabs defaultValue="input" className="gap-3">
                    <TabsList className="w-fit gap-3">
                        <TabsTrigger value="input" className="px-2 py-1.5">
                            Input
                        </TabsTrigger>
                        <TabsTrigger value="output" className="px-2 py-1.5">
                            Output
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="input">
                        {inputSchema ? <JsonSchemaTopLevelObject schema={inputSchema} /> : <CompactEmptyState>No inputs.</CompactEmptyState>}
                    </TabsContent>
                    <TabsContent value="output" className="flex flex-col gap-4">
                        {outputSchemas.length > 0 ? (
                            outputSchemas.map((outputSchema) => (
                                <div key={outputSchema.name} className="flex flex-col gap-2">
                                    {outputSchemas.length > 1 && <span className="type-code-medium-xs text-text-secondary">{outputSchema.name}</span>}
                                    <JsonSchemaTopLevelObject schema={outputSchema.schema} />
                                </div>
                            ))
                        ) : (
                            <CompactEmptyState>No outputs.</CompactEmptyState>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            <DialogFooter>{setUpButton}</DialogFooter>
        </>
    );
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2">
        <span className="shrink-0 type-label-xxs uppercase text-text-secondary">{label}</span>
        <div className="min-w-0 type-label-sm text-text-default">{children}</div>
    </div>
);

const CompactEmptyState = ({ children }: { children: React.ReactNode }) => (
    <EmptyCard className="h-24">
        <span className="type-label-sm text-text-secondary">{children}</span>
    </EmptyCard>
);
