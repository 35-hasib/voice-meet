"use client";

import { useCallback } from "react";
import { StatusScreen } from "@/components/status-screen";

/**
 * Route-level error boundary.
 *
 * Built on the shared `StatusScreen` so a failure here is visually identical to
 * every other dead end in the app. It previously carried its own hand-rolled
 * card with a different radius, padding, and button colour, which is how a
 * shared status screen quietly stops being shared.
 *
 * `retry` is the current prop; `reset` is kept as a fallback so this keeps
 * working if the boundary is ever rendered by a caller that only supplies it.
 */
export default function RouteError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}): React.JSX.Element {
  const handleRetry = useCallback((): void => {
    (retry ?? reset)?.();
  }, [reset, retry]);

  return (
    <StatusScreen
      title="Something went wrong"
      message="The page hit an unexpected error. Trying again usually resolves it."
      // The digest is a server-side correlation id, not user-facing copy, so it
      // is never shown as if it were a reason the error happened.
      eyebrow={error.digest === undefined ? undefined : "Unexpected error"}
      primaryAction={{ label: "Back to home", href: "/" }}
      secondaryAction={{ label: "Try again", onClick: handleRetry }}
    />
  );
}
