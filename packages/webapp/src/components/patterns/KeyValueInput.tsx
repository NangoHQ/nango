import { EyeIcon, EyeOffIcon, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, CopyButton, IconButton, Input, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

interface KeyValuePair {
    id: number;
    key: string;
    value: string;
}

interface KeyValueInputProps {
    initialValues?: Record<string, string>;
    onChange: (values: Record<string, string>) => void;
    placeholderKey?: string;
    placeholderValue?: string;
    disabled?: boolean;
    isSecret?: boolean;
    mono?: boolean;
    columnLabels?: [string, string];
    /** Shows an "add" button with this label instead of keeping an empty row at the end. */
    addLabel?: string;
}

let nextId = 0;
const generateId = () => nextId++;
const emptyPair = (): KeyValuePair => ({ id: generateId(), key: '', value: '' });

export const KeyValueInput: React.FC<KeyValueInputProps> = ({
    initialValues = {},
    onChange,
    placeholderKey = 'Key',
    placeholderValue = 'Value',
    disabled = false,
    isSecret = false,
    mono = false,
    columnLabels,
    addLabel
}) => {
    const autoRow = !disabled && !addLabel;

    const buildPairsFromValues = (values: Record<string, string>): KeyValuePair[] => {
        const mapped = Object.entries(values).map(([key, value]) => ({ id: generateId(), key, value }));
        if (autoRow || (addLabel && !disabled && mapped.length === 0)) {
            return [...mapped, emptyPair()];
        }
        return mapped;
    };

    const [pairs, setPairs] = useState<KeyValuePair[]>(() => buildPairsFromValues(initialValues));

    const lastReportedRef = useRef<string>(JSON.stringify(initialValues));
    const initialValuesKey = JSON.stringify(initialValues);

    useEffect(() => {
        if (initialValuesKey !== lastReportedRef.current) {
            setPairs(buildPairsFromValues(initialValues));
            lastReportedRef.current = initialValuesKey;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValuesKey, autoRow]);

    useEffect(() => {
        setPairs((prev) => {
            const last = prev[prev.length - 1];
            const hasTrailingEmpty = last && last.key === '' && last.value === '';

            if (autoRow && !hasTrailingEmpty) {
                return [...prev, emptyPair()];
            }
            if (!autoRow && !addLabel && hasTrailingEmpty) {
                return prev.slice(0, -1);
            }
            return prev;
        });
    }, [autoRow, addLabel]);

    useEffect(() => {
        const newValues = pairs.reduce<Record<string, string>>((acc, curr) => {
            if (curr.key) {
                acc[curr.key] = curr.value;
            }
            return acc;
        }, {});

        const newValuesKey = JSON.stringify(newValues);
        if (newValuesKey !== lastReportedRef.current) {
            lastReportedRef.current = newValuesKey;
            onChange(newValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pairs]);

    const onUpdate = (field: 'key' | 'value', value: string, index: number) => {
        setPairs((prev) => {
            const copy = prev.map((p) => ({ ...p }));
            copy[index][field] = field === 'key' ? value.replace(/\s/g, '') : value;
            if (autoRow && copy.length === index + 1 && copy[index][field] !== '') {
                copy.push(emptyPair());
            }
            return copy;
        });
    };

    const onRemove = (index: number) => {
        if (autoRow && index === 0 && pairs.length === 1) {
            setPairs([emptyPair()]);
        } else {
            setPairs((prev) => prev.filter((_, i) => i !== index));
        }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const clip = e.clipboardData.getData('Text');
        if (!clip) {
            return;
        }

        const split = clip.split(/[\n, ]/g);
        const newPairs: KeyValuePair[] = [];

        for (const item of split) {
            if (!item.includes('=')) {
                continue;
            }

            const line = item.split('=');
            if (line.length > 2 || line[0] === '') {
                continue;
            }

            const key = line[0].trim();
            const value = line[1] ? line[1].trim().replaceAll(/['"]/g, '') : '';

            newPairs.push({ id: generateId(), key, value });
        }

        if (newPairs.length === 0) {
            return;
        }

        e.preventDefault();

        setPairs((prev) => {
            const copy = prev.filter((p) => p.key !== '' || p.value !== '');
            copy.push(...newPairs);
            if (autoRow) {
                copy.push(emptyPair());
            }
            return copy;
        });
    };

    const keyCounts = useMemo(() => {
        return pairs.reduce<Record<string, number>>((acc, p) => {
            if (p.key) {
                acc[p.key] = (acc[p.key] || 0) + 1;
            }
            return acc;
        }, {});
    }, [pairs]);

    const [visibleSecrets, setVisibleSecrets] = useState<Record<number, boolean>>({});

    const toggleSecretVisibility = (id: number) => {
        setVisibleSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="flex flex-col gap-2">
            {columnLabels && pairs.length > 0 && (
                <div className="flex gap-2 type-label-xs uppercase text-text-muted">
                    <span className="flex-1">{columnLabels[0]}</span>
                    <span className="flex-1">{columnLabels[1]}</span>
                    <span className="w-7 shrink-0" aria-hidden />
                </div>
            )}
            {pairs.map((pair, i) => {
                const isDuplicate = Boolean(pair.key && keyCounts[pair.key] > 1);
                const isEmpty = pair.key === '' && pair.value === '';
                const revealed = Boolean(visibleSecrets[pair.id]);
                return (
                    <div key={pair.id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <Input
                                value={pair.key}
                                onChange={(e) => onUpdate('key', e.target.value, i)}
                                onPaste={onPaste}
                                placeholder={placeholderKey}
                                disabled={disabled}
                                mono={mono}
                                aria-label={columnLabels?.[0] ?? placeholderKey}
                                aria-invalid={isDuplicate}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            {isSecret ? (
                                <InputGroup>
                                    <InputGroupInput
                                        value={pair.value}
                                        onChange={(e) => onUpdate('value', e.target.value, i)}
                                        onPaste={onPaste}
                                        placeholder={placeholderValue}
                                        disabled={disabled}
                                        mono={mono}
                                        aria-label={columnLabels?.[1] ?? placeholderValue}
                                        type={revealed ? 'text' : 'password'}
                                    />
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton label={revealed ? 'Hide value' : 'Show value'} onClick={() => toggleSecretVisibility(pair.id)}>
                                            {revealed ? <EyeOffIcon /> : <EyeIcon />}
                                        </InputGroupButton>
                                        <CopyButton value={pair.value} disabled={pair.value === ''} />
                                    </InputGroupAddon>
                                </InputGroup>
                            ) : (
                                <Input
                                    value={pair.value}
                                    onChange={(e) => onUpdate('value', e.target.value, i)}
                                    onPaste={onPaste}
                                    placeholder={placeholderValue}
                                    disabled={disabled}
                                    mono={mono}
                                    aria-label={columnLabels?.[1] ?? placeholderValue}
                                />
                            )}
                        </div>
                        <div className={cn('shrink-0', disabled || (autoRow && isEmpty) ? 'invisible' : '')}>
                            <IconButton type="button" variant="ghost" size="sm" label="Remove entry" onClick={() => !disabled && onRemove(i)}>
                                <Trash2 />
                            </IconButton>
                        </div>
                    </div>
                );
            })}
            {addLabel && !disabled && (
                <div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPairs((prev) => [...prev, emptyPair()])}>
                        <Plus />
                        {addLabel}
                    </Button>
                </div>
            )}
        </div>
    );
};
