"use client";

import { useEffect } from "react";

/**
 * Discourages casual copying and common DevTools keyboard shortcuts.
 * This is a UI deterrent only; browser source and DevTools cannot be secured
 * by client-side JavaScript.
 */
export default function BrowserProtection() {
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || Boolean(
        target.closest("input, textarea, [contenteditable='true'], [role='textbox']"),
      );
    };

    const preventNonEditableAction = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;
      const devToolsShortcut =
        event.key === "F12" ||
        (commandKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (commandKey && key === "u");
      const copyShortcut =
        commandKey && !event.shiftKey && ["c", "x", "a"].includes(key) &&
        !isEditableTarget(event.target);

      if (devToolsShortcut || copyShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("contextmenu", preventNonEditableAction, true);
    document.addEventListener("selectstart", preventNonEditableAction, true);
    document.addEventListener("copy", preventNonEditableAction, true);
    document.addEventListener("cut", preventNonEditableAction, true);
    document.addEventListener("dragstart", preventNonEditableAction, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("contextmenu", preventNonEditableAction, true);
      document.removeEventListener("selectstart", preventNonEditableAction, true);
      document.removeEventListener("copy", preventNonEditableAction, true);
      document.removeEventListener("cut", preventNonEditableAction, true);
      document.removeEventListener("dragstart", preventNonEditableAction, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
