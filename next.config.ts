import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Poster and backdrop art comes from TMDB once a key is configured.
    // Without this the <Image> component refuses the host and every film page
    // falls back to a broken image rather than the type plate.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
