/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        fontFamily: {
            sans: ['Inter', 'sans-serif']
        },
        extend: {
            aria: {
                invalid: 'invalid="true"'
            },
            colors: {
                primary: 'var(--color-primary)',
                surface: 'var(--color-background-surface)',
                subSurface: 'var(--color-background-sub-surface)',
                elevated: 'var(--color-background-elevated)',
                subtle: 'var(--color-background-subtle)',

                'text-primary': 'var(--color-text-primary)',
                'text-secondary': 'var(--color-text-secondary)',
                'text-tertiary': 'var(--color-text-tertiary)',
                'on-primary': 'var(--color-on-primary)',

                'border-muted': 'var(--color-border-muted)',
                'border-default': 'var(--color-border-default)',

                error: 'var(--color-error)',

                brand: {
                    100: '#E0F7FCFF',
                    300: '#66D6F0FF',
                    500: '#00B2E3FF',
                    700: '#0089B0FF',
                    900: '#005771FF'
                },
                red: {
                    100: '#FDECEC',
                    300: '#F7A6A6',
                    500: '#EE4242',
                    700: '#E81818'
                },
                yellow: {
                    100: '#FFF8D1',
                    300: '#FED75B',
                    500: '#F7C752',
                    700: '#D6A81E',
                    900: '#5C4A0B'
                },
                green: {
                    300: '#A8E6B9',
                    700: '#1E9E3E'
                }
            },
            borderColor: (theme) => ({
                muted: theme('colors.border-muted'),
                default: theme('colors.border-default')
            }),
            textColor: (theme) => ({
                primary: theme('colors.text-primary'),
                secondary: theme('colors.text-secondary'),
                tertiary: theme('colors.text-tertiary'),
                'on-primary': theme('colors.on-primary')
            }),
            boxShadow: {
                focus: '0 0 0 3px rgba(0, 178, 227, 0.20)'
            }
        }
    },
    plugins: [require('tailwindcss-animate')]
};
