/** Start a local download; callers report initiation, not that the browser saved the file. */
export function downloadText(text: string, filename: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  let link: HTMLAnchorElement | null = null;
  try {
    link = Object.assign(document.createElement("a"), {
      href: url,
      download: filename,
      hidden: true,
    });
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link?.remove();
  }
  // Give the browser a turn to start reading before releasing the temporary URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
