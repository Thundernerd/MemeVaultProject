import Navigation from "@/components/Navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      <main className="pt-14 md:pt-0 md:ml-52 min-h-screen px-6 pt-20 pb-8 md:px-8 md:pt-8">
        {children}
      </main>
    </>
  );
}
