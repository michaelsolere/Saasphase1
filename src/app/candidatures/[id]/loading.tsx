export default function ApplicationDetailLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="animate-pulse">
        <div className="h-4 w-44 rounded bg-border" />
        <div className="mt-10 h-10 w-80 rounded bg-border" />
        <div className="mt-4 h-6 w-48 rounded bg-border" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="h-96 rounded-2xl bg-border" />
          <div className="h-72 rounded-2xl bg-border" />
        </div>
      </div>
      <p className="sr-only">Chargement de la candidature</p>
    </main>
  );
}
