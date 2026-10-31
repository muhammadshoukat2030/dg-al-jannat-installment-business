import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Wallet,
  FileBarChart,
  Settings,
  Banknote,
  Wallet2,
  ArrowLeftRight,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SyncStatusIndicator from '../components/common/SyncStatusIndicator';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/investors', label: 'Investors', icon: Banknote },
  { to: '/owner', label: 'Owner', icon: Wallet2 },
  { to: '/withdrawals', label: 'Withdrawals', icon: ArrowLeftRight },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('ims_sidebar_collapsed') === 'true';
  });
  const { admin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  function isItemActive(to, end) {
    if (to === '/') {
      return currentPath === '/';
    }
    if (end) {
      return currentPath === to;
    }
    return currentPath === to || currentPath.startsWith(`${to}/`);
  }

  useEffect(() => {
    localStorage.setItem('ims_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }, [isCollapsed]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function toggleCollapse() {
    setIsCollapsed((prev) => !prev);
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-theme-main text-theme-text transition-colors">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* FIXED SIDEBAR FOR DESKTOP & MOBILE DRAWER */}
      <aside
        className={`fixed md:sticky top-0 inset-y-0 left-0 z-50 h-screen flex flex-col shrink-0 border-r border-theme-border bg-theme-sidebar transition-all duration-300 ease-in-out shadow-sm ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'w-20 md:w-20' : 'w-64 md:w-64'}`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-theme-border shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-theme-primary text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                IM
              </div>
              <span className="font-bold text-theme-primary text-sm leading-tight truncate">
                Installment
                <br />
                System
              </span>
            </div>
          ) : (
            <div className="mx-auto w-8 h-8 rounded-lg bg-theme-primary text-white flex items-center justify-center font-bold text-sm shadow-sm">
              IM
            </div>
          )}

          {/* Mobile close button */}
          <button
            className="md:hidden p-1.5 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-card-hover"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop collapse / expand toggle */}
          <button
            type="button"
            onClick={toggleCollapse}
            className={`hidden md:flex p-1.5 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-card-hover transition-colors ${
              isCollapsed ? 'mx-auto mt-2' : ''
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {navItems.map(({ to, label, icon: Icon, end }) => {
            const active = isItemActive(to, end);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? label : undefined}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isCollapsed ? 'justify-center px-2' : ''
                } ${
                  active
                    ? 'sidebar-nav-item-active bg-[#6C4CF1] text-white shadow-sm font-semibold'
                    : 'text-theme-muted hover:text-theme-text hover:bg-theme-card-hover'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" />
                {!isCollapsed && <span className="truncate">{label}</span>}

                {/* Tooltip on hover when collapsed */}
                {isCollapsed && (
                  <div className="hidden md:group-hover:block absolute left-full ml-3 px-2.5 py-1 bg-theme-card text-theme-text text-xs rounded-md shadow-md border border-theme-border whitespace-nowrap z-50 pointer-events-none">
                    {label}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer Toggle on Desktop if Collapsed */}
        {isCollapsed && (
          <div className="hidden md:flex p-3 border-t border-theme-border justify-center shrink-0">
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-card-hover"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT WRAPPER: ONLY THIS SCROLLS */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-theme-card border-b border-theme-border flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 no-print transition-colors">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-2 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-card-hover"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="md:hidden font-bold text-sm text-theme-primary">Installment System</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Offline-First Sync Status Indicator */}
            <SyncStatusIndicator />

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-card-hover transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-emerald-400" /> : <Moon className="w-4 h-4 text-theme-primary" />}
            </button>

            {/* Admin Info */}
            <span className="text-sm font-medium text-theme-text hidden sm:inline-block">
              {admin?.name || 'Administrator'}
            </span>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="btn-secondary !px-3 !py-1.5 !text-xs flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 w-full flex flex-col transition-colors">
          <div className="max-w-7xl w-full mx-auto flex-1">
            <Outlet />
          </div>

          {/* Footer - Always at bottom of content */}
          <footer className="py-4 text-center text-xs text-theme-muted border-t border-theme-border mt-8 no-print">
            Software Development by SHOUKAT | 03348004300
          </footer>
        </main>
      </div>
    </div>
  );
}
