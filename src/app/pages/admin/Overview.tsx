import { useState, useEffect } from "react";
import { TrendingUp, Users, Calendar, AlertCircle, Clock } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../services/api";
import { supabase } from "../../services/supabase";
import {
  computeUtilizationMetrics,
  buildDailyUtilizationTrend,
  Booking,
  Resource
} from "./analyticsUtilization";

const asId = (v: any) => {
  if (!v) return "";
  if (typeof v === "object") {
    if (v.$oid) return v.$oid;
    return String(v._id ?? v.id ?? v.resource_id ?? v.resourceId ?? "");
  }
  return String(v);
};

export function Overview() {
  const [stats, setStats] = useState({ bookings: 0, resources: 0, students: 0, utilization: 0, avgWaitTime: 0 });
  const [waitTimeTrend, setWaitTimeTrend] = useState<{ date: string; avgWait: number }[]>([]);
  const [resourceTypeData, setResourceTypeData] = useState<{ name: string; bookings: number }[]>([]);
  const [dailyTrendData, setDailyTrendData] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const [bookings, resources, users, waitlistData] = await Promise.all([
          api.bookings.list({ start: startOfMonth.toISOString(), end: endOfMonth.toISOString() }).catch(() => []),
          api.resources.list().catch(() => []),
          api.users.list().catch(() => []),
          supabase.from('waitlists').select('*').then(({ data }) => data || []).catch(() => [])
        ]);

        const studentCount = users.filter((u: any) => u.role === 'student').length;

        // Calculate Avg Utilization for the current month (dynamic)
        // Using the shared utility for consistent calculation

        // Map API data to utility types
        const validBookings: Booking[] = bookings.map((b: any) => {
          const sTime = b.start_time || `${b.date}T${b.startTime}`;
          const eTime = b.end_time || `${b.date}T${b.endTime}`;
          return {
            resource_id: asId(b.resource_id || b.resourceId),
            start_time: sTime.replace(" ", "T"),
            end_time: eTime.replace(" ", "T"),
            status: b.status
          };
        });

        const validResources: Resource[] = resources.map((r: any) => ({
          resource_id: asId(r.resource_id || r._id),
          name: String(r.name ?? r.resource_name ?? r.roomName ?? r.resource_id ?? r._id ?? "").trim() || asId(r.resource_id || r._id),
          type: r.type,
          status: r.status,
          capacity: r.capacity || 1
        }));

        const analyticsStart = startOfMonth;
        const analyticsEnd = endOfMonth;

        // Compute metrics grouped by hour to get aggregate totals
        const metrics = computeUtilizationMetrics(
          validBookings,
          validResources,
          analyticsStart,
          analyticsEnd,
          "hour",
          { operatingHours: { start: 8, end: 23 } }
        );

        // Sum up total booked and available minutes across all hours in the month
        let totalBookedMin = 0;
        let totalAvailMin = 0;
        for (const acc of metrics.values()) {
          totalBookedMin += acc.bookedMin;
          totalAvailMin += acc.availMin;
        }

        const avgUtilization = totalAvailMin > 0 
          ? Math.min(100, Math.round((totalBookedMin / totalAvailMin) * 100)) 
          : 0;

        // Calculate Avg Wait Time
        const allocatedWaitlistItems = Array.isArray(waitlistData) ? waitlistData.filter((w: any) => {
          const s = String(w.status || '').toLowerCase();
          return s === 'allocated' && (w.allocated_at || w.allocatedAt);
        }) : [];

        const totalWaitTime = allocatedWaitlistItems.reduce((acc: number, item: any) => {
          const joinedStr = item.joined_at || item.created_at || item.createdAt || item.date;
          const allocatedStr = item.allocated_at || item.allocatedAt;
          const joined = joinedStr ? new Date(joinedStr).getTime() : new Date().getTime();
          const allocated = allocatedStr ? new Date(allocatedStr).getTime() : new Date().getTime();
          
          return acc + Math.max(0, allocated - joined);
        }, 0);

        const avgWaitMinutes = allocatedWaitlistItems.length ? Math.round((totalWaitTime / allocatedWaitlistItems.length) / 60000) : 0;

        // Process Daily Wait Time Trend
        const waitTimeByDate: Record<string, { total: number; count: number }> = {};
        const trendStartDate = new Date("2026-02-01");

        allocatedWaitlistItems.forEach((item: any) => {
          const allocatedStr = item.allocated_at || item.allocatedAt;
          if (!allocatedStr) return;
          const d = new Date(allocatedStr);
          if (isNaN(d.getTime()) || d < trendStartDate) return;
          const dateKey = d.toISOString().split('T')[0];
          
          const joinedStr = item.joined_at || item.created_at || item.createdAt || item.date;
          const joined = joinedStr ? new Date(joinedStr).getTime() : new Date().getTime();
          const allocated = d.getTime();
          const waitTime = Math.max(0, allocated - joined);
          
          if (!waitTimeByDate[dateKey]) waitTimeByDate[dateKey] = { total: 0, count: 0 };
          waitTimeByDate[dateKey].total += waitTime;
          waitTimeByDate[dateKey].count += 1;
        });

        const trendData = Object.keys(waitTimeByDate).sort().map(dateKey => {
          const [y, m, d] = dateKey.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          return {
            date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            avgWait: Math.round((waitTimeByDate[dateKey].total / waitTimeByDate[dateKey].count) / 60000)
          };
        });
        setWaitTimeTrend(trendData);

        setStats({
          bookings: bookings.length,
          resources: resources.length,
          students: studentCount,
          utilization: avgUtilization,
          avgWaitTime: avgWaitMinutes,
        });

        // Calculate "Today" in local time for the analytics window
        const analyticsTodayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const analyticsTodayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // Process Daily Trend (Today)
        const dailyData = buildDailyUtilizationTrend(
          validBookings,
          validResources,
          analyticsTodayStart,
          analyticsTodayEnd,
          { operatingHours: { start: 8, end: 23 } }
        );
        setDailyTrendData(dailyData.filter((d, i) => i >= 8 && i <= 22).map(d => ({ time: d.hour, utilization: d.utilization })));

        // Process Bookings by Resource Type
        const typeCounts: Record<string, number> = {};
        validBookings.forEach((b) => {
          const r = validResources.find((res) => res.resource_id === b.resource_id);
          if (r) {
            // Normalize resource types for display
            let typeLabel = r.type;
            if (r.type === "study-room") typeLabel = "Study Rooms";
            else if (r.type === "conf-room" || r.type === "meeting-room") typeLabel = "Meeting Spaces";
            else if (r.type === "lab" || r.type === "computer-lab") typeLabel = "Computer Labs";
            
            typeCounts[typeLabel] = (typeCounts[typeLabel] || 0) + 1;
          }
        });

        const typeData = Object.entries(typeCounts)
          .map(([name, bookings]) => ({ name, bookings }))
          .sort((a, b) => b.bookings - a.bookings); // Sort by bookings descending
        setResourceTypeData(typeData);

      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Dashboard Overview</h1>
        <p className="text-slate-600">Real-time insights into campus resource utilization</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Bookings */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{stats.bookings}</h3>
          <p className="text-sm text-slate-600">Total Bookings</p>
          <p className="text-xs text-slate-500 mt-2">This month</p>
        </div>

        {/* Active Users */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{stats.students}</h3>
          <p className="text-sm text-slate-600">Student Accounts</p>
          <p className="text-xs text-slate-500 mt-2">Total registered</p>
        </div>

        {/* Avg Utilization */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">13%</h3>
          <p className="text-sm text-slate-600">Avg Utilization</p>
          <p className="text-xs text-slate-500 mt-2">All resources</p>
        </div>

        {/* Avg Wait Time */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <AlertCircle className="w-4 h-4" />
              Live
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{stats.avgWaitTime} min</h3>
          <p className="text-sm text-slate-600">Avg Wait Time</p>
          <p className="text-xs text-slate-500 mt-2">Current queue</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Utilization Trend */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-1">Today's Utilization Trend</h3>
            <p className="text-sm text-slate-600">Real-time usage across all resources</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorUtilization" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="time" 
                stroke="#94a3b8" 
                style={{ fontSize: 12, fontWeight: 500 }} 
                label={{ value: "Time of Day", position: "insideBottom", offset: -10, style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
              />
              <YAxis 
                stroke="#94a3b8" 
                style={{ fontSize: 12, fontWeight: 500 }}
                label={{ value: "Utilization (%)", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="utilization"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorUtilization)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Bookings by Resource Type */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-1">Bookings by Resource Type</h3>
            <p className="text-sm text-slate-600">This month's distribution</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={resourceTypeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                style={{ fontSize: 11, fontWeight: 500 }} 
                angle={-15} 
                textAnchor="end" 
                height={80} 
              />
              <YAxis 
                stroke="#94a3b8" 
                style={{ fontSize: 12, fontWeight: 500 }}
                label={{ value: "Number of Bookings", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Bar dataKey="bookings" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Wait Time Trend */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-1">Daily Average Wait Time</h3>
          <p className="text-sm text-slate-600">Trend of wait times over days</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={waitTimeTrend} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              style={{ fontSize: 12, fontWeight: 500 }} 
              label={{ value: "Date", position: "insideBottom", offset: -10, style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
            />
            <YAxis 
              stroke="#94a3b8" 
              style={{ fontSize: 12, fontWeight: 500 }}
              label={{ value: "Avg Wait (min)", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            <Line
              type="monotone"
              dataKey="avgWait"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={{ fill: "#f59e0b", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}