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
                'pure-black': '#05050A',
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

                'orange-light': '#FFD19A',
                'orange-base': '#EC9455',
                'orange-base-35': '#F5AE73',
                'orange-dark': '#F76B15',

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
            width: {
                largebox: '1200px',
                largecell: '480px'
            },
            fontSize: {
                xs: '11px',
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
