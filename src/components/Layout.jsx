import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, UsersRound, ListChecks, CalendarRange, Settings, LogOut, Moon, Sun, ChevronLeft, ChevronRight, ChevronDown, Eye } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PAGE_TITLES = {
  '/Dashboard': 'Dashboard',
  '/Features': 'Feature Backlog',
  '/TeamPlan': 'Team Plan',
  '/Tracking': 'Planned vs Actual',
  '/Teams': 'Teams',
  '/Users': 'User Management',
  '/Settings': 'Settings',

};

const navItems = [
  { path: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Features', label: 'Features', icon: ListChecks, roles: ['admin', 'editor', 'viewer'] },
  { path: '/TeamPlan', label: 'Team Plan', icon: CalendarRange, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Tracking', label: 'Tracking', icon: Eye, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Teams', label: 'Teams', icon: UsersRound, roles: ['admin'] },
  { path: '/Users', label: 'Users', icon: Users, roles: ['admin'] },
  { path: '/Settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export default function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

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



  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  const pageTitle = PAGE_TITLES[location.pathname] || 'Cards Planner';

  const sidebarWidth = collapsed ? 'w-14' : 'w-52';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex overflow-hidden">
        {/* Sidebar */}
         <aside
           className={`relative shrink-0 h-full flex flex-col transition-all duration-200 bg-[#1a1530] dark:bg-[#1a1530] ${sidebarWidth}`}
         >
          {/* Logo */}
          <div className="h-16 flex items-center gap-2 px-3 shrink-0 border-b border-indigo-900 bg-[#1a1530] dark:bg-[#1a1530]">
            <Link to="/Dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-900 flex items-center justify-center shrink-0">
                <CalendarRange className="w-4 h-4 text-indigo-400" />
              </div>
               {!collapsed && <span className="font-bold text-white dark:text-white text-lg tracking-tight whitespace-nowrap">Quarter Planner</span>}
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto text-slate-200">
            {filteredNav.map(item => {
              const isActive = location.pathname === item.path;
              const NavLink = (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-100 hover:text-white hover:bg-indigo-700'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
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
             className="absolute -right-3 top-4 w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-colors z-10 bg-[#2a2040] border border-indigo-700 hover:bg-[#3a3050]"
            >
             {collapsed ? <ChevronRight className="w-3 h-3 text-slate-300" /> : <ChevronLeft className="w-3 h-3 text-slate-300" />}
          </button>
        </aside>

        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          {/* Top Header Bar */}
          <header className="h-16 flex items-center px-6 gap-4 shrink-0 z-20 border-b border-border">
            <h1 className="text-xl font-bold text-foreground">{pageTitle}</h1>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">Period:</span>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="h-9 text-sm w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="h-9 text-sm w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-150 hover:bg-slate-100 dark:hover:bg-slate-800 ml-1">
                      <div className="w-7 h-7 rounded-full bg-indigo-900 shadow-md flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-indigo-400">{(user.full_name || user.email || '?')[0].toUpperCase()}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground hidden sm:inline">{user.full_name || user.email}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:inline" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDarkMode(!darkMode)} className="gap-2">
                      {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      {darkMode ? 'Light Mode' : 'Dark Mode'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => base44.auth.logout()} className="text-destructive focus:text-destructive gap-2">
                      <LogOut className="w-4 h-4" /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          {/* Main content — scrollable */}
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="p-6 md:p-8 max-w-[1400px]">
              <Outlet context={{ user, userRole, selectedYear, selectedQuarter, darkMode }} />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}