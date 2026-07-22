"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login, type LoginState } from "@/features/auth/actions";

const initialState: LoginState = {
  error: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Connexion en cours…" : "Se connecter"}
    </button>
  );
}

export function LoginForm({ returnPath }: { returnPath: string | null }) {
  const [state, formAction] = useActionState(
    login.bind(null, returnPath),
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
