/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,ts,jsx,tsx,html}', './public/**/*.{js,ts,jsx,tsx,html}'],
    theme: {
        fontFamily: {
            sans: ['Inter', 'sans-serif']
        },
        extend: {
            colors: {
                'bg-black': '#0E1014',
                'bg-dark-gray': '#181B20',
                'text-light-gray': '#A9A9A9',
                'text-dark-gray': '#5F5F5F',
                'bg-cta-green': '#75E270',
                'text-cta-green1': '#224421',
                'border-gray': '#333333',
                'border-blue': '#1489DF',
                'text-blue': '#1489DF',
                'text-light-blue': '#76C5FF',
                'bg-dark-blue': '#182633',
                white: '#FFFFFF'
            }
        }
    },
    plugins: [require('@tailwindcss/forms')]
};
