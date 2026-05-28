import { Prism } from '@mantine/prism';

import type { PrismProps } from '@mantine/prism';

export const SimpleCodeBlock = ({ children, language }: { children: string; language: PrismProps['language'] }) => {
    return (
        <Prism className="w-full min-w-0" language={language} colorScheme="dark" noCopy={true}>
            {children}
        </Prism>
    );
};
