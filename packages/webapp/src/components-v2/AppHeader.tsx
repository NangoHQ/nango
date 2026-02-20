import { BookOpen, FlaskConical } from 'lucide-react';

import { Breadcrumbs } from './Breadcrumbs';
import { Button, ButtonLink } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';
import { useStore } from '@/store';

export const AppHeader: React.FC = () => {
    const playgroundOpen = useStore((s) => s.playground.isOpen);
    const setPlaygroundOpen = useStore((s) => s.setPlaygroundOpen);

    return (
        <header className="relative z-[60] h-16 px-10 pl-2 py-2.5 items-center flex justify-between shrink-0 gap-1.5">
            <Breadcrumbs />
            <div className="flex gap-1.5 justify-end">
                <Button variant={playgroundOpen ? 'primary' : 'secondary'} size="sm" onClick={() => setPlaygroundOpen(!playgroundOpen)}>
                    <FlaskConical />
                    Playground
                </Button>
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
