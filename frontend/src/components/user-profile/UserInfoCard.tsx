"use client";
import React, { useState, useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { fetchAuthed } from "@/lib/apiClient";
import { USER_SERVICE_URL } from "@/lib/apiUrls";

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
        {value || <span className="text-gray-400 italic">Not set</span>}
      </p>
    </div>
  );
}

export default function UserInfoCard() {
  const { profile, loading, refetch } = useProfile();
  const { isOpen, openModal, closeModal } = useModal();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    position: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form when modal opens
  useEffect(() => {
    if (isOpen && profile) {
      setForm({
        firstName: profile.firstName ?? "",
        lastName:  profile.lastName  ?? "",
        phone:     profile.phone     ?? "",
        position:  profile.position  ?? "",
      });
      setError(null);
    }
  }, [isOpen, profile]);

  function change(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchAuthed(`${USER_SERVICE_URL}/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message ?? `Error ${res.status}`);
      }
      refetch();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6 animate-pulse">
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Personal Information
          </h4>
          <button
            onClick={openModal}
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          >
            <svg className="fill-current" width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z" fill="" />
            </svg>
            Edit
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
          <InfoField label="First Name"    value={profile?.firstName} />
          <InfoField label="Last Name"     value={profile?.lastName} />
          <InfoField label="Email Address" value={profile?.email} />
          <InfoField label="Phone"         value={profile?.phone} />
          <InfoField label="Bio"           value={profile?.position} />
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[600px] m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Edit Personal Information
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              Update your details to keep your profile up-to-date.
            </p>
          </div>

          <div className="px-2 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
              <div>
                <Label>First Name</Label>
                <Input type="text" value={form.firstName} onChange={change("firstName")} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input type="text" value={form.lastName} onChange={change("lastName")} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input type="text" value={form.phone} onChange={change("phone")} />
              </div>
              <div>
                <Label>Bio / Position</Label>
                <Input type="text" value={form.position} onChange={change("position")} />
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-500">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Button size="sm" variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
