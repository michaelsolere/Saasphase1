export default function ApplicationsLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="animate-pulse">
        <div className="h-4 w-32 rounded bg-border" />
        <div className="mt-8 h-10 w-72 rounded bg-border" />
        <div className="mt-3 h-5 w-full max-w-xl rounded bg-border" />
        <div className="mt-10 h-12 rounded-2xl bg-border" />
        <div className="mt-5 h-80 rounded-2xl bg-border" />
      </div>
      <p className="sr-only">Chargement des candidatures</p>
    </main>
  );
}
