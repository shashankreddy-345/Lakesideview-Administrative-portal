import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { api } from "../../services/api";

import {
  buildUtilizationByRoomName,
  buildRoomTimebandHeatmap,
  Booking,
  Resource,
  HeatBand,
} from "./roomAnalyticsUtils";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

const getHeatmapColor = (value: number) => {
  if (value > 80) return "bg-rose-500"; // Over
  if (value >= 50) return "bg-amber-400"; // Busy
  if (value >= 30) return "bg-emerald-400"; // Optimal
  return "bg-sky-300"; // Under
};
const getHeatmapTextColor = (value: number) => "text-white";

const normalizeToISO = (s: string) => {
  if (!s) return "";
  return s.includes("T") ? s : s.replace(" ", "T");
};

const asId = (v: any) => {
  if (!v) return "";
  if (typeof v === "object") {
    if (v.$oid) return v.$oid;
    return String(v._id ?? v.id ?? v.resource_id ?? v.resourceId ?? "").trim();
  }
  return String(v).trim();
};

const dateOnly = (dt: string) => normalizeToISO(dt).split("T")[0];

const getLatestBookingDate = (bookings: any[]) => {
  const dates = bookings
    .map((b) => dateOnly(String(b.start_time ?? b.startTime ?? "")))
    .filter(Boolean)
    .sort(); // ascending
  return dates.length ? dates[dates.length - 1] : null;
};

