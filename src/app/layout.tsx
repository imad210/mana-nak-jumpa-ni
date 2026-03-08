import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midpoint Malaysia | Fair Meetup Finder",
  description: "Find the geographic midpoint between multiple locations in Malaysia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
