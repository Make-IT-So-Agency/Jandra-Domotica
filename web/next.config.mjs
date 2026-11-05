/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer en exceljs zijn Node-bibliotheken; die mogen niet mee
  // in de browserbundel gerold worden.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // Laadpalen stond vroeger in de root; oude bladwijzers en links in mails
  // komen zo nog op de juiste pagina. /laadpalen zelf was Laadpunten en is nu
  // het overzicht van de module: dat is ook een goede plek om te landen.
  async redirects() {
    return ["rapporten", "vennootschappen", "tarieven", "instellingen"].flatMap((deel) => [
      { source: `/${deel}`, destination: `/laadpalen/${deel}`, permanent: false },
      { source: `/${deel}/:rest*`, destination: `/laadpalen/${deel}/:rest*`, permanent: false },
    ]);
  },
};

export default nextConfig;
