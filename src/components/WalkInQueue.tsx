"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Barber {
  id: string;
  name: string;
  status: "available" | "busy" | "closed";
  currentClient: string | null;
  queue: number;
  maxQueue: number;
  waitMin: number | null;
  nextAppt: string;
  initials: string;
  accentHex: string;
  photoUrl?: string | null;
}

interface WalkInQueueProps {
  barbers: Barber[];
  onJoin?: (barberId: string) => void;
}

// ─────────────────────────────────────────────
// StatusPill
// Frosted glass pill · uppercase tracking · inset ring
// ─────────────────────────────────────────────

function StatusPill({ status }: { status: Barber["status"] }) {
  const cfg = {
    available: {
      label: "Available",
      pill: "bg-emerald-500/[0.13] ring-emerald-500/40 text-emerald-400",
      dot: "bg-emerald-400",
      ping: "bg-emerald-300",
      pulse: true,
    },
    busy: {
      label: "Busy",
      pill: "bg-amber-500/[0.13] ring-amber-500/40 text-amber-400",
      dot: "bg-amber-400",
      ping: "bg-amber-300",
      pulse: false,
    },
    closed: {
      label: "Closed",
      pill: "bg-red-500/[0.10] ring-red-500/30 text-red-400",
      dot: "bg-red-500",
      ping: "",
      pulse: false,
    },
  }[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-[5px]
        rounded-full text-[10.5px] font-semibold uppercase tracking-[0.07em]
        ring-1 ring-inset backdrop-blur-md
        ${cfg.pill}
      `}
    >
      <span className="relative flex h-[6px] w-[6px] shrink-0">
        {cfg.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${cfg.ping} opacity-75 animate-ping`}
          />
        )}
        <span className={`relative inline-flex h-[6px] w-[6px] rounded-full ${cfg.dot}`} />
      </span>
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────
// ProgressBar
// Animated fill with color-coded gradient + ambient glow
// ─────────────────────────────────────────────

