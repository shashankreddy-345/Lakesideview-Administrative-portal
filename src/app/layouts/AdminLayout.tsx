import { Outlet, NavLink } from "react-router";
import { BarChart3, MessageSquare, LogOut, ShieldCheck, User, LineChart, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";

export function AdminLayout() {
  const [user, setUser] = useState<{ full_name?: string; email?: string; role?: string } | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-900">CampusFlow</h1>
              <p className="text-xs text-slate-500">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium">Overview</span>
          </NavLink>
          <NavLink
            to="/admin/analytics"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <LineChart className="w-5 h-5" />
            <span className="font-medium">Resource Analytics</span>
          </NavLink>
          <NavLink
            to="/admin/rooms"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Room Analytics</span>
          </NavLink>
          <NavLink
            to="/admin/feedback"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium">Feedback Monitor</span>
          </NavLink>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 text-sm truncate">{user?.full_name || user?.email || "Admin"}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{user?.role || "Administrator"}</p>
            </div>
          </div>
          <NavLink
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 mt-2 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}