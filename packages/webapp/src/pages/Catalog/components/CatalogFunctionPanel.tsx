import { X } from 'lucide-react';
import { useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { FunctionPanel, FunctionPanelHeader, FunctionSchemaTabs } from '@/features/Functions/FunctionPanel';
import { toFunctionSchemas } from '@/features/Functions/schemas';

import type { ProviderTemplatesSuccess } from '@nangohq/types';

interface CatalogFunctionPanelProps {
    fn: ProviderTemplatesSuccess['data'][number];
    setupButton: React.ReactNode;
    onClose: () => void;
}

export const CatalogFunctionPanel: React.FC<CatalogFunctionPanelProps> = ({ fn, setupButton, onClose }) => {
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
                <FunctionSchemaTabs inputSchema={inputSchema} outputSchemas={outputSchemas} />
            </div>
        </FunctionPanel>
    );
};
