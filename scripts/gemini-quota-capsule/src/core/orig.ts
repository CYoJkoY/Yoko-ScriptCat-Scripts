// Captured before the network observer wraps window.fetch. The reference stays unbound, as in the
// pre-refactor script, so every call site keeps supplying its own receiver.
export const origFetch: typeof window.fetch = window.fetch;
export const origXhrOpen = XMLHttpRequest.prototype.open;
export const origXhrSend = XMLHttpRequest.prototype.send;
