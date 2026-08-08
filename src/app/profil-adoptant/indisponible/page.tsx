import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AdopterProfileUnavailablePage() {
  return <main className="grid min-h-screen place-items-center bg-[#f6f3ed] p-5"><div className="max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold">Ce lien n’est pas disponible.</h1><p className="mt-3 leading-7 text-muted">Il a peut-être expiré ou été remplacé. Contactez directement l’élevage si vous avez besoin d’un nouvel accès.</p></div></main>;
}
