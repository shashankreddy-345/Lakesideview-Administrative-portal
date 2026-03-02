import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { api } from "../services/api";

export function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"student" | "admin">("student");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const { user, token } = await api.auth.login({ email, password });
      if (user) {
        localStorage.setItem("authToken", token);
        localStorage.setItem("user", JSON.stringify(user));
        navigate(user.role === "student" ? "/student" : "/admin");
      } else {
        setError("Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Login error details:", err);
      setError("Failed to login. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (email: string) => {
    setIsLoading(true);
    setError(null);
    const password = "password123";

    try {
      const { user, token } = await api.auth.login({ email, password });
      if (user) {
        localStorage.setItem("authToken", token);
        localStorage.setItem("user", JSON.stringify(user));
        navigate(user.role === "student" ? "/student" : "/admin");
      } else {
        setError("Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Login error details:", err);
      setError("Failed to login. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">Lakesideview University</h1>
            </div>
            <p className="text-slate-600 ml-[52px]">Campus Resource Management</p>
          </div>

          {/* Role Selection */}
          <div className="mb-8">
            <Label className="text-sm text-slate-600 mb-3 block">Select Role</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("student")}
                className={`p-4 rounded-xl border-2 transition-all ${
                  role === "student"
                    ? "border-blue-600 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <GraduationCap className={`w-6 h-6 mb-2 ${role === "student" ? "text-blue-600" : "text-slate-400"}`} />
                <div className={`font-medium ${role === "student" ? "text-blue-900" : "text-slate-700"}`}>
                  Student
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`p-4 rounded-xl border-2 transition-all ${
                  role === "admin"
                    ? "border-indigo-600 bg-indigo-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <ShieldCheck className={`w-6 h-6 mb-2 ${role === "admin" ? "text-indigo-600" : "text-slate-400"}`} />
                <div className={`font-medium ${role === "admin" ? "text-indigo-900" : "text-slate-700"}`}>
                  Admin
                </div>
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
                {error}
              </div>
            )}
            <div>
              <Label htmlFor="email" className="text-slate-700 mb-2 block">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={role === "student" ? "student@university.edu" : "admin@university.edu"}
                className="h-12 rounded-xl border-slate-200 bg-white"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-slate-700 mb-2 block">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                className="h-12 rounded-xl border-slate-200 bg-white"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className={`w-full h-12 rounded-xl text-white shadow-lg ${
                role === "student"
                  ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  : "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800"
              }`}
            >
              {isLoading ? "Signing in..." : `Sign in as ${role === "student" ? "Student" : "Admin"}`}
            </Button>
          </form>

          {/* Demo Users */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Demo Users (Password: password123)</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("sophia.young10@lakeside.edu")}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">Sophia Young</div>
                  <div className="text-xs text-slate-500">Admin</div>
                </div>
                <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Noah Jackson", email: "noah.jackson11@lakeside.edu" },
                  { name: "Hannah Thomas", email: "hannah.thomas12@lakeside.edu" },
                  { name: "Zoe Smith", email: "zoe.smith13@lakeside.edu" },
                  { name: "Omar Garcia", email: "omar.garcia14@lakeside.edu" },
                ].map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => handleQuickLogin(u.email)}
                    className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">Student</div>
                    </div>
                    <GraduationCap className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Protected by university authentication
          </p>
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 items-center justify-center p-12">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 text-white max-w-lg">
          <h2 className="text-4xl font-semibold mb-4">
            Campus Resource Management
          </h2>
          <div className="grid grid-cols-3 gap-4 bg-white/10 backdrop-blur-sm rounded-2xl p-6">
            <div className="text-center">
              <div className="text-3xl font-semibold">Ease</div>
              <div className="text-sm text-blue-100 mt-1">To use</div>
            </div>
            <div className="text-center border-l border-white/20">
              <div className="text-3xl font-semibold">24/7</div>
              <div className="text-sm text-blue-100 mt-1">Monitoring</div>
            </div>
            <div className="text-center border-l border-white/20">
              <div className="text-3xl font-semibold">11</div>
              <div className="text-sm text-blue-100 mt-1">Resources</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
