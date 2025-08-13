import { Prism } from '@mantine/prism';
import { useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { cn } from '../utils/utils';
import { CopyButton } from './ui/button/CopyButton';
import { Tag } from './ui/label/Tag';

import type { PrismProps } from '@mantine/prism';
import type { HTMLAttributes } from 'react';

export interface Snippet {
    language: PrismProps['language'];
    displayLanguage: string;
    code: string;
    copy?: string;
}

export type CodeBlockProps = {
    title?: string;
    snippets: Snippet[];
} & HTMLAttributes<HTMLDivElement>;

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, snippets, ...props }) => {
    const [selectedSnippet, setSelectedSnippet] = useState(snippets[0]);

    return (
        <div {...props} className={cn('border border-grayscale-7 rounded-md', props.className)}>
            <header className="flex justify-between items-center py-1.5 px-4 bg-grayscale-3 rounded-t-md">
                <span className="text-text-tertiary text-s">{title}</span>
                <div className="flex gap-2 items-center">
                    {snippets.length > 1 ? (
                        <Select
                            defaultValue={snippets[0].language}
                            onValueChange={(language) => setSelectedSnippet(snippets.find((s) => s.language === language) ?? snippets[0])}
                        >
                            <SelectTrigger className="text-text-primary bg-grayscale-2 text-sm px-1.5 py-1 h-auto">
                                <SelectValue placeholder="Language" />
                            </SelectTrigger>
                            <SelectContent>
                                {snippets.map(({ language, displayLanguage }) => (
                                    <SelectItem key={language} value={language} className="text-s">
                                        {displayLanguage}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Tag variant="neutral">{snippets[0].language}</Tag>
                    )}
                    <CopyButton text={selectedSnippet.code} />
                </div>
            </header>
            <Prism language={selectedSnippet.language} colorScheme="dark" noCopy={true}>
                {selectedSnippet.code}
            </Prism>
        </div>
    );
};
