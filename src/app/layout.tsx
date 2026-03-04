import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Your Appointment | Barbershop",
  description: "Schedule your next haircut online. Easy booking, great service.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}