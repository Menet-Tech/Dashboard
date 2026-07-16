export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) {
      console.warn("Clipboard API failed, falling back to execCommand", e);
    }
  }
  
  // Fallback for non-HTTPS environments (execCommand)
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (!successful) {
      throw new Error("execCommand copy failed");
    }
  } catch (err) {
    throw new Error("Gagal menyalin teks ke clipboard");
  } finally {
    document.body.removeChild(textArea);
  }
}
