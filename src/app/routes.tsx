import { createBrowserRouter } from "react-router";
import { Login } from "./pages/Login";
import { StudentLayout } from "./layouts/StudentLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { ResourceDiscovery } from "./pages/student/ResourceDiscovery";
import { MyBookings } from "./pages/student/MyBookings";
import { Overview } from "./pages/admin/Overview";
import { FeedbackMonitor } from "./pages/admin/FeedbackMonitor";
import { ResourceAnalytics } from "./pages/admin/ResourceAnalytics";
import { RoomAnalytics } from "./pages/admin/RoomAnalytics.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
  },
  {
    path: "/student",
    Component: StudentLayout,
    children: [
      { index: true, Component: ResourceDiscovery },
      { path: "bookings", Component: MyBookings },
    ],
  },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: Overview },
      { path: "analytics", Component: ResourceAnalytics },
      { path: "rooms", Component: RoomAnalytics },
      { path: "feedback", Component: FeedbackMonitor },
    ],
  },
]);