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
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                primary: 'var(--color-primary)',
                'on-primary': 'var(--color-on-primary)',
                background: 'var(--color-background)',
                surface: 'var(--color-surface)',
                text: 'var(--color-text)',
                'text-muted': 'var(--color-text-muted)',

                // ---
                // From Figma
                'green-light': '#EDFBD8',
                'green-base-35': '#84D65A59',
                'green-base': '#84D65A',
                'green-dark': '#2B641E',

                'blue-light': '#D7F1FD',
                'blue-base': '#509AF8',
                'blue-base-35': '#509AF859',
                'blue-dark': '#0C2A75',

                'red-light': '#FCE8DB',
                'red-base': '#EF665B',
                'red-base-35': '#EF665B59',
                'red-dark': '#71192F',

                'yellow-light': '#FEF7D1',
                'yellow-base': '#F7C752',
                'yellow-base-35': '#F7C75259',
                'yellow-dark': '#755118',

                'alert-red': '#EF665B',
                'dark-0': '#FFFFFF',
                'dark-100': '#F4F4F5',
                'dark-200': '#E4E4E7',
                'dark-300': '#D4D4D8',
                'dark-400': '#A1A1AA',
                'dark-500': '#71717A',
                'dark-600': '#27272A',
                'dark-700': '#18181B',
                'dark-800': '#09090B',
                'border-gray-400': '#323439',
                'text-light': '#A9ACB3',
                ring: '#A9ACB3'
            },
            boxShadow: {
                card: '-3.2px -3.2px 10.399px 0px rgba(198, 198, 198, 0.20), 4.8px 4.8px 28.797px 0px rgba(198, 198, 198, 0.20)'
            }
        }
    },
    plugins: [require('tailwindcss-animate')]
};
