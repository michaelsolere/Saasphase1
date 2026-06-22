export default function LoginLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12 sm:px-10 lg:px-12">
      <div className="grid w-full animate-pulse gap-10 lg:grid-cols-[1fr_440px] lg:items-center">
        <div>
          <div className="h-4 w-32 rounded bg-border" />
          <div className="mt-10 h-12 max-w-xl rounded bg-border" />
          <div className="mt-4 h-6 max-w-lg rounded bg-border" />
        </div>
        <div className="h-[430px] rounded-3xl bg-border" />
      </div>
      <p className="sr-only">Chargement de la connexion</p>
    </main>
  );
}
