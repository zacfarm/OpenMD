"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = {
  href: string;
  label: string;
};

type Props = {
  label: string;
  items: Item[];
};

const HOVER_OPEN_DELAY_MS = 1000;
const HOVER_CLOSE_DELAY_MS = 2000;

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNavDropdown({ label, items }: Props) {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [lockedClosed, setLockedClosed] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActiveItem = items.some((item) => isPathActive(pathname, item.href));

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  return (
    <div
      className={`app-nav-dropdown${isOpen ? " is-open" : ""}`}
      onMouseEnter={() => {
        clearCloseTimer();
        if (lockedClosed || isOpen) return;
        clearHoverTimer();
        hoverTimerRef.current = setTimeout(() => {
          setIsOpen(true);
          hoverTimerRef.current = null;
        }, HOVER_OPEN_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearHoverTimer();
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
          setIsOpen(false);
          closeTimerRef.current = null;
        }, HOVER_CLOSE_DELAY_MS);
        setLockedClosed(false);
      }}
    >
      <span className={`app-nav-link${hasActiveItem ? " is-active" : ""}`}>
        {label}
      </span>
      <div className="app-nav-dropdown-menu">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`app-nav-dropdown-link${
              isPathActive(pathname, item.href) ? " is-active" : ""
            }`}
            onClick={() => {
              clearHoverTimer();
              clearCloseTimer();
              setIsOpen(false);
              setLockedClosed(true);
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
