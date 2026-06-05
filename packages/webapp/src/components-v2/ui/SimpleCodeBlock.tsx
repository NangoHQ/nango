import { CodeHighlight } from '@mantine/code-highlight';

export const SimpleCodeBlock = ({ children, language }: { children: string; language: string }) => {
    return <CodeHighlight className="w-full min-w-0" language={language} withCopyButton={false} code={children} />;
};
