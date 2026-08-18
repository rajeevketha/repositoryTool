const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|zip|gz|woff2?|ttf|eot|pdf|mp3|mp4|wav|resource)$/i;

export function isEditablePath(path) {
  const p = String(path || "").toLowerCase();
  if (!p || p.endsWith("/")) return false;
  if (BINARY_EXT.test(p)) return false;
  return true;
}

export function decodeUtf8Base64(b64) {
  const binary = atob(String(b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function withEditedText(file, text) {
  return { ...file, base64: encodeUtf8Base64(text), edited: true };
}
