import { useState, useEffect } from "react";
import { Search, MapPin, Users, Clock, Calendar } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { api, Resource as ApiResource, Booking as ApiBooking } from "../../services/api";

interface Resource {
  id: string;
  name: string;
  type: string;
  location: string;
  capacity: number;
  utilization: number;
  status: "optimal" | "busy" | "over-utilized";
  nextAvailable: string;
}

const statusConfig = {
  optimal: {
    color: "bg-emerald-500",
    barColor: "bg-emerald-400",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    label: "Optimal",
  },
  busy: {
    color: "bg-amber-500",
    barColor: "bg-amber-400",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    label: "Busy",
  },
  "over-utilized": {
    color: "bg-rose-500",
    barColor: "bg-rose-400",
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    label: "High",
  },
  maintenance: {
    color: "bg-slate-500",
    barColor: "bg-slate-400",
    bgColor: "bg-slate-100",
    textColor: "text-slate-700",
    label: "Maintenance",
  },
};

const asId = (v: any) => {
  if (!v) return "";
  if (typeof v === "object") {
    if (v.$oid) return v.$oid;
    return String(v._id ?? v.id ?? v.resource_id ?? v.resourceId ?? "");
  }
  return String(v);
};

const typeFilters = [
  { value: "all", label: "All Resources" },
  { value: "study-room", label: "Study Room" },
  { value: "c-lab", label: "Computer Lab" },
  { value: "conf-room", label: "Meeting Space" }
];

const UTILIZATION_THRESHOLDS = {
  BUSY: 40,
  HIGH: 80,
};

