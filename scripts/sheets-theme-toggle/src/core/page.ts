/**
 * `@match` covers the whole `/spreadsheets/` tree, which also holds the file
 * list and the template gallery. Neither has an editor to theme, so the install
 * waits for a document route: `/spreadsheets/d/<id>` or the multi-account
 * `/spreadsheets/u/<n>/d/<id>` form.
 */
const SHEET_DOCUMENT_PATH = /^\/spreadsheets\/(?:u\/\d+\/)?d\/[^/]+/;

export function isSheetEditorPath(pathname: string): boolean {
  return SHEET_DOCUMENT_PATH.test(pathname);
}
