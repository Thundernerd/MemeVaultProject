import Navigation from "@/components/Navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const oidcEnabled = !!process.env.MEMEVAULTPROJECT_OIDC_ISSUER;

  return (
    <>
      <Navigation oidcEnabled={oidcEnabled} />
      <main className="mt-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-24">
          {children}
        </div>
      </main>
    </>
  );
}
