export const FGP_SOURCE_HEADER = "X-FGP-Source";
export const FGP_SOURCE_PROXY = "proxy";
export const FGP_SOURCE_UPSTREAM = "upstream";

export const SWAGGER_DOCS_PATH = "/api/docs";
export const SWAGGER_UI_CDN = "https://cdn.jsdelivr.net";

// Chemins servis par FGP lui-meme. Toute route ajoutee ici doit etre hors du pattern
// /:blob/* du proxy, sinon des headers seraient poses sur une reponse upstream.
export const FGP_OWNED_PATHS = [
  "/",
  "/healthz",
  "/static/*",
  "/logs",
  "/logs/*",
  "/llms.txt",
  "/api/*",
] as const;

// En-tetes poses sur les erreurs generees par FGP sur la route proxy, ou secureHeaders() ne
// peut pas s'appliquer : la decision se prend apres coup, sur X-FGP-Source. Doit rester
// identique a ce que secureHeaders() produit sur une route FGP ; un test de parite le verifie.
export const FGP_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  [
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; manifest-src 'self'",
  ],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
  ["Origin-Agent-Cluster", "?1"],
  [
    "Permissions-Policy",
    "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), bluetooth=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()",
  ],
  ["Referrer-Policy", "no-referrer"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-DNS-Prefetch-Control", "off"],
  ["X-Download-Options", "noopen"],
  ["X-Frame-Options", "DENY"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["X-XSS-Protection", "0"],
] as const;
