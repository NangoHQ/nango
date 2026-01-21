import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input/Input';
import SecretInput from '@/components/ui/input/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { cn } from '@/utils/utils';

interface KeyValueInputProps {
    initialValues?: Record<string, string>;
    onChange: (values: Record<string, string>) => void;
    placeholderKey?: string;
    placeholderValue?: string;
    disabled?: boolean;
    isSecret?: boolean;
    alwaysShowEmptyRow?: boolean;
}

export const KeyValueInput: React.FC<KeyValueInputProps> = ({
    initialValues = {},
    onChange,
    placeholderKey = 'Key',
    placeholderValue = 'Value',
    disabled = false,
    isSecret = false,
    alwaysShowEmptyRow = false
}) => {
    const buildPairsFromValues = (values: Record<string, string>) => {
        const entries = Object.entries(values);
        if (entries.length > 0) {
            const mapped = entries.map(([key, value]) => ({ key, value }));
            return alwaysShowEmptyRow ? [...mapped, { key: '', value: '' }] : mapped;
        }
        return [{ key: '', value: '' }];
    };

    const [pairs, setPairs] = useState<{ key: string; value: string }[]>(() => buildPairsFromValues(initialValues));

    const initialValuesKey = JSON.stringify(initialValues);
    useEffect(() => {
        setPairs(buildPairsFromValues(initialValues));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValuesKey, alwaysShowEmptyRow]);

    useEffect(() => {
        const validPairs = pairs.filter((p) => p.key !== '' || p.value !== '');
        const newValues = validPairs.reduce<Record<string, string>>((acc, curr) => {
            if (curr.key) {
                acc[curr.key] = curr.value;
            }
            return acc;
        }, {});
        onChange(newValues);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pairs]);

    const onUpdate = (field: 'key' | 'value', value: string, index: number) => {
        setPairs((prev) => {
            const copy = [...prev];
            copy[index][field] = value;
            if (copy.length === index + 1 && value !== '') {
                copy.push({ key: '', value: '' });
            }
            return copy;
        });
    };

    const onRemove = (index: number) => {
        if (index === 0 && pairs.length === 1) {
            setPairs([{ key: '', value: '' }]);
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
        const newPairs: { key: string; value: string }[] = [];

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

            newPairs.push({ key, value });
        }

        if (newPairs.length === 0) {
            return;
        }

        e.preventDefault();

        setPairs((prev) => {
            const copy = [...prev].filter((p) => p.key !== '' || p.value !== '');
            copy.push(...newPairs);
            copy.push({ key: '', value: '' });
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

    return (
        <div className="flex flex-col gap-3">
            {pairs.map((pair, i) => {
                const isDuplicate = Boolean(pair.key && keyCounts[pair.key] > 1);
                return (
                    <div key={i} className="flex gap-3">
                        <div className="flex-1">
                            <Input
                                value={pair.key}
                                onChange={(e) => onUpdate('key', e.target.value, i)}
                                inputSize={'lg'}
                                variant={'black'}
                                onPaste={onPaste}
                                placeholder={placeholderKey}
                                disabled={disabled}
                                aria-invalid={isDuplicate}
                                className={isDuplicate ? '!border-feedback-error-border' : ''}
                            />
                        </div>
                        <div className="flex flex-1">
                            {isSecret ? (
                                <SecretInput
                                    value={pair.value}
                                    onChange={(e) => onUpdate('value', e.target.value, i)}
                                    copy={true}
                                    inputSize={'lg'}
                                    variant={'black'}
                                    onPaste={onPaste}
                                    placeholder={placeholderValue}
                                    disabled={disabled}
                                />
                            ) : (
                                <Input
                                    value={pair.value}
                                    onChange={(e) => onUpdate('value', e.target.value, i)}
                                    inputSize={'lg'}
                                    variant={'black'}
                                    onPaste={onPaste}
                                    placeholder={placeholderValue}
                                    disabled={disabled}
                                />
                            )}
                            <Button
                                variant="ghost"
                                size="lg"
                                className={cn('py-2 px-2 h-full w-11', (pair.key === '' && pair.value === '') || disabled ? 'invisible' : '')}
                                onClick={() => !disabled && onRemove(i)}
                            >
                                <Trash2 className="text-fg-error" />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
