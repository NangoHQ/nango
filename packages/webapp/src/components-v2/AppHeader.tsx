import { BookOpen } from 'lucide-react';

import { ButtonLink } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';

export const AppHeader: React.FC = () => {
    return (
        <header className="h-16 px-10 py-2.5 items-center flex justify-end gap-1.5">
            <ButtonLink to="https://docs.nango.dev" variant="secondary" size="sm">
                <BookOpen />
                Docs
            </ButtonLink>
            <ButtonLink to="https://nango.dev/slack" variant="secondary" size="sm">
                <SlackIcon />
                Help
            </ButtonLink>
        </header>
    );
};
