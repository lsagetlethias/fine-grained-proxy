import type { Child } from "hono/jsx";

export function Layout({ children }: { children: Child }) {
  return (
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>FGP — Fine-Grained Proxy</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
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
      <body class="bg-gray-50 text-gray-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
