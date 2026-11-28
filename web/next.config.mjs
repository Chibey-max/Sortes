/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi / WalletConnect pull optional node-only deps; keep them out of the browser bundle.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional payment SDKs reached through wagmi's Base/Coinbase connectors. Sortes uses only
    // QoreX and MetaMask, so these are stubbed out instead of installed.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/story/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
