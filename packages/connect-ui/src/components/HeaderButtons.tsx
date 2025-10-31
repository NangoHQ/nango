import { Link } from '@tanstack/react-router';
import { ArrowLeft, X } from 'lucide-react';

import { Button } from './ui/button';
import { triggerClose } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface HeaderButtonsProps extends React.HTMLAttributes<HTMLDivElement> {
    onClickClose?: () => void;
    backLink?: string;
    onClickBack?: () => void;
    isAuthLink?: boolean;
}

export const HeaderButtons: React.FC<HeaderButtonsProps> = ({
    onClickClose = () => triggerClose('click:close'),
    backLink,
    onClickBack,
    isAuthLink,
    ...props
}) => {
    const { t } = useI18n();

    return (
        <header {...props} className={cn('flex justify-end', backLink && 'justify-between', props.className)}>
            {backLink && (
                <Link to={backLink} onClick={onClickBack}>
                    <Button size={'icon'} title={t('common.back')} variant={'transparent'}>
                        <ArrowLeft className="size-4 mr-1" /> {t('common.back')}
                    </Button>
                </Link>
            )}
            {!isAuthLink && (
                <Button size={'icon'} title={t('common.close')} variant={'transparent'} onClick={onClickClose}>
                    <X className="w-4 h-4" />
                </Button>
            )}
        </header>
    );
};
