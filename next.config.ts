import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  async rewrites() { return [{ source: "/api/backend/:path*", destination: "http://127.0.0.1:8787/api/:path*" }]; },
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
export default config;
