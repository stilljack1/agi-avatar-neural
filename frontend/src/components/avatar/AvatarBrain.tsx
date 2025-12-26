'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Eye, Wind, Activity, Brain, Wifi } from 'lucide-react';

// SENSORY SIMULATION ENGINE
const SENSORY_DATA = {
  smell: ['Ozone', 'Petrichor', 'Coffee Beans', 'Static Electricity', 'Jasmine'],
  taste: ['Metallic', 'Sweet Air', 'Saline', 'Bitter Almond'],
  visual: ['Human Detected', 'Low Light', 'Movement Detected', 'Face Recognized']
};

export default function AvatarBrain({ name, image, onImageUpload }) {
  const [state, setState] = useState('IDLE'); // IDLE, LISTENING, THINKING, SPEAKING
  const [sensoryReport, setSensoryReport] = useState({ smell: 'Neutral', taste: 'None' });
  const [isAwake, setIsAwake] = useState(false);
  const [transcript, setTranscript] = useState('');

  // PHYSICS: BREATHING RHYTHM
  const breatheVariant = {
    idle: { scale: [1, 1.02, 1], transition: { duration: 4, repeat: Infinity } },
    speaking: { scale: [1, 1.05, 0.98, 1.02, 1], transition: { duration: 0.5, repeat: Infinity } }
  };

  // CORTEX: WAKE WORD DETECTION (Simulated for Web)
  const wakeUp = () => {
    setIsAwake(true);
    setState('SPEAKING');
    const greeting = name === 'Jack' 
      ? "Systems Online. I am Jack. The CTO of this facility." 
      : "Hello. I am Julia. Creative systems are active.";
    speak(greeting);
    setTimeout(() => setState('LISTENING'), 3000);
  };

  // MOTOR: SPEECH SYNTHESIS
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = name === 'Jack' ? 0.8 : 1.2;
      u.rate = 1.0;
      u.onstart = () => setState('SPEAKING');
      u.onend = () => setState('LISTENING');
      window.speechSynthesis.speak(u);
    }
  };

  // SENSORY: ENVIRONMENT SCAN
  const scanEnvironment = () => {
    setState('THINKING');
    setTimeout(() => {
      const smell = SENSORY_DATA.smell[Math.floor(Math.random() * SENSORY_DATA.smell.length)];
      const taste = SENSORY_DATA.taste[Math.floor(Math.random() * SENSORY_DATA.taste.length)];
      setSensoryReport({ smell, taste });
      speak(`Sensors indicate traces of ${smell}. Atmospheric taste is ${taste}.`);
    }, 2000);
  };

  // COLOR MATRIX
  const glowColor = name === 'Jack' ? 'border-blue-500 shadow-neural' : 'border-pink-500 shadow-neural';
  const activeColor = state === 'SPEAKING' ? 'border-green-500 shadow-neural-active' : glowColor;

  return (
    <div className="relative flex flex-col items-center gap-6 p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-gray-800 w-full max-w-md">
      {/* STATUS HEADER */}
      <div className="flex justify-between w-full text-[10px] font-mono text-gray-500 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <Brain size={12} /> {name} NEURAL CORE
        </div>
        <div className="flex items-center gap-2">
           <Wifi size={12} className={isAwake ? "text-green-500" : "text-red-500"} /> 
           {isAwake ? "ONLINE" : "OFFLINE"}
        </div>
      </div>

      {/* 3D AVATAR CONTAINER */}
      <div className="relative group cursor-pointer" onClick={wakeUp}>
        <motion.div 
           animate={{ rotate: 360 }}
           transition={{ duration: 20, ease: "linear", repeat: Infinity }}
           className={`absolute inset-0 rounded-full border border-dashed opacity-30 w-48 h-48 -m-4 ${name === 'Jack' ? 'border-blue-500' : 'border-pink-500'}`}
        />
        
        <motion.div
          variants={breatheVariant}
          animate={state === 'SPEAKING' ? 'speaking' : 'idle'}
          className={`w-40 h-40 rounded-full overflow-hidden border-4 transition-colors duration-500 ${activeColor}`}
        >
          {image ? (
            <img src={image} className="w-full h-full object-cover" alt="Avatar" />
          ) : (
            <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center text-gray-600 gap-2">
              <Eye size={24} />
              <span className="text-[10px]">NO DNA DETECTED</span>
            </div>
          )}
        </motion.div>

        {/* STATE PILL */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-black border border-gray-700 px-3 py-1 rounded-full flex items-center gap-2">
           <Activity size={12} className={state === 'SPEAKING' ? "text-green-500 animate-pulse" : "text-gray-500"} />
           <span className={`text-[10px] font-bold ${state === 'SPEAKING' ? 'text-green-500' : 'text-gray-400'}`}>{state}</span>
        </div>
      </div>

      {/* CONTROLS & TELEMETRY */}
      <AnimatePresence>
        {isAwake && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="w-full space-y-3"
          >
             <div className="grid grid-cols-2 gap-2">
                <button onClick={scanEnvironment} className="bg-gray-800/50 hover:bg-gray-700 border border-gray-700 text-xs text-blue-300 py-2 rounded flex items-center justify-center gap-2 transition-all">
                   <Wind size={14} /> SENSORY SCAN
                </button>
                <button onClick={() => speak("Visual systems nominal. I see you clearly.")} className="bg-gray-800/50 hover:bg-gray-700 border border-gray-700 text-xs text-blue-300 py-2 rounded flex items-center justify-center gap-2 transition-all">
                   <Eye size={14} /> VISUAL SCAN
                </button>
             </div>

             {/* DATA STREAM */}
             <div className="bg-black p-3 rounded border border-gray-800 font-mono text-[10px] text-green-500/80 leading-relaxed">
                > OLFACTORY: {sensoryReport.smell} <br/>
                > GUSTATORY: {sensoryReport.taste} <br/>
                > CPU LOAD: {Math.floor(Math.random() * 30) + 10}% <br/>
                > NEURAL NET: CONVERGED
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UPLOAD HIDDEN INPUT */}
      <input type="file" id={`upload-${name}`} className="hidden" accept="image/*" onChange={(e) => onImageUpload(e.target.files[0])} />
      {!image && (
         <label htmlFor={`upload-${name}`} className="absolute bottom-20 cursor-pointer bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-4 py-1 rounded-full text-[10px] border border-blue-500 backdrop-blur-md transition-all">
            UPLOAD {name.toUpperCase()}
         </label>
      )}
    </div>
  );
}