function ProgressBar({ queue, maxQueue }: { queue: number; maxQueue: number }) {
  const pct = maxQueue > 0 ? Math.min(queue / maxQueue, 1) * 100 : 0;

  const [gradient, glowColor] =
    queue <= 1
      ? ["from-emerald-500 to-emerald-400", "shadow-[0_0_8px_2px_rgba(52,211,153,0.45)]"]
      : queue <= 3
      ? ["from-amber-500 to-amber-400", "shadow-[0_0_8px_2px_rgba(251,191,36,0.40)]"]
      : ["from-red-600 to-red-500", "shadow-[0_0_8px_2px_rgba(220,38,38,0.40)]"];

  return (
    <div className="w-full h-[5px] bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} ${glowColor}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// BarberHero
// Full-bleed cinematic photo · name + badges overlaid
// Initials fallback with radial vignette
// ─────────────────────────────────────────────

function BarberHero({ barber }: { barber: Barber }) {
  const [imgFailed, setImgFailed] = useState(false);
  // photoUrl takes priority; falls back to /barbers/{id}.jpg served from /public
  const src = barber.photoUrl ?? `/barbers/${barber.id}.jpg`;

  return (
    <div className="relative w-full h-64 overflow-hidden">

      {/* ── Background: photo or initials ── */}
      {!imgFailed ? (
        <img
          src={src}
          alt={barber.name}
          className="absolute inset-0 w-full h-full object-cover object-top"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center select-none"
          style={{ backgroundColor: barber.accentHex }}
        >
          {/* Radial vignette on accent block for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(0,0,0,0.40)_100%)]" />
          <span className="relative text-[76px] font-black tracking-tighter text-white/85 drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]">
            {barber.initials}
          </span>
        </div>
      )}

      {/* ── Cinematic bottom scrim ── */}
      {/* Strong at very bottom, fades to clear by midpoint */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 from-[0%] via-neutral-950/45 via-[42%] to-transparent" />

      {/* ── Top vignette ── */}
      {/* Soft shadow for badge legibility */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />

      {/* ── Overlaid top row: status + next appt ── */}
      <div className="absolute top-0 inset-x-0 px-4 pt-4 flex items-start justify-between gap-2">
        <StatusPill status={barber.status} />

        {/* Frosted glass "next appt" chip */}
        <span className="inline-flex items-center gap-1.5 bg-black/35 backdrop-blur-md border border-white/[0.10] rounded-full px-2.5 py-[5px] text-[10.5px] text-white/55 font-medium tracking-wide shrink-0">
          {/* Minimal clock glyph */}
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            aria-hidden="true"
            className="opacity-60"
          >
            <circle cx="4.5" cy="4.5" r="3.75" stroke="currentColor" strokeWidth="1.1" />
            <path d="M4.5 2.5V4.5L5.75 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {barber.nextAppt}
        </span>
      </div>

      {/* ── Overlaid bottom: name + current client ── */}
      <div className="absolute bottom-0 inset-x-0 px-5 pb-5">
        <h2 className="text-[27px] font-black text-white leading-none tracking-tight drop-shadow-[0_1px_12px_rgba(0,0,0,0.95)]">
          {barber.name}
        </h2>
        <p className="mt-1.5 text-[13px] font-medium leading-none">
          {barber.currentClient ? (
            <>
              <span className="text-white/45">With </span>
              <span className="text-white/80">{barber.currentClient}</span>
            </>
          ) : (
            <span className="text-white/30">Chair is open</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BarberCard
// Cinematic hero carries name + context
// Minimal body: only queue section + CTA
// ─────────────────────────────────────────────

function BarberCard({
  barber,
  index,
  onJoin,
}: {
  barber: Barber;
  index: number;
  onJoin: (id: string) => void;
}) {
  const isClosed = barber.status === "closed";
  const isAvailable = barber.status === "available";

  const helperText =
    barber.status === "available"
      ? "Walk in now — you're next"
      : barber.status === "busy"
      ? barber.queue > 0 && barber.waitMin != null
        ? `You will be #${barber.queue + 1} (~${barber.waitMin} min wait)`
        : "Join the queue"
      : "Not accepting walk-ins";

  const buttonLabel =
    barber.status === "available"
      ? "Join now"
      : barber.status === "busy"
      ? "Join queue"
      : "Unavailable";

  // Gradient CTAs with inset specular ring + ambient glow
  const buttonCls = isClosed
    ? "bg-neutral-800/80 text-neutral-600 cursor-not-allowed"
    : isAvailable
    ? [
        "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white",
        "ring-1 ring-inset ring-white/[0.18]",
        "shadow-[0_4px_22px_rgba(52,211,153,0.30)]",
        "active:brightness-[0.88]",
      ].join(" ")
    : [
        "bg-gradient-to-b from-amber-400 to-amber-600 text-white",
        "ring-1 ring-inset ring-white/[0.18]",
        "shadow-[0_4px_22px_rgba(251,191,36,0.25)]",
        "active:brightness-[0.88]",
      ].join(" ");

  const helperColor = isAvailable
    ? "text-emerald-400"
    : isClosed
    ? "text-red-400"
    : "text-amber-400";

  return (
    <motion.article
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.09,
        duration: 0.45,
        ease: [0.25, 1, 0.5, 1],
      }}
      // White hair-line border: looks premium on near-black cards
      className="w-full rounded-3xl bg-neutral-900 border border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.65)] overflow-hidden"
    >
      {/* ── Cinematic hero ── */}
      <BarberHero barber={barber} />

      {/* ── Hair-line divider ── */}
      <div className="mx-5 h-px bg-white/[0.045]" />

      {/* ── Minimal card body ── */}
      <div className="px-5 pt-4 pb-5 flex flex-col gap-[14px]">

        {/* Queue section */}
        <div className="flex flex-col gap-2">

          {/* Meta row: label + wait time */}
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-neutral-500">
              Queue
            </span>
            {barber.waitMin != null ? (
              <span className="text-[12px] font-semibold text-neutral-300">
                ~{barber.waitMin} min wait
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-neutral-600">
                No wait
              </span>
            )}
          </div>

          {/* Animated fill bar */}
          <ProgressBar queue={barber.queue} maxQueue={barber.maxQueue} />

          {/* Spots row + helper */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-600">
              {barber.queue} / {barber.maxQueue} spots
            </span>
            <span className={`text-[11px] font-semibold ${helperColor}`}>
              {helperText}
            </span>
          </div>
        </div>

        {/* CTA button */}
        <button
          disabled={isClosed}
          onClick={() => !isClosed && onJoin(barber.id)}
          aria-label={`${buttonLabel} for ${barber.name}`}
          aria-disabled={isClosed}
          className={`
            w-full py-[17px] rounded-2xl
            font-bold text-[15px] tracking-[0.015em]
            transition-all duration-150
            ${buttonCls}
          `}
        >
          {buttonLabel}
        </button>

      </div>
    </motion.article>
  );
}

// ─────────────────────────────────────────────
// Toast
// Glass morphism pill · SVG check · spring physics
// ─────────────────────────────────────────────

function Toast({ barberName }: { barberName: string }) {
  return (
    <motion.div
      className="fixed bottom-8 left-1/2 z-50 pointer-events-none"
      style={{ x: "-50%" }}
      initial={{ y: 80, opacity: 0, scale: 0.88 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 60, opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      <div className="flex items-center gap-2.5 bg-neutral-900/90 backdrop-blur-2xl border border-white/[0.10] text-white text-[13px] font-semibold px-5 py-3.5 rounded-full shadow-[0_8px_36px_rgba(0,0,0,0.75)] whitespace-nowrap">
        {/* Emerald check dot */}
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]">
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
            <path
              d="M1 3.5L3.2 5.7L8 1"
              stroke="white"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        Added to {barberName}&apos;s queue
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// WalkInQueue — main export
//
// Designed to be embedded inside an existing page or tab.
// Does NOT create a route, page, or navigation.
//
// ─────────────────────────────────────────────
//
// SUPABASE REALTIME STUB — connect in the parent component:
//
// import { createClient } from "@/lib/supabase/client";
// import { useEffect, useState } from "react";
//
// const [barbers, setBarbers] = useState<Barber[]>(initialBarbers);
//
// useEffect(() => {
//   const supabase = createClient();
//   const channel = supabase
//     .channel("walkin_queue_realtime")
//     .on(
//       "postgres_changes",
//       { event: "*", schema: "public", table: "barber_state" },
//       (payload) => {
//         // Map payload.new → Barber shape, then update state
//         setBarbers((prev) =>
//           prev.map((b) =>
//             b.id === payload.new.barber_id
//               ? { ...b, ...mapPayloadToBarber(payload.new) }
//               : b
//           )
//         );
//       }
//     )
//     .subscribe();
//
//   return () => { supabase.removeChannel(channel); };
// }, []);
//
// <WalkInQueue barbers={barbers} onJoin={handleJoin} />
//
// ─────────────────────────────────────────────

export default function WalkInQueue({ barbers, onJoin }: WalkInQueueProps) {
  const [toast, setToast] = useState<{
    barberId: string;
    barberName: string;
  } | null>(null);

  const handleCardJoin = useCallback(
    (barberId: string) => {
      const barber = barbers.find((b) => b.id === barberId);
      if (!barber) return;
      onJoin?.(barberId);
      setToast({ barberId, barberName: barber.name });
      setTimeout(() => setToast(null), 2200);
    },
    [barbers, onJoin]
  );

  return (
    // Centered mobile viewport container — max 420px, phone layout only
    <div className="min-h-screen bg-neutral-950 flex justify-center">
      <div className="w-full max-w-[420px] px-4 pb-24">

        {/* Card feed */}
        <div className="flex flex-col gap-6 pt-6">
          {barbers.map((barber, i) => (
            <BarberCard
              key={barber.id}
              barber={barber}
              index={i}
              onJoin={handleCardJoin}
            />
          ))}
        </div>

      </div>

      {/* Toast — spring animated, auto-dismissed, no stacking */}
      <AnimatePresence mode="wait">
        {toast && (
          <Toast key={toast.barberId} barberName={toast.barberName} />
        )}
      </AnimatePresence>
    </div>
  );
}
