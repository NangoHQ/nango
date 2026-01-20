import { BookOpen } from 'lucide-react';

import { Breadcrumbs } from './Breadcrumbs';
import { ButtonLink } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';

export const AppHeader: React.FC = () => {
    return (
        <header className="h-16 px-10 py-2.5 items-center flex justify-between shrink-0 gap-1.5">
            <Breadcrumbs />
            <div className="flex gap-1.5 justify-end">
                <ButtonLink to="https://nango.dev/docs" target="_blank" variant="secondary" size="sm">
                    <BookOpen />
                    Docs
                </ButtonLink>
                <ButtonLink to="https://nango.dev/slack" target="_blank" variant="secondary" size="sm">
                    <SlackIcon />
                    Help
                </ButtonLink>
            </div>
        </header>
    );
};
