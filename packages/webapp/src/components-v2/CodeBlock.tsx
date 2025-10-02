import { Prism } from '@mantine/prism';
import { Loader, Play } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from './CopyButton';
import { Tag } from '../components/ui/label/Tag';
import { cn } from '../utils/utils';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import type { PrismProps } from '@mantine/prism';
import type { MaybePromise } from '@nangohq/types';
import type { HTMLAttributes } from 'react';

export interface Snippet {
    language: PrismProps['language'];
    displayLanguage: string;
    icon: React.ReactNode;
    code: string;
}

export type CodeBlockProps = {
    title?: string;
    snippets: Snippet[];
    onExecute?: () => MaybePromise<void>;
} & HTMLAttributes<HTMLDivElement>;

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, snippets, onExecute, ...props }) => {
    const [selectedSnippetIndex, setSelectedSnippetIndex] = useState(0);
    const [isExecuting, setIsExecuting] = useState(false);

    const onClickExecute = async () => {
        if (!onExecute) {
            return;
        }

        setIsExecuting(true);
        try {
            await onExecute();
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div {...props} className={cn('border border-border-muted rounded', props.className)}>
            <header className="flex justify-between items-center py-1.5 px-3 bg-bg-subtle rounded-t">
                <span className="text-text-tertiary text-s">{title}</span>
                <div className="flex gap-2 items-center">
                    {snippets.length > 1 ? (
                        <Select
                            defaultValue={snippets[0].language}
                            onValueChange={(language) => setSelectedSnippetIndex(snippets.findIndex((s) => s.language === language) ?? 0)}
                        >
                            <SelectTrigger size="sm">
                                <SelectValue placeholder="Language" />
                            </SelectTrigger>
                            <SelectContent>
                                {snippets.map(({ language, displayLanguage, icon }) => (
                                    <SelectItem key={language} value={language}>
                                        <div className="flex flex-row items-center gap-1">
                                            {icon}
                                            {displayLanguage}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Tag variant="neutral">{snippets[0].language}</Tag>
                    )}
                    {onExecute && (
                        <Button variant="secondary" onClick={onClickExecute} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader className="w-4 h-4 animate-spin text-text-secondary" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 text-brand-500" />
                                    Run
                                </>
                            )}
                        </Button>
                    )}
                    <CopyButton text={snippets[selectedSnippetIndex].code} />
                </div>
            </header>
            <div className="overflow-x-auto">
                <Prism className="w-full min-w-0" language={snippets[selectedSnippetIndex].language} colorScheme="dark" noCopy={true}>
                    {snippets[selectedSnippetIndex].code}
                </Prism>
            </div>
        </div>
    );
};
