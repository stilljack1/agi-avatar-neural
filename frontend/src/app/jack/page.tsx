'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JackPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/neural?actor=jack');
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
      <p>Loading Jack...</p>
    </div>
  );
}
