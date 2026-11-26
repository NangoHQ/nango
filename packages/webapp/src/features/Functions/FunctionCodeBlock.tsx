import { CodeBlock } from '@/components/ui/CodeBlock';
import { Spinner } from '@/components/ui/Spinner';
import { CompactEmptyState } from './FunctionPanel';

interface FunctionCodeBlockProps {
    name: string;
    code: string | undefined;
    pending: boolean;
    failed: boolean;
}

export const FunctionCodeBlock: React.FC<FunctionCodeBlockProps> = ({ name, code, pending, failed }) => {
    if (pending) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Spinner className="size-5 text-text-muted" />
            </div>
        );
    }
    if (failed || !code) {
        return <CompactEmptyState>Failed to load source code.</CompactEmptyState>;
    }
    return <CodeBlock title={`${name}.ts`} language="typescript" code={code} />;
};
