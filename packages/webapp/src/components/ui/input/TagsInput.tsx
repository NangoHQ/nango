import { forwardRef, type KeyboardEvent, useState, useMemo } from 'react';
import { X } from '@geist-ui/icons';

import useSet from '../../../hooks/useSet';

type TagsInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & { defaultValue: string };

const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(function TagsInput({ className, defaultValue, ...props }, ref) {
    const defaultScopes = useMemo(() => {
        return !!defaultValue ? defaultValue.split(',') : [];
    }, [defaultValue]);

    const [enteredValue, setEnteredValue] = useState('');
    const [error, setError] = useState('');
    const [selectedScopes, addToScopesSet, removeFromSelectedSet] = useSet<string>(defaultScopes);

    function handleEnter(e: KeyboardEvent<HTMLInputElement>) {
        //quick check for empty inputs
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    }

    function handleAdd() {
        if (enteredValue.trim()) {
            addToScopesSet(enteredValue.trim());
            setEnteredValue('');
            setError('');
        }
    }

    function removeScope(scopeToBeRemoved: string) {
        removeFromSelectedSet(scopeToBeRemoved);
    }

    function showInvalid() {
        //show error message only when developer sets this field to be a required one.
        if (props.required) {
            setError('Please enter atleast one scope for this provider');
        }
    }

    return (
        <>
            <div className="flex gap-3">
                <input onInvalid={showInvalid} value={selectedScopes.join(',')} {...props} hidden />
                <input
                    ref={ref}
                    value={enteredValue}
                    onChange={(e) => setEnteredValue(e.currentTarget.value)}
                    onKeyDown={handleEnter}
                    className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                />
                <button
                    onClick={() => handleAdd()}
                    type="button"
                    className="text-center px-8 text-sm font-medium bg-white text-black rounded-lg cursor-pointer"
                >
                    Add
                </button>
            </div>
            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
            {!!selectedScopes.length && (
                <div className="px-2 pt-2 mt-3 pb-11 mb-3 flex flex-wrap rounded-lg border border-border-gray">
                    {selectedScopes.map((selectedScope, i) => {
                        return (
                            <span
                                key={selectedScope + i}
                                className="flex flex-wrap gap-2 pl-4 pr-2 py-2 m-1 justify-between items-center text-sm font-medium rounded-lg cursor-pointer bg-gray-100 text-black"
                            >
                                {selectedScope}
                                <X onClick={() => removeScope(selectedScope)} className="h-5 w-5" />
                            </span>
                        );
                    })}
                </div>
            )}
        </>
    );
});

export default TagsInput;
