import { PLATFORMS, type PlatformDefinition } from "../config";
export function hostnameMatches(hostname: string, domains: readonly string[]): boolean {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith("." + domain),
  );
}

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
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname;

  if (hostnameMatches(hostname, ["chatgpt.com", "chat.openai.com"])) {
    return PLATFORMS.chatgpt;
  }
  if (hostnameMatches(hostname, ["gemini.google.com"])) {
    return PLATFORMS.gemini;
  }
  if (
    hostnameMatches(hostname, ["grok.com"]) ||
    (hostname === "x.com" && pathname.startsWith("/i/grok"))
  ) {
    return PLATFORMS.grok;
  }
  if (hostnameMatches(hostname, ["claude.ai"])) {
    return PLATFORMS.claude;
  }
  if (hostnameMatches(hostname, ["deepseek.com"])) {
    return PLATFORMS.deepseek;
  }
  if (hostnameMatches(hostname, ["copilot.microsoft.com"])) {
    return PLATFORMS.copilot;
  }
  if (hostnameMatches(hostname, ["perplexity.ai"])) {
    return PLATFORMS.perplexity;
  }
  if (hostnameMatches(hostname, ["poe.com"])) {
    return PLATFORMS.poe;
  }
  if (hostnameMatches(hostname, ["doubao.com"])) {
    return PLATFORMS.doubao;
  }
  if (hostnameMatches(hostname, ["yuanbao.tencent.com"])) {
    return PLATFORMS.yuanbao;
  }
  if (hostnameMatches(hostname, ["chat.qwen.ai"])) {
    return PLATFORMS.qwen;
  }
  if (hostnameMatches(hostname, ["qianwen.com"])) {
    return PLATFORMS.qianwen;
  }
  if (hostnameMatches(hostname, ["chatglm.cn"])) {
    return PLATFORMS.glm;
  }
  if (hostnameMatches(hostname, ["chat.z.ai"])) {
    return PLATFORMS.zai;
  }
  return null;
}

