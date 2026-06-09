import { Prism } from '@mantine/prism';
import { Eye, EyeOff, Loader, Play } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button, IconButton } from '@nangohq/design-system';

import { darkModeSelector, useThemeStore } from '../../lib/theme.js';
import { cn } from '../../utils/utils.js';
import { Badge } from './Badge.js';
import { CopyButton } from './CopyButton.js';

import type { PrismProps } from '@mantine/prism';
import type { MaybePromise } from '@nangohq/types';
import type { HTMLAttributes } from 'react';

export type CodeBlockProps = {
    title?: string;
    language: PrismProps['language'];
    code: string;
    copyable?: boolean;
    icon?: React.ReactNode;
    headerElement?: React.ReactNode;
    displayLanguage?: string;
    highlightedLines?: number[];
    secret?: boolean;
    onExecute?: () => MaybePromise<void>;
    /** When false, code area has no max-height/scroll; parent should scroll (e.g. in Playground). Default true. */
    constrainHeight?: boolean;
} & HTMLAttributes<HTMLDivElement>;

const highlight = {
    color: ''
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
    title,
    code,
    language,
    copyable = true,
    icon,
    headerElement,
    displayLanguage,
    highlightedLines,
    secret,
    onExecute,
    constrainHeight = true,
    ...props
}) => {
    const darkMode = useThemeStore(darkModeSelector);
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
            <header className="flex justify-between items-center py-1.5 px-3 bg-surface-panel-inset rounded-t">
                <span className="text-text-muted text-s">{title}</span>
                <div className="flex gap-2 items-center">
                    {headerElement}
                    {displayLanguage && (
                        <Badge variant="gray" className="uppercase">
                            {icon && icon}
                            {displayLanguage}
                        </Badge>
                    )}
                    {onExecute && (
                        <Button variant="outline" onClick={onClickExecute} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader className="size-4 animate-spin text-text-secondary" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Play className="size-4 text-text-brand" />
                                    Run
                                </>
                            )}
                        </Button>
                    )}
                    {secret && (
                        <IconButton variant="ghost" size="2xs" label="Toggle visibility" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeOff /> : <Eye />}
                        </IconButton>
                    )}
                    {copyable && <CopyButton text={code} />}
                </div>
            </header>
            <div className={cn(constrainHeight && 'max-h-128 overflow-auto')}>
                <div className={'relative'}>
                    {!isSecretVisible && <div className="absolute z-10 w-full h-full backdrop-blur-xs    bg-black/0"></div>}
                    <Prism
                        className="w-full min-w-0"
                        language={language}
                        colorScheme={darkMode ? 'dark' : 'light'}
                        noCopy={true}
                        styles={{ code: { fontSize: '12px' } }}
                        highlightLines={Object.fromEntries(highlightedLines?.map((line) => [line, highlight]) ?? [])}
                    >
                        {code}
                    </Prism>
                </div>
            </div>
        </div>
    );
};
