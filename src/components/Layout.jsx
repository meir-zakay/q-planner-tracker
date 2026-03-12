import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, UsersRound, ListChecks, CalendarRange, Settings, LogOut, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
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
};

const navItems = [
  { path: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Features', label: 'Features', icon: ListChecks, roles: ['admin', 'editor', 'viewer'] },
  { path: '/TeamPlan', label: 'Team Plan', icon: CalendarRange, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Teams', label: 'Teams', icon: UsersRound, roles: ['admin'] },
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

  const pageTitle = PAGE_TITLES[location.pathname] || 'QPlan';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top Header Bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-4 shrink-0 z-20 sticky top-0">
          {/* Logo */}
          <Link to="/Dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">Q</span>
            </div>
            <span className="font-bold text-foreground text-sm tracking-tight">QPlan</span>
          </Link>

          {/* Divider */}
          <div className="w-px h-5 bg-border shrink-0" />

          {/* Page Title */}
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

          {/* Dark mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDarkMode(!darkMode)}>
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{darkMode ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
          </Tooltip>

          {/* User + Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-foreground leading-none">{user?.full_name || user?.email || 'User'}</p>
              <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{userRole}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => base44.auth.logout()}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Logout</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside className={`relative shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 bg-card border-r border-border flex flex-col transition-all duration-200 ${collapsed ? 'w-14' : 'w-52'}`}>
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

            {/* Collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="absolute -right-3 top-4 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-accent transition-colors z-10"
            >
              {collapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
            </button>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 overflow-auto">
            <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
              <Outlet context={{ user, userRole, selectedYear, selectedQuarter }} />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}