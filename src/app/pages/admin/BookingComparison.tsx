import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { api } from "../../services/api";
import { supabase } from "../../services/supabase";

// Helper to normalize booking data, similar to other analytics pages
const asId = (v: any) => {
  if (!v) return "";
  if (typeof v === "object") {
    if (v.$oid) return v.$oid;
    return String(v._id ?? v.id ?? v.resource_id ?? v.resourceId ?? "");
  }
  return String(v);
};

const normalizeToISO = (s: string) => {
  if (!s) return "";
  return s.includes("T") ? s : s.replace(" ", "T");
};

interface NormalizedBooking {
  resource_id: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
}

export function BookingComparison() {
  const [dailyCounts, setDailyCounts] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [leadTimeComparison, setLeadTimeComparison] = useState<any[]>([]);
  const [hourlyDistribution, setHourlyDistribution] = useState<any[]>([]);
  const [waitTimeTrend, setWaitTimeTrend] = useState<any[]>([]);

  const splitDate = new Date("2026-02-20T00:00:00");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bookingsData, waitlistData] = await Promise.all([
          api.bookings.list().catch(() => []),
          supabase.from('waitlists').select('*').then(({ data }) => data || []).catch(() => [])
        ]);

        const validBookings: NormalizedBooking[] = (Array.isArray(bookingsData) ? bookingsData : []).map((b: any) => {
          const sTime = b.start_time || `${b.date}T${b.startTime}`;
          const eTime = b.end_time || `${b.date}T${b.endTime}`;
          return {
            resource_id: asId(b.resource_id || b.resourceId),
            start_time: normalizeToISO(sTime),
            end_time: normalizeToISO(eTime),
            status: b.status,
            created_at: normalizeToISO(b.created_at || b.createdAt || new Date().toISOString())
          };
        });

        const beforeBookings = validBookings.filter(b => new Date(b.start_time) < splitDate);
        const afterBookings = validBookings.filter(b => new Date(b.start_time) >= splitDate);

        // 1. Daily Booking Counts
        const counts: { [key: string]: number } = {};
        validBookings.forEach(b => {
          const day = b.start_time.split('T')[0];
          counts[day] = (counts[day] || 0) + 1;
        });
        const dailyData = Object.keys(counts).sort().map(day => ({
          date: day,
          bookings: counts[day]
        }));
        setDailyCounts(dailyData);

        // 2. Booking Status Distribution
        const countStatuses = (bookings: NormalizedBooking[]) => {
          const statusCounts = { completed: 0, cancelled: 0, upcoming: 0, other: 0 };
          bookings.forEach(b => {
            const status = (b.status || 'upcoming').toLowerCase();
            if (status.includes('complete')) statusCounts.completed++;
            else if (status.includes('cancel')) statusCounts.cancelled++;
            else if (status.includes('upcoming') || status.includes('confirmed') || status.includes('active')) statusCounts.upcoming++;
            else statusCounts.other++;
          });
          return statusCounts;
        };
        
        const beforeStatus = countStatuses(beforeBookings);
        const afterStatus = countStatuses(afterBookings);
        const totalBefore = beforeBookings.length || 1;
        const totalAfter = afterBookings.length || 1;

        setStatusDistribution([
          { 
            period: 'Before Feb 20', 
            completed: (beforeStatus.completed / totalBefore) * 100,
            cancelled: (beforeStatus.cancelled / totalBefore) * 100,
            upcoming: (beforeStatus.upcoming / totalBefore) * 100,
          },
          { 
            period: 'After Feb 20', 
            completed: (afterStatus.completed / totalAfter) * 100,
            cancelled: (afterStatus.cancelled / totalAfter) * 100,
            upcoming: (afterStatus.upcoming / totalAfter) * 100,
          }
        ]);

        // 3. Booking Lead Time Comparison
        const calculateAvgLeadTime = (bookings: NormalizedBooking[]) => {
          if (bookings.length === 0) return 0;
          const totalLeadTime = bookings.reduce((acc, b) => {
            const start = new Date(b.start_time).getTime();
            const created = new Date(b.created_at).getTime();
            const leadTime = (start - created) / (1000 * 60 * 60 * 24); // in days
            return acc + (leadTime > 0 ? leadTime : 0);
          }, 0);
          return totalLeadTime / bookings.length;
        };

        setLeadTimeComparison([
          { period: 'Before Feb 20', 'Average Lead Time (Days)': calculateAvgLeadTime(beforeBookings) },
          { period: 'After Feb 20', 'Average Lead Time (Days)': calculateAvgLeadTime(afterBookings) }
        ]);

        // 4. Booking Start Hour Distribution
        const getHourlyCounts = (bookings: NormalizedBooking[]) => {
          const hourly = Array(24).fill(0);
          bookings.forEach(b => {
            const hour = new Date(b.start_time).getHours();
            hourly[hour]++;
          });
          return hourly;
        };
        const beforeHourly = getHourlyCounts(beforeBookings);
        const afterHourly = getHourlyCounts(afterBookings);
        const combinedHourly = Array(24).fill(0).map((_, i) => ({
          hour: `${String(i).padStart(2, '0')}:00`,
          before: beforeHourly[i],
          after: afterHourly[i]
        }));
        setHourlyDistribution(combinedHourly);

        // 5. Daily Average Wait Time (from Overview)
        const allocatedWaitlistItems = (Array.isArray(waitlistData) ? waitlistData : []).filter((w: any) => {
          const s = String(w.status || '').toLowerCase();
          return s === 'allocated' && (w.allocated_at || w.allocatedAt);
        });

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

      } catch (error) {
        console.error("Failed to fetch booking comparison data", error);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Booking Behavior Comparison</h1>
        <p className="text-slate-600">Analysis of booking patterns before and after {splitDate.toLocaleDateString()}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. Daily Booking Counts */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Daily Booking Counts</h3>
          <p className="text-sm text-slate-600 mb-6">Volatility and volume trends over time.</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" style={{ fontSize: 12 }} tick={{ angle: -30, textAnchor: 'end' }} height={70} />
              <YAxis label={{ value: "Total Bookings", angle: -90, position: "insideLeft", style: { fill: "#64748b" } }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bookings" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <ReferenceLine x={splitDate.toISOString().split('T')[0]} stroke="red" strokeDasharray="3 3" label={{ value: "Split Date", position: "insideTopRight", fill: "red" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Booking Status Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Booking Status Distribution</h3>
          <p className="text-sm text-slate-600 mb-6">Shift in proportion of successful vs. cancelled bookings.</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" domain={[0, 100]} label={{ value: "Percentage (%)", position: "insideBottom", offset: -5, style: { fill: "#64748b" } }} />
              <YAxis type="category" dataKey="period" width={100} />
              <Tooltip formatter={(value) => `${(value as number).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" />
              <Bar dataKey="upcoming" stackId="a" fill="#3b82f6" name="Upcoming/Active" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" name="Cancelled" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Daily Average Wait Time */}
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
              <ReferenceLine x={splitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} stroke="red" strokeDasharray="3 3" label={{ value: "Split", position: "insideTopRight", fill: "red" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Booking Start Hour Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Booking Start Hour Distribution</h3>
          <p className="text-sm text-slate-600 mb-6">Shift in daily "rush hours" for resources.</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" style={{ fontSize: 11 }} />
              <YAxis label={{ value: "Bookings", angle: -90, position: "insideLeft", style: { fill: "#64748b" } }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="before" fill="#a855f7" name="Before Feb 20" radius={[4, 4, 0, 0]} />
              <Bar dataKey="after" fill="#f59e0b" name="After Feb 20" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}