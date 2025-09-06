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
                elevated: 'var(--color-background-elevated)',
                subtle: 'var(--color-background-subtle)',

                'text-primary': 'var(--color-text-primary)',
                'text-secondary': 'var(--color-text-secondary)',
                'on-primary': 'var(--color-on-primary)',

                error: 'var(--color-error)',

                brand: {
                    100: '#E0F7FCFF',
                    300: '#66D6F0FF',
                    500: '#00B2E3FF',
                    700: '#0089B0FF',
                    900: '#005771FF'
                },
                red: {
                    300: '#F7A6A6',
                    500: '#EE4242',
                    700: '#E81818'
                },
                green: {
                    300: '#A8E6B9',
                    700: '#1E9E3E'
                }
            },
            textColor: (theme) => ({
                primary: theme('colors.text-primary'),
                secondary: theme('colors.text-secondary'),
                'on-primary': theme('colors.on-primary')
            }),
            boxShadow: {
                focus: '0 0 0 3px rgba(0, 178, 227, 0.20)'
            }
        }
    },
    plugins: [require('tailwindcss-animate')]
};
