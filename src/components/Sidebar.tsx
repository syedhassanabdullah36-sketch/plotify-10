import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  PlusCircle,
  Settings as SettingsIcon,
  Compass,
  X,
  Menu,
  ShieldCheck,
  FileCode2,
  FileSpreadsheet,
  Mountain,
  Leaf,
  CloudRain,
  Thermometer,
  Truck,
  Camera,
  Glasses,
  Users,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'projects'
  | 'new-project'
  | 'settings'
  | 'overview'
  | 'edit-project'
  | 'floor-plan'
  | 'viewer-3d'
  | 'design-studio'
  | 'impact-simulator'
  | 'cost-planning'
  | 'evidence-traceability'
  | 'documentation'
  | 'site-context'
  | 'brief'
  | 'regulations'
  | 'structural'
  | 'mep-coordination'
  | 'openbim-ifc'
  | 'cad-exchange'
  | 'terrain-modeling'
  | 'whole-life-carbon'
  | 'climate-resilience'
  | 'envelope-performance'
  | 'site-logistics'
  | 'ar-site'
  | 'vr-review'
  | 'live-collaboration';

interface SidebarProps {
  currentTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  projectCount: number;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  projectCount,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'projects' as ActiveTab,
      label: 'Projects',
      icon: FolderKanban,
      badge: projectCount,
    },
    {
      id: 'openbim-ifc' as ActiveTab,
      label: 'OpenBIM & IFC',
      icon: FileCode2,
      badge: null,
    },
    {
      id: 'cad-exchange' as ActiveTab,
      label: 'CAD Exchange',
      icon: FileSpreadsheet,
      badge: null,
    },
    {
      id: 'terrain-modeling' as ActiveTab,
      label: 'Terrain & Site',
      icon: Mountain,
      badge: null,
    },
    {
      id: 'whole-life-carbon' as ActiveTab,
      label: 'Whole-Life Carbon',
      icon: Leaf,
      badge: null,
    },
    {
      id: 'climate-resilience' as ActiveTab,
      label: 'Climate & Resilience',
      icon: CloudRain,
      badge: null,
    },
    {
      id: 'envelope-performance' as ActiveTab,
      label: 'Envelope Analyzer',
      icon: Thermometer,
      badge: null,
    },
    {
      id: 'site-logistics' as ActiveTab,
      label: 'Site Logistics',
      icon: Truck,
      badge: null,
    },
    {
      id: 'ar-site' as ActiveTab,
      label: 'AR Site View',
      icon: Camera,
      badge: null,
    },
    {
      id: 'vr-review' as ActiveTab,
      label: 'VR Design Review',
      icon: Glasses,
      badge: null,
    },
    {
      id: 'live-collaboration' as ActiveTab,
      label: 'Live Collaboration',
      icon: Users,
      badge: null,
    },
    {
      id: 'new-project' as ActiveTab,
      label: 'New Project',
      icon: PlusCircle,
      badge: null,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Settings',
      icon: SettingsIcon,
      badge: null,
    },
  ];

  const handleNavClick = (tab: ActiveTab) => {
    onNavigate(tab);
    setIsMobileOpen(false);
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 flex items-center justify-between">
        <button
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-3 text-left group"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-xs group-hover:bg-slate-800 transition-colors">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
              Plotify
            </h1>
            <div className="text-[10px] font-semibold text-teal-700 tracking-wider">
              AI-Powered Architectural Intelligence
            </div>
          </div>
        </button>

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Workspace
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentTab === item.id ||
            (item.id === 'projects' &&
              (currentTab === 'overview' ||
                currentTab === 'edit-project' ||
                currentTab === 'floor-plan' ||
                currentTab === 'viewer-3d' ||
                currentTab === 'design-studio' ||
                currentTab === 'impact-simulator' ||
                currentTab === 'cost-planning' ||
                currentTab === 'evidence-traceability' ||
                currentTab === 'documentation' ||
                currentTab === 'site-context' ||
                currentTab === 'brief' ||
                currentTab === 'regulations' ||
                currentTab === 'structural' ||
                currentTab === 'mep-coordination')) ||
            (item.id === 'new-project' && currentTab === 'new-project');

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-teal-50 text-teal-900 font-semibold shadow-xs border border-teal-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-teal-700' : 'text-slate-400'
                  }`}
                />
                <span className="whitespace-nowrap">{item.label}</span>
              </div>

              {typeof item.badge === 'number' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-md tabular-nums font-medium ${
                    isActive
                      ? 'bg-teal-200/60 text-teal-900'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Notice */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-500 leading-tight">
            <span className="font-semibold text-slate-700 block mb-0.5">
              Milestone 1 Active
            </span>
            Spatial data & project foundation verified. Local storage enabled.
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 shrink-0 h-screen sticky top-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-900 text-teal-400 flex items-center justify-center font-bold">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 text-sm tracking-tight leading-tight">
              Plotify
            </span>
            <span className="text-[10px] text-teal-700 font-semibold tracking-tight">
              AI-Powered Architectural Intelligence
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Slide-over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
