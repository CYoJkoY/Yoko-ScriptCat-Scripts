import { observeDom } from "../../../../shared/dom/observeDom";

/**
 * 搜索结果页把“被自己中断的搜索请求”当成网络错误处理：站点请求层把 abort
 * 捕获后返回 `status: "network_error"`，结果页因此直接弹出一条英文
 * "canceled"/"cancelled" 提示。此时结果由新的请求重新渲染，这条提示与用户
 * 操作结果无关，只在搜索结果页定向移除；其余错误（搜索失败、网络异常等）
 * 原样保留。
 */

export const SEARCH_PAGE_PATH_PREFIX = "/app/search";

/** 站点自己的 toast 组件与 Element Plus 提示容器。 */
export const SEARCH_NOTICE_SELECTOR = ".hb-toast, .el-message, .el-notification";

/** 站点 toast 的定位外壳，整块移除才不会残留透明占位层。 */
export const SEARCH_NOTICE_HOST_SELECTOR = ".hb-toast__wrapper";

/** 只有整条提示文本就是“请求已取消”时才移除，避免吞掉真实错误。 */
const CANCEL_NOTICE_TEXT = /^(?:cancell?ed|已取消|请求已取消)$/i;

export function isSearchPagePath(pathname: string): boolean {
  return pathname === SEARCH_PAGE_PATH_PREFIX || pathname.startsWith(SEARCH_PAGE_PATH_PREFIX + "/");
}

export function isCancelNoticeText(text: string | null): boolean {
  if (text === null) return false;
  return CANCEL_NOTICE_TEXT.test(text.trim());
}

/**
 * Removes the notice that owns `node` when the whole notice text is a bare
 * cancellation. Returns whether a notice was removed.
 */
export function dismissCancelNotice(node: Element): boolean {
  const notice = node.matches(SEARCH_NOTICE_SELECTOR) ? node : node.closest(SEARCH_NOTICE_SELECTOR);
  if (notice === null || !notice.isConnected) return false;
  if (!isCancelNoticeText(notice.textContent)) return false;
  (notice.closest(SEARCH_NOTICE_HOST_SELECTOR) ?? notice).remove();
  return true;
}

function dismissCancelNotices(root: Element): void {
  if (!root.isConnected) return;
  if (dismissCancelNotice(root)) return;
  for (const notice of root.querySelectorAll(SEARCH_NOTICE_SELECTOR)) {
    dismissCancelNotice(notice);
  }
}

export function watchSearchCancelNotice(): void {
  observeDom(
    "body",
    (records) => {
      if (!isSearchPagePath(location.pathname)) return;
      for (const record of records) {
        if (record.type === "childList") {
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              dismissCancelNotices(node);
              continue;
            }
            // 写入 textContent 会整段换成新的文本节点，同样要回看所在提示。
            const parent = node.parentElement;
            if (parent !== null) dismissCancelNotice(parent);
          }
          continue;
        }
        if (record.type !== "characterData") continue;
        // 提示文本可能在插入之后才写入，此时只看字符变更所在的提示节点。
        const parent = record.target.parentElement;
        if (parent !== null) dismissCancelNotice(parent);
      }
    },
    { config: { childList: true, subtree: true, characterData: true } },
  );
}
