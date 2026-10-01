import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Components } from 'react-markdown';

const components: Components = {
    p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
    ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-text-strong">{children}</strong>,
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" className="text-text-link underline underline-offset-2">
            {children}
        </a>
    ),
    h1: ({ children }) => <h3 className="mt-4 font-semibold text-text-strong">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-4 font-semibold text-text-strong">{children}</h3>,
    h3: ({ children }) => <h3 className="mt-4 font-semibold text-text-strong">{children}</h3>,
    code: ({ children }) => <code className="rounded-sm bg-surface-panel-inset px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
    pre: ({ children }) => (
        <pre className="mt-3 overflow-auto rounded-ds-xs bg-surface-panel-inset p-3 font-mono text-xs [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="mt-3 overflow-auto rounded-ds-xs border border-border-muted">
            <table className="w-full text-sm">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border-b border-border-muted bg-surface-panel-inset px-3 py-2 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border-b border-border-muted px-3 py-2 align-top">{children}</td>
};

export const Markdown: React.FC<{ children: string; size?: 'medium' | 'small' }> = ({ children, size = 'medium' }) => {
    return (
        <div className={size === 'small' ? 'text-body-small-regular text-text-default' : 'text-body-medium-regular text-text-default'}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
};
