"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  ShieldCheck,
  Shuffle,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { signOutUser } from "@/app/actions/sign-out";
import { Brand } from "@/components/brand";

type AppShellProps = {
  children: React.ReactNode;
  familyName: string;
  userName: string;
  roleName: string;
  avatarColor: string;
  isAdmin: boolean;
};

// Le sezioni raccontano il prodotto: pianificare, capire il carico, decidere insieme, prendersi cura.
const navGroups: { caption: string; links: { href: string; label: string; icon: typeof CalendarDays; adminOnly?: boolean }[] }[] = [
  {
    caption: "La vostra organizzazione",
    links: [
      { href: "/careboard", label: "Careboard", icon: LayoutDashboard },
      { href: "/calendar", label: "Calendario", icon: CalendarDays },
      { href: "/tasks", label: "Attività", icon: CheckSquare2 },
    ],
  },
  {
    caption: "Carico e decisioni",
    links: [
      { href: "/workload", label: "Carico", icon: BarChart3 },
      { href: "/scenarios", label: "Scenari", icon: Shuffle },
      { href: "/summary", label: "Riepilogo", icon: Sparkles },
    ],
  },
  {
    caption: "Cura condivisa",
    links: [
      { href: "/inbox", label: "Care inbox", icon: Inbox },
      { href: "/support", label: "Richieste di aiuto", icon: LifeBuoy },
    ],
  },
  {
    caption: "Spazio e persone",
    links: [
      { href: "/family", label: "Il nucleo", icon: UsersRound, adminOnly: true },
      { href: "/privacy", label: "Privacy e dati", icon: ShieldCheck },
    ],
  },
];

const quickLinks = [
  { href: "/careboard", label: "Oggi" },
  { href: "/inbox", label: "Inbox" },
];

export function AppShell({ children, familyName, userName, roleName, avatarColor, isAdmin }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const isActive = (href: string) => pathname === href || (href !== "/careboard" && pathname.startsWith(href));

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" type="button" aria-label="Apri menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={16} /></button>
        <Brand />
        <div className="workspace-name"><span className="workspace-dot" />{familyName}</div>
        <nav className="topbar-quick" aria-label="Accesso rapido">
          {quickLinks.map((link) => (
            <Link className={`quick-link ${pathname === link.href ? "active" : ""}`} href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="user-chip"><span className="avatar" style={{ background: avatarColor }}>{initials || "P"}</span><span>{userName} · {roleName}</span></div>
          <form action={signOutUser}><button className="outline-button signout-button" type="submit">Esci <ChevronRight size={13} /></button></form>
        </div>
      </header>
      <div className="workspace">
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="side-family-card">
            <span className="side-family-icon"><HeartHandshake size={15} /></span>
            <span><strong>{familyName}</strong><small>Il vostro spazio condiviso</small></span>
          </div>
          {navGroups.map((group) => {
            const links = group.links.filter((link) => !link.adminOnly || isAdmin);
            if (!links.length) return null;
            return (
              <nav className="nav-section" aria-label={group.caption} key={group.caption}>
                <div className="nav-caption">{group.caption}</div>
                {links.map(({ href, label, icon: Icon }) => (
                  <Link className={`nav-link ${isActive(href) ? "active" : ""}`} href={href} key={href} onClick={() => setMenuOpen(false)}>
                    <Icon size={15} />{label}{isActive(href) && <ChevronRight className="nav-end-icon" size={12} />}
                  </Link>
                ))}
              </nav>
            );
          })}
          <div className="family-note"><span className="family-note-icon">✳</span><div><strong>Una famiglia, un piano.</strong><p>Gli impegni di tutti, finalmente insieme.</p></div></div>
          <div className="sidebar-footer"><span className="sync-dot" />Dati condivisi con la famiglia</div>
        </aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
