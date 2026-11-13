import { sessionStore } from "../state";

/**
 * A comment written by this tab that the site tree may not echo yet. The mark
 * lives in sessionStorage so a full page reload can still wait for the server
 * copy, while closing the tab drops the verification state. Marks expire after
 * a short window instead of being removed on the first echo, because the tree
 * endpoint can lag again on the next reload.
 */
export const READER_COMMENT_MARKS_KEY = "heybox-up.readerCommentMarks.v1";

export const READER_COMMENT_MARK_LIMIT = 4;

export const READER_COMMENT_MARK_TTL_MS = 30 * 60 * 1000;

export interface ReaderCommentMarkInput {
  linkId: string;
  /** The id returned by create, or empty when that endpoint omitted it. */
  commentId: string;
  text: string;
  userId: string;
  /** Empty for a top-level floor. */
  rootId: string;
  /** Empty for a top-level floor, otherwise the answered comment id. */
  parentId: string;
  createAt: number;
  /** Page that owned the answered floor when the write was made. */
  verifyPage: number;
  imageUrls: readonly string[];
}

export interface ReaderCommentMark extends ReaderCommentMarkInput {
  token: string;
  savedAt: number;
}

function readRecordText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readRecordNumber(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : 0;
}

function readImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (url !== "") urls.push(url);
  }
  return urls;
}

function normalizeMark(value: unknown, now: number): ReaderCommentMark | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const token = readRecordText(record, "token");
  const linkId = readRecordText(record, "linkId");
  const userId = readRecordText(record, "userId");
  const savedAt = readRecordNumber(record, "savedAt");
  if (token === "" || linkId === "" || userId === "" || savedAt <= 0) return null;
  if (now - savedAt > READER_COMMENT_MARK_TTL_MS) return null;
  const text = typeof record["text"] === "string" ? record["text"] : "";
  const imageUrls = readImageUrls(record["imageUrls"]);
  if (text.trim() === "" && imageUrls.length === 0) return null;
  const verifyPage = Math.floor(readRecordNumber(record, "verifyPage"));
  return {
    token: token,
    linkId: linkId,
    commentId: readRecordText(record, "commentId"),
    text: text,
    userId: userId,
    rootId: readRecordText(record, "rootId"),
    parentId: readRecordText(record, "parentId"),
    createAt: Math.floor(readRecordNumber(record, "createAt")),
    verifyPage: verifyPage > 0 ? verifyPage : 1,
    imageUrls: imageUrls,
    savedAt: savedAt,
  };
}

function readAllMarks(now: number = Date.now()): ReaderCommentMark[] {
  const stored = sessionStore.readJson(READER_COMMENT_MARKS_KEY, []);
  const values = Array.isArray(stored) ? stored : [];
  const marks: ReaderCommentMark[] = [];
  for (const value of values) {
    const mark = normalizeMark(value, now);
    if (mark !== null) marks.push(mark);
  }
  marks.sort((left, right) => left.savedAt - right.savedAt);
  const keep = marks.slice(-READER_COMMENT_MARK_LIMIT);
  if (keep.length !== values.length) sessionStore.writeJson(READER_COMMENT_MARKS_KEY, keep);
  return keep;
}

function createMarkToken(): string {
  const uuid = typeof crypto === "undefined" || typeof crypto.randomUUID !== "function"
    ? ""
    : crypto.randomUUID().replace(/-/g, "");
  const random = Math.random().toString(36).slice(2);
  return (uuid + Date.now().toString(36) + random).slice(0, 32);
}

/** Marks a comment as written here until the site tree echoes it back. */
export function saveReaderCommentMark(input: ReaderCommentMarkInput): ReaderCommentMark | null {
  const linkId = input.linkId.trim();
  const userId = input.userId.trim();
  const text = input.text;
  const imageUrls = readImageUrls(input.imageUrls);
  if (linkId === "" || userId === "" || (text.trim() === "" && imageUrls.length === 0)) return null;
  const mark: ReaderCommentMark = {
    token: createMarkToken(),
    linkId: linkId,
    commentId: input.commentId.trim(),
    text: text,
    userId: userId,
    rootId: input.rootId.trim(),
    parentId: input.parentId.trim(),
    createAt: Math.floor(input.createAt),
    verifyPage: Math.max(1, Math.floor(input.verifyPage)),
    imageUrls: imageUrls,
    savedAt: Date.now(),
  };
  const previous = readAllMarks(mark.savedAt);
  const withoutDuplicate = previous.filter((item) => !(
    item.linkId === mark.linkId
    && ((mark.commentId !== "" && item.commentId === mark.commentId)
      || (mark.commentId === "" && item.commentId === "" && item.text === mark.text))
  ));
  const next = withoutDuplicate.concat(mark).slice(-READER_COMMENT_MARK_LIMIT);
  sessionStore.writeJson(READER_COMMENT_MARKS_KEY, next);
  return mark;
}

/** Returns the marks for one article, dropping expired or malformed entries. */
export function readReaderCommentMarks(linkId: string): ReaderCommentMark[] {
  const id = linkId.trim();
  if (id === "") return [];
  return readAllMarks().filter((mark) => mark.linkId === id);
}

export function clearReaderCommentMarks(linkId: string): void {
  const id = linkId.trim();
  if (id === "") return;
  const marks = readAllMarks();
  const remaining = marks.filter((mark) => mark.linkId !== id);
  if (remaining.length === marks.length) return;
  if (remaining.length === 0) sessionStore.remove(READER_COMMENT_MARKS_KEY);
  else sessionStore.writeJson(READER_COMMENT_MARKS_KEY, remaining);
}

/** Drops a mark after its comment was deleted here. */
export function removeReaderCommentMark(linkId: string, commentId: string): void {
  const id = linkId.trim();
  const comment = commentId.trim();
  if (id === "" || comment === "") return;
  const marks = readAllMarks();
  const remaining = marks.filter((mark) => !(mark.linkId === id && mark.commentId === comment));
  if (remaining.length === marks.length) return;
  if (remaining.length === 0) sessionStore.remove(READER_COMMENT_MARKS_KEY);
  else sessionStore.writeJson(READER_COMMENT_MARKS_KEY, remaining);
}

/** Drops one mark by its session token, for a check that ran out of attempts. */
export function removeReaderCommentMarkToken(linkId: string, token: string): void {
  const id = linkId.trim();
  const value = token.trim();
  if (id === "" || value === "") return;
  const marks = readAllMarks();
  const remaining = marks.filter((mark) => !(mark.linkId === id && mark.token === value));
  if (remaining.length === marks.length) return;
  if (remaining.length === 0) sessionStore.remove(READER_COMMENT_MARKS_KEY);
  else sessionStore.writeJson(READER_COMMENT_MARKS_KEY, remaining);
}
