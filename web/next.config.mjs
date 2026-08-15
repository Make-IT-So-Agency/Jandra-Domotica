/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer en exceljs zijn Node-bibliotheken; die mogen niet mee
  // in de browserbundel gerold worden.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
};

export default nextConfig;
