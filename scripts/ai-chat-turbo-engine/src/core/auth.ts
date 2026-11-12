import {
  findPlatformForLocation,
  type PlatformDefinition,
} from "../config";

// Login, account chooser, and OAuth callback routes are not chat pages.
// Only path segments are inspected; query params such as next or redirect
// are ignored so normal chat links keep working.
const AUTH_ROUTE_SEGMENTS = new Set([
  "auth",
  "auth0",
  "authorize",
  "authorization",
  "oauth",
  "oauth2",
  "openid",
  "sso",
  "saml",
  "login",
  "log-in",
  "signin",
  "sign-in",
  "sign_in",
  "signup",
  "sign-up",
  "sign_up",
  "register",
  "registration",
  "callback",
  "magic-link",
  "magiclink",
  "verify",
  "verification",
  "mfa",
  "2fa",
  "otp",
  "account",
  "accounts",
  "account-chooser",
  "choose-account",
  "switch-account",
  "challenge",
  "captcha",
  "consent",
  "redirect",
  "recover",
  "recovery",
  "reset-password",
  "forgot-password",
  "password",
]);
const AUTH_HOSTNAME_PREFIXES = [
  "auth.",
  "auth0.",
  "login.",
  "signin.",
  "accounts.",
  "sso.",
];

// Whether the engine is live in this document. SPA navigation to an auth
// route sets it back to false until the chat route returns. The flag lives
// with the route guard so lifecycle and route handlers share one owner.
let engineActive = false;

export function setEngineActive(active: boolean): void {
  engineActive = active;
}

export function isEngineActive(): boolean {
  return engineActive;
}

export function isAuthOrRedirectRoute(locationLike?: Location): boolean {
  const source = locationLike || window.location;
  if (!source) return false;

  const hostname = String(source.hostname || "").toLowerCase();
  if (
    AUTH_HOSTNAME_PREFIXES.some((prefix) => hostname.startsWith(prefix))
  ) {
    return true;
  }

  const pathname = String(source.pathname || "").toLowerCase();
  if (!pathname) return false;

  return pathname
    .split("/")
    .filter(Boolean)
    .some((segment) =>
      AUTH_ROUTE_SEGMENTS.has(segment.replace(/\.(?:html?|php|aspx?)$/, "")),
    );
}

/** Dormant on auth and redirect routes: no UI, no listeners, no input writes. */
export function isEngineDormant(): boolean {
  return !engineActive || isAuthOrRedirectRoute();
}

export function detectPlatform(): PlatformDefinition | null {
  return findPlatformForLocation(
    window.location.hostname,
    window.location.pathname,
  );
}

