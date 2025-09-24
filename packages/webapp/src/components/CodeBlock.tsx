import { Prism } from '@mantine/prism';
import { IconLoader2, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { cn } from '../utils/utils';
import { CopyButton } from './ui/button/CopyButton';
import { Tag } from './ui/label/Tag';

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
        <div {...props} className={cn('border border-grayscale-7 rounded-md', props.className)}>
            <header className="flex justify-between items-center py-1.5 px-4 bg-grayscale-3 rounded-t-md">
                <span className="text-text-tertiary text-s">{title}</span>
                <div className="flex gap-2 items-center">
                    {snippets.length > 1 ? (
                        <Select
                            defaultValue={snippets[0].language}
                            onValueChange={(language) => setSelectedSnippetIndex(snippets.findIndex((s) => s.language === language) ?? 0)}
                        >
                            <SelectTrigger className="text-text-primary bg-grayscale-2 text-sm px-4 py-1 h-auto">
                                <SelectValue placeholder="Language" />
                            </SelectTrigger>
                            <SelectContent>
                                {snippets.map(({ language, displayLanguage, icon }) => (
                                    <SelectItem key={language} value={language}>
                                        <div className="text-s flex flex-row items-center gap-2">
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
                        <button
                            onClick={onClickExecute}
                            disabled={isExecuting}
                            className="flex flex-row items-center gap-2 px-4 py-1 rounded-sm text-text-secondary text-sm hover:bg-grayscale-5 transition-transform"
                        >
                            {isExecuting ? (
                                <>
                                    <IconLoader2 className="w-4 h-4 animate-spin text-text-secondary" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <IconPlayerPlay className="w-4 h-4 text-success-4" />
                                    Run
                                </>
                            )}
                        </button>
                    )}
                    <CopyButton text={snippets[selectedSnippetIndex].code} />
                </div>
            </header>
            <Prism language={snippets[selectedSnippetIndex].language} colorScheme="dark" noCopy={true}>
                {snippets[selectedSnippetIndex].code}
            </Prism>
        </div>
    );
};
