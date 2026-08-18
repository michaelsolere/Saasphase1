import Link from "next/link";

export default function ChoiceUnavailablePage() {
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16"><section className="w-full rounded-2xl border bg-surface p-7 text-center"><p className="text-sm font-semibold uppercase tracking-wide text-accent">Hermès</p><h1 className="mt-3 text-2xl font-semibold">Ce lien n’est plus disponible</h1><p className="mt-3 text-sm leading-6 text-muted">Le lien est inconnu, expiré ou révoqué. Contactez directement l’élevage si vous devez encore répondre.</p><Link href="/" className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline">Retour à l’accueil</Link></section></main>;
}
