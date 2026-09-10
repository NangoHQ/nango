import '@/index.css';

const noMotion = document.createElement('style');
noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
document.head.appendChild(noMotion);
