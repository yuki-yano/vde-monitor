/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(--ctp-${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        latte: {
          base: withAlpha("base"),
          mantle: withAlpha("mantle"),
          crust: withAlpha("crust"),
          text: withAlpha("text"),
          subtext1: withAlpha("subtext1"),
          subtext0: withAlpha("subtext0"),
          surface0: withAlpha("surface0"),
          surface1: withAlpha("surface1"),
          surface2: withAlpha("surface2"),
          overlay0: withAlpha("overlay0"),
          overlay1: withAlpha("overlay1"),
          overlay2: withAlpha("overlay2"),
          blue: withAlpha("blue"),
          lavender: withAlpha("lavender"),
          peach: withAlpha("peach"),
          red: withAlpha("red"),
          green: withAlpha("green"),
          yellow: withAlpha("yellow"),
          mauve: withAlpha("mauve"),
          maroon: withAlpha("maroon"),
        },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        glass: "0 20px 60px -30px rgb(var(--ctp-shadow) / 0.35)",
        glow: "0 0 0 1px rgb(var(--ctp-lavender) / 0.3), 0 15px 40px -20px rgb(var(--ctp-lavender) / 0.6)",
      },
    },
  },
  plugins: [],
};
