import { useMemo } from 'react';

import { getInputSchema, getOutputSchemas } from '../../Integrations/providerConfigKey/Functions/FunctionDetailsPanel';
import { useFunctionDisplayName } from '../functions';
import { FunctionIcon } from './FunctionIcon';

import type { NangoActionFunction, NangoSyncFunction } from '@nangohq/types';

export const FunctionCard = ({ fn, onClick }: { fn: NangoSyncFunction | NangoActionFunction; onClick: () => void }) => {
    const displayName = useFunctionDisplayName(fn.name);
    const details = useMemo(() => getFunctionDetails(fn), [fn]);
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-full cursor-pointer items-center gap-3 rounded-md border border-border-muted bg-surface-panel p-3 text-left transition-colors hover:bg-state-hover hover:border-border-default"
        >
            <FunctionIcon fn={fn} />
            <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
                <span className="text-text-strong text-body-medium-semi">{displayName}</span>
                {fn.description && <p className="line-clamp-2 text-text-secondary text-body-small-regular">{fn.description}</p>}
                {details.length > 0 && <span className="mt-auto text-text-muted text-body-small-regular">{details.join(' · ')}</span>}
            </div>
        </button>
    );
};

function getFunctionDetails(fn: NangoSyncFunction | NangoActionFunction): string[] {
    if (fn.type === 'sync') {
        return [fn.runs && capitalize(fn.runs), fn.returns.length > 0 && `Returns ${fn.returns.join(', ')}`].filter((detail) => typeof detail === 'string');
    }

    const inputCount = Object.keys(getInputSchema(fn)?.properties ?? {}).length;
    const outputCount = Object.keys(getOutputSchemas(fn)[0]?.schema.properties ?? {}).length;
    return [inputCount > 0 ? pluralize(inputCount, 'input') : 'No inputs', outputCount > 0 && pluralize(outputCount, 'output field')].filter(
        (detail) => typeof detail === 'string'
    );
}

function pluralize(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
