export async function copyText(text: string, target: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    target.focus();
    target.select();
    try { return document.execCommand("copy"); } catch { return false; }
  }
}
