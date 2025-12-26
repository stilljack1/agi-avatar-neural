'use client';
import { useState } from 'react';
import AvatarBrain from '@/components/avatar/AvatarBrain';
import { Activity, Shield, Cpu } from 'lucide-react';

export default function MissionControl() {
  const [jackImg, setJackImg] = useState(null);
  const [juliaImg, setJuliaImg] = useState(null);

  const processUpload = (file, setter) => {
    if(file) {
      const reader = new FileReader();
      reader.onload = (e) => setter(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono relative overflow-hidden selection:bg-green-500/30">
       {/* BACKGROUND GRID */}
       <div className="absolute inset-0 bg-[linear-gradient(rgba(0,50,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,50,0,0.1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

       {/* HEADER */}
       <header className="border-b border-green-900/30 bg-black/80 backdrop-blur-xl sticky top-0 z-50 p-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
             <div className="flex items-center gap-3">
                <Cpu className="text-green-500 animate-pulse" />
                <div>
                   <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">AGI-1 NEURAL INTERFACE</h1>
                   <div className="text-[10px] text-gray-500">QUANTUM PROCESSING UNIT: ONLINE</div>
                </div>
             </div>
             <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1 text-green-500"><Activity size={14} /> SYSTEM STABLE</div>
                <div className="flex items-center gap-1 text-blue-500"><Shield size={14} /> SECURE</div>
             </div>
          </div>
       </header>

       {/* MAIN CONTENT */}
       <main className="max-w-7xl mx-auto p-8 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
             {/* JACK POD */}
             <div className="flex flex-col items-center gap-4">
                <div className="w-full h-1 bg-blue-900/30 rounded-full overflow-hidden"><div className="w-2/3 h-full bg-blue-500 animate-pulse" /></div>
                <AvatarBrain name="Jack" image={jackImg} onImageUpload={(f) => processUpload(f, setJackImg)} />
             </div>

             {/* JULIA POD */}
             <div className="flex flex-col items-center gap-4">
                <div className="w-full h-1 bg-pink-900/30 rounded-full overflow-hidden"><div className="w-2/3 h-full bg-pink-500 animate-pulse" /></div>
                <AvatarBrain name="Julia" image={juliaImg} onImageUpload={(f) => processUpload(f, setJuliaImg)} />
             </div>
          </div>
       </main>

       {/* FOOTER */}
       <footer className="fixed bottom-0 w-full border-t border-gray-900 bg-black/90 text-center py-2 text-[10px] text-gray-600">
          AGI-1 PROTOTYPE // CTO AUTHORIZED // AWS CLOUDSHELL DEPLOYMENT
       </footer>
    </div>
  );
}
