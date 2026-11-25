import { X } from 'lucide-react';
import { useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { FunctionCodeBlock } from '@/features/Functions/FunctionCodeBlock';
import { FunctionPanel, FunctionPanelHeader, FunctionSchemaTabs } from '@/features/Functions/FunctionPanel';
import { toFunctionSchemas } from '@/features/Functions/schemas';
import { useGetTemplateFunctionCode } from '@/hooks/useIntegrationFunctions';
import { useStore } from '@/store';

import type { ProviderTemplatesSuccess } from '@nangohq/types';

type CatalogFunction = ProviderTemplatesSuccess['data'][number];

interface CatalogFunctionPanelProps {
    fn: CatalogFunction;
    provider: string;
    setupButton: React.ReactNode;
    onClose: () => void;
}

export const CatalogFunctionPanel: React.FC<CatalogFunctionPanelProps> = ({ fn, provider, setupButton, onClose }) => {
    const { inputSchema, outputSchemas } = useMemo(() => toFunctionSchemas(fn), [fn]);

    return (
        <FunctionPanel>
            <FunctionPanelHeader
                name={fn.name}
                description={fn.description}
                actions={
                    <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
                        <X />
                    </IconButton>
                }
            >
                <div>{setupButton}</div>
            </FunctionPanelHeader>
            <div className="pb-6">
                <FunctionSchemaTabs
                    inputSchema={inputSchema}
                    outputSchemas={outputSchemas}
                    extraTabs={[{ value: 'code', label: 'Code', content: <TemplateCode fn={fn} provider={provider} /> }]}
                />
            </div>
        </FunctionPanel>
    );
};

const TemplateCode: React.FC<{ fn: CatalogFunction; provider: string }> = ({ fn, provider }) => {
    const env = useStore((state) => state.env);
    const { data, isPending, error } = useGetTemplateFunctionCode({ env, provider, name: fn.name, type: fn.type });

    return <FunctionCodeBlock name={fn.name} code={data?.code} pending={isPending} failed={Boolean(error)} />;
};
