import { startPageSyncObserver } from "./core/page-sync";
import {
  NAV_MOTION_EVENT,
  applyFeedWidth,
  applyHideCyPreference,
  applyReaderLineHeight,
  readFeedWidth,
  readHideCyPreference,
  readNavMotionPreference,
  readReaderLineHeight,
} from "./state";
import { watchCommentSort } from "./ui/comment-sort";
import { watchCommunitySearch } from "./ui/community-search";
import { watchDesktopShell } from "./ui/desktop";
import { watchFavourPage } from "./ui/favour";
import { applyNavMotionPreference, watchTopNav } from "./ui/navigation";
import { watchCommentRail } from "./ui/rail";
import { createPostNavigationController, watchPostPager, watchReader } from "./ui/reader";
import { THEME_MEDIA, applyTheme, currentThemeMode, readThemeMode, watchTheme } from "./ui/theme";

// Preferences are applied before the DOM is observed so the first paint already
// carries the stored theme, column width and reading rhythm.
THEME_MEDIA.addEventListener("change", () => {
  if (currentThemeMode === "system") applyTheme("system", false);
});
applyTheme(readThemeMode(), false);
applyFeedWidth(readFeedWidth());
applyReaderLineHeight(readReaderLineHeight());
document.addEventListener(NAV_MOTION_EVENT, (event) => {
  const detail = event instanceof CustomEvent ? event.detail : undefined;
  applyNavMotionPreference(detail === true);
});
applyNavMotionPreference(readNavMotionPreference());

function boot(): void {
  applyHideCyPreference(readHideCyPreference());
  const navigation = createPostNavigationController();
  watchTheme();
  watchTopNav();
  watchCommentSort();
  watchFavourPage();
  watchCommentRail();
  watchPostPager(navigation);
  watchReader(navigation);
  watchCommunitySearch();
  watchDesktopShell();
  startPageSyncObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
