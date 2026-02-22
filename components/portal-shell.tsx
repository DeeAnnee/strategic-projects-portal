"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "next-auth";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import FloatingCopilot from "@/components/ai/floating-copilot";
import NotificationBell from "@/components/notification-bell";
import ThemeToggle from "@/components/theme-toggle";
import { canAccessModule, type ModuleName } from "@/lib/auth/rbac";

type Props = {
  session: Session;
  children: ReactNode;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  isRead: boolean;
};

type NavItem = {
  href: Route;
  label: string;
  moduleName?: ModuleName;
  icon: (props: { className?: string }) => ReactNode;
};

const IconBrand = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
    <defs>
      <linearGradient id="portal-nav-icon-bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#B00A30" />
        <stop offset="100%" stopColor="#870824" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="120" fill="url(#portal-nav-icon-bg)" />
    <circle cx="256" cy="256" r="120" fill="none" stroke="#FFFFFF" strokeWidth="32" />
    <path
      d="M300 180 L300 340
      M300 180
      C360 180, 360 250, 300 250"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="32"
      strokeLinecap="round"
    />
    <path
      d="M200 200
      C160 200, 160 240, 200 240
      C240 240, 240 280, 200 280"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="32"
      strokeLinecap="round"
    />
  </svg>
);

const IconHome = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V21h14V9.8" /></svg>
);
const IconFolder = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
);
const IconChart = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></svg>
);
const IconRobot = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M12 4v4" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></svg>
);
const IconResource = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" /></svg>
);
const IconApprovals = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="m8 12 2.4 2.4L16.5 8.3" />
  </svg>
);
const IconReports = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16v14H4z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
    <path d="M15 16h1" />
  </svg>
);
const IconBoard = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="13" width="7" height="7" rx="1"/><rect x="14" y="13" width="7" height="7" rx="1"/></svg>
);
const IconProjectManagement = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
);
const IconGovernanceProject = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h9l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M15 4v4h4" />
    <path d="M8 11h8" />
    <path d="M8 15h8" />
    <path d="M8 19h5" />
  </svg>
);
const IconFinance = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.2 14.8c.5.9 1.5 1.4 2.8 1.4 1.5 0 2.5-.7 2.5-1.8 0-1-.7-1.6-2.4-2l-1.3-.3c-1.8-.4-2.7-1.3-2.7-2.8 0-1.8 1.5-3 3.8-3 1.9 0 3.4 1 3.8 2.5" />
    <path d="M12 5.4v13.2" />
  </svg>
);
const IconSpoCommittee = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16" />
    <path d="M4 12h10" />
    <path d="M4 18h8" />
    <path d="m16 16 2.2 2.2L22 14.4" />
  </svg>
);
const IconAdmin = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z" /></svg>
);
const IconBell = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18H5l1.3-1.6A5.5 5.5 0 0 0 7.5 13V10a4.5 4.5 0 1 1 9 0v3c0 1.2.4 2.3 1.2 3.2L19 18h-4Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
);
const IconSettings = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10.3 3.2h3.4l.4 1.8c.4.1.8.3 1.2.5l1.6-1 2.4 2.4-1 1.6c.2.4.4.8.5 1.2l1.8.4v3.4l-1.8.4c-.1.4-.3.8-.5 1.2l1 1.6-2.4 2.4-1.6-1c-.4.2-.8.4-1.2.5l-.4 1.8h-3.4l-.4-1.8c-.4-.1-.8-.3-1.2-.5l-1.6 1-2.4-2.4 1-1.6c-.2-.4-.4-.8-.5-1.2l-1.8-.4v-3.4l1.8-.4c.1-.4.3-.8.5-1.2l-1-1.6 2.4-2.4 1.6 1c.4-.2.8-.4 1.2-.5l.4-1.8Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

const primaryNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", moduleName: "dashboard", icon: IconChart },
  { href: "/submissions", label: "Projects", moduleName: "projects", icon: IconFolder },
  { href: "/approvals", label: "Approvals", moduleName: "projects", icon: IconApprovals },
  { href: "/reports", label: "Reports Studio", moduleName: "dashboard", icon: IconReports },
  { href: "/resources", label: "Resources", moduleName: "projects", icon: IconResource },
  { href: "/ai-helper", label: "STRATOS Lab", moduleName: "stratos_lab", icon: IconRobot }
];

