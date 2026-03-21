import { Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { PlaygroundInputs } from './PlaygroundInputs';
import { PlaygroundResult } from './PlaygroundResult';
import { PlaygroundSelectors } from './PlaygroundSelectors';
import { getInputFields } from './types';
import { usePlaygroundReattach } from './usePlaygroundReattach';
import { usePlaygroundRun } from './usePlaygroundRun';
import { Button } from '../ui/button';
import { Sheet, SheetContent } from '../ui/sheet';
import { useGetIntegrationFlows } from '@/hooks/useIntegration';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { cn } from '@/utils/utils';

import type { NangoSyncConfig } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const Playground: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundFunctionName = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const result = usePlaygroundStore((s) => s.result);
    const running = usePlaygroundStore((s) => s.running);
    const inputErrors = usePlaygroundStore((s) => s.inputErrors);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const clearPlaygroundInputError = usePlaygroundStore((s) => s.clearInputError);

    const location = useLocation();

    useEffect(() => {
        // Auto-close the sheet when the route changes
        if (playgroundOpen) {
            setPlaygroundOpen(false);
        }
    }, [location.pathname]);

    const queryEnv = playgroundOpen ? env : '';

    const { data: flowsData } = useGetIntegrationFlows(queryEnv, playgroundIntegration || '');

    const allFlows: (NangoSyncConfig & { resolvedType: 'action' | 'sync' })[] = useMemo(() => {
        if (!flowsData) return [];
        return flowsData.data.flows.filter((f) => f.type === 'action' || f.type === 'sync').map((f) => ({ ...f, resolvedType: f.type as 'action' | 'sync' }));
    }, [flowsData]);

    const playgroundFunction = useMemo(() => {
        if (!playgroundFunctionName) return undefined;
        return allFlows.find((f) => f.name === playgroundFunctionName);
    }, [allFlows, playgroundFunctionName]);

    const inputSchema = useMemo((): JSONSchema7 | null => {
        if (!playgroundFunction || !playgroundFunction.json_schema || typeof playgroundFunction.json_schema !== 'object') return null;
        const defKey = playgroundFunction.input;
        const schema =
            (defKey ? (playgroundFunction.json_schema.definitions?.[defKey] as JSONSchema7 | undefined) : undefined) || playgroundFunction.json_schema;
        if (!schema || typeof schema !== 'object') return null;
        const props = schema.properties;
        if (!props || Object.keys(props).length === 0) return null;
        return schema;
    }, [playgroundFunction]);

    const inputFields = useMemo(() => getInputFields(inputSchema), [inputSchema]);

    const { handleRun, handleCancel } = usePlaygroundRun(inputFields);
    usePlaygroundReattach();

    const clearInputError = useCallback((name: string) => clearPlaygroundInputError(name), [clearPlaygroundInputError]);

    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunctionName && playgroundFunctionType);
    const isSync = playgroundFunctionType === 'sync';
    const showInputs = Boolean(playgroundFunction && (isSync || inputFields.length > 0));

    return (
        <>
            {/* Custom overlay — click to close, pointer-events-none so it never blocks the page */}
            <div
                className={cn(
                    'fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ease-in-out',
                    playgroundOpen ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'
                )}
                onClick={() => setPlaygroundOpen(false)}
            />
            <Sheet open={playgroundOpen} onOpenChange={setPlaygroundOpen} modal={false}>
                <SheetContent
                    side="right"
                    overlayClassName="hidden"
                    insetTop={108}
                    insetBottom={44}
                    insetRight={24}
                    onInteractOutside={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onFocusOutside={(e) => e.preventDefault()}
                    className={cn(
                        'dark:bg-bg-elevated text-text-primary rounded-lg border border-border-muted shadow-lg p-6',
                        'flex flex-col items-start gap-[10px]',
                        'w-[537px] max-w-none sm:max-w-none',
                        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                        '[&>button]:hidden'
                    )}
                >
                    {/* Header */}
                    <div className="flex w-full items-start justify-between pb-8">
                        <div className="min-w-0">
                            <h2 className="text-text-primary text-heading-medium font-medium text-[20px] pb-2">Playground</h2>
                            <p className="text-body-regular-medium text-text-secondary text-body-medium-medium text-[14px] font-400 line-height-[160%]">
                                Quickly run any function.
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" className="size-7 mt-0.5" onClick={() => setPlaygroundOpen(false)} aria-label="Close playground">
                            <X className="size-4" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="flex w-full flex-col gap-6">
                        <PlaygroundSelectors env={env} queryEnv={queryEnv} />

                        {showInputs && (
                            <PlaygroundInputs
                                env={env}
                                queryEnv={queryEnv}
                                isSync={isSync}
                                inputFields={inputFields}
                                inputErrors={inputErrors}
                                clearInputError={clearInputError}
                            />
                        )}

                        {/* Run controls */}
                        <div className="pt-1 flex gap-2">
                            {running ? (
                                <>
                                    <Button variant="primary" disabled loading={true} size="sm">
                                        Running
                                    </Button>
                                    {isSync && (
                                        <Button variant="destructive" size="sm" onClick={handleCancel}>
                                            <X className="size-4" />
                                            Cancel run
                                        </Button>
                                    )}
                                </>
                            ) : result ? (
                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun}>
                                    <RotateCcw className="size-4" />
                                    Run again
                                </Button>
                            ) : (
                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun}>
                                    <Play className="size-4" />
                                    Run
                                </Button>
                            )}
                        </div>

                        <PlaygroundResult env={env} isSync={isSync} />
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};
