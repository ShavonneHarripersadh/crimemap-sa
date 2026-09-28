import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "crimemap-sa.vercel.app" }],
        destination: "https://www.crimemapsa.co.za/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "crimemap-sa.vercel.app" }],
        destination: "https://www.crimemapsa.co.za/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
