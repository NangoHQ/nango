/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,ts,jsx,tsx,html}', './public/**/*.{js,ts,jsx,tsx,html}'],
    theme: {
        fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['"Source Code Pro"', 'sans-serif']
        },
        extend: {
            colors: {
                'bg-black': '#0E1014',
                'pure-black': '#05050a',
                'active-gray': '#161720',
                'hover-gray': '#1D1F28',
                'text-light-gray': '#A9A9A9',
                'off-black': '#05050a',
                'bg-cta-green': '#75E270',
                'text-cta-green1': '#224421',
                'border-gray': '#333333',
                'border-blue': '#1489DF',
                'text-blue': '#1489DF',
                'text-light-blue': '#76C5FF',
                'bg-dark-blue': '#182633',
                'row-hover': '#0d0d14',
                white: '#FFFFFF',

                // From Figma
                'green-base': '#84D65A',
                'green-dark': '#2B641E',
                'blue-base': '#509AF8',
                'red-base': '#EF665B',
                'red-dark': '#71192F',
                'red-base-35': 'rgba(57, 58, 55, 0.16)',
                'yellow-base': '#F7C752',
                'yellow-base-35': 'rgba(247, 199, 82, 0.35)',
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
                'text-light': '#A9ACB3'
            },
            width: {
                largebox: '1200px',
                largecell: '480px'
            },
            fontSize: {
                s: '13px',
                '3xl': '28px'
            },
            fontFamily: {
                code: ['"Roboto Mono"', '"Source Code Pro"', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: [require('@tailwindcss/forms')]
};
