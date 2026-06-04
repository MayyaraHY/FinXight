import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only ships that output, not the full node_modules tree.
  output: "standalone",
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
    
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  
};

export default nextConfig;
