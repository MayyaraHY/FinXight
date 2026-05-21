"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { USER_SERVICE_URL } from "@/lib/apiUrls";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useRef, useState } from "react";

export default function SignUpForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- form state ---
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked,    setIsChecked]    = useState(false);

  // --- picture state ---
  const [pictureFile,    setPictureFile]    = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

  // --- submission state ---
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  // ── picture selection ──────────────────────────────────────────────
  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5 MB.");
      return;
    }

    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
    setError(null);
  }

  function removePicture() {
    setPictureFile(null);
    setPicturePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    if (!firstName.trim()) { setError("First name is required.");                    return; }
    if (!email.trim())     { setError("Email is required.");                         return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!isChecked)        { setError("You must agree to the Terms and Conditions."); return; }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // Single multipart request — data (JSON) + picture (file) together
      const formData = new FormData();

      formData.append(
        "data",
        new Blob(
          [JSON.stringify({
            firstName,
            lastName: lastName.trim() || undefined,
            email,
            password,
          })],
          { type: "application/json" }
        )
      );

      if (pictureFile) formData.append("picture", pictureFile);

      const resp = await fetch(`${USER_SERVICE_URL}/auth/register`, {
        method: "POST",
        body: formData,
        // ⚠️ Do NOT set Content-Type header — browser sets it automatically with the correct boundary
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ??
          `Registration failed (HTTP ${resp.status})`
        );
      }

      setSuccess("Account created! Check your email to verify, then sign in.");
      setTimeout(() => router.push("/signin"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">Sign Up</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create your account to get started.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-5">

          {/* ── Profile Picture ── */}
          <div>
            <Label>
              Profile Picture{" "}
              <span className="text-xs text-gray-400">(optional)</span>
            </Label>
            <div className="flex items-center gap-4 mt-1">

              {/* Avatar preview */}
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                {picturePreview ? (
                  <img src={picturePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                )}
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-300 rounded-lg hover:bg-brand-50 dark:text-brand-400 dark:border-brand-700 dark:hover:bg-brand-900/20 transition"
                >
                  {pictureFile ? "Change photo" : "Upload photo"}
                </button>
                {pictureFile && (
                  <button
                    type="button"
                    onClick={removePicture}
                    className="px-3 py-1.5 text-xs font-medium text-error-600 border border-error-300 rounded-lg hover:bg-error-50 dark:text-error-400 dark:border-error-700 transition"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-gray-400">JPG, PNG, WEBP · max 5 MB</p>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePictureChange}
            />
          </div>

          {/* ── Name row ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name <span className="text-error-500">*</span></Label>
              <Input
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          {/* ── Email ── */}
          <div>
            <Label>Email <span className="text-error-500">*</span></Label>
            <Input
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* ── Password ── */}
          <div>
            <Label>Password <span className="text-error-500">*</span></Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
              >
                {showPassword
                  ? <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                  : <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />}
              </span>
            </div>
          </div>

          {/* ── Terms ── */}
          <div className="flex items-start gap-3">
            <Checkbox className="w-5 h-5 mt-0.5" checked={isChecked} onChange={setIsChecked} />
            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">
              By creating an account you agree to the{" "}
              <span className="text-gray-800 dark:text-white/90">Terms and Conditions</span>{" "}
              and our{" "}
              <span className="text-gray-800 dark:text-white">Privacy Policy</span>
            </p>
          </div>

          {/* ── Feedback ── */}
          {error   && <p className="text-sm text-error-500"   role="alert">{error}</p>}
          {success && <p className="text-sm text-success-500" role="status">{success}</p>}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Sign Up"}
          </button>

        </div>
      </form>

      {/* ── Footer ── */}
      <p className="mt-5 text-sm text-center text-gray-700 dark:text-gray-400">
        Already have an account?{" "}
        <Link href="/signin" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
          Sign In
        </Link>
      </p>
    </>
  );
}