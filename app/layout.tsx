import "./globals.css";
export const metadata = {
  title: "Dinner Scout — Your week, sorted",
  description: "A sample high-protein dinner planner for Omotesando & Aoyama.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
