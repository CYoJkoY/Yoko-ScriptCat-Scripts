import { PAGE_ROUTE, isOfficialHomePath } from "./config";
import { registerPageSync, startPageSyncObserver } from "./core/page-sync";
import {
  NAV_MOTION_EVENT,
  applyFeedWidth,
  applyHideCyPreference,
  applyReaderLineHeight,
  readFeedWidth,
  readHideCyPreference,
  readNavMotionPreference,
  readReaderLineHeight,
  releaseHideCy,
} from "./state";
import { watchCommentSort } from "./ui/comment-sort";
import { watchCommunitySearch } from "./ui/community-search";
import { watchDesktopShell } from "./ui/desktop";
import { watchFavourPage } from "./ui/favour";
import { watchNativeComments } from "./ui/native-comments";
import { applyNavMotionPreference, releaseNav, watchTopNav } from "./ui/navigation";
import { watchCommentRail } from "./ui/rail";
import { createPostNavigationController, watchPostPager, watchReader } from "./ui/reader";
import { THEME_MEDIA, applyTheme, currentThemeMode, readThemeMode, releaseTheme, watchTheme } from "./ui/theme";

// Preferences are applied before the DOM is observed so the first paint already
// carries the stored theme, column width and reading rhythm. The official
// homepage is never painted by the script, so it skips these writes entirely.
if (isOfficialHomePath(location.pathname)) {
  releaseTheme();
} else {
  THEME_MEDIA.addEventListener("change", () => {
    if (currentThemeMode === "system") applyTheme("system", false);
  });
  applyTheme(readThemeMode(), false);
  applyFeedWidth(readFeedWidth());
  applyReaderLineHeight(readReaderLineHeight());
}
document.addEventListener(NAV_MOTION_EVENT, (event) => {
  const detail = event instanceof CustomEvent ? event.detail : undefined;
  applyNavMotionPreference(detail === true);
});
if (!isOfficialHomePath(location.pathname)) applyNavMotionPreference(readNavMotionPreference());

// The official homepage keeps the site's own chrome, so every adapter hook is
// released there. The guard keeps the same task from touching an adapted route
// when a route change forces all tasks to run once.
function releaseOfficialHome(): void {
  if (!isOfficialHomePath(location.pathname)) return;
  releaseTheme();
  releaseNav();
  releaseHideCy();
}

function boot(): void {
  if (isOfficialHomePath(location.pathname)) {
    releaseOfficialHome();
  } else {
    applyHideCyPreference(readHideCyPreference());
  }
  registerPageSync(releaseOfficialHome, 0, [PAGE_ROUTE.OFFICIAL_HOME]);
  const navigation = createPostNavigationController();
  watchTheme();
  watchTopNav();
  watchCommentSort();
  watchFavourPage();
  watchCommentRail();
  watchPostPager(navigation);
  watchReader(navigation);
  watchNativeComments();
  watchCommunitySearch();
  watchDesktopShell();
  startPageSyncObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
