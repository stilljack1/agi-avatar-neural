import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AGI-1 Singularity Console',
  description: 'AGI-1 sovereign execution console with isolated task orchestration and operator status.',
};

export default function SingularityLayout({ children }: { children: ReactNode }) {
  return children;
}
