import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // This creates a static 'out' folder
  images: { unoptimized: true }, // Required for static export
};

export default nextConfig;
