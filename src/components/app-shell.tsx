"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare2, ChevronRight, HeartHandshake, Menu, Settings2, UsersRound } from "lucide-react";
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

const links = [
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/tasks", label: "Attività", icon: CheckSquare2 },
  { href: "/family", label: "La famiglia", icon: UsersRound },
  { href: "/account", label: "Il mio account", icon: Settings2 },
];

export function AppShell({ children, familyName, userName, roleName, avatarColor, isAdmin }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" type="button" aria-label="Apri menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={16} /></button>
        <Brand />
        <div className="workspace-name"><span className="workspace-dot" />{familyName}</div>
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
          <nav className="nav-section" aria-label="Navigazione principale">
            <div className="nav-caption">La vostra organizzazione</div>
            {links.filter((link) => link.href !== "/family" || isAdmin).map(({ href, label, icon: Icon }) => (
              <Link className={`nav-link ${pathname === href ? "active" : ""}`} href={href} key={href} onClick={() => setMenuOpen(false)}>
                <Icon size={15} />{label}{pathname === href && <ChevronRight className="nav-end-icon" size={12} />}
              </Link>
            ))}
          </nav>
          <div className="family-note"><span className="family-note-icon">✳</span><div><strong>Una famiglia, un piano.</strong><p>Gli impegni di tutti, finalmente insieme.</p></div></div>
          <div className="sidebar-footer"><span className="sync-dot" />Dati condivisi con la famiglia</div>
        </aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
