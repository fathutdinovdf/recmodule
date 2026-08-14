/* Tailwind 4 подключается плагином PostCSS — отдельного tailwind.config уже нет,
   вся настройка живёт в CSS (src/app/shadcn.css). */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
