"use client";

import { useState } from "react";
import { submitWalkin } from "@/lib/kiosk/actions";

export default function KioskForm() {
  const [msg, setMsg] = useState<string>("");

  async function onSubmit(formData: FormData) {
    setMsg("Submitting...");
    const res = await submitWalkin({
      firstName: String(formData.get("firstName") ?? ""),
      lastInitial: String(formData.get("lastInitial") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      preferenceType: "ANY",
      preferredBarberId: null,
    });

    setMsg(res.success ? `✅ Joined. Position: ${res.position}` : `❌ ${res.error}`);
  }

  return (
    <form action={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <input name="firstName" placeholder="First name" />
      <input name="lastInitial" placeholder="Last initial" maxLength={1} />
      <input name="phone" placeholder="Phone (10 digits)" />
      <button type="submit">Join Queue</button>
      <div>{msg}</div>
    </form>
  );
}
