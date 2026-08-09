import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export const AdminNav: React.FC = () => {
  const router = useRouter();

  const links = [
    { label: 'OVERVIEW', path: '/admin/overview' },
    { label: 'MINT CONTROL', path: '/admin/mint' },
    { label: 'PAYMENT', path: '/admin/payment' },
    { label: 'REVEAL', path: '/admin/reveal' },
    { label: 'ROYALTY', path: '/admin/royalty' },
    { label: 'BURN LAB', path: '/admin/burn' },
    { label: 'CONTRACT', path: '/admin/contract' },
  ];

  return (
    <div className="flex border-b border-zinc-800 overflow-x-auto no-scrollbar mb-6">
      {links.map((link) => {
        const isActive = router.pathname === link.path;
        return (
          <Link
            key={link.path}
            href={link.path}
            className={`px-4 py-2 text-xs tracking-widest whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? 'border-[#CCFF00] text-[#CCFF00] font-bold bg-zinc-900/30'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
};
