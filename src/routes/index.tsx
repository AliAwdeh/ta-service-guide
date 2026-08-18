import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Landing,
});

/* The public "/" is a minimal maids.cc-branded landing. The per-client guides
   live at /v/<code> (generated via POST /api/guides); the internal
   generator/preview lives at /debug. */
function Landing() {
  useEffect(() => {
    document.documentElement.style.backgroundColor = "#EEF3FB";
    document.body.style.backgroundColor = "#EEF3FB";
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#EEF3FB] px-6 text-center font-sans">
      <img
        src="/assets/maids-logo.png"
        alt="maids.cc"
        width={247}
        height={83}
        className="h-12 w-auto"
      />
      <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-[#111827]">
        Your Maid <span className="text-[#4878BC]">Service Guide</span>
      </h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[#6B7280]">
        Your personal guide is prepared for you by maids.cc and shared through your WhatsApp
        message. Please open the link we sent you to view it.
      </p>
    </div>
  );
}
