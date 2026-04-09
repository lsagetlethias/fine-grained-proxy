import type { Child } from "hono/jsx";
import { raw } from "hono/html";

export function Layout({ children }: { children: Child }) {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>FGP — Fine-Grained Proxy</title>
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
