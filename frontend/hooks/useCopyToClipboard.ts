"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RESET_DELAY_MS = 2000;

export function useCopyToClipboard(): {
  copied: boolean;
  error: string | null;
  copy: (value: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const copy = useCallback(async (value: string): Promise<boolean> => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard access is unavailable in this browser.");
      }

      await navigator.clipboard.writeText(value);
      setError(null);
      setCopied(true);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, RESET_DELAY_MS);

      return true;
    } catch {
      setCopied(false);
      setError("Copying is not supported here. Select the link and copy it manually.");
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { copied, error, copy };
}
