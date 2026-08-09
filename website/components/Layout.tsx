import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useWeb3 } from '../context/Web3Context';
import { WEB3_CONFIG } from '../config/web3';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { account, isCorrectNetwork, connectWallet, switchNetwork } = useWeb3();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  const formatAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const navLinks = [
    { label: 'MINT', path: '/mint' },
    { label: 'STAKING', path: '/staking' },
    { label: 'BURN LAB', path: '/burn' },
    { label: 'ADMIN', path: '/admin/overview' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-zinc-200 font-mono flex flex-col md:flex-row antialiased">
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0f1115] border-b border-zinc-800">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-[#CCFF00] animate-pulse"></span>
          <span className="font-bold text-white tracking-wider text-sm">MINI BROKERS</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 border border-zinc-800 text-zinc-400 hover:text-white hover:border-[#CCFF00]"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#0A0B0D]/95 backdrop-blur-md flex flex-col p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <span className="font-bold text-white tracking-wider">TERMINAL MENU</span>
            <button onClick={() => setMobileMenuOpen(false)} className="text-zinc-400 text-xl">✕</button>
          </div>

          <div className="flex flex-col space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-lg tracking-widest p-2 border-l-2 ${
                  router.pathname.startsWith(link.path)
                    ? 'border-[#CCFF00] text-[#CCFF00] bg-zinc-900/50'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="pt-6 border-t border-zinc-800">
            {!account ? (
              <button
                onClick={connectWallet}
                className="w-full py-3 bg-[#CCFF00] text-black font-bold uppercase tracking-wider hover:shadow-[0_0_15px_rgba(204,255,0,0.4)]"
              >
                CONNECT WALLET
              </button>
            ) : (
              <div className="p-3 bg-zinc-900 border border-zinc-800 text-center">
                <span className="text-xs text-zinc-500 block">CONNECTED</span>
                <span className="text-sm font-bold text-[#CCFF00]">{formatAddr(account)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-zinc-800/80 bg-[#0f1115] p-6 space-y-8 min-h-screen">
        <div>
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-[#CCFF00] shadow-[0_0_8px_#CCFF00]"></span>
            <h1 className="font-bold text-white tracking-widest text-lg">MINI BROKERS</h1>
          </div>
          <p className="text-[10px] text-zinc-500 tracking-wider mt-1 uppercase">COLLECTOR TERMINAL</p>
        </div>

        <nav className="flex flex-col space-y-2 flex-1">
          {navLinks.map((link) => {
            const isActive = router.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`px-4 py-2.5 text-xs tracking-widest transition-all border ${
                  isActive
                    ? 'bg-zinc-900 border-[#CCFF00]/40 text-[#CCFF00] font-bold shadow-[inset_0_0_10px_rgba(204,255,0,0.05)]'
                    : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                [ {link.label} ]
              </Link>
            );
          })}
        </nav>

        {/* System & Wallet Status Box */}
        <div className="p-4 border border-zinc-800/80 bg-zinc-950 space-y-3">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-zinc-500">NETWORK</span>
            <span className={isCorrectNetwork ? 'text-zinc-300' : 'text-red-400 font-bold'}>
              {WEB3_CONFIG.CHAIN_NAME}
            </span>
          </div>

          {account && !isCorrectNetwork && (
            <button
              onClick={switchNetwork}
              className="w-full py-1 text-[10px] bg-red-950 text-red-400 border border-red-800 hover:bg-red-900"
            >
              SWITCH NETWORK
            </button>
          )}

          {!account ? (
            <button
              onClick={connectWallet}
              className="w-full py-2.5 bg-[#CCFF00] text-black font-bold text-xs tracking-wider hover:bg-[#b8e600] transition-colors"
            >
              CONNECT WALLET
            </button>
          ) : (
            <div className="pt-2 border-t border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 block">CONNECTED ADDRESS</span>
              <span className="text-xs text-[#CCFF00] tracking-wide font-bold">{formatAddr(account)}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Terminal Viewport */}
      <main className="flex-1 p-4 md:p-10 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
};
