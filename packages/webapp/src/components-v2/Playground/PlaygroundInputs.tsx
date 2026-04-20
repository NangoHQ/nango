import { Braces, ExternalLink, Info } from 'lucide-react';

import { CodeBlock } from '../CodeBlock';
import { JSON_DISPLAY_LIMIT } from './types';
import { Alert, AlertActions, AlertButtonLink, AlertDescription } from '../ui/alert';
import { Input } from '../ui/input';
import { useConnection } from '@/hooks/useConnections';
import { CatalogBadge } from '@/pages/Integrations/components/CatalogBadge';
import { usePlaygroundStore } from '@/store/playground';

import type { InputField } from './types';

interface Props {
    env: string;
    queryEnv: string;
    isSync: boolean;
    inputFields: InputField[];
    inputErrors: Record<string, string>;
    clearInputError: (name: string) => void;
}

export const PlaygroundInputs: React.FC<Props> = ({ env, queryEnv, isSync, inputFields, inputErrors, clearInputError }) => {
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const inputValues = usePlaygroundStore((s) => s.inputValues);
    const setPlaygroundInputValue = usePlaygroundStore((s) => s.setInputValue);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);

    const connectionDetailsQuery = useConnection(
        { env: queryEnv, provider_config_key: playgroundIntegration || '' },
        { connectionId: playgroundConnection || '' }
    );
    const connectionMetadata = connectionDetailsQuery.data?.connection?.metadata ?? null;

    if (isSync) {
        return (
            <div className="grid grid-cols-[110px_1fr] gap-x-4">
                <label className="text-text-primary text-label-large">Metadata</label>
                <div className="min-w-0 flex flex-col gap-3">
                    <Alert variant="info" className="px-3 py-2" actionsBelow>
                        <Info />
                        <AlertDescription className="text-body-small-regular">
                            Sync inputs are read from the connection metadata, edited via the Nango API.
                        </AlertDescription>
                        <AlertActions>
                            {playgroundIntegration && playgroundConnection && (
                                <AlertButtonLink
                                    to={`/${env}/connections/${playgroundIntegration}/${encodeURIComponent(playgroundConnection)}#auth`}
                                    variant="info-secondary"
                                    onClick={() => setPlaygroundOpen(false)}
                                >
                                    View metadata
                                </AlertButtonLink>
                            )}
                            <AlertButtonLink
                                to="https://nango.dev/docs/implementation-guides/use-cases/customer-configuration"
                                variant="info"
                                onClick={() => setPlaygroundOpen(false)}
                            >
                                Docs <ExternalLink />
                            </AlertButtonLink>
                        </AlertActions>
                    </Alert>

                    {inputFields.length > 0 && playgroundIntegration && playgroundConnection ? (
                        inputFields.map((field) => {
                            const rawValue =
                                connectionMetadata && typeof connectionMetadata === 'object'
                                    ? (connectionMetadata as Record<string, unknown>)[field.name]
                                    : undefined;
                            const isObjectValue = rawValue !== null && rawValue !== undefined && typeof rawValue === 'object';
                            return (
                                <div key={field.name} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-primary text-body-medium-medium">
                                            {field.name}
                                            {field.required && <span className="text-feedback-error-fg text-body-medium-medium">*</span>}
                                        </span>
                                        <CatalogBadge variant="light">{field.type}</CatalogBadge>
                                    </div>
                                    {isObjectValue ? (
                                        <CodeBlock
                                            language="json"
                                            displayLanguage="JSON"
                                            icon={<Braces />}
                                            code={
                                                JSON.stringify(rawValue, null, 2).length < JSON_DISPLAY_LIMIT
                                                    ? JSON.stringify(rawValue, null, 2)
                                                    : 'Value too large to display'
                                            }
                                            constrainHeight={false}
                                        />
                                    ) : (
                                        <p className="text-text-tertiary text-body-small-regular">
                                            {rawValue !== undefined && rawValue !== null ? JSON.stringify(rawValue, null, 2) : '—'}
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    ) : !playgroundIntegration || !playgroundConnection ? (
                        <div className="text-text-tertiary text-body-small-regular">Select a connection to view its metadata.</div>
                    ) : (
                        <div className="text-text-tertiary text-body-small-regular">This sync doesn&apos;t take inputs.</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-[110px_1fr] gap-x-4">
            <label className="text-text-primary text-label-large">Inputs</label>
            <div className="min-w-0 flex flex-col gap-3">
                {inputFields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-text-primary text-body-medium-medium">
                                {field.name}
                                {field.required && <span className="text-feedback-error-fg text-body-medium-medium">*</span>}
                            </span>
                            <CatalogBadge variant="light">{field.type}</CatalogBadge>
                        </div>
                        {field.description && <p className="text-text-tertiary text-body-small-regular">{field.description}</p>}
                        <Input
                            className="border-border-muted data-[filled=true]:not-aria-invalid:border-border-muted"
                            value={inputValues[field.name] || ''}
                            aria-invalid={Boolean(inputErrors[field.name])}
                            placeholder={field.type === 'object' ? '{}' : field.type === 'array' ? '[]' : undefined}
                            onChange={(e) => {
                                setPlaygroundInputValue(field.name, e.target.value);
                                clearInputError(field.name);
                            }}
                        />
                        {inputErrors[field.name] && <p className="text-feedback-error-fg text-body-small-regular">{inputErrors[field.name]}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
};
