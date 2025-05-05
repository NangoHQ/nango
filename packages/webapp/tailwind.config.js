/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}', './public/**/*.{js,ts,jsx,tsx,html}'],
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
                'grayscale-1': '#0D0D0D',
                'grayscale-2': '#161616',
                'grayscale-3': '#1C1C1C',
                'grayscale-4': '#2A2A2A',
                'grayscale-5': '#333333',
                'grayscale-6': '#444444',
                'grayscale-7': '#555555',
                'grayscale-8': '#666666',
                'grayscale-9': '#888888',
                'grayscale-10': '#9FA2A9',
                'grayscale-11': '#B3B7BF',
                'grayscale-12': '#C7CCD5',
                'grayscale-13': '#E4E9F2',
                'grayscale-14': '#F8FAFE',

                // Design system v2 - Outdated colors. Created separate ones above in order to not break existing styles. Delete after migration.
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

                // 'code-mint': '#6ed6ac',
                // 'code-blue': '#90a1f0',
                // 'code-violet': '#c695c6',
                // 'code-gray': '#cfd4d9',
                // 'code-orange': '#f09745',
                // 'code-yellow': '#f7c752',

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
                'info-500': '#0c2a75',

                // -----
                // Design system v3
                //
                black: '#000000',
                'primary-1': '#012a29',
                'primary-2': '#024b49',
                'primary-3': '#036a67',
                'primary-4': '#05928f',
                'primary-5': '#06b6b3',
                'primary-6': '#2cd4d1',
                'primary-7': '#5ce2df',
                'primary-8': '#91f0ed',
                'primary-9': '#b6faf8',
                'primary-10': '#e5fefd',
                'grayscale-1': '#0D0D0D',
                'grayscale-2': '#161616',
                'grayscale-3': '#1C1C1C',
                'grayscale-4': '#2A2A2A',
                'grayscale-5': '#333333',
                'grayscale-6': '#444444',
                'grayscale-7': '#555555',
                'grayscale-8': '#666666',
                'grayscale-9': '#888888',
                'grayscale-10': '#9FA2A9',
                'grayscale-11': '#B3B7BF',
                'grayscale-12': '#C7CCD5',
                'grayscale-13': '#E4E9F2',
                'grayscale-14': '#F8FAFE',
                'info-1': '#f0fafe',
                'info-2': '#d7f1fd',
                'info-3': '#c2dcfd',
                'info-4': '#509af8',
                'info-5': '#0c2a75',
                'info-4b': '#509af8',
                'info-5b': '#0c2a75',
                'alert-1': '#fef6f1',
                'alert-2': '#fce8db',
                'alert-3': '#f3d1cd',
                'alert-4': '#ef665b',
                'alert-5': '#dc564c',
                'alert-6': '#c8453d',
                'alert-7': '#71192f',
                'alert-4b': '#ef665b',
                'alert-7b': '#71192f',
                'warning-1': '#fffcf0',
                'warning-2': '#fef7d1',
                'warning-3': '#fcebc2',
                'warning-4': '#f7c752',
                'warning-5': '#e6a70d',
                'warning-4b': '#f7c752',
                'success-1': '#f9fef1',
                'success-2': '#edfbd8',
                'success-3': '#d4f1c5',
                'success-4': '#84d65a',
                'success-5': '#2b641e',
                'success-4b': '#84d65a',
                'success-5b': '#2b641e',
                'border-1': '#050506',
                'border-2': '#0b0d0e',
                'border-3': '#151719',
                'border-4': '#202427',
                'border-5': '#2e3338',
                'border-6': '#3e454c',
                'border-7': '#505962',
                'border-8': '#65707b',
                'border-9': '#7e8a95',
                'border-10': '#a0a8b1',
                'border-11': '#c7ccd1',
                'border-12': '#e3e5e8',
                'text-1': '#050506',
                'text-2': '#0b0d0e',
                'text-3': '#151719',
                'text-4': '#202427',
                'text-5': '#2e3338',
                'text-6': '#3e454c',
                'text-7': '#505962',
                'text-8': '#65707b',
                'text-9': '#7e8a95',
                'text-10': '#a0a8b1',
                'text-11': '#c7ccd1',
                'text-12': '#e3e5e8',
                'data-success': '#5bb98b',
                'data-failure': '#e5484d',
                'code-mint': '#6ed6ac',
                'code-blue': '#90a1f0',
                'code-violet': '#c695c6',
                'code-gray': '#c7ccd1',
                'code-orange': '#f09745',
                'code-yellow': '#f7c752'
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
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out'
            }
        }
    },
    plugins: [require('@tailwindcss/forms')]
};
