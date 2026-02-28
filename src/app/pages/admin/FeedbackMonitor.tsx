import { useState, useEffect } from "react";
import { Star, Filter, Search, TrendingUp, MessageSquare, ThumbsUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api, Feedback as ApiFeedback } from "../../services/api";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "../../components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

interface Feedback {
  id: string;
  userName: string;
  resourceName: string;
  rating: number;
  comment: string;
  category: string;
  date: string;
  timestamp: number;
  status: "new" | "reviewed" | "resolved";
}

const StarRating = ({ rating }: { rating: number }) => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"
          }`}
        />
      ))}
    </div>
  );
};

const statusConfig = {
  new: {
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    label: "New",
  },
  reviewed: {
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    label: "Reviewed",
  },
  resolved: {
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    label: "Resolved",
  },
};

export function FeedbackMonitor() {
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRating, setSelectedRating] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchFeedback = async () => {
      try {
        const data = await api.feedback.list();
        const mapped: Feedback[] = data.map((f: any) => ({
          id: f._id,
          userName: "Anonymous Student", // API doesn't provide user details in list yet
          resourceName: "General Resource", // API doesn't provide resource details in list yet
          rating: f.rating,
          comment: f.comment,
          category: "General",
          date: f.created_at ? new Date(f.created_at).toLocaleDateString() : (f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "Recent"),
          timestamp: f.created_at ? new Date(f.created_at).getTime() : (f.createdAt ? new Date(f.createdAt).getTime() : 0),
          status: "new"
        }));
        setFeedbackList(mapped);
      } catch (error) {
        console.error("Failed to fetch feedback", error);
      }
    };
    fetchFeedback();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedRating, searchQuery, sortBy]);

  const categories = ["Facilities", "Equipment", "Technology", "Ambiance", "Availability", "Support"];

  const filteredFeedback = feedbackList.filter((feedback) => {
    const matchesCategory = selectedCategory === "all" || feedback.category === selectedCategory;
    const matchesRating = selectedRating === "all" || feedback.rating === selectedRating;
    const matchesSearch =
      feedback.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.comment.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesRating && matchesSearch;
  });

  const sortedFeedback = [...filteredFeedback].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return b.timestamp - a.timestamp;
      case "oldest":
        return a.timestamp - b.timestamp;
      case "highest":
        return b.rating - a.rating;
      case "lowest":
        return a.rating - b.rating;
      default:
        return 0;
    }
  });

  const totalPages = Math.ceil(sortedFeedback.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentFeedback = sortedFeedback.slice(startIndex, startIndex + itemsPerPage);

  const avgRating = feedbackList.length > 0 
    ? (feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackList.length).toFixed(1)
    : "0.0";

  // Calculate rating distribution for the chart
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  feedbackList.forEach((f) => {
    if (f.rating >= 1 && f.rating <= 5) {
      ratingCounts[f.rating as keyof typeof ratingCounts]++;
    }
  });
  const ratingData = [5, 4, 3, 2, 1].map((star) => ({ name: `${star} Stars`, count: ratingCounts[star as keyof typeof ratingCounts], star }));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Feedback Monitor</h1>
        <p className="text-slate-600">Track and respond to user feedback in real-time</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Star className="w-6 h-6 text-amber-500" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{avgRating}</h3>
          <p className="text-sm text-slate-600">Average Rating</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">{feedbackList.length}</h3>
          <p className="text-sm text-slate-600">Total Feedback</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <ThumbsUp className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">87%</h3>
          <p className="text-sm text-slate-600">Satisfaction Rate</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-1">
            {feedbackList.filter((f) => f.status === "resolved").length}
          </h3>
          <p className="text-sm text-slate-600">Resolved Issues</p>
        </div>
      </div>

      {/* Rating Distribution Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-1">Rating Distribution</h3>
          <p className="text-sm text-slate-600">Breakdown of feedback by star rating</p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratingData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis 
                type="number" 
                stroke="#94a3b8" 
                style={{ fontSize: 12, fontWeight: 500 }}
                label={{ value: "Count", position: "insideBottom", offset: -5, style: { fill: "#64748b", fontSize: 12, fontWeight: 600 } }}
              />
              <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {ratingData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={
                    entry.star >= 4 ? "#10b981" : // Emerald for 4-5
                    entry.star === 3 ? "#f59e0b" : // Amber for 3
                    "#ef4444" // Rose for 1-2
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search feedback by user or resource..."
              className="pl-12 h-11 rounded-xl border-slate-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] h-11 rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="highest">Highest Rated</SelectItem>
              <SelectItem value="lowest">Lowest Rated</SelectItem>
            </SelectContent>
          </Select>

          {/* Rating Filter */}
          <div className="flex gap-2">
            {[5, 4, 3, 2, 1, "all"].map((rating) => (
              <button
                key={rating}
                onClick={() => setSelectedRating(rating as number | "all")}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedRating === rating
                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {rating === "all" ? "All" : `${rating}★`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback List */}
      <div className="space-y-4">
        {currentFeedback.map((feedback) => {
          const config = statusConfig[feedback.status];
          return (
            <div
              key={feedback.id}
              className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                      {feedback.userName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{feedback.userName}</h3>
                      <p className="text-sm text-slate-500">{feedback.date}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{feedback.resourceName}</p>
                </div>
                <div className="flex items-center gap-3">
                </div>
              </div>

              <div className="mb-3">
                <StarRating rating={feedback.rating} />
              </div>

              <p className="text-slate-700 mb-4 leading-relaxed">{feedback.comment}</p>

              <div className="flex gap-2">
                <Button className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
                  Respond
                </Button>
                <Button className="h-9 px-4 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-sm">
                  Mark as Reviewed
                </Button>
                <Button className="h-9 px-4 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-sm">
                  Archive
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {(() => {
                const pages = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  if (currentPage <= 4) {
                    for (let i = 1; i <= 5; i++) pages.push(i);
                    pages.push("ellipsis");
                    pages.push(totalPages);
                  } else if (currentPage >= totalPages - 3) {
                    pages.push(1);
                    pages.push("ellipsis");
                    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    pages.push("ellipsis");
                    pages.push(currentPage - 1);
                    pages.push(currentPage);
                    pages.push(currentPage + 1);
                    pages.push("ellipsis");
                    pages.push(totalPages);
                  }
                }
                return pages.map((page, index) => (
                  <PaginationItem key={index}>
                    {page === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page as number);
                        }}
                      >
                        {page}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ));
              })()}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {filteredFeedback.length === 0 && (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No feedback found</h3>
          <p className="text-slate-600">Try adjusting your filters to see more results</p>
        </div>
      )}
    </div>
  );
}
