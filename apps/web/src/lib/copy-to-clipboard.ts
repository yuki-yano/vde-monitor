const focusWithoutScroll = (element: HTMLElement) => {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
};

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    const activeElement = document.activeElement;
    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.fontSize = "16px";

    document.body.appendChild(textarea);

    let copied = false;
    try {
      focusWithoutScroll(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
      if (activeElement instanceof HTMLElement) {
        focusWithoutScroll(activeElement);
      }
      window.scrollTo(previousScrollX, previousScrollY);
    }

    return copied;
  }
};