function getDayRangeExclusive(selectedDate: string) {
  // [start, end) where end = next day 00:00
  const start = new Date(`${selectedDate}T00:00:00`);
  const end = new Date(`${selectedDate}T00:00:00`);
  end.setTime(end.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours
  return { start, end };
}

export function RoomAnalytics() {
  // initial: today, but we will auto-correct to a booking date if today has no bookings
  const today = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // must be ONE type, not "all"
  const [selectedType, setSelectedType] = useState<string>("");

  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [utilizationByRoom, setUtilizationByRoom] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<{ bands: string[]; rows: any[] } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { start, end } = getDayRangeExclusive(selectedDate);

        const [resourcesData, bookingsData] = await Promise.all([
          api.resources.list().catch(() => []),
          api.bookings.list({ start: start.toISOString(), end: end.toISOString() }).catch(() => []),
        ]);

        // ✅ normalize resources
        const validResources: Resource[] = (Array.isArray(resourcesData) ? resourcesData : []).map((r: any) => {
          const rid = asId(r.resource_id ?? r.resourceId ?? r._id ?? r.id);
          return {
            resource_id: rid,
            type: String(r.type ?? r.resourceType ?? "").trim(),
            name: String(r.name ?? r.resource_name ?? r.roomName ?? rid).trim() || rid,
            status: r.status,
            capacity: r.capacity || 1
          };
        });

        const validBookings: Booking[] = (Array.isArray(bookingsData) ? bookingsData : []).map((b: any) => ({
          resource_id: asId(b.resource_id ?? b.resourceId ?? b.resource),
          start_time: normalizeToISO(String(b.start_time ?? b.startTime ?? "")),
          end_time: normalizeToISO(String(b.end_time ?? b.endTime ?? "")),
          status: String(b.status ?? "confirmed"),
        }));

        const types = Array.from(new Set(validResources.map((r) => r.type))).filter(Boolean);
        setResourceTypes(types);

        const effectiveType = selectedType || types[0] || "";
        if (effectiveType && effectiveType !== selectedType) {
          setSelectedType(effectiveType);
          return;
        }

        // ✅ auto-pick a date that actually exists in bookings (prevents empty charts)
        // only do this if user is still on the initial "today" default
        const latestBookingDate = getLatestBookingDate(bookingsData);
        if (latestBookingDate && selectedDate === today) {
          // if today has no bookings, use latest booking date
          const todayHasBookings = validBookings.some((b) => dateOnly(b.start_time) === today);
          if (!todayHasBookings) {
            setSelectedDate(latestBookingDate);
            return;
          }
        }

        // filter resources by selected type
        const filteredResources = effectiveType
          ? validResources.filter((r) => r.type === effectiveType)
          : validResources;
        
        // bands for heatmap
        const bands: HeatBand[] = [
          { label: "8-9", startHour: 8, endHour: 9 },
          { label: "9-10", startHour: 9, endHour: 10 },
          { label: "10-11", startHour: 10, endHour: 11 },
          { label: "11-12", startHour: 11, endHour: 12 },
          { label: "12-13", startHour: 12, endHour: 13 },
          { label: "13-14", startHour: 13, endHour: 14 },
          { label: "14-15", startHour: 14, endHour: 15 },
          { label: "15-16", startHour: 15, endHour: 16 },
          { label: "16-17", startHour: 16, endHour: 17 },
          { label: "17-18", startHour: 17, endHour: 18 },
          { label: "18-19", startHour: 18, endHour: 19 },
          { label: "19-20", startHour: 19, endHour: 20 },
          { label: "20-21", startHour: 20, endHour: 21 },
          { label: "21-22", startHour: 21, endHour: 22 },
          { label: "22-23", startHour: 22, endHour: 23 },
        ];

        const analyticsStart = start;
        const analyticsEnd = end;

        // 1) Utilization by Room Name
        const roomUtils = buildUtilizationByRoomName(validBookings, filteredResources, analyticsStart, analyticsEnd, {
          nameKey: "name",
          includeStatuses: ["completed", "confirmed", "active", "upcoming"],
          onlyAvailableResources: false,
          operatingHours: { start: 8, end: 23 }
        });

        setUtilizationByRoom(roomUtils.map((r) => ({ name: r.roomName, utilization: r.utilization })));

        // 2) Status Distribution from utilization results
        const statusCounts = { Under: 0, Optimal: 0, Busy: 0, Over: 0 };
        for (const r of roomUtils) {
          if (r.utilization > 80) statusCounts.Over++;
          else if (r.utilization >= 50) statusCounts.Busy++;
          else if (r.utilization >= 30) statusCounts.Optimal++;
          else statusCounts.Under++;
        }

        const totalRooms = roomUtils.length || 1;
        setStatusDistribution([
          { name: "Under (<30%)", value: Math.round((statusCounts.Under / totalRooms) * 100) },
          { name: "Optimal (30-50%)", value: Math.round((statusCounts.Optimal / totalRooms) * 100) },
          { name: "Busy (50-80%)", value: Math.round((statusCounts.Busy / totalRooms) * 100) },
          { name: "Over (>80%)", value: Math.round((statusCounts.Over / totalRooms) * 100) },
        ]);

        // 3) Heatmap
        const heatmap = buildRoomTimebandHeatmap(validBookings, filteredResources, analyticsStart, analyticsEnd, {
          bands,
          nameKey: "name",
          includeStatuses: ["completed", "confirmed", "active", "upcoming"],
          onlyAvailableResources: false,
        });

        setHeatmapData({
          bands: heatmap.bands,
          rows: heatmap.rooms.map((r) => ({ resource: r.roomName, cells: r.cells })),
        });
      } catch (e) {
        console.error("Failed to fetch room analytics", e);
      }
    };

    fetchData();
  }, [selectedDate, selectedType, today]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Room Analytics</h1>
        <p className="text-slate-600">Detailed utilization metrics per room</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex items-center gap-3 text-slate-700">
            <Filter className="w-5 h-5 text-slate-400" />
            <span className="font-medium">Filters:</span>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <Label htmlFor="date" className="text-xs text-slate-600 mb-1 block">
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-10 rounded-xl w-44"
              />
            </div>

            <div>
              <Label htmlFor="type" className="text-xs text-slate-600 mb-1 block">
                Resource Type
              </Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-10 w-52 rounded-xl">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {resourceTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Graphs 1 + 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Graph 1 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-1">Utilization by Room</h3>
            <p className="text-sm text-slate-600">Utilization percentage for each room on {selectedDate}</p>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={utilizationByRoom} layout="vertical" margin={{ top: 5, right: 30, left: 24, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number" 
                domain={[0, 100]} 
                stroke="#94a3b8" 
                style={{ fontSize: 12, fontWeight: 500 }} 
                label={{ value: "Utilization (%)", position: "insideBottom", offset: -5, style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }} />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" style={{ fontSize: 11, fontWeight: 500 }} width={140} />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Bar dataKey="utilization" fill="#3b82f6" radius={[0, 6, 6, 0]} name="Utilization %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Graph 2 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-1">Utilization Status Distribution</h3>
            <p className="text-sm text-slate-600">Percentage of rooms in each utilization category</p>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                outerRadius={110}
                dataKey="value"
              >
                {statusDistribution.map((_, idx) => (
                  <Cell key={`c-${idx}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Graph 3: Heatmap */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-1">Room Schedule Heatmap</h3>
          <p className="text-sm text-slate-600">Utilization by room and time slot</p>
        </div>

        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header */}
            <div className="flex mb-2">
              <div className="w-40" />
              {heatmapData?.bands.map((band) => (
                <div key={band} className="flex-1 min-w-[80px] text-center text-sm font-medium text-slate-600 px-2">
                  {band}
                </div>
              ))}
            </div>

            {/* Rows */}
            {heatmapData?.rows.map((row) => (
              <div key={row.resource} className="flex mb-2">
                <div className="w-40 flex items-center">
                  <span className="text-sm font-medium text-slate-700 truncate pr-2" title={row.resource}>
                    {row.resource}
                  </span>
                </div>

                {row.cells.map((cell: any) => (
                  <div key={cell.band} className="flex-1 min-w-[80px] px-2">
                    <div
                      className={`h-12 rounded-lg flex items-center justify-center text-sm font-semibold transition-all hover:scale-105 cursor-pointer ${getHeatmapColor(
                        cell.utilization
                      )} ${getHeatmapTextColor(cell.utilization)}`}
                      title={`${row.resource} @ ${cell.band}: ${cell.utilization}%`}
                    >
                      {cell.utilization}%
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mt-6 pt-6 border-t border-slate-100">
          <span className="text-sm font-medium text-slate-600">Utilization:</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-sky-300" />
            <span className="text-sm text-slate-600">Under (&lt;30%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-400" />
            <span className="text-sm text-slate-600">Optimal (30-50%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-400" />
            <span className="text-sm text-slate-600">Busy (50-80%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-rose-500" />
            <span className="text-sm text-slate-600">Over (&gt;80%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}