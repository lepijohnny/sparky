import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface AutoScroll {
  ref: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  scrollToBottom: () => void;
  isNearBottom: boolean;
}

interface AutoScrollOptions {
  streaming: boolean;
  hasMore: boolean;
  bottomThreshold?: number;
  deps?: unknown[];
}

/**
 * Auto-scroll controller for the chat message list.
 *
 * Handles two scroll behaviors:
 * 1. Auto-scroll during streaming — keeps viewport pinned to bottom
 *    while the agent is replying, but only if the user hasn't scrolled up.
 * 2. Scroll-to-bottom on send — scrollToBottom() queues a pending
 *    scroll that flushes after the next React render via useLayoutEffect.
 *
 * Load-more (infinite scroll upward) is handled separately via
 * IntersectionObserver in ChatDetailsPage.
 */
export function useChatAutoScroll({
  streaming,
  bottomThreshold = 80,
  deps = [],
}: AutoScrollOptions): AutoScroll {
  const ref = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const pendingScrollRef = useRef(false);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < bottomThreshold;
    setIsNearBottom(nearBottom);
  }, [bottomThreshold]);

  const scrollToBottom = useCallback(() => {
    pendingScrollRef.current = true;
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollRef.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
      pendingScrollRef.current = false;
    }
  });

  useLayoutEffect(() => {
    if (streaming && isNearBottom && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [streaming, isNearBottom, ...deps]);

  return { ref, onScroll, scrollToBottom, isNearBottom };
}
