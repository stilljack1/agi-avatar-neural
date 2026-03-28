'use client';

import { motion } from 'framer-motion';
import { Rocket, Sparkles } from 'lucide-react';
import { AGI_CONFIG } from '@/lib/config';

interface SingularityLauncherProps {
  launchUrl?: string;
}

export function SingularityLauncher({
  launchUrl = AGI_CONFIG.taskInterfaceUrl,
}: SingularityLauncherProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.a
        href={launchUrl}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg text-black uppercase tracking-wider bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 shadow-[0_0_40px_rgba(234,179,8,0.3)] hover:shadow-[0_0_60px_rgba(234,179,8,0.5)] transition-shadow duration-300 overflow-hidden"
      >
        {/* Shimmer overlay */}
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700 ease-in-out" />

        <Rocket className="w-5 h-5 relative z-10" />
        <span className="relative z-10">Open Singularity</span>
        <Sparkles className="w-5 h-5 relative z-10" />
      </motion.a>

      <p className="text-gray-500 text-[10px] uppercase tracking-[0.3em] font-mono">
        Task Execution &bull; Autonomous Factory &bull; Dashboard
      </p>
    </div>
  );
}
