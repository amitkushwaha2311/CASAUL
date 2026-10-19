"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, ChevronRight } from "lucide-react";

export default function Navbar() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
      {/* Left spacer */}
      <div className="flex-1 hidden md:block" />

      {/* Center navigation */}
      <ul className="hidden md:flex items-center gap-8 text-[rgb(45,45,45)] font-normal text-sm list-none m-0 p-0">
        <li className="relative group">
          <Link
            href="/app/graphs"
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group text-inherit text-decoration-none"
          >
            Ecosystem
          </Link>
        </li>

        <li
          className="relative group"
          onMouseEnter={() => setOpenDropdown("economics")}
          onMouseLeave={() => setOpenDropdown(null)}
        >
          <Link
            href="/app/analytics"
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group text-inherit text-decoration-none"
          >
            <span>Economics</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {openDropdown === "economics" && (
            <div className="absolute top-full left-0 mt-2 py-2 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-black/5 z-50 text-xs">
              <Link
                href="/app/analytics"
                className="block px-4 py-2 hover:bg-black/5 text-[#2D2D2D] transition-colors"
              >
                Analytics & Trends
              </Link>
              <Link
                href="/app/assessments"
                className="block px-4 py-2 hover:bg-black/5 text-[#2D2D2D] transition-colors"
              >
                Resilience Assessments
              </Link>
            </div>
          )}
        </li>

        <li className="relative group">
          <Link
            href="/app/simulation"
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group text-inherit text-decoration-none"
          >
            Developers
          </Link>
        </li>

        <li
          className="relative group"
          onMouseEnter={() => setOpenDropdown("governance")}
          onMouseLeave={() => setOpenDropdown(null)}
        >
          <Link
            href="/app/recommendations"
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group text-inherit text-decoration-none"
          >
            <span>Governance</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {openDropdown === "governance" && (
            <div className="absolute top-full left-0 mt-2 py-2 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-black/5 z-50 text-xs">
              <Link
                href="/app/recommendations"
                className="block px-4 py-2 hover:bg-black/5 text-[#2D2D2D] transition-colors"
              >
                Safety & Decisions
              </Link>
              <Link
                href="/app/evidence"
                className="block px-4 py-2 hover:bg-black/5 text-[#2D2D2D] transition-colors"
              >
                Evidence Dossiers
              </Link>
            </div>
          )}
        </li>
      </ul>

      {/* Mobile logo */}
      <div className="md:hidden">
        <Link href="/app" className="text-decoration-none">
          <span className="font-regular tracking-tighter text-xl text-[rgba(30,50,90,0.9)]">
            RIVR
          </span>
        </Link>
      </div>

      {/* Right button wrapper */}
      <div className="flex-1 flex justify-end">
        <Link href="/app/command-center" className="text-decoration-none">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center bg-[rgba(30,50,90,0.8)] text-white rounded-full pl-2 pr-4 md:pr-6 py-1.5 md:py-2 gap-2 md:gap-3 hover:bg-[rgba(30,50,90,1)] transition-colors group cursor-pointer border-none"
          >
            <div className="bg-white/20 p-1 md:p-1.5 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <span className="text-xs md:text-sm font-normal">Book Demo</span>
          </motion.button>
        </Link>
      </div>
    </nav>
  );
}
