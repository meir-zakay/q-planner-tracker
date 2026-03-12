import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, UsersRound, ListChecks, CalendarRange, Settings, LogOut, Sun, Moon, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PAGE_TITLES = {
  '/Dashboard': 'Dashboard',
  '/Features': 'Feature Backlog',
  '/TeamPlan': 'Team Plan',
  '/Teams': 'Teams',
  '/Users': 'User Management',
  '/Settings': 'Settings',
  '/Capacity': 'Capacity',
};

const navItems = [
  { path: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Features', label: 'Features', icon: ListChecks, roles: ['admin', 'editor', 'viewer'] },
  { path: '/TeamPlan', label: 'Team Plan', icon: CalendarRange, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Teams', label: 'Teams', icon: UsersRound, roles: ['admin'] },
  { path: '/Capacity', label: 'Capacity', icon: BarChart3, roles: ['admin'] },
  { path: '/Users', label: 'Users', icon: Users, roles: ['admin'] },
  { path: '/Settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export default function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const userRole = user?.role || 'viewer';

  const currentYear = new Date().getFullYear();
  const currentQ = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('selectedYear');
    return saved ? parseInt(saved) : currentYear;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => localStorage.getItem('selectedQuarter') || currentQ);

  useEffect(() => {
    localStorage.setItem('selectedYear', selectedYear);
    localStorage.setItem('selectedQuarter', selectedQuarter);
    window.dispatchEvent(new Event('quarterChanged'));
  }, [selectedYear, selectedQuarter]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  const pageTitle = PAGE_TITLES[location.pathname] || 'Cards Planner';

  const sidebarWidth = collapsed ? 'w-14' : 'w-52';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <aside className={`relative shrink-0 h-screen sticky top-0 bg-card border-r border-border flex flex-col transition-all duration-200 ${sidebarWidth}`}>
          {/* Logo */}
          <div className="h-14 flex items-center gap-2 px-3 border-b border-border shrink-0">
            <Link to="/Dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-bold text-xs">C</span>
              </div>
              {!collapsed && <span className="font-bold text-foreground text-sm tracking-tight whitespace-nowrap">Cards Planner</span>}
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {filteredNav.map(item => {
              const isActive = location.pathname === item.path;
              const NavLink = (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return NavLink;
            })}
          </nav>

          {/* Bottom section: divider + theme + logout */}
          <div className="border-t border-border p-2 space-y-0.5">
            {/* Theme toggle */}
            {(() => {
              const themeBtn = (
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-accent w-full ${collapsed ? 'justify-center' : ''}`}
                >
                  {darkMode ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                  {!collapsed && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
                </button>
              );
              if (collapsed) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>{themeBtn}</TooltipTrigger>
                    <TooltipContent side="right">{darkMode ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
                  </Tooltip>
                );
              }
              return themeBtn;
            })()}

            {/* User info + Logout */}
            {(() => {
              const logoutBtn = (
                <button
                  onClick={() => base44.auth.logout()}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-accent w-full ${collapsed ? 'justify-center' : ''}`}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>Logout</span>}
                </button>
              );
              if (collapsed) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>{logoutBtn}</TooltipTrigger>
                    <TooltipContent side="right">Logout</TooltipContent>
                  </Tooltip>
                );
              }
              return logoutBtn;
            })()}

            {/* User badge */}
            {!collapsed && user && (
              <div className="px-2.5 pt-2">
                <p className="text-xs font-medium text-foreground leading-none truncate">{user.full_name || user.email}</p>
                <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{userRole}</p>
              </div>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-4 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-accent transition-colors z-10"
          >
            {collapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
          </button>
        </aside>

        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Header Bar */}
          <header className="h-14 bg-card border-b border-border flex items-center px-6 gap-4 shrink-0 z-20 sticky top-0">
            {/* Page Title — left aligned at sidebar end */}
            <h1 className="text-sm font-semibold text-foreground">{pageTitle}</h1>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Quarter selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Period:</span>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="h-8 text-xs w-[64px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-[72px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 min-w-0 overflow-auto">
            <div className="p-6 md:p-8 max-w-[1400px]">
              <Outlet context={{ user, userRole, selectedYear, selectedQuarter }} />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}