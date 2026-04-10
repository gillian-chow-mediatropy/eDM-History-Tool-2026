import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import {
    ArchiveIcon,
    BellIcon,
    ChartIcon,
    ChevronDownIconSmall,
    CloseIcon,
    FileTextIcon,
    GlobeIcon,
    GridIcon,
    LayersIcon,
    LogoutIcon,
    MailIcon,
    MediaIcon,
    MapPinIcon,
    MenuIcon,
    MoonIcon,
    SearchIcon,
    SettingsIcon,
    UserIcon,
    WorkflowIcon
} from "./icons";

function navClassName(isActive, compact) {
    return [
        "group relative flex items-center w-full gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
        compact ? "px-2 lg:justify-center" : "px-3",
        isActive
            ? "bg-brand-50 text-brand-500"
            : "text-gray-700 hover:bg-gray-100"
    ].join(" ");
}

export default function AppLayout({ children }) {
    const { user, permissions, logout } = useAuth();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
    const [isNotificationOpen, setNotificationOpen] = useState(false);
    const [isUserMenuOpen, setUserMenuOpen] = useState(false);
    const notificationRef = useRef(null);
    const userMenuRef = useRef(null);

    const canAccess = useMemo(
        () => (permission) => permissions.includes("*") || permissions.includes(permission),
        [permissions]
    );

    const mainNavItems = useMemo(() => ([
        { to: "/dashboard", label: "Dashboard", icon: <GridIcon /> },
        { to: "/archive", label: "Archive", icon: <ArchiveIcon /> },
        { to: "/campaigns", label: "Campaigns", icon: <WorkflowIcon />, permission: "builder:view" }
    ]), []);

    const adminNavItems = useMemo(() => ([
        { to: "/users", label: "Users", icon: <UserIcon />, permission: "settings:view" },
        { to: "/settings/markets", label: "Markets", icon: <GlobeIcon />, permission: "settings:view" },
        { to: "/settings/areas", label: "Areas", icon: <MapPinIcon />, permission: "settings:view" },
        { to: "/settings/templates", label: "Template", icon: <LayersIcon />, permission: "settings:view" },
        { to: "/settings/media", label: "Media", icon: <MediaIcon />, permission: "settings:view" },
        { to: "/settings/source-campaigns", label: "Source Campaigns", icon: <FileTextIcon />, permission: "settings:view" },
        { to: "/progress", label: "Progress", icon: <ChartIcon />, permission: "settings:view", temporary: true }
    ]), []);

    const fullName = String(user?.fullName || "User").trim();
    const initials = fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((token) => token[0])
        .join("") || "U";

    const showLabels = !isCompact || isMobileOpen;
    const notifications = [
        { id: 1, name: "Terry Franci", message: "requested proof access update", time: "5 min ago" },
        { id: 2, name: "Alena Franci", message: "commented on Marriott campaign", time: "8 min ago" },
        { id: 3, name: "Jocelyn Kenter", message: "requested revision approval", time: "15 min ago" },
        { id: 4, name: "Brandon Philips", message: "flagged archive preview issue", time: "1 hr ago" }
    ];

    useEffect(() => {
        function handleClickOutside(event) {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setNotificationOpen(false);
            }

            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setUserMenuOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                setNotificationOpen(false);
                setUserMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    function handleMenuToggle() {
        if (window.innerWidth >= 1024) {
            setIsCompact((value) => !value);
        } else {
            setIsMobileOpen((value) => !value);
        }
    }

    function handleApplicationMenuToggle() {
        setApplicationMenuOpen((value) => !value);
    }

    async function handleLogout() {
        await logout();
        setIsMobileOpen(false);
        setApplicationMenuOpen(false);
        setNotificationOpen(false);
        setUserMenuOpen(false);
    }

    return (
        <div className="min-h-screen xl:flex bg-gray-50">
            <div
                className={`fixed inset-0 z-40 bg-gray-900/45 transition lg:hidden ${isMobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={() => setIsMobileOpen(false)}
                aria-hidden="true"
            />

            <aside
                className={[
                    "fixed top-0 left-0 z-50 h-screen border-r border-gray-200 bg-white transition-all duration-300",
                    "-translate-x-full lg:translate-x-0",
                    isMobileOpen ? "translate-x-0 w-[290px]" : "w-[290px]",
                    isCompact ? "lg:w-[90px]" : "lg:w-[290px]"
                ].join(" ")}
            >
                <div className="flex h-full flex-col px-5">
                    <div className={`py-8 flex ${showLabels ? "justify-start" : "lg:justify-center"}`}>
                        <NavLink to="/dashboard" onClick={() => setIsMobileOpen(false)}>
                            {showLabels ? (
                                <img src="/images/logo/logo.svg" alt="Marriott" className="h-10 w-auto" />
                            ) : (
                                <img src="/images/logo/logo-icon.svg" alt="Marriott" className="h-8 w-8" />
                            )}
                        </NavLink>
                    </div>

                    <nav className="flex-1 overflow-y-auto no-scrollbar">
                        <div>
                            <h2 className={`mb-4 text-xs uppercase leading-[20px] text-gray-400 ${showLabels ? "" : "text-center"}`}>
                                {showLabels ? "Menu" : "..."}
                            </h2>
                            <ul className="flex flex-col gap-1.5">
                                {mainNavItems
                                    .filter((item) => !item.permission || canAccess(item.permission))
                                    .map((item) => (
                                        <li key={item.to}>
                                            <NavLink
                                                to={item.to}
                                                className={({ isActive }) => navClassName(isActive, !showLabels)}
                                                onClick={() => setIsMobileOpen(false)}
                                            >
                                                <span className="h-5 w-5 text-current">{item.icon}</span>
                                                {showLabels && <span>{item.label}</span>}
                                            </NavLink>
                                        </li>
                                    ))}
                            </ul>
                        </div>

                        {!!adminNavItems.filter((item) => !item.permission || canAccess(item.permission)).length && (
                            <div className="mt-8">
                                <h2 className={`mb-4 text-xs uppercase leading-[20px] text-gray-400 ${showLabels ? "" : "text-center"}`}>
                                    {showLabels ? "Settings" : "..."}
                                </h2>
                                <ul className="flex flex-col gap-1.5">
                                    {adminNavItems
                                        .filter((item) => !item.permission || canAccess(item.permission))
                                        .map((item) => (
                                            <li key={item.to}>
                                                <NavLink
                                                    to={item.to}
                                                    className={({ isActive }) => navClassName(isActive, !showLabels)}
                                                    onClick={() => setIsMobileOpen(false)}
                                                >
                                                    <span className="h-5 w-5 text-current">{item.icon}</span>
                                                    {showLabels && (
                                                        <span className="inline-flex items-center gap-2">
                                                            {item.label}
                                                            {item.temporary && (
                                                                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                                                                    Temp
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </NavLink>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )}
                    </nav>

                    {showLabels && (
                        <div className="mx-auto mb-6 w-full max-w-60 rounded-2xl bg-gray-50 px-4 py-5 text-center">
                            <h3 className="mb-2 font-semibold text-gray-900">Archive quick access</h3>
                            <p className="mb-4 text-sm text-gray-500">
                                Open the archive to browse campaigns, previews, and filters quickly.
                            </p>
                            <NavLink
                                to="/archive"
                                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
                                onClick={() => setIsMobileOpen(false)}
                            >
                                Open archive
                            </NavLink>
                        </div>
                    )}
                </div>
            </aside>

            <div className={`flex-1 transition-all duration-300 ${isCompact ? "lg:ml-[90px]" : "lg:ml-[290px]"}`}>
                <header className="sticky top-0 flex w-full bg-white border-gray-200 z-30 lg:border-b">
                    <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
                        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
                            <button
                                type="button"
                                className="items-center justify-center w-10 h-10 text-gray-500 border border-gray-200 rounded-lg lg:flex lg:h-11 lg:w-11"
                                onClick={handleMenuToggle}
                                aria-label="Toggle Sidebar"
                            >
                                <span className="h-5 w-5">{isMobileOpen ? <CloseIcon /> : <MenuIcon />}</span>
                            </button>

                            <div className="hidden lg:block">
                                <div className="relative">
                                    <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2 text-gray-400">
                                        <SearchIcon />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search or type command..."
                                        className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 xl:w-[430px]"
                                        readOnly
                                    />
                                    <span className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">
                                        Ctrl K
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"
                                onClick={handleApplicationMenuToggle}
                                aria-label="Toggle Header Menu"
                            >
                                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M6 10.5C6.83 10.5 7.5 11.17 7.5 12C7.5 12.83 6.83 13.5 6 13.5C5.17 13.5 4.5 12.83 4.5 12C4.5 11.17 5.17 10.5 6 10.5ZM18 10.5C18.83 10.5 19.5 11.17 19.5 12C19.5 12.83 18.83 13.5 18 13.5C17.17 13.5 16.5 12.83 16.5 12C16.5 11.17 17.17 10.5 18 10.5ZM13.5 12C13.5 11.17 12.83 10.5 12 10.5C11.17 10.5 10.5 11.17 10.5 12C10.5 12.83 11.17 13.5 12 13.5C12.83 13.5 13.5 12.83 13.5 12Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>

                        <div className={`${isApplicationMenuOpen ? "flex" : "hidden"} items-center justify-between w-full gap-4 px-5 py-4 shadow-theme-md lg:flex lg:w-auto lg:justify-end lg:px-0 lg:py-4 lg:shadow-none`}>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center w-10 h-10 text-gray-700 rounded-full border border-gray-200 hover:bg-gray-100"
                                aria-label="Theme"
                            >
                                <span className="h-5 w-5"><MoonIcon /></span>
                            </button>

                            <div className="relative" ref={notificationRef}>
                                <button
                                    type="button"
                                    className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                                    aria-label="Notifications"
                                    onClick={() => {
                                        setNotificationOpen((value) => !value);
                                        setUserMenuOpen(false);
                                    }}
                                >
                                    <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-brand-500">
                                        <span className="absolute h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                                    </span>
                                    <span className="h-5 w-5"><BellIcon /></span>
                                </button>

                                {isNotificationOpen && (
                                    <div className="absolute -right-24 mt-4 flex h-[420px] w-[320px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-md sm:right-0 sm:w-[360px]">
                                        <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
                                            <h5 className="text-lg font-semibold text-gray-900">Notification</h5>
                                            <button
                                                type="button"
                                                className="text-gray-500 hover:text-gray-700"
                                                onClick={() => setNotificationOpen(false)}
                                                aria-label="Close Notifications"
                                            >
                                                <span className="h-5 w-5"><CloseIcon /></span>
                                            </button>
                                        </div>

                                        <ul className="flex-1 space-y-1 overflow-y-auto">
                                            {notifications.map((item, index) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        className={`w-full rounded-lg px-3 py-3 text-left hover:bg-gray-50 ${index < notifications.length - 1 ? "border-b border-gray-100" : ""}`}
                                                    >
                                                        <p className="text-sm text-gray-600">
                                                            <span className="font-semibold text-gray-900">{item.name}</span>{" "}
                                                            {item.message}
                                                        </p>
                                                        <p className="mt-1 text-xs text-gray-500">{item.time}</p>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>

                                        <button
                                            type="button"
                                            className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                        >
                                            View All Notifications
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="relative" ref={userMenuRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 text-left"
                                    onClick={() => {
                                        setUserMenuOpen((value) => !value);
                                        setNotificationOpen(false);
                                    }}
                                    aria-label="User Menu"
                                >
                                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-xs font-semibold uppercase text-white">{initials}</span>
                                    <span className="hidden sm:block">
                                        <span className="block text-sm font-medium leading-tight text-gray-900">{user?.fullName || "User"}</span>
                                        <span className="block text-xs leading-tight text-gray-500">{user?.role || "User"}</span>
                                    </span>
                                    <span className={`h-4 w-4 text-gray-500 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}>
                                        <ChevronDownIconSmall />
                                    </span>
                                </button>

                                {isUserMenuOpen && (
                                    <div className="absolute right-0 mt-4 w-[260px] rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-md">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{user?.fullName || "User"}</p>
                                            <p className="mt-0.5 text-xs text-gray-500 break-all">{user?.email || "-"}</p>
                                        </div>

                                        <div className="my-3 h-px bg-gray-200" />

                                        <ul className="space-y-1">
                                            <li>
                                                <NavLink
                                                    to="/profile"
                                                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                                    onClick={() => setUserMenuOpen(false)}
                                                >
                                                    <span className="h-5 w-5"><UserIcon /></span>
                                                    Edit profile
                                                </NavLink>
                                            </li>
                                            <li>
                                                <NavLink
                                                    to={canAccess("settings:view") ? "/users" : "/profile"}
                                                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                                    onClick={() => setUserMenuOpen(false)}
                                                >
                                                    <span className="h-5 w-5"><SettingsIcon /></span>
                                                    Account settings
                                                </NavLink>
                                            </li>
                                            <li>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
                                                >
                                                    <span className="h-5 w-5"><MailIcon /></span>
                                                    Support
                                                </button>
                                            </li>
                                        </ul>

                                        <div className="my-3 h-px bg-gray-200" />

                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
                                        >
                                            <span className="h-5 w-5"><LogoutIcon /></span>
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
            </div>
        </div>
    );
}
