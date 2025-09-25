import { X } from '@geist-ui/icons';
import { PlusSmallIcon } from '@heroicons/react/24/outline';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { Input } from './Input';
import useSet from '../../../hooks/useSet';
import { CopyButton } from '../button/CopyButton';

import type { KeyboardEvent } from 'react';

type TagsInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & {
    defaultValue?: string;
    selectedScopes?: string[];
    onScopeChange?: (values: string) => void;
    addToScopesSet?: (scope: string) => void;
    removeFromSelectedSet?: (scope: string) => void;
    clipboard?: boolean;
};

const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(function TagsInput(
    {
        className,
        defaultValue,
        selectedScopes: optionalSelectedScopes,
        onScopeChange,
        addToScopesSet: optionalAddToScopesSet,
        removeFromSelectedSet: optionalRemoveFromSelectedSet,
        clipboard,
        ...props
    },
    ref
) {
    const defaultScopes = useMemo(() => {
        return defaultValue ? defaultValue.split(',') : [];
    }, [defaultValue]);

    const [enteredValue, setEnteredValue] = useState('');
    const [error, setError] = useState('');
    const [selectedScopes, addToScopesSet, removeFromSelectedSet] = useSet<string>();

    const [scopes, setScopes] = useState(selectedScopes);

    const prevOptionalScopesRef = useRef<string>('');
    const lastSentToParentRef = useRef<string>('');

    const isControlled = optionalSelectedScopes !== undefined;

    const readOnly = props.readOnly || false;

    useEffect(() => {
        const optionalSelectedScopesStr = JSON.stringify(optionalSelectedScopes || []);
        const selectedScopesStr = JSON.stringify(selectedScopes);

        if (isControlled && optionalSelectedScopesStr !== prevOptionalScopesRef.current && optionalSelectedScopesStr !== lastSentToParentRef.current) {
            prevOptionalScopesRef.current = optionalSelectedScopesStr;
            setScopes(optionalSelectedScopes);
        } else if (!isControlled && selectedScopesStr !== JSON.stringify(scopes)) {
            setScopes(selectedScopes);
        }
    }, [optionalSelectedScopes, selectedScopes, scopes, isControlled]);

    useEffect(() => {
        if (defaultScopes.length) {
            defaultScopes.forEach((scope) => {
                if (isControlled) {
                    const trimmedScope = scope.trim();
                    if (!scopes.includes(trimmedScope)) {
                        setScopes((prev) => [...prev, trimmedScope]);
                    }
                } else {
                    typeof optionalAddToScopesSet === 'function' ? optionalAddToScopesSet(scope.trim()) : addToScopesSet(scope.trim());
                }
            });
        }
    }, [defaultScopes, addToScopesSet, optionalAddToScopesSet, isControlled, scopes]);

    useEffect(() => {
        if (onScopeChange) {
            const scopeString = scopes.join(',');
            if (scopeString !== lastSentToParentRef.current) {
                lastSentToParentRef.current = scopeString;
                onScopeChange(scopeString);
            }
        }
    }, [scopes, onScopeChange]);

    function handleEnter(e: KeyboardEvent<HTMLInputElement>) {
        //quick check for empty inputs
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    }

    function handleAdd() {
        if (enteredValue.trim()) {
            if (enteredValue.includes(',')) {
                const enteredScopes = enteredValue
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s);

                if (isControlled) {
                    setScopes((prev) => [...prev, ...enteredScopes.filter((scope) => !prev.includes(scope))]);
                } else {
                    enteredScopes.forEach((scope) => {
                        typeof optionalAddToScopesSet === 'function' ? optionalAddToScopesSet(scope) : addToScopesSet(scope);
                    });
                }
                setEnteredValue('');
                setError('');
                return;
            }

            const trimmedScope = enteredValue.trim();
            if (isControlled) {
                if (!scopes.includes(trimmedScope)) {
                    setScopes((prev) => [...prev, trimmedScope]);
                }
            } else {
                typeof optionalAddToScopesSet === 'function' ? optionalAddToScopesSet(trimmedScope) : addToScopesSet(trimmedScope);
            }
            setEnteredValue('');
            setError('');
        }
    }

    function removeScope(scopeToBeRemoved: string) {
        if (isControlled) {
            setScopes((prev) => prev.filter((scope) => scope !== scopeToBeRemoved));
        } else {
            typeof optionalRemoveFromSelectedSet === 'function' ? optionalRemoveFromSelectedSet(scopeToBeRemoved) : removeFromSelectedSet(scopeToBeRemoved);
        }
    }

    function showInvalid() {
        //show error message only when developer sets this field to be a required one.
        if (props.required) {
            setError('Please enter at least one scope for this provider');
        }
    }

    return (
        <div className="flex flex-col gap-2 grow">
            {!readOnly && (
                <>
                    <div className="flex gap-3 grow">
                        <input onInvalid={showInvalid} value={scopes.join(',')} {...props} hidden />
                        <Input
                            ref={ref}
                            value={enteredValue}
                            onChange={(e) => setEnteredValue(e.currentTarget.value)}
                            onKeyDown={handleEnter}
                            placeholder={scopes.length ? '' : 'Find the list of scopes in the documentation of the external API provider.'}
                            variant={'flat'}
                            after={clipboard ? <CopyButton text={scopes.join(',')} textPrompt="Copy scopes" /> : undefined}
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                    {enteredValue !== '' && (
                        <div
                            className="flex items-center border border-border-gray bg-active-gray text-white rounded-md px-3 py-0.5 mt-0.5 cursor-pointer"
                            onClick={handleAdd}
                        >
                            <PlusSmallIcon className="h-5 w-5" onClick={handleAdd} />
                            <span className="">Add new scope: &quot;{enteredValue}&quot;</span>
                        </div>
                    )}
                </>
            )}
            {Boolean(scopes.length) && (
                <div className="pt-1 mb-3 flex flex-wrap space-x-2">
                    {scopes.map((selectedScope, i) => {
                        return (
                            <span
                                key={selectedScope + i}
                                className={`${!readOnly ? 'cursor-pointer pl-4 pr-2' : 'px-3'} flex flex-wrap gap-1 py-1 mt-0.5 justify-between items-center text-sm font-medium rounded-lg bg-green-600/20 text-green-600`}
                            >
                                {selectedScope}
                                {!readOnly && <X onClick={() => removeScope(selectedScope)} className="h-5 w-5" />}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

export default TagsInput;
