import { Play, Rocket, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { PlaygroundEditor } from './PlaygroundEditor';
import { PlaygroundInputs } from './PlaygroundInputs';
import { PlaygroundResult } from './PlaygroundResult';
import { PlaygroundSelectors } from './PlaygroundSelectors';
import { getInputFields } from './types';
import { usePlaygroundDryRun } from './usePlaygroundDryRun';
import { usePlaygroundReattach } from './usePlaygroundReattach';
import { usePlaygroundRun } from './usePlaygroundRun';
import { Button } from '../ui/button';
import { Sheet, SheetContent } from '../ui/sheet';
import { useFlowSource } from '@/hooks/useFlowSource';
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

    // Editor state
    const editorOpen = usePlaygroundStore((s) => s.editorOpen);
    const editorCode = usePlaygroundStore((s) => s.editorCode);
    const editorDryRunning = usePlaygroundStore((s) => s.editorDryRunning);
    const editorDeploying = usePlaygroundStore((s) => s.editorDeploying);
    const setEditorOpen = usePlaygroundStore((s) => s.setEditorOpen);
    const setEditorCode = usePlaygroundStore((s) => s.setEditorCode);
    const setEditorOriginalCode = usePlaygroundStore((s) => s.setEditorOriginalCode);
    const clearConsoleOutput = usePlaygroundStore((s) => s.clearConsoleOutput);

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
    const { handleDryRun, handleDeploy, handleCancelDryRun } = usePlaygroundDryRun(inputFields);
    usePlaygroundReattach();

    // Fetch source code when editor opens
    const flowId = editorOpen ? (playgroundFunction?.id ?? null) : null;
    const { data: sourceCode, isLoading: sourceLoading } = useFlowSource(env, flowId);

    useEffect(() => {
        if (sourceCode && editorCode === null) {
            setEditorCode(sourceCode);
            setEditorOriginalCode(sourceCode);
        }
    }, [sourceCode, editorCode, setEditorCode, setEditorOriginalCode]);

    const handleCloseEditor = useCallback(() => {
        setEditorOpen(false);
        setEditorCode(null);
        setEditorOriginalCode(null);
        clearConsoleOutput();
    }, [setEditorOpen, setEditorCode, setEditorOriginalCode, clearConsoleOutput]);

    const clearInputError = useCallback((name: string) => clearPlaygroundInputError(name), [clearPlaygroundInputError]);

    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunctionName && playgroundFunctionType);
    const canDryRun = canRun && Boolean(editorCode);
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
                    insetTop={88}
                    insetBottom={24}
                    insetRight={24}
                    onInteractOutside={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onFocusOutside={(e) => e.preventDefault()}
                    className={cn(
                        'text-text-primary rounded-lg border border-border-muted shadow-lg p-6',
                        'flex flex-col items-start gap-2.5',
                        'max-w-none sm:max-w-none',
                        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                        '[&>button]:hidden',
                        'transition-[width] duration-300 ease-in-out',
                        editorOpen ? 'w-[calc(100vw-120px)]' : 'w-[537px]'
                    )}
                >
                    <div className={cn('flex gap-6 w-full', editorOpen ? 'h-full min-h-0' : 'flex-col')}>
                        {/* Left pane: Editor (only when editor is open) */}
                        {editorOpen && (
                            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-text-primary text-body-medium-semi">{playgroundFunctionName}.ts</h3>
                                    <Button variant="ghost" size="sm" onClick={handleCloseEditor}>
                                        <X className="size-4" />
                                        Close editor
                                    </Button>
                                </div>
                                <PlaygroundEditor loading={sourceLoading} />
                            </div>
                        )}

                        {/* Right pane: Controls (always visible) */}
                        <div className={cn('flex flex-col gap-4', editorOpen ? 'w-[420px] shrink-0 overflow-y-auto' : 'w-full')}>
                            <div className="flex flex-col gap-8">
                                {/* Header */}
                                <div className="flex w-full items-start justify-between">
                                    <div className="min-w-0 flex flex-col gap-2">
                                        <h2 className="text-text-primary text-heading-medium">Playground</h2>
                                        <p className="text-body-medium-regular text-text-secondary">Quickly run any function.</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setPlaygroundOpen(false)} aria-label="Close playground">
                                        <X />
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
                                    <div className="flex gap-2">
                                        {editorOpen ? (
                                            <>
                                                {editorDryRunning ? (
                                                    <>
                                                        <Button variant="primary" disabled loading={true} size="sm">
                                                            Running
                                                        </Button>
                                                        <Button variant="destructive" size="sm" onClick={handleCancelDryRun}>
                                                            <X className="size-4" />
                                                            Cancel
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button variant="primary" size="sm" onClick={handleDryRun} disabled={!canDryRun}>
                                                        <Play className="size-4" />
                                                        Run
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={handleDeploy}
                                                    disabled={!canDryRun || editorDryRunning || editorDeploying}
                                                    loading={editorDeploying}
                                                >
                                                    <Rocket className="size-4" />
                                                    Deploy
                                                </Button>
                                            </>
                                        ) : running ? (
                                            <>
                                                <Button variant="primary" disabled loading={true} size="sm">
                                                    Running
                                                </Button>
                                                {isSync && (
                                                    <Button variant="destructive" size="sm" onClick={handleCancel}>
                                                        <X />
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
                                </div>
                            </div>
                            {!editorOpen && <PlaygroundResult env={env} isSync={isSync} />}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};
