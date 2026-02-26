import { Prism } from '@mantine/prism';
import { Eye, EyeOff, Loader, Play } from 'lucide-react';
import { useCallback, useState } from 'react';

import { CopyButton } from './CopyButton.js';
import { cn } from '../utils/utils.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

import type { PrismProps } from '@mantine/prism';
import type { MaybePromise } from '@nangohq/types';
import type { HTMLAttributes } from 'react';

export type CodeBlockProps = {
    title?: string;
    language: PrismProps['language'];
    code: string;
    icon?: React.ReactNode;
    displayLanguage?: string;
    highlightedLines?: number[];
    secret?: boolean;
    onExecute?: () => MaybePromise<void>;
} & HTMLAttributes<HTMLDivElement>;

const highlight = {
    color: ''
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, code, language, icon, displayLanguage, highlightedLines, secret, onExecute, ...props }) => {
    const [isSecretVisible, setIsSecretVisible] = useState(!secret);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

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
                    {displayLanguage && (
                        <Badge variant="gray">
                            {icon && icon}
                            {displayLanguage}
                        </Badge>
                    )}
                    {onExecute && (
                        <Button variant="secondary" onClick={onClickExecute} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader className="size-4 animate-spin text-text-secondary" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Play className="size-4 text-brand-500" />
                                    Run
                                </>
                            )}
                        </Button>
                    )}
                    {secret && (
                        <Button variant="ghost" size="icon" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeOff /> : <Eye />}
                        </Button>
                    )}
                    <CopyButton text={code} />
                </div>
            </header>
            <div className="max-h-128 overflow-auto">
                <div className={'relative'}>
                    {!isSecretVisible && <div className="absolute z-10 w-full h-full backdrop-blur-xs    bg-black/0"></div>}
                    <Prism
                        className="w-full min-w-0"
                        language={language}
                        colorScheme="dark"
                        noCopy={true}
                        highlightLines={Object.fromEntries(highlightedLines?.map((line) => [line, highlight]) ?? [])}
                    >
                        {code}
                    </Prism>
                </div>
            </div>
        </div>
    );
};
