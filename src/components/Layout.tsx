import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  Home, 
  FileText, 
  Calculator, 
  BarChart3, 
  Download, 
  LogOut, 
  User,
  Users,
  BookOpen,
  FolderOpen,
  Menu,
  X,
  Settings
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/invoices', icon: FileText, label: 'Rechnungen' },
  { to: '/estimates', icon: Calculator, label: 'Kostenschätzung' },
  { to: '/comparison', icon: BarChart3, label: 'Soll/Ist' },
  { to: '/documents', icon: FolderOpen, label: 'Dokumente' },
  { to: '/contractors', icon: Users, label: 'Firmen' },
  { to: '/journal', icon: BookOpen, label: 'Bautagebuch' },
  { to: '/export', icon: Download, label: 'Export' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Link to="/" className="text-xl font-bold text-foreground">
              🏠 Hausbau-Tracker
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <User className="h-4 w-4" />
              <span>{profile?.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Abmelden</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden w-64 border-r bg-card lg:block">
          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-background lg:hidden">
            <nav className="flex flex-col gap-1 p-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
