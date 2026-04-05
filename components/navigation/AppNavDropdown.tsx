"use client";

import Link from "next/link";
import { useState, useRef } from "react";

type Item = {
  href: string;
  label: string;
};

type Props = {
  label: string;
  items: Item[];
};

export default function AppNavDropdown({ label, items }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 100);
  };

  const handleLinkClick = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(false);
  };

  return (
    <div
      className={`app-nav-dropdown${isOpen ? " is-open" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="app-nav-link">{label}</span>
      <div className="app-nav-dropdown-menu">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="app-nav-dropdown-link"
            onClick={handleLinkClick}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
