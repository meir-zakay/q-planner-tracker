import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, UsersRound, ListChecks, CalendarRange, Settings, LogOut, Menu, X, Sun, Moon, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { path: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Users', label: 'Users', icon: Users, roles: ['admin'] },
  { path: '/Teams', label: 'Teams', icon: UsersRound, roles: ['admin'] },
  { path: '/Features', label: 'Features', icon: ListChecks, roles: ['admin', 'editor', 'viewer'] },
  { path: '/TeamPlan', label: 'Team Plan', icon: CalendarRange, roles: ['admin', 'editor', 'viewer'] },
  { path: '/Settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: quarters } = useQuery({
    queryKey: ['quarterConfigs'],
    queryFn: () => base44.entities.QuarterConfig.list(),
    initialData: [],
  });

  const userRole = user?.role || 'viewer';

  // Quarter/year state from localStorage
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold tracking-tight text-foreground">QPlan</h1>
          <p className="text-xs text-muted-foreground mt-1">Quarterly Planning</p>
        </div>

        {/* Quarter selector */}
        <div className="px-4 py-3 border-b border-border space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Quarter</label>
          <div className="flex gap-2">
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-8 text-xs w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNav.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </Button>
          <div className="flex items-center justify-between px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.full_name || 'User'}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{userRole}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 lg:hidden flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <h2 className="text-sm font-semibold text-foreground">QPlan</h2>
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet context={{ user, userRole, selectedYear, selectedQuarter }} />
        </div>
      </main>
    </div>
  );
}