const governanceNavItems: NavItem[] = [
  {
    href: "/finance",
    label: "Finance Governance Hub",
    moduleName: "finance_governance_hub",
    icon: IconFinance
  },
  {
    href: "/operations",
    label: "Project Governance Hub",
    moduleName: "project_governance_hub",
    icon: IconGovernanceProject
  },
  {
    href: "/project-management-hub",
    label: "Project Management Hub",
    moduleName: "project_management_hub",
    icon: IconProjectManagement
  },
  { href: "/spo-committee", label: "SPO Committee Hub", moduleName: "spo_committee_hub", icon: IconSpoCommittee }
];

const getInitials = (name?: string | null) =>
  (name ?? "User")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

const getFirstName = (name?: string | null) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return "User";
  }
  return trimmed.split(/\s+/)[0] ?? "User";
};

const getRoleLabel = (role?: string | null) =>
  role
    ? role
        .replaceAll("_", " ")
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ")
    : "Portal User";

const isPathActive = (pathname: string, href: Route) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export default function PortalShell({ session, children }: Props) {
  const pathname = usePathname();
  const userImage =
    (session.user as { photoUrl?: string | null; image?: string | null }).photoUrl ??
    (session.user as { photoUrl?: string | null; image?: string | null }).image ??
    null;
  const [collapsed, setCollapsed] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const knownUnreadIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const principal = useMemo(
    () => ({
      id: session.user.id,
      email: session.user.email ?? undefined,
      azureObjectId: session.user.azureObjectId ?? undefined,
      roleType: session.user.roleType ?? session.user.role,
      isActive: session.user.isActive ?? true
    }),
    [session.user.azureObjectId, session.user.email, session.user.id, session.user.isActive, session.user.role, session.user.roleType]
  );
  const links: NavItem[] = useMemo(
    () => primaryNavItems.filter((item) => (item.moduleName ? canAccessModule(principal, item.moduleName) : true)),
    [principal]
  );
  const governanceLinks = useMemo(
    () => governanceNavItems.filter((item) => (item.moduleName ? canAccessModule(principal, item.moduleName) : true)),
    [principal]
  );
  const adminLink = useMemo<NavItem | null>(
    () =>
      canAccessModule(principal, "user_admin")
        ? { href: "/admin", label: "Admin", moduleName: "user_admin", icon: IconAdmin }
        : null,
    [principal]
  );
  const mobileNavItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [...links, ...governanceLinks];
    if (adminLink) {
      items.push(adminLink);
    }
    return items;
  }, [adminLink, governanceLinks, links]);
  const showGovernanceChildren = collapsed || governanceOpen;

  const loadNotifications = useCallback(async (notifyOnNew = false) => {
    const response = await fetch("/api/notifications");
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const list = (payload.data ?? []) as NotificationItem[];
    setNotifications(list);

    const unreadItems = list.filter((item) => !item.isRead);
    const unreadIds = new Set(unreadItems.map((item) => item.id));

    if (notifyOnNew) {
      const newestUnread = unreadItems.find((item) => !knownUnreadIdsRef.current.has(item.id));
      if (newestUnread) {
        setToastNotification(newestUnread);
        if (toastTimerRef.current) {
          clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = setTimeout(() => setToastNotification(null), 7000);
      }
    }

    knownUnreadIdsRef.current = unreadIds;
  }, []);

  const markRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    await loadNotifications();
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true })
    });
    await loadNotifications();
  };

  useEffect(() => {
    void loadNotifications(false);
    const interval = setInterval(() => {
      void loadNotifications(true);
    }, 15000);

    return () => {
      clearInterval(interval);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [loadNotifications]);

  const unreadNotificationCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.isRead ? 0 : 1), 0),
    [notifications]
  );

  return (
    <div className="min-h-screen bg-slate-100 text-neutral-900">
      <div className={`grid min-h-screen w-full grid-cols-1 ${collapsed ? "md:grid-cols-[96px_1fr]" : "md:grid-cols-[310px_1fr]"}`}>
        <aside className="sidebar-ombre relative z-20 hidden flex-col overflow-visible border-r border-white/30 py-4 text-white md:sticky md:top-0 md:flex md:h-screen md:self-start">
          <div className={`sidebar-brand relative mb-5 ${collapsed ? "justify-center px-2" : "px-4"}`}>
            <div className="flex items-center gap-2">
              <IconBrand className="h-6 w-6 text-white/95" />
              {!collapsed ? <p className="text-[16px] font-semibold leading-none tracking-[0.01em] text-white/95">Strategic Projects</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="sidebar-collapse-btn"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`h-4 w-4 ${collapsed ? "translate-x-[1px]" : "-translate-x-[1px]"}`}
              >
                {collapsed ? (
                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <nav className="space-y-2">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`sidebar-nav-item ${isPathActive(pathname, item.href) ? "is-active" : ""} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}
                >
                  <span className={`sidebar-nav-icon ${isPathActive(pathname, item.href) ? "is-active" : ""}`}>
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  {!collapsed ? <span className="text-[16px] leading-5">{item.label}</span> : null}
                </Link>
              ))}

              {governanceLinks.length > 0 ? (
                <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!collapsed) {
                      setGovernanceOpen((prev) => !prev);
                    }
                  }}
                  className={`sidebar-nav-item w-full ${collapsed ? "justify-center px-2" : "justify-between gap-3 px-3"}`}
                  title="Governance Hubs"
                  aria-expanded={collapsed ? true : governanceOpen}
                >
                  <span className="flex items-center gap-3">
                    <span className="sidebar-nav-icon">
                      <IconBoard className="h-[18px] w-[18px]" />
                    </span>
                    {!collapsed ? <span className="text-[16px] leading-5">Governance Hubs</span> : null}
                  </span>
                  {!collapsed ? (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={`h-4 w-4 transition-transform ${governanceOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>

                {showGovernanceChildren ? (
                  <div className={`mt-1 space-y-1 ${collapsed ? "" : "pl-4"}`}>
                    {governanceLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={`sidebar-nav-item ${isPathActive(pathname, item.href) ? "is-active" : ""} ${
                          collapsed ? "justify-center px-2" : "gap-3 px-3"
                        }`}
                      >
                        <span className={`sidebar-nav-icon ${isPathActive(pathname, item.href) ? "is-active" : ""}`}>
                          <item.icon className="h-[18px] w-[18px]" />
                        </span>
                        {!collapsed ? <span className="text-[15px] leading-5">{item.label}</span> : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
                </div>
              ) : null}

              {adminLink ? (
                <Link
                  href={adminLink.href}
                  title={adminLink.label}
                  className={`sidebar-nav-item ${isPathActive(pathname, adminLink.href) ? "is-active" : ""} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}
                >
                  <span className={`sidebar-nav-icon ${isPathActive(pathname, adminLink.href) ? "is-active" : ""}`}>
                    <adminLink.icon className="h-[18px] w-[18px]" />
                  </span>
                  {!collapsed ? <span className="text-[16px] leading-5">{adminLink.label}</span> : null}
                </Link>
              ) : null}
            </nav>

            <div className="mt-auto px-1">
              {!collapsed ? (
                <div className="mt-3 flex items-center gap-3 px-1 py-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#8f0827]">
                    {getInitials(session.user.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{session.user.name ?? "User"}</p>
                    <p className="truncate text-[11px] text-white/80">{getRoleLabel(session.user.role)}</p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#8f0827]">
                  {getInitials(session.user.name)}
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="sidebar-ombre sticky top-0 z-30 border-b border-white/30 px-2 py-2 text-white md:hidden">
            <nav className="flex items-center gap-2 overflow-x-auto pb-1">
              {mobileNavItems.map((item) => (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  title={item.label}
                  className={`sidebar-nav-item shrink-0 gap-2 px-3 py-2 ${
                    isPathActive(pathname, item.href) ? "is-active" : ""
                  }`}
                >
                  <span className={`sidebar-nav-icon ${isPathActive(pathname, item.href) ? "is-active" : ""}`}>
                    <item.icon className="h-[16px] w-[16px]" />
                  </span>
                  <span className="whitespace-nowrap text-sm leading-5">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <header className="portal-header relative px-3 py-3 sm:px-6">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <div className="header-brand-copy">
                <p className="header-brand-title">CIBC Caribbean</p>
                <p className="header-brand-subtitle">Transformation &amp; Project Governance</p>
              </div>

              <p className="header-title">Strategic Projects Portal</p>

              <div className="flex items-center justify-end gap-3">
                <Link
                  href={"/" as Route}
                  className="notification-trigger-btn"
                  title="Home"
                >
                  <IconHome className="h-[17px] w-[17px]" />
                </Link>
                <NotificationBell
                  unreadCount={unreadNotificationCount}
                  isOpen={notificationOpen}
                  onOpenNotifications={() => {
                    setSettingsOpen(false);
                    setProfileOpen(false);
                    setNotificationOpen((prev) => !prev);
                    void loadNotifications(false);
                  }}
                />
                <button
                  type="button"
                  className="settings-trigger-btn"
                  onClick={() => {
                    setNotificationOpen(false);
                    setProfileOpen(false);
                    setSettingsOpen((prev) => !prev);
                  }}
                  title="Settings"
                >
                  <IconSettings className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  className="profile-trigger-btn"
                  onClick={() => {
                    setNotificationOpen(false);
                    setSettingsOpen(false);
                    setProfileOpen((prev) => !prev);
                  }}
                  title="Account"
                >
                  {userImage ? (
                    <img src={userImage} alt={session.user.name ?? "User"} className="profile-avatar-thumb" />
                  ) : (
                    <span className="profile-avatar-initials">{getInitials(session.user.name)}</span>
                  )}
                </button>
              </div>
            </div>
            <div className="mt-2 text-right">
              <p className="header-welcome">Welcome {getFirstName(session.user.name)}!</p>
            </div>

            {notificationOpen ? (
              <div className="notification-center-panel absolute right-6 top-[88px] z-40 w-[420px] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Notification Center</h3>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { void markAllRead(); }} className="notification-action-pill">
                      Mark all as read
                    </button>
                    <button type="button" onClick={() => setNotificationOpen(false)} className="notification-action-pill">
                      Close
                    </button>
                  </div>
                </div>
                <ul className="max-h-80 space-y-2 overflow-auto pr-1">
                  {notifications.length === 0 ? (
                    <li className="notification-empty-state">No notifications yet.</li>
                  ) : (
                    notifications.map((note) => (
                      <li key={note.id} className={`notification-item ${note.isRead ? "is-read" : "is-unread"}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!note.isRead ? <span className="notification-unread-dot" /> : null}
                            <Link
                              href={note.href as Route}
                              className="notification-item-title"
                              onClick={() => {
                                void markRead(note.id);
                                setNotificationOpen(false);
                              }}
                            >
                              {note.title}
                            </Link>
                          </div>
                          <p className="notification-item-body">{note.body}</p>
                        </div>
                        {!note.isRead ? (
                          <button
                            type="button"
                            onClick={() => {
                              void markRead(note.id);
                            }}
                            className="notification-inline-action"
                          >
                            Mark read
                          </button>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
            {settingsOpen ? (
              <div className="settings-panel absolute right-6 top-[88px] z-40 w-[320px] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Settings</h3>
                  <button
                    type="button"
                    className="notification-action-pill"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="settings-section">
                  <p className="settings-section-label">Appearance</p>
                  <ThemeToggle className="mt-2 w-full settings-theme-toggle" />
                </div>
              </div>
            ) : null}
            {profileOpen ? (
              <div className="profile-panel absolute right-6 top-[88px] z-40 w-[360px] max-w-[calc(100vw-2rem)] p-4">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                  <p className="text-sm font-semibold text-slate-700">Strategic Projects Portal</p>
                  <button
                    type="button"
                    className="profile-signout-link"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                  >
                    Sign out
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="profile-avatar-large">
                    {userImage ? (
                      <img src={userImage} alt={session.user.name ?? "User"} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-semibold">{getInitials(session.user.name)}</span>
                    )}
                  </div>
                  <div className="min-w-0 max-w-[220px]">
                    <p className="break-words text-xl font-semibold leading-tight text-slate-800">{session.user.name ?? "User"}</p>
                    <p className="mt-1 break-all text-sm leading-tight text-slate-600">{session.user.email ?? ""}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </header>

          <main className="min-w-0 px-3 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
      {toastNotification ? (
        <div className="mac-notification-toast fixed right-5 top-5 z-50 w-[360px] p-3">
          <div className="flex items-start gap-3">
            <div className="mac-notification-icon mt-0.5">
              <IconBell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mac-notification-app">Strategic Projects Portal</p>
              <p className="mac-notification-title">{toastNotification.title}</p>
              <p className="mac-notification-body">{toastNotification.body}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="notification-action-pill" onClick={() => setToastNotification(null)}>
              Dismiss
            </button>
            <Link
              href={toastNotification.href as Route}
              className="notification-action-primary"
              onClick={() => {
                void markRead(toastNotification.id);
                setToastNotification(null);
              }}
            >
              Open
            </Link>
          </div>
        </div>
      ) : null}
      <FloatingCopilot />
    </div>
  );
}
