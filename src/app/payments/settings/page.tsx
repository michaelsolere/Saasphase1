import Link from "next/link";
import { redirect } from "next/navigation";

import { formatPrice } from "@/features/reservations/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export const dynamic = "force-dynamic";

type PaymentSettings = {
  default_pre_reservation_deposit_cents: number;
  default_arrhes_second_payment_cents: number;
  default_puppy_price_cents: number | null;
  pre_reservation_response_delay_days: number;
  default_currency: string;
  settings_json: Json;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCurrency(value: unknown) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function getSettingsJsonCurrency(settingsJson: Json) {
  if (!isRecord(settingsJson)) {
    return null;
  }

  const directCurrency =
    normalizeCurrency(settingsJson.currency) ??
    normalizeCurrency(settingsJson.default_currency) ??
    normalizeCurrency(settingsJson.payment_currency);

  if (directCurrency) {
    return directCurrency;
  }

  if (isRecord(settingsJson.payment)) {
    return (
      normalizeCurrency(settingsJson.payment.currency) ??
      normalizeCurrency(settingsJson.payment.default_currency)
    );
  }

  return null;
}

function SettingCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-surface p-5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </dd>
      {detail ? <p className="mt-2 text-sm leading-6 text-muted">{detail}</p> : null}
    </div>
  );
}

function MissingSettingsMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h1 className="text-xl font-semibold">
        Paramètres de paiement indisponibles
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6">
        Les paramètres d’organisation n’ont pas pu être chargés. Aucune donnée
        n’a été modifiée.
      </p>
      <Link
        href="/payments"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux paiements
      </Link>
    </section>
  );
}

export default async function PaymentSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const organizationId = membership?.organization_id ?? null;

  const { data: rawSettings, error: settingsError } = organizationId
    ? await supabase
        .from("organization_settings")
        .select(
          "default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents, default_puppy_price_cents, pre_reservation_response_delay_days, default_currency, settings_json",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const settings = rawSettings as PaymentSettings | null;
  const hasLoadingError = Boolean(membershipError || settingsError);
  const currency =
    settings
      ? getSettingsJsonCurrency(settings.settings_json) ??
        normalizeCurrency(settings.default_currency) ??
        "EUR"
      : "EUR";
  const totalDepositCents = settings
    ? settings.default_pre_reservation_deposit_cents +
      settings.default_arrhes_second_payment_cents
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/payments"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux paiements
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paiements · Paramètres
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Paramètres de paiement
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Ces paramètres serviront à définir les montants et délais par défaut
          des parcours adoptants. Pour l’instant, cette page est en lecture
          seule.
        </p>
      </header>

      <section className="py-8">
        {hasLoadingError || !settings ? (
          <MissingSettingsMessage />
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              Les workflows existants utilisent encore les constantes
              applicatives. La modification de ces paramètres sera ajoutée dans
              un lot ultérieur.
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <SettingCard
                label="Pré-réservation"
                value={formatPrice(
                  settings.default_pre_reservation_deposit_cents,
                  currency,
                )}
                detail="Montant par défaut du premier versement demandé."
              />
              <SettingCard
                label="Complément d’arrhes"
                value={formatPrice(
                  settings.default_arrhes_second_payment_cents,
                  currency,
                )}
                detail="Montant par défaut du complément demandé ensuite."
              />
              <SettingCard
                label="Arrhes totales calculées"
                value={formatPrice(totalDepositCents, currency)}
                detail="Somme de la pré-réservation et du complément d’arrhes."
              />
              <SettingCard
                label="Prix chiot par défaut"
                value={formatPrice(settings.default_puppy_price_cents, currency)}
                detail="Tarif indicatif, si renseigné dans les paramètres d’organisation."
              />
              <SettingCard
                label="Délai de réponse pré-réservation"
                value={`${settings.pre_reservation_response_delay_days} jour${
                  settings.pre_reservation_response_delay_days > 1 ? "s" : ""
                }`}
                detail="Délai par défaut associé à la demande de pré-réservation."
              />
              <SettingCard
                label="Devise"
                value={currency}
                detail="Devise affichée depuis les paramètres existants, sans création de donnée."
              />
            </dl>

            <p className="rounded-xl border bg-surface px-4 py-3 text-sm text-muted">
              Aucun champ n’est modifiable depuis cette page dans ce lot.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
