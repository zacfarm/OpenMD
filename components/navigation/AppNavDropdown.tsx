"use client";

import Link from "next/link";
import { useState } from "react";

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
  const [lockedClosed, setLockedClosed] = useState(false);

  return (
    <div
      className={`app-nav-dropdown${isOpen ? " is-open" : ""}`}
      onMouseEnter={() => {
        if (!lockedClosed) {
          setIsOpen(true);
        }
      }}
      onMouseLeave={() => {
        setIsOpen(false);
        setLockedClosed(false);
      }}
    >
      <span className="app-nav-link">{label}</span>
      <div className="app-nav-dropdown-menu">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="app-nav-dropdown-link"
            onClick={() => {
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
