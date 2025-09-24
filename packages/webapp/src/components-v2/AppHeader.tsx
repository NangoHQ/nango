import { BookOpen } from 'lucide-react';

import { Button } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';

export const AppHeader: React.FC = () => {
    return (
        <header className="h-16 px-10 py-2.5 items-center flex justify-end gap-1.5">
            <Button variant="secondary" size="sm">
                <BookOpen />
                Docs
            </Button>
            <Button variant="secondary" size="sm">
                <SlackIcon />
                Help
            </Button>
        </header>
    );
};
