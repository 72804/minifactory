import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiniFactory Admin",
  description: "Internal cross-app portfolio dashboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mf-shell">{children}</div>
      </body>
    </html>
  );
}
