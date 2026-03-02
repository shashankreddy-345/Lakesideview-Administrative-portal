import { Calendar, MapPin, Clock, MoreVertical, X, Check, Star } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { useState, useEffect } from "react";
import { api, Booking as ApiBooking } from "../../services/api";

interface Booking {
  id: string;
  resourceId: string;
  resourceName: string;
  location: string;
  date: string;
  time: string;
  duration: string;
  status: "confirmed" | "pending" | "completed" | "cancelled";
}

const statusConfig = {
  confirmed: {
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    label: "Confirmed",
  },
  pending: {
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    label: "Pending",
  },
  completed: {
    bgColor: "bg-slate-50",
    textColor: "text-slate-600",
    borderColor: "border-slate-200",
    label: "Completed",
  },
  cancelled: {
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    borderColor: "border-rose-200",
    label: "Cancelled",
  },
};

export function MyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; bookingId: string | null }>({
    open: false,
    bookingId: null,
  });
  const [ratingDialog, setRatingDialog] = useState<{ open: boolean; bookingId: string | null }>({
    open: false,
    bookingId: null,
  });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [stats, setStats] = useState({
    upcoming: 0,
    thisMonth: 0,
    totalHours: 0,
    completionRate: 0
  });

  const fetchBookings = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);

      // Fetch bookings and resources to map names
      const [bookingsData, resourcesData] = await Promise.all([
        api.bookings.getByStudent(user._id).catch(() => []),
        api.resources.list().catch(() => [])
      ]);

      // Sort bookings by date descending
      bookingsData.sort((a: any, b: any) => {
        const sA = a.start_time || `${a.date}T${a.startTime}`;
        const sB = b.start_time || `${b.date}T${b.startTime}`;
        const dateA = new Date(sA.includes("T") ? sA : sA.replace(" ", "T"));
        const dateB = new Date(sB.includes("T") ? sB : sB.replace(" ", "T"));
        return dateB.getTime() - dateA.getTime();
      });

      // bookingsData is already filtered by student ID from the API

      // Calculate stats
      const now = new Date();
      let upcoming = 0;
      let thisMonth = 0;
      let totalHours = 0;
      let completed = 0;
      let totalForRate = 0;

      bookingsData.forEach((b: any) => {
        const startStr = b.start_time || `${b.date}T${b.startTime}`;
        const endStr = b.end_time || `${b.date}T${b.endTime}`;
        // Handle potential space in date string if not ISO
        const start = new Date(startStr.includes("T") ? startStr : startStr.replace(" ", "T"));
        const end = new Date(endStr.includes("T") ? endStr : endStr.replace(" ", "T"));

        if (isNaN(start.getTime())) return;

        let status = b.status;
        if (status !== 'cancelled' && end < now) {
          status = 'completed';
        }

        // Upcoming: Future date and active status
        if (start > now && (status === 'confirmed' || status === 'pending' || status === 'upcoming')) {
          upcoming++;
        }

        // This Month
        if (start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear()) {
          thisMonth++;
        }

        // Total Hours (excluding cancelled)
        if (status !== 'cancelled' && !isNaN(end.getTime())) {
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          totalHours += Math.max(0, hours);
        }

        // Completion Rate
        if (status === 'completed') completed++;
        if (status !== 'cancelled') totalForRate++;
      });

      setStats({
        upcoming,
        thisMonth,
        totalHours: Math.round(totalHours),
        completionRate: totalForRate > 0 ? Math.round((completed / totalForRate) * 100) : 0
      });

      const resourceMap = new Map();
      resourcesData.forEach((r: any) => {
        resourceMap.set(r._id, r);
        if (r.resource_id) {
          resourceMap.set(r.resource_id, r);
        }
      });

      const mappedBookings: Booking[] = bookingsData.map((b: ApiBooking) => {
        // Handle potentially different field names from the API record
        const resourceId = (b as any).resource_id || b.resourceId;
        const startTime = (b as any).start_time || b.startTime || "";
        const endTime = (b as any).end_time || b.endTime || "";
        
        const resource = resourceMap.get(resourceId);
        const start = new Date(startTime);
        const end = new Date(endTime);
        const duration = !isNaN(start.getTime()) && !isNaN(end.getTime()) 
          ? Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60))) 
          : 0;

        let status = b.status;
        if (status !== 'cancelled' && status !== 'completed' && end < now) {
          status = 'completed';
        }

        return {
          id: b._id || (b as any).booking_id, // Fallback to booking_id if _id is missing
          resourceId: resourceId,
          resourceName: resource?.name || "Unknown Resource",
          location: resource ? `${resource.building}, Floor ${resource.floor || resource.floorNumber || '?'}` : "Unknown Location",
          date: !isNaN(start.getTime()) ? start.toLocaleDateString() : (b.date || ""),
          time: !isNaN(start.getTime()) ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (b.startTime || ""),
          duration: `${duration} hour${duration !== 1 ? 's' : ''}`,
          status: (["confirmed", "pending", "completed", "cancelled"].includes(status) ? status : "confirmed") as any,
        };
      });

      setBookings(mappedBookings);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
    }
  };

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCancelBooking = (bookingId: string) => {
    setCancelDialog({ open: true, bookingId });
  };

  const confirmCancel = async () => {
    if (!cancelDialog.bookingId) return;
    try {
      await api.bookings.cancel(cancelDialog.bookingId);
      fetchBookings();
      setCancelDialog({ open: false, bookingId: null });
    } catch (error) {
      alert("Failed to cancel booking");
    }
  };

  const handleRateBooking = (bookingId: string) => {
    setRatingDialog({ open: true, bookingId });
  };

  const confirmRating = async () => {
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      await api.feedback.create({ 
        rating, 
        comment: ratingComment,
        studentId: user?._id,
        date: new Date().toISOString().split('T')[0]
      });
      setRatingDialog({ open: false, bookingId: null });
      setRating(0);
      setHoverRating(0);
      setRatingComment("");
    } catch (error) {
      alert("Failed to submit rating");
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">My Bookings</h1>
          <p className="text-slate-600">Manage your upcoming and past reservations</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Upcoming</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.upcoming}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">This Month</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.thisMonth}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Total Hours</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.totalHours}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Completion Rate</div>
          <div className="text-2xl font-semibold text-emerald-600">{stats.completionRate}%</div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            <div className="col-span-4">Resource</div>
            <div className="col-span-2">Date & Time</div>
            <div className="col-span-2">Duration</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const config = statusConfig[booking.status] || statusConfig.confirmed;
            const isFuture = booking.status === "confirmed" || booking.status === "pending";
            const isCompleted = booking.status === "completed";
            
            return (
              <div
                key={booking.id}
                className="px-6 py-5 hover:bg-slate-50 transition-colors group"
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Resource Name */}
                  <div className="col-span-4">
                    <h3 className="font-semibold text-slate-900 mb-1">{booking.resourceName}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      {booking.location}
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700 mb-1">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {booking.date}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {booking.time}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="col-span-2">
                    <span className="text-sm font-medium text-slate-700">{booking.duration}</span>
                  </div>

                  {/* Location (simplified for table) */}
                  <div className="col-span-2">
                    <span className="text-sm text-slate-600">{booking.location.split(",")[0]}</span>
                  </div>

                  {/* Status */}
                  <div className="col-span-1">
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
                    >
                      {booking.status === "confirmed" && <Check className="w-3 h-3" />}
                      {booking.status === "cancelled" && <X className="w-3 h-3" />}
                      {config.label}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {isFuture && (
                        <button
                          onClick={() => handleCancelBooking(booking.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {isCompleted && (
                        <button
                          onClick={() => handleRateBooking(booking.id)}
                          className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <Star className="w-3 h-3" />
                          Rate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty State or Pagination could go here */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-600">Showing {bookings.length} bookings</p>
        <div className="flex gap-2">
          <Button className="h-9 px-4 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50">
            Previous
          </Button>
          <Button className="h-9 px-4 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50">
            Next
          </Button>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ open, bookingId: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => setCancelDialog({ open: false, bookingId: null })}
              className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Keep Booking
            </Button>
            <Button
              onClick={confirmCancel}
              className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
            >
              Yes, Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating Dialog */}
      <Dialog open={ratingDialog.open} onOpenChange={(open) => setRatingDialog({ open, bookingId: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rate Your Experience</DialogTitle>
            <DialogDescription>
              How was your experience with this resource?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoverRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "fill-slate-200 text-slate-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Comments (optional)
              </label>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Share your thoughts about this resource..."
                className="w-full h-24 rounded-xl border border-slate-200 px-4 py-3 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setRatingDialog({ open: false, bookingId: null })}
              className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRating}
              disabled={rating === 0}
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300"
            >
              Submit Rating
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}