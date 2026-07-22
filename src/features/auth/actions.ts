"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  defaultLoginSuccessPath,
  validateLoginReturnPath,
} from "@/features/auth/login-return";

export type LoginState = {
  error: string | null;
};

export async function login(
  returnPath: string | null,
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return {
      error: "Renseignez votre email et votre mot de passe.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return {
      error: "Connexion impossible. Vérifiez vos identifiants et réessayez.",
    };
  }

  redirect(validateLoginReturnPath(returnPath) ?? defaultLoginSuccessPath);
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect("/candidatures?erreur=logout");
  }

  redirect("/login?deconnexion=success");
}
