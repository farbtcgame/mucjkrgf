import React from 'react';
import { Layout } from '../components/Layout';
import { MintCard } from '../components/MintCard';

export default function MintPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="border-b border-zinc-800/80 pb-4">
          <h1 className="text-xl font-bold text-white tracking-widest uppercase">MINT TERMINAL</h1>
          <p className="text-xs text-zinc-500 mt-1">
            VERIFIED SMART CONTRACT INTERACTION
          </p>
        </div>
        <MintCard />
      </div>
    </Layout>
  );
}
