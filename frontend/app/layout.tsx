import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
  title: "Buco — Budget Concierge",
  description: "Find affordable restaurants, salons, and local spots near you.",
};

// Capping the scale stops iOS Safari from zooming in when a text field is
// focused (and never zooming back out). The map still pinch-zooms via Leaflet.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
