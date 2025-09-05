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
                gray: {
                    1000: '#0B0B0CFF',
                    950: '#121212FF',
                    900: '#18191BFF',
                    875: '#1E1F21FF',
                    850: '#202124FF',
                    825: '#242528FF',
                    800: '#2A2B2FFF',
                    750: '#35363AFF',
                    700: '#424347FF',
                    650: '#505155FF',
                    600: '#626366FF',
                    550: '#76777AFF',
                    500: '#8B8C8FFF',
                    400: '#A1A2A5FF',
                    300: '#C4C5C7FF',
                    250: '#D6D7D8FF',
                    200: '#E7E7E7FF',
                    150: '#F2F3F5FF',
                    100: '#F9FAFBFF',
                    75: '#FCFDFDFF',
                    50: '#FFFFFFFF'
                },
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
            backgroundColor: (theme) => ({
                'primary-light': theme('colors.brand.500'), // Var --colors-primary
                'primary-dark': theme('colors.brand.500'), // Var --colors-primary
                'surface-light': theme('colors.gray.50'), // Var --colors-background
                'surface-dark': theme('colors.gray.1000'), // Var --colors-background
                'elevated-light': theme('colors.gray.100'), // Var --colors-foreground
                'elevated-dark': theme('colors.gray.900'), // Var --colors-foreground
                'subtle-light': theme('colors.gray.250'),
                'subtle-dark': theme('colors.gray.800')
            }),
            textColor: (theme) => ({
                'primary-light': theme('colors.gray.900'), // Var --colors-text-primary
                'primary-dark': theme('colors.gray.50'), // Var --colors-text-primary
                'secondary-light': theme('colors.gray.600'), // Var --colors-text-secondary
                'secondary-dark': theme('colors.gray.500'), // Var --colors-text-secondary
                'on-primary-light': theme('colors.gray.50'), // Var --colors-text-on-primary
                'on-primary-dark': theme('colors.gray.50') // Var --colors-text-on-primary
            }),
            borderColor: (theme) => ({
                'primary-light': theme('colors.brand.500'), // Var --colors-primary
                'primary-dark': theme('colors.brand.500'), // Var --colors-primary
                'surface-light': theme('colors.gray.50'), // Var --colors-background
                'surface-dark': theme('colors.gray.1000'), // Var --colors-background
                'elevated-light': theme('colors.gray.100'), // Var --colors-foreground
                'elevated-dark': theme('colors.gray.900'), // Var --colors-foreground
                'subtle-light': theme('colors.gray.250'),
                'subtle-dark': theme('colors.gray.800'),
                'text-primary-light': theme('colors.gray.900'), // Var --colors-text-primary
                'text-primary-dark': theme('colors.gray.50') // Var --colors-text-primary
            }),
            boxShadow: {
                focus: '0 0 0 3px rgba(0, 178, 227, 0.20)'
            }
        }
    },
    plugins: [require('tailwindcss-animate')]
};
