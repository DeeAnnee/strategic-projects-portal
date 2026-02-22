"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NotificationBellProps = {
  unreadCount: number;
  onOpenNotifications: () => void;
  isOpen?: boolean;
};

const MAX_ATTENTION_MS = 8000;
const NEW_DOT_MS = 2000;

const IconBell = ({ className = "h-[18px] w-[18px]" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M15 18H5l1.3-1.6A5.5 5.5 0 0 0 7.5 13V10a4.5 4.5 0 1 1 9 0v3c0 1.2.4 2.3 1.2 3.2L19 18h-4Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export default function NotificationBell({ unreadCount, onOpenNotifications, isOpen = false }: NotificationBellProps) {
  const pathname = usePathname();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [newDelta, setNewDelta] = useState(0);
  const [showNewDot, setShowNewDot] = useState(false);

  const previousUnreadCountRef = useRef(unreadCount);
  const initialLoadHandledRef = useRef(false);
  const hasAnimatedForThisCountRef = useRef<number | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newDotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAnimation = useCallback(() => {
    setIsAnimating(false);
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  }, []);

  const clearNewDot = useCallback(() => {
    setShowNewDot(false);
    if (newDotTimerRef.current) {
      clearTimeout(newDotTimerRef.current);
      newDotTimerRef.current = null;
    }
  }, []);

  const triggerAttention = useCallback((delta: number, targetCount: number) => {
    setNewDelta(delta);
    setShowNewDot(true);
    setIsAnimating(true);
    hasAnimatedForThisCountRef.current = targetCount;

    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    animationTimerRef.current = setTimeout(() => {
      setIsAnimating(false);
      animationTimerRef.current = null;
    }, MAX_ATTENTION_MS);

    if (newDotTimerRef.current) {
      clearTimeout(newDotTimerRef.current);
    }
    newDotTimerRef.current = setTimeout(() => {
      setShowNewDot(false);
      setNewDelta(0);
      newDotTimerRef.current = null;
    }, NEW_DOT_MS);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      const shouldReduceMotion = mediaQuery.matches;
      setIsReducedMotion(shouldReduceMotion);
      if (shouldReduceMotion) {
        clearAnimation();
        clearNewDot();
      }
    };

    syncReducedMotion();

    mediaQuery.addEventListener("change", syncReducedMotion);
    return () => {
      mediaQuery.removeEventListener("change", syncReducedMotion);
    };
  }, [clearAnimation, clearNewDot]);

  useEffect(() => {
    if (isOpen || pathname.startsWith("/approvals") || pathname.startsWith("/notifications")) {
      clearAnimation();
      clearNewDot();
    }
  }, [clearAnimation, clearNewDot, isOpen, pathname]);

  useEffect(() => {
    const previousUnread = previousUnreadCountRef.current;

    if (unreadCount < previousUnread) {
      if (
        hasAnimatedForThisCountRef.current !== null &&
        unreadCount < hasAnimatedForThisCountRef.current
      ) {
        hasAnimatedForThisCountRef.current = null;
      }
    }

    if (unreadCount === 0) {
      clearAnimation();
      clearNewDot();
      hasAnimatedForThisCountRef.current = null;
      previousUnreadCountRef.current = unreadCount;
      initialLoadHandledRef.current = true;
      return;
    }

    if (isReducedMotion) {
      previousUnreadCountRef.current = unreadCount;
      initialLoadHandledRef.current = true;
      return;
    }

    const isInitialLoad = !initialLoadHandledRef.current;
    const hasNewNotifications = unreadCount > previousUnread;

    if (isInitialLoad && unreadCount > 0) {
      triggerAttention(unreadCount, unreadCount);
    } else if (
      hasNewNotifications &&
      hasAnimatedForThisCountRef.current !== unreadCount
    ) {
      triggerAttention(unreadCount - previousUnread, unreadCount);
    }

    initialLoadHandledRef.current = true;
    previousUnreadCountRef.current = unreadCount;
  }, [clearAnimation, clearNewDot, isReducedMotion, triggerAttention, unreadCount]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
      if (newDotTimerRef.current) {
        clearTimeout(newDotTimerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    clearAnimation();
    clearNewDot();
    onOpenNotifications();
  };

  const ariaLabel = unreadCount > 0 ? `${unreadCount} unread notifications` : "No unread notifications";
  const title = newDelta > 0 ? `Notification center (+${newDelta} new)` : "Notification center";

  return (
    <button
      type="button"
      className="notification-trigger-btn notification-bell-btn relative"
      onClick={handleClick}
      title={title}
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <span className={`notification-bell-ripple ${isAnimating ? "is-active" : ""}`} aria-hidden="true" />
      <span className={`notification-bell-icon ${isAnimating ? "is-ringing" : ""}`}>
        <IconBell className="h-[18px] w-[18px]" />
      </span>
      {unreadCount > 0 ? (
        <span className={`notification-bell-badge ${isAnimating ? "is-pulsing" : ""}`}>
          {unreadCount}
        </span>
      ) : null}
      {showNewDot ? <span className="notification-bell-new-dot" aria-hidden="true" /> : null}
    </button>
  );
}
