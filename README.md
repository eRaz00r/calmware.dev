# calmware.dev

A lean, single-page, terminal-inspired website for a one-man software studio. Built with vanilla HTML, CSS, and JavaScript.

## Features
- Terminal-style UI with prompt and scrollback
- Command palette (Cmd/Ctrl+K) with fuzzy filter
- Keyboard UX: history (↑/↓), tab completion, Esc to cancel
- Commands: `help`, `about`, `services`, `work`, `contact`, `clear`, `theme`
- Accessible (ARIA, focus, prefers-reduced-motion), SEO meta, favicon, OG image

## Getting started
Open `index.html` directly in a browser or serve the folder with any static server.

- Safari/Chrome desktop and mobile supported
- Type `help` to see available commands
- Toggle the accent color: `theme purple|cyan|green`

## Structure
- `index.html` – HTML shell and palette overlay
- `styles.css` – theme variables and layout
- `script.js` – command registry, palette, keyboard UX
- `config.json` – configuration for banner, accent color, and banner size
- `assets/favicon.svg`, `assets/og.svg`
- `robots.txt`

## Configuration

The site can be customized via `config.json`:

```json
{
  "defaultAccent": "purple",
  "bannerContent": null,
  "bannerText": "calmware.dev",
  "bannerAsciiFont": "ANSI Shadow",
  "bannerSize": {
    "min": "12px",
    "vw": "2.4vw",
    "max": "20px"
  },
  "showBannerOnLoad": true,
  "themeMap": {
    "purple": "#9b87f5",
    "cyan": "#7cd4ff",
    "green": "#7bd88f"
  }
}
```

- `defaultAccent`: Initial accent color theme (must exist in `themeMap`)
- `bannerContent`: Custom banner text (raw ASCII string) or `null` to use built-in ASCII banner
- `bannerText`: Plain alphanumeric text that will be converted to ASCII art using figlet (e.g., "calmware.dev")
- `bannerAsciiFont`: Font name for ASCII art generation (e.g., "ANSI Shadow", "Standard", "Big")
- `bannerSize`: Responsive font size using CSS `clamp()` (min, vw, max)
- `showBannerOnLoad`: Whether to display the banner on page load
- `themeMap`: Object mapping theme names to hex color values (extendable)

**Banner Priority**: If `bannerText` is set, it will be converted to ASCII art. Otherwise, `bannerContent` (raw ASCII) is used, or the built-in banner as final fallback.

If `config.json` is missing or invalid, built-in defaults are used.

## Deploying
Host as static files (GitHub Pages, Netlify, Vercel, S3+CloudFront, etc.). Ensure `index.html` is the default document and `assets/` is served with correct MIME types (`image/svg+xml`).


