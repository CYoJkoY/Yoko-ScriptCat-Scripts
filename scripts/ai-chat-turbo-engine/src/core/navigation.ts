export interface NavigationLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface NavigationTracker {
  /** True only when the path or query changed; hash-only moves are ignored. */
  observe(location: NavigationLocation): boolean;
}

/**
 * Hash changes are in-page UI moves on these chat hosts, not conversation
 * switches. Query changes stay significant so hosts that select a chat with
 * a parameter still invalidate the index.
 */
function navigationKey(location: NavigationLocation): string {
  return `${location.pathname}${location.search}`;
}

/**
 * Detect conversation route changes across history patching. Gemini rewrites
 * the URL while an answer streams, so callers must not clear the conversation
 * index unless the path or query actually changed.
 */
export function createNavigationTracker(
  initialLocation: NavigationLocation,
): NavigationTracker {
  let lastKey = navigationKey(initialLocation);

  return {
    observe(location) {
      const nextKey = navigationKey(location);
      if (nextKey === lastKey) return false;
      lastKey = nextKey;
      return true;
    },
  };
}
