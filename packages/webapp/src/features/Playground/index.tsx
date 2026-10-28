import { Braces, Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, FieldLabel } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { getPlaygroundInput, getPlaygroundInputFields } from './input.utils';
import { PlaygroundInputs } from './PlaygroundInputs';
import { PlaygroundResultData, PlaygroundResultStatus } from './PlaygroundResult';
import { PlaygroundSelectors } from './PlaygroundSelectors';
import { usePlayground } from './usePlayground';
import { usePlaygroundFunctions } from './usePlaygroundFunctions';

export const FunctionPlaygroundDrawer: React.FC = () => {
    const env = useStore((s) => s.env);
    const isOpen = usePlaygroundStore((s) => s.isOpen);
    const setOpen = usePlaygroundStore((s) => s.setOpen);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunctionName = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const result = usePlaygroundStore((s) => s.result);
    const running = usePlaygroundStore((s) => s.running);
    const inputErrors = usePlaygroundStore((s) => s.inputErrors);
    const clearPlaygroundInputError = usePlaygroundStore((s) => s.clearInputError);
    const { pathname } = useLocation();

    // `pathname` is the trigger: the drawer closes on every navigation.
    useEffect(() => {
        usePlaygroundStore.getState().setOpen(false);
    }, [pathname]);

    const playgroundFunctions = usePlaygroundFunctions({ env: isOpen ? env : '', providerConfigKey: playgroundIntegration || '' });

    const playgroundFunction = useMemo(() => {
        if (!playgroundFunctionName || !playgroundFunctionType) return undefined;
        return playgroundFunctions.rows.find((row) => row.name === playgroundFunctionName && row.type === playgroundFunctionType);
    }, [playgroundFunctions.rows, playgroundFunctionName, playgroundFunctionType]);

    const input = useMemo(() => getPlaygroundInput(playgroundFunction), [playgroundFunction]);
    const inputFields = useMemo(() => getPlaygroundInputFields(input), [input]);

    // Keep this outside SheetContent. SheetContent unmounts on close, and a sync run must keep polling.
    const { handleRun, handleCancel } = usePlayground(input);

    const clearInputError = useCallback((name: string) => clearPlaygroundInputError(name), [clearPlaygroundInputError]);

    const isFunctionDisabled = Boolean(playgroundFunction && playgroundFunction.enabled === false);
    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunction && playgroundFunctionType) && !isFunctionDisabled;
    const isSync = playgroundFunctionType === 'sync';
    const showInputs = Boolean(playgroundFunction && (isSync || inputFields.length > 0));

    return (
        <Sheet open={isOpen} onOpenChange={setOpen}>
            <SheetContent
                side="right"
                hideCloseButton
                className="w-full sm:w-[720px] max-w-none sm:max-w-none p-0 bg-surface-page text-text-strong border-l-border-muted"
            >
                <div className="h-full overflow-y-auto">
                    <div className="flex h-14 items-center justify-between border-b border-border-muted px-6">
                        <SheetTitle className="type-heading-sm text-text-strong">Test run</SheetTitle>
                        <SheetClose
                            title="Close"
                            className="-mr-2 flex size-8 items-center justify-center bg-transparent text-text-muted transition-colors hover:text-text-strong focus:text-text-strong"
                        >
                            <X size={16} />
                        </SheetClose>
                    </div>
                    <div className="flex w-full flex-col gap-8 p-6">
                        <div className="flex flex-col gap-6">
                            <PlaygroundSelectors
                                env={env}
                                functions={playgroundFunctions.rows}
                                functionsReady={playgroundFunctions.ready}
                                functionsError={playgroundFunctions.error}
                                onRetryFunctions={playgroundFunctions.retry}
                            />

                            {showInputs && (
                                <PlaygroundInputs
                                    env={env}
                                    isSync={isSync}
                                    inputFields={inputFields}
                                    inputErrors={inputErrors}
                                    clearInputError={clearInputError}
                                />
                            )}

                            <div className="flex gap-2">
                                {running ? (
                                    <>
                                        <Button variant="primary" disabled loading={true} size="md">
                                            Running
                                        </Button>
                                        {isSync && (
                                            <Button variant="danger" size="md" onClick={handleCancel}>
                                                <X />
                                                Cancel run
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <ConditionalTooltip condition={isFunctionDisabled} content="Enable this function to run it.">
                                        <Button variant="primary" size="md" onClick={handleRun} disabled={!canRun}>
                                            {result ? <RotateCcw /> : <Play />}
                                            {result ? 'Run again' : 'Run'}
                                        </Button>
                                    </ConditionalTooltip>
                                )}
                            </div>

                            <PlaygroundResultStatus env={env} isSync={isSync} />
                        </div>

                        <div className="flex min-w-0 flex-col gap-3">
                            <FieldLabel>Result</FieldLabel>
                            {result ? (
                                <PlaygroundResultData />
                            ) : (
                                <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-ds-md border border-dashed border-border-default text-body-medium-regular text-text-muted">
                                    <Braces className="size-5" />
                                    Run a function to see its result here.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
