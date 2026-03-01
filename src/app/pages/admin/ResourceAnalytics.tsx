import { useState, useEffect } from "react";
import { Calendar, TrendingUp, Layers, Activity, AlertTriangle, CheckCircle, ArrowDown } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../services/api";
import {
  buildDailyUtilizationTrend,
  buildWeeklyUtilizationAndBookings,
  computeUtilizationMetrics,
  Booking,
  Resource
} from "./analyticsUtilization";
import { buildUtilizationByRoomName } from "./roomAnalyticsUtils";

const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c026d3"];

const asId = (v: any) => {
  if (!v) return "";
  if (typeof v === "object") {
    if (v.$oid) return v.$oid;
    return String(v._id ?? v.id ?? v.resource_id ?? v.resourceId ?? "");
  }
  return String(v);
};

export function ResourceAnalytics() {
  const [resources, setResources] = useState<any[]>([]);
  const [startDate, setStartDate] = useState("2026-02-01");
  const [endDate, setEndDate] = useState("2026-03-10");
  
  const [dailyTrendData, setDailyTrendData] = useState<any[]>([
    { hour: "8 AM", utilization: 0 }, { hour: "10 AM", utilization: 0 },
    { hour: "12 PM", utilization: 0 }, { hour: "2 PM", utilization: 0 },
    { hour: "4 PM", utilization: 0 }, { hour: "6 PM", utilization: 0 },
    { hour: "8 PM", utilization: 0 }
  ]);
  const [weeklyTrendData, setWeeklyTrendData] = useState<any[]>([
    { day: "Mon", bookings: 0, utilization: 0 }, { day: "Tue", bookings: 0, utilization: 0 },
    { day: "Wed", bookings: 0, utilization: 0 }, { day: "Thu", bookings: 0, utilization: 0 },
    { day: "Fri", bookings: 0, utilization: 0 }, { day: "Sat", bookings: 0, utilization: 0 },
    { day: "Sun", bookings: 0, utilization: 0 }
  ]);
  const [resourceTypeDistribution, setResourceTypeDistribution] = useState<any[]>([]);
  const [totalBookings, setTotalBookings] = useState(0);
  const [avgUtilization, setAvgUtilization] = useState(0);
  const [resourcePerformance, setResourcePerformance] = useState<{ over: any[], busy: any[], optimal: any[], under: any[] }>({ over: [], busy: [], optimal: [], under: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Prepare date range for API
        const startFilter = new Date(`${startDate}T00:00:00`);
        const endFilter = new Date(`${endDate}T23:59:59.999`);

        const [resourcesData, bookingsData] = await Promise.all([
          api.resources.list().catch(() => []),
          api.bookings.list({ start: startFilter.toISOString(), end: endFilter.toISOString() }).catch(() => [])
        ]);

        const validBookings: Booking[] = (Array.isArray(bookingsData) ? bookingsData : []).map((b: any) => {
          const sTime = b.start_time || `${b.date}T${b.startTime}`;
          const eTime = b.end_time || `${b.date}T${b.endTime}`;
          return {
            resource_id: asId(b.resource_id || b.resourceId),
            start_time: sTime.replace(" ", "T"),
            end_time: eTime.replace(" ", "T"),
            status: b.status
          };
        });

        const validResources: Resource[] = (Array.isArray(resourcesData) ? resourcesData : []).map((r: any) => ({
          resource_id: asId(r.resource_id || r._id),
          name: String(r.name ?? r.resource_name ?? r.roomName ?? r.resource_id ?? r._id ?? "").trim() || asId(r.resource_id || r._id),
          type: r.type,
          status: r.status,
          capacity: r.capacity || 1
        }));

        const analyticsStart = startFilter;
        const analyticsEnd = endFilter;

        // Filter bookings by date range for the "Total Bookings" count
        const filteredBookingsCount = validBookings.filter((b) => {
          const start = new Date(b.start_time.includes("T") ? b.start_time : b.start_time.replace(" ", "T"));
          return start >= analyticsStart && start <= analyticsEnd;
        });
        setTotalBookings(filteredBookingsCount.length);
        
        setResources(validResources);

        // Calculate Overall Avg Utilization
        const overallMetrics = computeUtilizationMetrics(
          validBookings,
          validResources,
          analyticsStart,
          analyticsEnd,
          "type", // Grouping doesn't matter for total sum
          { operatingHours: { start: 8, end: 23 } }
        );
        let totalB = 0;
        let totalA = 0;
        for (const m of overallMetrics.values()) {
          totalB += m.bookedMin;
          totalA += m.availMin;
        }
        setAvgUtilization(totalA > 0 ? Math.round((totalB / totalA) * 100) : 0);

        // 2. Process Daily Trend
        const dailyData = buildDailyUtilizationTrend(
          validBookings,
          validResources,
          analyticsStart,
          analyticsEnd,
          { operatingHours: { start: 8, end: 23 } }
        );
        setDailyTrendData(dailyData.filter((d, i) => i >= 8 && i <= 22)); // 08:00 to 23:00 (exclusive of 23:00 start)

        // 3. Process Weekly Trend
        const weeklyData = buildWeeklyUtilizationAndBookings(
          validBookings,
          validResources,
          analyticsStart,
          analyticsEnd,
          { operatingHours: { start: 8, end: 23 } }
        );
        setWeeklyTrendData(weeklyData);

        // 5. Process Resource Type Distribution (Pie Chart)
        const typeCounts: Record<string, number> = {};
        filteredBookingsCount.forEach((b) => {
          const r = validResources.find((res) => res.resource_id === b.resource_id);
          if (r) {
            typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
          }
        });
        const typeDist = Object.keys(typeCounts).map(name => ({
          name,
          value: typeCounts[name]
        }));
        setResourceTypeDistribution(typeDist.length ? typeDist : [{ name: "No Data", value: 1 }]);

        // 6. Calculate Per-Resource Performance
        const roomUtils = buildUtilizationByRoomName(
          validBookings,
          validResources,
          analyticsStart,
          analyticsEnd,
          { nameKey: "name", operatingHours: { start: 8, end: 23 } }
        );

        const performance = { over: [] as any[], busy: [] as any[], optimal: [] as any[], under: [] as any[] };
        roomUtils.forEach(r => {
          if (r.utilization > 80) performance.over.push({ name: r.roomName, utilization: r.utilization });
          else if (r.utilization >= 50) performance.busy.push({ name: r.roomName, utilization: r.utilization });
          else if (r.utilization >= 30) performance.optimal.push({ name: r.roomName, utilization: r.utilization });
          else performance.under.push({ name: r.roomName, utilization: r.utilization });
        });
        setResourcePerformance(performance);

      } catch (e) {
        console.error("Failed to fetch analytics data", e);
      }
    };
    fetchData();
  }, [startDate, endDate]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Resource Analytics</h1>
        <p className="text-slate-600">Detailed insights into resource utilization and trends</p>
      </div>

      {/* Date Filters */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="w-5 h-5 text-slate-400" />
            <span className="font-medium">Date Range:</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <Label htmlFor="startDate" className="text-xs text-slate-600 mb-1 block">
                From
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-xl w-40"
                min="2026-02-01"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-xs text-slate-600 mb-1 block">
                To
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-xl w-40"
                max="2026-03-10"
              />
            </div>
            <button className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium mt-5 transition-colors">
              Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Layers className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{resources.length}</h3>
          <p className="text-sm text-slate-600">Total Resources</p>
          <p className="text-xs text-slate-500 mt-2">Across all types</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{avgUtilization}%</h3>
          <p className="text-sm text-slate-600">Avg Utilization</p>
          <p className="text-xs text-emerald-600 mt-2">During operating hours</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{totalBookings}</h3>
          <p className="text-sm text-slate-600">Total Bookings</p>
          <p className="text-xs text-slate-500 mt-2">Selected period</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">2-4 PM</h3>
          <p className="text-sm text-slate-600">Peak Hours</p>
          <p className="text-xs text-slate-500 mt-2">Wed-Thu busiest</p>
        </div>
      </div>

      {/* Daily Trends */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-1">Daily Utilization Trend</h3>
          <p className="text-sm text-slate-600">24-hour utilization pattern</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={dailyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="hour" 
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
            <Line
              type="monotone"
              dataKey="utilization"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: "#3b82f6", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly Trends */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-1">Weekly Utilization & Booking Trends</h3>
          <p className="text-sm text-slate-600">Comparison of utilization and booking volume</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={weeklyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="day" 
              stroke="#94a3b8" 
              style={{ fontSize: 12, fontWeight: 500 }}
              label={{ value: "Day of Week", position: "insideBottom", offset: -10, style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#94a3b8" 
              style={{ fontSize: 12, fontWeight: 500 }}
              label={{ value: "Utilization (%)", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#94a3b8" 
              style={{ fontSize: 12, fontWeight: 500 }}
              label={{ value: "Number of Bookings", angle: 90, position: "insideRight", style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="utilization" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Utilization %" />
            <Bar yAxisId="right" dataKey="bookings" fill="#6366f1" radius={[8, 8, 0, 0]} name="Bookings" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resource Performance Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Over-utilized */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="font-semibold text-slate-900">Over-utilized (&gt;80%)</h3>
          </div>
          <div className="space-y-3">
            {resourcePerformance.over.length === 0 ? <p className="text-sm text-slate-500">No resources in this category.</p> : resourcePerformance.over.slice(0, 5).map((r: any) => (
              <div key={r.name} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</span>
                <span className="font-semibold text-rose-600">{r.utilization}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Busy */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-slate-900">Busy (50-80%)</h3>
          </div>
          <div className="space-y-3">
            {resourcePerformance.busy.length === 0 ? <p className="text-sm text-slate-500">No resources in this category.</p> : resourcePerformance.busy.slice(0, 5).map((r: any) => (
              <div key={r.name} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</span>
                <span className="font-semibold text-amber-600">{r.utilization}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Optimal */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-slate-900">Optimal (30-50%)</h3>
          </div>
          <div className="space-y-3">
            {resourcePerformance.optimal.length === 0 ? <p className="text-sm text-slate-500">No resources in this category.</p> : resourcePerformance.optimal.slice(0, 5).map((r: any) => (
              <div key={r.name} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</span>
                <span className="font-semibold text-emerald-600">{r.utilization}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Under-utilized */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDown className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Under-utilized (&lt;30%)</h3>
          </div>
          <div className="space-y-3">
            {resourcePerformance.under.length === 0 ? <p className="text-sm text-slate-500">No resources in this category.</p> : resourcePerformance.under.slice(0, 5).map((r: any) => (
              <div key={r.name} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</span>
                <span className="font-semibold text-slate-500">{r.utilization}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resource Distribution */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        {/* Resource Type Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-1">Resource Type Distribution</h3>
            <p className="text-sm text-slate-600">Breakdown by resource category</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={resourceTypeDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {resourceTypeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {resourceTypeDistribution.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm text-slate-700">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{item.value} bookings</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