export function ResourceDiscovery() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookingDialog, setBookingDialog] = useState<{ open: boolean; resource: Resource | null }>({
    open: false,
    resource: null,
  });
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingDuration, setBookingDuration] = useState("1");

  const fetchResources = async () => {
    try {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const [resourcesData, bookingsData] = await Promise.all([
        api.resources.list().catch(() => []),
        api.bookings.list({ start: startOfDay.toISOString(), end: endOfDay.toISOString() }).catch(() => [])
      ]);

      const currentTimestamp = now.getTime();

      const mappedResources: Resource[] = resourcesData.map((r: any) => {
        const resourceId = asId(r.resource_id || r._id);
        
        const activeBookings = bookingsData.filter((b: any) => {
          const bookingResourceId = asId(b.resource_id || b.resourceId);
          if (bookingResourceId !== resourceId) return false;
          if (b.status === 'cancelled') return false;

          // Parse start and end times robustly
          const startStr = b.start_time || `${b.date}T${b.startTime}`;
          const endStr = b.end_time || `${b.date}T${b.endTime}`;
          
          // Strip timezone offset to treat as local time
          const s = (startStr.includes("T") ? startStr : startStr.replace(" ", "T")).replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
          const e = (endStr.includes("T") ? endStr : endStr.replace(" ", "T")).replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
          
          const start = new Date(s);
          const end = new Date(e);

          if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

          // Check if current time falls within the booking window
          return currentTimestamp >= start.getTime() && currentTimestamp < end.getTime();
        });

        const utilization = Math.min(100, Math.round((activeBookings.length / (r.capacity || 1)) * 100));
        
        let status: "optimal" | "busy" | "over-utilized" = "optimal";
        if (utilization > UTILIZATION_THRESHOLDS.HIGH) status = "over-utilized";
        else if (utilization > UTILIZATION_THRESHOLDS.BUSY) status = "busy";

        return {
          id: resourceId,
          name: r.name,
          type: typeFilters.find(t => t.value === r.type)?.label || r.type, // Map type to label here
          location: `${r.building}, Floor ${r.floor || r.floorNumber || '?'}`,
          capacity: r.capacity,
          utilization,
          status: (r.status === 'maintenance' ? 'maintenance' : status) as any,
          nextAvailable: r.status === 'maintenance' ? "Unavailable" : "Available now"
        };
      });
      setResources(mappedResources);
    } catch (error) {
      console.error("Failed to fetch resources:", error);
    }
  };

  useEffect(() => {
    fetchResources();
    const interval = setInterval(fetchResources, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleBookNow = (resource: Resource) => {
    setBookingDialog({ open: true, resource });
  };

  const handleConfirmBooking = async () => {
    if (!bookingDialog.resource) return;

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        alert("Please log in to book a resource");
        return;
      }
      const user = JSON.parse(userStr);
      const userId = user.user_id || user._id;

      // Calculate end time
      const [hours, minutes] = bookingTime.split(':').map(Number);
      const endHours = hours + parseInt(bookingDuration);
      const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      // Construct ISO strings for Supabase (timestamptz)
      // Treat inputs as local time and convert to correct UTC instant
      const startLocal = new Date(`${bookingDate}T${bookingTime}:00`);
      const endLocal = new Date(`${bookingDate}T${endTime}:00`);
      const startDateTime = startLocal.toISOString();
      const endDateTime = endLocal.toISOString();

      // --- Validation Checks ---
      const dayStart = new Date(startLocal);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(startLocal);
      dayEnd.setHours(23, 59, 59, 999);

      // Fetch all bookings for the selected day to validate constraints
      const dayBookings = await api.bookings.list({
        start: dayStart.toISOString(),
        end: dayEnd.toISOString()
      });

      const activeBookings = Array.isArray(dayBookings) ? dayBookings.filter((b: any) => b.status !== 'cancelled') : [];

      // 1. Daily Limit Check: Max 2 bookings per day per student
      const myDailyBookings = activeBookings.filter((b: any) => {
        const bUserId = b.user_id || b.studentId;
        return String(bUserId) === String(userId);
      });

      if (myDailyBookings.length >= 2) {
        alert("You cannot book more than 2 resources per day.");
        return;
      }

      // 2. Concurrent Booking Check: No overlapping bookings for same student
      const hasOverlap = myDailyBookings.some((b: any) => {
        const bStart = new Date(b.start_time || b.startTime);
        const bEnd = new Date(b.end_time || b.endTime);
        // Check if ranges overlap: (StartA < EndB) and (EndA > StartB)
        return startLocal < bEnd && endLocal > bStart;
      });

      if (hasOverlap) {
        alert("You already have a booking during this time slot.");
        return;
      }

      // 3. Resource Capacity Check: Cannot exceed capacity at specific time
      const resourceBookings = activeBookings.filter((b: any) => {
        const bResId = b.resource_id || b.resourceId;
        return String(bResId) === String(bookingDialog.resource?.id);
      });

      const currentOccupancy = resourceBookings.filter((b: any) => {
        const bStart = new Date(b.start_time || b.startTime);
        const bEnd = new Date(b.end_time || b.endTime);
        return startLocal < bEnd && endLocal > bStart;
      }).length;

      if (currentOccupancy >= (bookingDialog.resource?.capacity || 1)) {
        alert("This resource is fully booked for the selected time.");
        return;
      }
      // --- End Validation Checks ---

      await api.bookings.create({
        resource_id: bookingDialog.resource.id,
        user_id: userId,
        start_time: startDateTime,
        end_time: endDateTime,
        status: "confirmed"
      } as any);

      alert(`Booking confirmed for ${bookingDialog.resource.name}`);
      setBookingDialog({ open: false, resource: null });
      setBookingDate("");
      setBookingTime("");
      setBookingDuration("1");
      fetchResources();
    } catch (error) {
      console.error("Booking failed:", error);
      alert("Failed to create booking. Please try again.");
    }
  };

  // Filter logic needs to check against the raw type value if we mapped it in state, 
  // OR we should store raw type in state and map only for display.
  // Let's adjust the filter to work with the mapped label since we mapped it in fetchResources above.
  const filteredResources = resources.filter(r => {
    const matchesType = selectedType === "all" || r.type === typeFilters.find(t => t.value === selectedType)?.label || r.type === selectedType;
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Discover Resources</h1>
        <p className="text-slate-600">Find and book campus resources based on real-time availability</p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search resources by name or location..."
            className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Type Filter Pills */}
      <div className="mb-8 flex flex-wrap gap-2">
        {typeFilters.map((type) => (
          <button
            key={type.value}
            onClick={() => setSelectedType(type.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              selectedType === type.value
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Resource Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredResources.map((resource) => {
          const config = statusConfig[resource.status];
          return (
            <div
              key={resource.id}
              className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {resource.name}
                  </h3>
                  <p className="text-sm text-slate-500">{resource.type}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                  {config.label}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {resource.location}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="w-4 h-4 text-slate-400" />
                  Capacity: {resource.capacity} people
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {resource.nextAvailable}
                </div>
              </div>

              {/* Utilization Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">Current Utilization</span>
                  <span className={`text-xs font-semibold ${config.textColor}`}>{resource.utilization}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${resource.utilization}%` }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <Button
                onClick={() => handleBookNow(resource)}
                disabled={resource.status === 'maintenance'}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                Book Now
              </Button>
            </div>
          );
        })}
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialog.open} onOpenChange={(open) => setBookingDialog({ open, resource: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book Resource</DialogTitle>
            <DialogDescription>
              {bookingDialog.resource?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="date" className="text-slate-700 mb-2 block">
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="h-11 rounded-xl"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="time" className="text-slate-700 mb-2 block">
                Time
              </Label>
              <Input
                id="time"
                type="time"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="duration" className="text-slate-700 mb-2 block">
                Duration (hours)
              </Label>
              <select
                id="duration"
                value={bookingDuration}
                onChange={(e) => setBookingDuration(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 bg-white"
              >
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="3">3 hours</option>
                <option value="4">4 hours</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setBookingDialog({ open: false, resource: null })}
              className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBooking}
              disabled={!bookingDate || !bookingTime}
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirm Booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}