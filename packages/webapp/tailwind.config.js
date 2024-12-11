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
                'orange-base-35': '#F5AE7359',
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
                ring: '#A9ACB3',

                // -----
                // Design system v2
                //
                'grayscale-100': '#fafafa',
                'grayscale-200': '#ececec',
                'grayscale-300': '#d0d1d0',
                'grayscale-400': '#a2a2a2',
                'grayscale-500': '#737473',
                'grayscale-600': '#454545',
                'grayscale-700': '#333333',
                'grayscale-800': '#262626',
                'grayscale-900': '#111111',
                'grayscale-1000': '#09090b',

                'code-mint': '#6ed6ac',
                'code-blue': '#90a1f0',
                'code-violet': '#c695c6',
                'code-gray': '#cfd4d9',
                'code-orange': '#f09745',
                'code-yellow': '#f7c752',

                success: '#5bb98b',
                failure: '#e5484d',

                'success-100': '#f9fef1',
                'success-200': '#edfbd8',
                'success-300': '#d4f1c5',
                'success-400': '#84d65a',
                'success-500': '#2b641e',

                'warning-100': '#fffcf0',
                'warning-200': '#fef7d1',
                'warning-300': '#fcebc2',
                'warning-400': '#f7c752',
                'warning-500': '#e6a70d',

                'alert-100': '#fef6f1',
                'alert-200': '#fce8db',
                'alert-300': '#f9c9c6',
                'alert-400': '#ef665b',
                'alert-500': '#71192f',

                'info-100': '#f0fafe',
                'info-200': '#d7f1fd',
                'info-300': '#c2dcfd',
                'info-400': '#509af8',
                'info-500': '#0c2a75'
            },
            fontSize: {
                xs: ['11px', '16px'],
                s: ['12px', '18px'],
                sm: '14px',
                base: '16px',
                xl: '20px',
                '2xl': '24px',
                '3xl': '28px',
                '4xl': '32px',
                '5xl': '36px'
            },
            width: {
                largebox: '1200px',
                largecell: '480px'
            },
            fontFamily: {
                code: ['"Roboto Mono"', '"Source Code Pro"', 'system-ui', 'sans-serif']
            },
            boxShadow: {
                card: '0px 2px 50px 5px rgba(51, 51, 51, 0.30), 0px 8px 10px 0px rgba(0, 0, 0, 0.30)'
            }
        }
    },
    plugins: [require('@tailwindcss/forms')]
};
