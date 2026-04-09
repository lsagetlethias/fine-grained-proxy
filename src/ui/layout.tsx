import type { Child } from "hono/jsx";
import { raw } from "hono/html";

const FGP_LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 8v8c0 7.2 5.1 13.3 12 15 6.9-1.7 12-7.8 12-15V8L16 2z" fill="#4c6ef5" opacity="0.15"/><path d="M16 2L4 8v8c0 7.2 5.1 13.3 12 15 6.9-1.7 12-7.8 12-15V8L16 2z" stroke="#4c6ef5" stroke-width="1.5" fill="none"/><circle cx="16" cy="14" r="3" stroke="#3b5bdb" stroke-width="1.5" fill="none"/><path d="M16 17v5" stroke="#3b5bdb" stroke-width="1.5" stroke-linecap="round"/><path d="M14.5 20h3" stroke="#3b5bdb" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const FGP_FAVICON_URI = `data:image/svg+xml,${encodeURIComponent(FGP_LOGO_SVG)}`;

const FGP_DESCRIPTION =
  "Fine-Grained Proxy — proxy HTTP stateless qui ajoute des tokens fine-grained (scoping par app, par action) devant n'importe quelle API.";

const FGP_URL = "https://fgp-proxy.lsagetlethias.deno.net/";

export function FgpLogo({ size = 32 }: { size?: number }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: FGP_LOGO_SVG.replace(
          "<svg ",
          `<svg width="${size}" height="${size}" `,
        ),
      }}
    />
  );
}

export function Layout({ children }: { children: Child }) {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>FGP — Fine-Grained Proxy</title>

          <meta name="description" content={FGP_DESCRIPTION} />
          <meta name="theme-color" content="#4c6ef5" />
          <link rel="canonical" href={FGP_URL} />
          <link rel="icon" type="image/svg+xml" href={FGP_FAVICON_URI} />

          <meta property="og:type" content="website" />
          <meta property="og:url" content={FGP_URL} />
          <meta property="og:title" content="FGP — Fine-Grained Proxy" />
          <meta property="og:description" content={FGP_DESCRIPTION} />
          <meta property="og:image" content={FGP_FAVICON_URI} />

          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content="FGP — Fine-Grained Proxy" />
          <meta name="twitter:description" content={FGP_DESCRIPTION} />

          {/* TODO: replace with build-time Tailwind CSS — CDN script kept for now because we use a custom fgp-* palette and dark mode that require tailwind.config at runtime. A proper build step (e.g. Tailwind CLI or PostCSS) will eliminate this. */}
          <script src="https://cdn.tailwindcss.com"></script>
          <script
            dangerouslySetInnerHTML={{
              __html: `
              tailwind.config = {
                darkMode: 'media',
                theme: {
                  extend: {
                    colors: {
                      fgp: {
                        50: '#f0f4ff',
                        100: '#dbe4ff',
                        200: '#bac8ff',
                        500: '#4c6ef5',
                        600: '#3b5bdb',
                        700: '#364fc7',
                        800: '#2b3d9e',
                        900: '#1e2a6e',
                      }
                    }
                  }
                }
              }
            `,
            }}
          />
        </head>
        <body class="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 min-h-screen antialiased">
          <div class="max-w-7xl mx-auto px-4 py-8 sm:py-12">
            {children}
          </div>
        </body>
      </html>
    </>
  );
}
