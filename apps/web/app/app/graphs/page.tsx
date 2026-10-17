"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GraphsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/state");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#111210] flex items-center justify-center p-8">
      <div className="causal-glass-strong p-8 rounded-2xl max-w-md text-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#A99A80]/20 border-t-[#A99A80] animate-spin mx-auto mb-4" />
        <h1 className="text-lg font-mono font-bold text-[#F0EDE5]">Redirecting to Graph Explorer</h1>
        <p className="text-xs font-sans text-[#A7A398] mt-2">
          Accessing multi-domain cyber-physical infrastructure topology...
        </p>
      </div>
    </div>
  );
}
