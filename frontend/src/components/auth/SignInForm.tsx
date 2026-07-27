"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function SignInForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Connexion
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Saisissez votre e-mail et votre mot de passe pour vous connecter.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <div>
            <Label>
              Email <span className="text-error-500">*</span>
            </Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>
              Mot de passe <span className="text-error-500">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Saisissez votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
              >
                {showPassword ? (
                  <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                ) : (
                  <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox checked={isChecked} onChange={setIsChecked} />
              <span className="text-sm font-normal text-gray-700 dark:text-gray-400">
                Rester connecté
              </span>
            </div>
            <Link
              href="/reset-password"
              className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Mot de passe oublié ?
            </Link>
          </div>

          {error && (
            <p className="text-sm text-error-500" role="alert">
              {error}
            </p>
          )}

          <Button className="w-full" size="sm" disabled={submitting}>
            {submitting ? "Connexion…" : "Se connecter"}
          </Button>
        </div>
      </form>

      {/* Footer link */}
      <p className="mt-5 text-sm text-center text-gray-700 dark:text-gray-400">
        Vous n&apos;avez pas de compte ?{" "}
        <Link
          href="/signup"
          className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          S&apos;inscrire
        </Link>
      </p>
    </>
  );
}
