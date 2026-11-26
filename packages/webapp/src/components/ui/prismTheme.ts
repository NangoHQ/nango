import type { PrismProps } from '@mantine/prism';

type PrismTheme = ReturnType<NonNullable<PrismProps['getPrismTheme']>>;

const color = (token: string) => ({ color: `var(--${token})` });

// Keep these as CSS variables: resolved colours would freeze code in one theme.
const theme: PrismTheme = {
    plain: { color: 'var(--text-default)', backgroundColor: 'transparent' },
    styles: [
        { types: ['property', 'attr-name', 'variable', 'parameter'], style: color('text-strong') },
        { types: ['string', 'char', 'attr-value', 'template-string', 'url', 'regex'], style: color('text-link') },
        { types: ['number', 'constant', 'builtin', 'class-name'], style: color('text-warning') },
        { types: ['boolean', 'null', 'keyword', 'tag', 'deleted'], style: color('text-danger') },
        { types: ['function', 'inserted'], style: color('text-success') },
        { types: ['punctuation', 'operator'], style: color('text-muted') },
        { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { ...color('text-muted'), fontStyle: 'italic' } }
    ]
};

export const getTokenPrismTheme = (): PrismTheme => theme;
