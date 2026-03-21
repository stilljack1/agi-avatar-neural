'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JuliaPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/neural?actor=julia');
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0a0a14',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <p>Loading Julia...</p>
    </div>
  );
}
