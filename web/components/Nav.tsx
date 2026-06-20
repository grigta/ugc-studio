"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  dash: "M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z",
  auto: "M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z",
  user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  product: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  video: "M3 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM23 7l-5 4 5 4z",
  voice: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 10v1a7 7 0 0 0 14 0v-1M12 18v4",
  library: "m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
};

const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Дашборд", icon: I.dash },
  { href: "/auto", label: "Авто-пайплайн", icon: I.auto },
  { href: "/persona", label: "Персонаж", icon: I.user },
  { href: "/product", label: "Товар в кадр", icon: I.product },
  { href: "/video", label: "Видео", icon: I.video },
  { href: "/voice", label: "Голос", icon: I.voice },
  { href: "/library", label: "Библиотека", icon: I.library },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z" />
          </svg>
        </span>
        <span className="name">UGC <span>Studio</span></span>
      </div>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
            <Icon d={l.icon} />
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
